# PlainSign on Monad — Monad Metropolis entry

**Track:** Trust, Identity & AI Infrastructure · **Team:** Mohamed Adib (solo, CS student at SVCE Chennai) · **Network:** Monad mainnet, chain ID 143

- Live product: https://ess-cor.github.io/plainsign/review.html (wallet-free walkthrough, defaults to Monad mainnet)
- Monad request lab (real requests against Monad mainnet contracts, for use with the extension): https://ess-cor.github.io/plainsign/monad-lab.html
- Extension download (Chrome, load unpacked): https://ess-cor.github.io/plainsign/plainsign-extension.zip
- Live Monad mainnet check (read-only RPC evidence): https://ess-cor.github.io/plainsign/monad-mainnet-check.json
- Videos: see the watch pages linked from the live product.

## The problem

Monad makes transactions cheap and fast. That is great for users, and equally great for drainers: a page can label a button "Free Mint" or "Verify wallet" while asking for an unlimited token approval or a Permit2 signature that never expires. Wallet popups show hex and contract addresses. Most people click Confirm.

## What PlainSign does on Monad

PlainSign is an open-source Chrome extension that sits between a dApp and the wallet. When a page asks the wallet to send a transaction or sign something (`eth_sendTransaction`, `eth_signTypedData_v3/v4`, `personal_sign`, `eth_sign`), PlainSign pauses the request **before the wallet opens**, decodes it, checks the addresses involved on Monad, and shows a plain-English verdict: **Safe**, **Caution** or **Danger**. Reject returns the standard `4001` error so the wallet never sees the request; Continue forwards the original request unchanged.

Monad-specific behaviour (all new for this hackathon):

- **Chain 143 is a first-class network.** Monad mainnet lives in the same chain registry as Ethereum and Sepolia: MON native currency, public RPCs (`rpc.monad.xyz` with `rpc1–3` fallbacks, or `VITE_MONAD_RPC`), MonadVision explorer links, and WMON (`0x3bd3…433A`) as the wrapped native token.
- **Explanations speak MON.** "You'll send 2.5 MON", "You'll turn 1 MON into the same amount of WMON" — no ETH wording leaking onto Monad.
- **Monad's canonical contracts are known by name.** WMON, USDC, USDT0, bridged WETH, Permit2, Uniswap Universal Router / SwapRouter02, Kuru routers, PancakeSwap Smart Router, Seaport 1.6 and Multicall3, taken from Monad's official docs and `monad-crypto/protocols`. Allowlists are per chain, so an Ethereum address means nothing on Monad and vice versa. A contract that imitates WMON's `deposit()` at a different address gets Caution, not the friendly wrap explanation.
- **Live address checks on Monad.** Every address in a request is checked against Monad mainnet over RPC (`eth_getCode`): an approval or permit whose spender has no code — a personal wallet, not an app — is Danger.
- **New rule: cross-network signatures.** If a site asks for an EIP-712 signature whose domain `chainId` is not the chain your wallet is on (for example an Ethereum Permit2 permit while you are on Monad), PlainSign raises a Caution with both chain names. That pattern is common in phishing kits that replay one signature across chains.
- **The verdict card shows the network** (`Monad · chain 143 · MON`) so you always know which chain the request targets.
- **Simulation is honest.** Balance-change simulation (Alchemy) remains Sepolia-only; on Monad, PlainSign decodes and scores without claiming a balance preview.

## How it was verified

- `npm test`: 216 unit/integration tests, including a Monad suite (`tests/unit/monad/monad.test.ts`) covering the registry, MON/WMON wording, look-alike WMON, unlimited USDC approvals, EOA spenders, Permit2 on Monad and the cross-network rule.
- `npm run verify:monad`: read-only script against Monad mainnet. It confirms chain ID 143 from the public RPC, confirms bytecode at every allowlisted Monad contract, reads `WMON.symbol()`, and runs two scenarios through the production decoder and rules with live on-chain address data. Output: `demo-dapp/public/monad-mainnet-check.json`.
- The extension itself was exercised in Chromium with an automated test wallet on chain 143 against the Monad request lab (see the technical demo video).

PlainSign never signs, sends or holds funds. It deploys no contract: it is client-side security infrastructure for every Monad dApp and wallet user, so there is no PlainSign contract address.

## Honest development history

- **9–12 September 2026:** the original PlainSign prototype (extension, decoders, open risk rules, verdict UI, Sepolia demo) — inside the Monad Metropolis build window (1 Sep – 13 Oct).
- **10–12 October 2026:** Ethereum mainnet registry, wallet-free walkthrough and release 0.2.1, prepared for a different competition (Colosseum Crypto World's Fair). That entry is the separate repository `adib-cyber007/plainsign` and is unchanged.
- **13 October 2026:** all Monad work listed above, in this repository (`ess-cor/plainsign`, version 0.3.0).

AI coding assistance was used. Git history uses real timestamps.

## Go-to-market

First users are Monad's own early adopters: people farming new dApps, minting NFTs and claiming airdrops in the first months of mainnet, exactly the group drainers target. Distribution: (1) Chrome Web Store listing plus the free download; (2) Monad community channels and campus Web3 clubs in India, starting with my college; (3) offering the open `rules.json` and Monad contract registry to Monad wallets and dApps so they can show the same verdicts natively. PlainSign stays free and open for users; the sustainable path is a paid API/SDK for wallets and dApps that want the verdict engine embedded, plus a community-maintained drainer feed.
