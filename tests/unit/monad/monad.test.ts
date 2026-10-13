import { encodeFunctionData, erc20Abi, maxUint256, parseEther, type Address } from "viem";
import { describe, expect, it } from "vitest";

import { analyze } from "../../../src/analyze";
import {
  CHAINS,
  MONAD_CHAIN_ID,
  explorerAddressUrl,
  getChainConfig,
  nativeSymbol,
  wrappedSymbol,
} from "../../../src/config/chains";
import { createPlainSignPublicClient } from "../../../src/config/publicRpc";
import { getAllowlistEntry } from "../../../src/enrich/allowlist";
import type { AddressInfo, AnalysisRequest, Explanation, Intent, RiskResult, SimulationResult } from "../../../src/types";

const USER = "0x1111111111111111111111111111111111111111" as Address;
const WMON = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address;
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as Address;
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3" as Address;
const STRANGER_CONTRACT = "0x9999999999999999999999999999999999999999" as Address;
const STRANGER_WALLET = "0x8888888888888888888888888888888888888888" as Address;

/** Offline enrichment: allowlist from the real registry, EOAs/contracts from a fixed map. */
function fakeEnrich(eoas: Address[] = [STRANGER_WALLET]) {
  return async (addresses: Address[], chainId: number) => {
    const out: Record<string, AddressInfo> = {};
    for (const address of addresses) {
      const allowlisted = getAllowlistEntry(chainId, address);
      out[address.toLowerCase()] = {
        address,
        isContract: !eoas.some((eoa) => eoa.toLowerCase() === address.toLowerCase()),
        isVerified: allowlisted ? true : undefined,
        allowlisted,
        fetchedAt: 0,
      };
    }
    return out;
  };
}

function monadRequest(
  request: AnalysisRequest["request"],
  origin = "https://app.example.xyz",
): AnalysisRequest {
  return { id: `monad-${Math.random()}`, origin, chainId: MONAD_CHAIN_ID, from: USER, request };
}

const offline = {
  simulate: async () => ({ ok: false as const, provider: "none" as const, changes: [] }),
  reword: async (_i: Intent, _s: SimulationResult, _r: RiskResult, explanation: Explanation) => explanation,
};

describe("Monad mainnet registry (chain 143)", () => {
  it("registers Monad with MON, WMON, public RPCs and MonadVision", () => {
    const monad = getChainConfig(143);
    expect(monad?.name).toBe("Monad");
    expect(monad?.testnet).toBe(false);
    expect(monad?.nativeCurrency).toEqual({ name: "Monad", symbol: "MON", decimals: 18 });
    expect(monad?.rpcUrls[0]).toBe("https://rpc.monad.xyz");
    expect(monad?.wethAddress).toBe(WMON.toLowerCase());
    expect(nativeSymbol(143)).toBe("MON");
    expect(wrappedSymbol(143)).toBe("WMON");
    expect(explorerAddressUrl(143, WMON)).toBe(`https://monadvision.com/address/${WMON}`);
  });

  it("builds a viem client that reports MON as the native currency", () => {
    const client = createPlainSignPublicClient(MONAD_CHAIN_ID);
    expect(client.chain.id).toBe(143);
    expect(client.chain.nativeCurrency.symbol).toBe("MON");
  });

  it("knows canonical Monad contracts and keeps them isolated per network", () => {
    expect(getAllowlistEntry(143, WMON)?.protocol).toContain("WMON");
    expect(getAllowlistEntry(143, USDC)?.protocol).toContain("USDC");
    expect(getAllowlistEntry(143, PERMIT2)?.protocol).toBe("Uniswap Permit2");
    // Ethereum's USDC address means nothing on Monad and vice versa.
    expect(getAllowlistEntry(143, CHAINS[1].wethAddress)).toBeUndefined();
    expect(getAllowlistEntry(1, USDC)).toBeUndefined();
  });
});

describe("Monad wallet requests end to end", () => {
  it("explains a native MON transfer in MON, not ETH", async () => {
    const result = await analyze(
      monadRequest({
        method: "eth_sendTransaction",
        params: [{ from: USER, to: STRANGER_WALLET, value: `0x${parseEther("2.5").toString(16)}` }],
      }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.intent.kind).toBe("native_transfer");
    expect(result.explanation.summary).toContain("2.5 MON");
    expect(result.explanation.summary).not.toContain("ETH");
    expect(result.network).toMatchObject({ chainId: 143, name: "Monad", nativeSymbol: "MON", supported: true });
    expect(result.explanation.technical).toContain("Network: Monad");
  });

  it("recognises WMON deposit as a 1:1 wrap of MON", async () => {
    const result = await analyze(
      monadRequest({
        method: "eth_sendTransaction",
        params: [{ from: USER, to: WMON, value: `0x${parseEther("1").toString(16)}`, data: "0xd0e30db0" }],
      }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.intent.kind).toBe("weth_wrap");
    expect(result.explanation.summary).toBe("You'll turn 1 MON into the same amount of WMON.");
    expect(result.risk.verdict).toBe("safe");
  });

  it("does not trust a look-alike WMON contract", async () => {
    const result = await analyze(
      monadRequest({
        method: "eth_sendTransaction",
        params: [{ from: USER, to: STRANGER_CONTRACT, value: "0x1", data: "0xd0e30db0" }],
      }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.intent.kind).toBe("unknown_function");
    expect(result.risk.verdict).not.toBe("safe");
  });

  it("flags an unlimited Monad USDC approval to an unknown contract", async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STRANGER_CONTRACT, maxUint256] });
    const result = await analyze(
      monadRequest({ method: "eth_sendTransaction", params: [{ from: USER, to: USDC, data }] }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.intent.kind).toBe("erc20_approve");
    expect(result.risk.reasons.map((r) => r.id)).toContain("unlimited_approval");
    expect(result.risk.verdict).not.toBe("safe");
  });

  it("blocks a Monad approval whose spender is a personal wallet", async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [STRANGER_WALLET, 1_000_000n] });
    const result = await analyze(
      monadRequest({ method: "eth_sendTransaction", params: [{ from: USER, to: USDC, data }] }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.risk.verdict).toBe("danger");
    expect(result.risk.reasons.map((r) => r.id)).toContain("spender_is_eoa");
  });

  const permit2 = (chainId: number) => ({
    primaryType: "PermitSingle",
    domain: { name: "Permit2", chainId, verifyingContract: PERMIT2 },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
    },
    message: {
      details: {
        token: USDC,
        amount: "1461501637330902918203684832716283019655932542975",
        expiration: 2115360000,
        nonce: 0,
      },
      spender: STRANGER_CONTRACT,
      sigDeadline: 2115360000,
    },
  });

  it("decodes a Monad Permit2 signature and warns about its unlimited, long-lived scope", async () => {
    const result = await analyze(
      monadRequest({ method: "eth_signTypedData_v4", params: [USER, JSON.stringify(permit2(143))] }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.intent.kind).toBe("permit2_single");
    expect(result.intent.domain?.chainId).toBe(143);
    expect(result.risk.reasons.map((r) => r.id)).toContain("permit_long_or_unlimited");
    expect(result.risk.reasons.map((r) => r.id)).not.toContain("typed_data_chain_mismatch");
  });

  it("warns when a site asks for a signature on another chain while the wallet is on Monad", async () => {
    const result = await analyze(
      monadRequest({ method: "eth_signTypedData_v4", params: [USER, JSON.stringify(permit2(1))] }),
      { ...offline, enrich: fakeEnrich() },
    );
    expect(result.risk.reasons.map((r) => r.id)).toContain("typed_data_chain_mismatch");
    expect(result.risk.verdict).not.toBe("safe");
    expect(result.explanation.technical.join("\n")).toContain("Signature domain chain: 1 (Ethereum)");
  });
});
