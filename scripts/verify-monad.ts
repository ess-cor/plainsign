import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, defineChain, encodeFunctionData, erc20Abi, http, maxUint256, parseEther, type Address } from "viem";

import { CHAINS, MONAD_CHAIN_ID } from "../src/config/chains";
import { decode } from "../src/decoder";
import { explain } from "../src/explain";
import { evaluate } from "../src/risk/engine";
import type { AddressInfo, AnalysisRequest } from "../src/types";
import { getAllowlistEntry } from "../src/enrich/allowlist";

// Read-only Monad mainnet evidence. Never signs or sends anything.
const config = CHAINS[MONAD_CHAIN_ID];
const monad = defineChain({
  id: config.id,
  name: config.name,
  nativeCurrency: config.nativeCurrency,
  rpcUrls: { default: { http: [...config.rpcUrls] } },
});
const KNOWN = Object.keys(config.protocols) as Address[];
const USER = "0x1111111111111111111111111111111111111111" as Address;
const UNKNOWN_SPENDER = "0x9999999999999999999999999999999999999999" as Address;

const rpcChecks: Record<string, unknown>[] = [];
let client: ReturnType<typeof createPublicClient> | undefined;
for (const rpc of config.rpcUrls) {
  try {
    const candidate = createPublicClient({ chain: monad, transport: http(rpc, { timeout: 8000, retryCount: 0 }) });
    const [chainId, blockNumber] = await Promise.all([candidate.getChainId(), candidate.getBlockNumber()]);
    if (chainId !== MONAD_CHAIN_ID) throw new Error(`Unexpected chain ${chainId}`);
    rpcChecks.push({ rpc, ok: true, chainId, blockNumber: blockNumber.toString() });
    client = candidate as typeof client;
    break;
  } catch (error) {
    rpcChecks.push({ rpc, ok: false, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
  }
}
if (!client) throw new Error("No Monad RPC reachable");

const contracts: Record<string, unknown>[] = [];
const enriched: Record<string, AddressInfo> = {};
for (const address of [...KNOWN, UNKNOWN_SPENDER]) {
  const code = await client.getCode({ address });
  const isContract = !!code && code !== "0x";
  enriched[address.toLowerCase()] = { address, isContract, allowlisted: getAllowlistEntry(MONAD_CHAIN_ID, address), fetchedAt: Date.now() };
  contracts.push({ address, label: getAllowlistEntry(MONAD_CHAIN_ID, address)?.protocol ?? "(unknown test address)", isContract, bytecodeBytes: isContract ? (code!.length - 2) / 2 : 0 });
}
const wmonSymbol = await client.readContract({ address: config.wethAddress, abi: erc20Abi, functionName: "symbol" });

async function verdictFor(label: string, request: AnalysisRequest["request"], origin = "https://app.uniswap.org") {
  const req: AnalysisRequest = { id: label, origin, chainId: MONAD_CHAIN_ID, from: USER, request };
  const intent = await decode(req);
  const simulation = { ok: false as const, provider: "none" as const, changes: [] };
  const risk = evaluate({ request: req, intent, simulation, addresses: enriched, now: Math.floor(Date.now() / 1000) });
  const explanation = explain(intent, simulation, risk, enriched, { chainId: MONAD_CHAIN_ID });
  return { label, kind: intent.kind, verdict: risk.verdict, score: risk.score, summary: explanation.summary, reasons: risk.reasons.map((r) => r.id) };
}

const USDC = "0x754704bc059f8c67012fed69bc8a327a5aafb603" as Address;
const scenarios = [
  await verdictFor("Wrap 1 MON into WMON", { method: "eth_sendTransaction", params: [{ from: USER, to: config.wethAddress, value: `0x${parseEther("1").toString(16)}`, data: "0xd0e30db0" }] }),
  await verdictFor("Unlimited USDC approval to unknown contract", { method: "eth_sendTransaction", params: [{ from: USER, to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [UNKNOWN_SPENDER, maxUint256] }) }] }, "https://claim-monad-airdrop.example"),
];

const report = { checkedAt: new Date().toISOString(), network: "Monad mainnet", chainId: MONAD_CHAIN_ID, readOnly: true, rpcChecks, wmonSymbol, contracts, scenarios };
await mkdir("output/submission", { recursive: true });
await writeFile("output/submission/monad-mainnet-check.json", `${JSON.stringify(report, null, 2)}\n`);
console.info(JSON.stringify(report, null, 2));
