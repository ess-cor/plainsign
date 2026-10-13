# PlainSign

**Understand a wallet request before you sign it. Now on Monad mainnet (chain 143).**

> **Monad Metropolis entry** (Trust, Identity & AI Infrastructure, solo): read [MONAD.md](MONAD.md).
> [Try it on Monad without a wallet](https://ess-cor.github.io/plainsign/review.html) · [Monad request lab](https://ess-cor.github.io/plainsign/monad-lab.html) · [Download the extension](https://ess-cor.github.io/plainsign/plainsign-extension.zip) · [Live Monad mainnet check](https://ess-cor.github.io/plainsign/monad-mainnet-check.json)
>
> Monad support (0.3.0): MON native currency, Monad RPC and MonadVision links, WMON-aware wrap explanations, Monad's canonical contracts (WMON, USDC, USDT0, Permit2, Uniswap, Kuru, PancakeSwap, Seaport, Multicall3), live Monad address checks, a network badge on every verdict, and a new rule that flags EIP-712 signatures meant for a different chain than your wallet's. Run `npm run verify:monad` for read-only evidence from Monad mainnet.
>
> This repository is the Monad edition. The earlier Colosseum submission lives unchanged at `adib-cyber007/plainsign`; the history below describes that work.

## The 60-second pitch

A page can label a button “Free Mint” while asking your wallet for permission to move every NFT you own. Gasless signatures such as Permit2 can be just as powerful, but often look even less familiar.

PlainSign is a Chrome extension that pauses supported Ethereum transaction and signature requests before the wallet popup. It decodes the request, checks the addresses involved, applies deterministic rules from an open JSON file, and shows a plain-English verdict: **Safe**, **Caution**, or **Danger**. Reject returns the standard wallet error, while Continue sends the original request to the wallet unchanged.

There is no backend, paid service, account, or telemetry. Ethereum mainnet and Sepolia use their own public RPC, Blockscout metadata, and protocol addresses from one chain registry. Optional Sepolia Alchemy simulation can add expected balance changes.

## Crypto World's Fair submission

**Submitted October 12, 2026 at 6:52 PM IST, project 17231, entered for judging.** See [current status](docs/SUBMISSION_STATUS.md). The [submission package](docs/SUBMISSION_READINESS.md) links the deck, submitted video URLs, form copy and verification evidence. [Development history](docs/PRE_EXISTING_WORK.md) separates the September prototype from work completed during this competition.

The [rules review](docs/HACKATHON_RULES_REVIEW.md) records the project checks and owner-confirmed declarations. [Third-party code and services](docs/THIRD_PARTY.md) are disclosed separately. CatDrop is a security-training demo with fictional promotional content, deliberately risky example requests, and test-network assets only.

The **sample walkthrough** at `review.html` lets judges explore six requests with the shipped decoder and rules, without a wallet or extension. Published version **0.2.1** includes a contract imitating WETH's wrap function: it receives Caution, while the registered WETH destination receives the wrap explanation. Expand **Inspect this sample request** to compare the inputs. Sample chain metadata is explicitly simulated. Run `npm --prefix demo-dapp run dev` and open `http://127.0.0.1:5173/plainsign/review.html` for local development.

Optional Gemini rewording can simplify only the explanation text; verdicts, scores, and reasons remain deterministic, and its bundled `VITE_LLM_KEY` must be a restricted disposable demo key.

## See it catch the trick

| “Free Mint” is a full NFT permission | Permit2 grants a long-lived token permission | Wrapping ETH uses known WETH |
|---|---|---|
| ![Danger verdict for the deceptive Free Mint request](docs/screenshots/red-freemint.png) | ![Danger verdict for the Permit2 signature](docs/screenshots/red-permit2.png) | ![Safe verdict for wrapping ETH](docs/screenshots/green-wrap.png) |

## Try it in 5 minutes

Use a test wallet only. The public demo uses the Sepolia test network and valueless test assets.

1. Open [release 0.2.1](https://github.com/adib-cyber007/plainsign/releases/tag/v0.2.1) and download its PlainSign extension ZIP. A local review bundle can be prepared in `output/submission-0.2.1/` by `npm run submission:package`; audit it with `npm run submission:audit`.
2. Extract the ZIP to a folder you can keep. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**, click **Load unpacked**, select the extracted folder, and confirm the PlainSign card has no red **Errors** button.
4. Install or unlock MetaMask in a throwaway Chrome profile. Enable test networks and select **Sepolia**.
5. Open the [CatDrop demo](https://adib-cyber007.github.io/plainsign/), click **Connect wallet**, and choose the throwaway account.
6. Click **Free Mint**. PlainSign should show a red **Danger** card before MetaMask opens. Click **Reject**; the page should report `Rejected (4001)`.
7. Try **Sign in** for a green login explanation and **Wrap 0.01 ETH** for the known-WETH path. Continuing Wrap requires at least 0.01 Sepolia ETH plus gas.

If the extension was already open when you installed or reloaded PlainSign, refresh the demo tab before testing.

## Architecture

```mermaid
flowchart LR
  A[dApp] -->|wallet request| B[PlainSign provider proxy]
  B -->|postMessage| C[Content bridge + overlay]
  C -->|runtime message| D[MV3 background worker]
  D --> E[Decode]
  E --> F[Enrich + optional simulate]
  F --> G[Open risk rules]
  G --> H[Plain-English verdict]
  H --> C
  C -->|Continue: original request| I[Wallet]
  C -->|Reject: error 4001| A
```

See [docs/architecture.md](docs/architecture.md) for execution contexts, trust boundaries, and the complete request lifecycle.

## What we intercept and why signatures matter

PlainSign intercepts five EIP-1193 methods:

| Method | Why inspect it |
|---|---|
| `eth_sendTransaction` | Calldata can hide token approvals, NFT collection permissions, transfers, swaps, and contract calls. |
| `eth_signTypedData_v4` / `v3` | EIP-712 signatures can create permits or marketplace orders that someone relays later without another wallet prompt. |
| `personal_sign` | Usually a readable login message, but an opaque 32-byte hash deserves a strong warning. |
| `eth_sign` | Raw hash signing is unusually powerful and receives an immediate Danger verdict. |

All other provider methods pass through immediately. Continue forwards the original request object; PlainSign never rewrites it.

## How the verdict is decided

The engine evaluates [`src/risk/rules.json`](src/risk/rules.json), sums matching weights, applies explicit verdict floors or instant verdicts, and lists every triggered reason. The table below is generated from that file by `npm run docs:rules`.

<!-- RULES_TABLE_START -->
Thresholds: **Safe 0-24**, **Caution 25-59**, **Danger 60-100**. Any critical reason is at least Caution.

| Rule | Plain-English reason | Severity | Score effect |
|---|---|---:|---:|
| `eth_sign` | Raw hash signing (eth_sign) | critical | Instant danger |
| `personal_sign_hash` | Signing an opaque 32-byte hash | critical | Instant danger |
| `spender_is_eoa` | Permission goes to a personal wallet, not an app | critical | Instant danger |
| `unlimited_approval` | Unlimited token permission | critical | +50 |
| `approval_for_all` | Full collection permission | critical | +45 |
| `permit_long_or_unlimited` | Long-lived or unlimited permit | warn | +35 |
| `permit2_transfer` | Gasless token transfer signature | critical | +40 |
| `order_near_zero` | Listing your NFTs for ~0 | critical | Instant danger |
| `known_drainer` | Known drainer address | critical | Instant danger |
| `contract_new` | Contract is less than 7 days old | warn | +25 |
| `unverified` | Unverified contract source | info | +15 |
| `domain_mismatch` | Website doesn't match the protocol | warn | +25 |
| `net_outflow` | You lose assets and receive nothing | critical | +40 |
| `sim_reverted` | Transaction would fail | info | 0; at least caution |
| `unknown_function` | Unrecognized action | warn | +20; at least caution |
| `allowlisted_target` | Known protocol on its official site | info | -20 |
<!-- RULES_TABLE_END -->

Rules are heuristics, not guarantees. A green verdict means the decoded request matched known low-risk patterns, not that an application or contract is universally safe.

## Develop and test

Requirements: Node.js 20 or 22, npm, and Chrome or Chromium.

```powershell
npm ci
npm --prefix contracts ci
npm --prefix demo-dapp ci
npm run verify:all
```

Useful artifact commands:

```powershell
npm run docs:rules
npm run screenshots
npm run slides
npm run package
```

`npm run verify:all` runs ESLint, TypeScript, unit tests, the production build, and browser E2E tests. `npm run demo:local` starts a no-faucet Hardhat demo. Environment variables and optional simulation setup are documented in [`.env.example`](.env.example).

## Limitations

- Verdicts are transparent heuristics, not security guarantees.
- Chrome with MetaMask is the primary tested path. EIP-6963 wallet discovery is best-effort.
- Transaction simulation is optional and Sepolia-only. Signatures are decoded, not simulated.
- Unknown functions, typed data, and incomplete address checks default to Caution. Known-drainer matches survive an RPC outage.
- Demo contracts live on Sepolia and hold only test assets.
- The extension is distributed as an unpacked hackathon build, not through the Chrome Web Store.

## Shipped features and roadmap

- Dangerous token and NFT permission warnings offer **Revoke instead**, which proposes a zero-permission transaction while rejecting the original request.
- PlainSign fetches its auditable [community drainer list](docs/denylist.json) from GitHub Pages and falls back to the bundled seed if the network is unavailable.
- Add more chains while preserving the same open-rule and no-backend design.
- Ethereum mainnet enrichment is now configured alongside Sepolia and the local demo. Mainnet simulation remains unavailable.
- Next: independent security review, five observed usability tests, and a wallet SDK pilot. No adoption or revenue is claimed yet.

## Team

**PlainSign:** Mohamed Adib, solo entrant and student at Sri Venkateswara College of Engineering. Registration and declarations are owner-confirmed complete on October 12. Madhav Krishna helped polish the project and is disclosed as a contributor, not an entrant. AI assistance and third-party services are disclosed in the submitted materials.

## License

[MIT](LICENSE)
