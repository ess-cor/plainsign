import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { encodeFunctionData, parseEther, toHex } from "viem";

import { CHAINS } from "../../src/config/chains";
import { networkInfo } from "../../src/config/network";
import { decodeMessage } from "../../src/decoder/message";
import { decodeTransaction, type TransactionLike } from "../../src/decoder/tx";
import { decodeTypedData } from "../../src/decoder/typedData";
import { erc721Abi } from "../../src/decoder/abis/erc721";
import { wethAbi } from "../../src/decoder/abis/weth";
import { getAllowlistEntry } from "../../src/enrich/allowlist";
import { collectAddresses } from "../../src/enrich/addresses";
import { explain } from "../../src/explain";
import { evaluate } from "../../src/risk/engine";
import { buildRevokeTransaction } from "../../src/revoke";
import { VerdictCard } from "../../src/ui/VerdictCard";
import type { AddressInfo, AnalysisRequest, AnalysisResult, Intent } from "../../src/types";
import "../../src/ui/styles.css";
import "./review.css";

const account = "0x1111111111111111111111111111111111111111";
const operator = "0x22222222222222222222222222222222222222aa";
const token = "0x33333333333333333333333333333333333333cc";
const permit2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const samples = [
  { id: "mint", title: "Free Mint", detail: "A collection permission hidden behind a mint button" },
  { id: "permit", title: "Verify wallet", detail: "An unlimited Permit2 signature with a long expiry" },
  { id: "login", title: "Sign in", detail: "A readable login message" },
  { id: "wrap", title: "Wrap {NATIVE}", detail: "Exchange 0.01 {NATIVE} for {WRAPPED}" },
  { id: "fake-wrap", title: "Imitation {WRAPPED}", detail: "The same wrap call sent to a different contract" },
  { id: "wrong-chain", title: "Wrong-network permit", detail: "A Permit2 signature for another chain than your wallet's" },
  { id: "unknown", title: "Unknown request", detail: "A function the decoder cannot recognize" },
] as const;
type SampleId = typeof samples[number]["id"];
type SampleChain = 143 | 1 | 11155111;
const label = (text: string, chainId: SampleChain) =>
  text.replaceAll("{NATIVE}", CHAINS[chainId].nativeCurrency.symbol).replaceAll("{WRAPPED}", CHAINS[chainId].wrappedSymbol);

function sampleResult(id: SampleId, chainId: SampleChain) {
  const config = CHAINS[chainId];
  const now = Math.floor(Date.now() / 1000);
  let intent: Intent;
  const request: AnalysisRequest = {
    id: `preview-${id}`, chainId, origin: "https://preview.plainsign.example", from: account,
    request: { method: "eth_sendTransaction", params: [] },
  };
  if (id === "login") {
    request.request = { method: "personal_sign", params: [toHex(
      `preview.plainsign.example wants you to sign in with your Ethereum account:\n${account}\n\nSign in to the sample.\n\nURI: https://preview.plainsign.example\nVersion: 1\nChain ID: ${chainId}\nNonce: abc12345\nIssued At: ${new Date().toISOString()}`,
    ), account] };
    intent = decodeMessage(request.request.params, "personal_sign");
  } else if (id === "permit" || id === "wrong-chain") {
    const domainChain = id === "wrong-chain" ? (chainId === 1 ? 143 : 1) : chainId;
    request.request = { method: "eth_signTypedData_v4", params: [account, {
      primaryType: "PermitSingle", domain: { name: "Permit2", chainId: domainChain, verifyingContract: permit2 },
      types: {
        EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
        PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
        PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
      },
      message: { details: { token, amount: ((1n << 160n) - 1n).toString(), expiration: now + 315360000, nonce: 0 }, spender: operator, sigDeadline: now + 315360000 },
    }] };
    intent = decodeTypedData(request.request.params, "eth_signTypedData_v4");
  } else {
    const tx: TransactionLike = id === "mint"
      ? { from: account, to: token, data: encodeFunctionData({ abi: erc721Abi, functionName: "setApprovalForAll", args: [operator, true] }) }
      : id === "wrap" || id === "fake-wrap"
        ? { from: account, to: id === "wrap" ? config.wethAddress : token, value: toHex(parseEther("0.01")), data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }) }
        : { from: account, to: token, data: "0x12345678" as const };
    request.request.params = [tx];
    intent = decodeTransaction(tx, chainId);
  }
  const addresses: Record<string, AddressInfo> = Object.fromEntries(collectAddresses(intent).map((address) => [address.toLowerCase(), {
    address, isContract: address.toLowerCase() !== operator, isVerified: true,
    allowlisted: getAllowlistEntry(chainId, address), fetchedAt: Date.now(),
  }]));
  const simulation = { ok: false, provider: "none" as const, changes: [] };
  const risk = evaluate({ request, intent, addresses, simulation, now });
  const result: AnalysisResult = {
    id: request.id, intent, simulation, risk,
    explanation: explain(intent, simulation, risk, addresses, { chainId, now }), durationMs: 0,
    network: networkInfo(chainId),
  };
  return { request, result, revoke: buildRevokeTransaction(request, intent) };
}

function Review() {
  const [sample, setSample] = useState<SampleId>("mint");
  const [chain, setChain] = useState<SampleChain>(143);
  const [outcome, setOutcome] = useState("");
  const { request, result, revoke } = useMemo(() => sampleResult(sample, chain), [sample, chain]);
  return <main className="review-shell">
    <header className="review-header"><a href="review.html">PlainSign</a><nav aria-label="Project resources">
      <a href="monad-demo.html">Watch the Monad demo</a>
      <a href="monad-pitch.html">Pitch</a><a href="monad-lab.html">Monad request lab</a>
      <a href="https://github.com/ess-cor/plainsign">View the code</a>
    </nav></header>
    <div className="review-intro"><h1>See what you’re<br />really signing.</h1><p>Try a request. Read the consequence.<br />Decide before your wallet opens.</p></div>
    <p className="preview-notice">Sample preview. No wallet, extension, or funds required. Chain metadata is simulated. Verdicts use the same decoder and open rules as the extension.</p>
    <p className="review-guide">Start with <strong>Free Mint</strong> and choose Reject. Compare it with <strong>Sign in</strong>, then compare <strong>Wrap MON</strong> with <strong>Imitation WMON</strong>: the destination matters as much as the function name. On Monad, contract labels come from Monad's canonical contract list (WMON, USDC, Permit2, Uniswap, Kuru, PancakeSwap).</p>
    <div className="review-layout">
      <section className="sample-picker" aria-label="Sample wallet requests">
        <label htmlFor="sample-chain">Network</label>
        <select id="sample-chain" value={chain} onChange={(event) => { setChain(Number(event.target.value) as SampleChain); setOutcome(""); }}><option value={143}>Monad mainnet (sample)</option><option value={1}>Ethereum mainnet (sample)</option><option value={11155111}>Sepolia (sample)</option></select>
        {samples.map((item) => <button key={item.id} type="button" aria-pressed={sample === item.id} onClick={() => { setSample(item.id); setOutcome(""); }}><strong>{label(item.title, chain)}</strong><span>{label(item.detail, chain)}</span></button>)}
      </section>
      <section className="preview-result" aria-label="Sample analysis" aria-live="polite">
        <VerdictCard key={`${sample}-${chain}`} result={result} canRevoke={Boolean(revoke)}
          onReject={() => setOutcome("Preview: rejected with error 4001. The wallet would not receive the request.")}
          onContinue={() => setOutcome("Preview: Continue would send the original request unchanged to your wallet. No wallet is connected here.")}
          onRevoke={() => setOutcome("Preview: reject the original approval and propose a separate zero-permission transaction. Revocation requires wallet confirmation and gas. It does not undo a previous signature.")} />
        <p className="preview-outcome" role="status">{outcome || "These buttons show what the extension would do. No request is sent."}</p>
        <details key={`request-${sample}-${chain}`} className="request-inspector">
          <summary>Inspect this sample request</summary>
          <p>This is the input to the decoder. Address verification above is simulated; no chain service is queried.</p>
          <pre aria-label="Sample request JSON">{JSON.stringify({ origin: request.origin, chainId: request.chainId, ...request.request }, null, 2)}</pre>
          <a href="https://github.com/ess-cor/plainsign/blob/master/src/risk/rules.json">Read the risk rules</a>
        </details>
      </section>
    </div>
    <footer className="review-footer"><p>Safe means no major warning signs found in this request. These checks are heuristics, not a security guarantee.</p><a href="./">Sepolia test dApp</a><a href="plainsign-extension.zip">Download the extension (Chrome, unpacked)</a><a href="monad-mainnet-check.json">Live Monad mainnet check</a></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Review />);
