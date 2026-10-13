# Changelog

All notable changes to PlainSign are documented here.

## 0.3.0 - 2026-10-13 (Monad edition)

### Added

- Monad mainnet (chain 143): MON native currency, public RPCs with fallbacks and `VITE_MONAD_RPC`, MonadVision explorer links, WMON as the wrapped native token.
- Monad canonical-contract allowlist (WMON, USDC, USDT0, bridged WETH, Permit2, Uniswap, Kuru, PancakeSwap, Seaport, Multicall3).
- `typed_data_chain_mismatch` rule: Caution when an EIP-712 domain targets a different chain than the wallet.
- Network badge on the verdict card and network metadata on every analysis result.
- Monad samples in the wallet-free walkthrough (now the default network), a Monad request lab page, `npm run verify:monad`, and a Monad test suite.

### Changed

- Native and wrapped token wording follows the active chain (MON/WMON on Monad) instead of hardcoded ETH/WETH.
- Simulation runs only on chains configured for it; Monad decodes and scores without a balance preview.

## 0.2.1 - 2026-10-12

### Fixed

- WETH wrap/unwrap explanations require the registered contract address for the active chain; lookalike calls and short unknown calldata receive Caution.
- All 32-byte personal-sign hex payloads receive Danger, including hashes that happen to decode as UTF-8.
- Analysis failures retain established Danger warnings and locally detectable raw-signing risks.
- TypeScript excludes generated and archived output, allowing verification after media preparation.
- Release automation includes upstream runtime license notices.

### Added

- An imitation-WETH comparison and inspectable request JSON in the wallet-free walkthrough, plus direct demo/deck navigation.
- Regression checks for contract identity, hash signing, and warnings surviving failed explanation stages.

## 0.2.0 - 2026-10-10

### Added

- Ethereum mainnet RPC and explorer support, plus a shared registry for network-specific WETH and protocol data.
- A wallet-free sample walkthrough using the production decoder, rules and verdict card with labelled simulated metadata.
- Read-only mainnet verification and a reproducible key-free submission package.
- Crypto World's Fair pitch deck, startup presentation script, business hypotheses and explicit pre-existing-code disclosure.

### Fixed

- Known-drainer matches remain visible when RPC enrichment fails.
- Incomplete address checks impose a Caution floor without lowering Danger or misclassifying unknown addresses as EOAs.

## 0.1.0 - 2026-09-11

### Added

- Chrome MV3 interception for Ethereum transactions, typed data, personal messages, and raw hash signing.
- viem-based decoding, public RPC and Blockscout enrichment, optional Sepolia simulation, and deterministic JSON risk rules.
- Plain-English Safe, Caution, and Danger overlay with beginner and technical views.
- Local and Sepolia demo flows, automated unit and browser tests, release packaging, and GitHub Pages deployment.
- Submission README, architecture guide, generated screenshots, Marp PDF deck, demo script, and submission draft.

### Fixed

- Unknown functions and unknown typed data now explicitly floor the verdict at Caution, matching the documented conservative behavior.
