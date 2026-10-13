import localDeployment from "../../contracts/deployments/31337.json";
import protocolConfig from "./allowlist.json";

export const MAINNET_CHAIN_ID = 1 as const;
export const SEPOLIA_CHAIN_ID = 11_155_111 as const;
export const HARDHAT_CHAIN_ID = 31_337 as const;
/** Monad mainnet (https://docs.monad.xyz/developer-essentials/network-information). */
export const MONAD_CHAIN_ID = 143 as const;

export interface KnownProtocol {
  protocol: string;
  domains: string[];
}

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface PlainSignChainConfig {
  id: number;
  name: string;
  rpcUrls: readonly string[];
  blockscoutBaseUrl?: string;
  /** Human-facing block explorer used for "view on explorer" links. */
  explorerUrl?: string;
  testnet: boolean;
  nativeCurrency: NativeCurrency;
  /** Canonical wrapped-native contract (WETH on Ethereum, WMON on Monad). */
  wethAddress: `0x${string}`;
  wrappedSymbol: string;
  /** Whether the balance-change preview (Alchemy simulateAssetChanges) is wired up. */
  simulation: boolean;
  protocols: Record<string, KnownProtocol>;
}

const ETHER: NativeCurrency = { name: "Ether", symbol: "ETH", decimals: 18 };
const MON: NativeCurrency = { name: "Monad", symbol: "MON", decimals: 18 };

export const CHAINS = {
  [MAINNET_CHAIN_ID]: {
    id: MAINNET_CHAIN_ID,
    name: "Ethereum",
    rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    blockscoutBaseUrl: "https://eth.blockscout.com/api/v2/",
    explorerUrl: "https://etherscan.io",
    testnet: false,
    nativeCurrency: ETHER,
    wethAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    wrappedSymbol: "WETH",
    simulation: false,
    protocols: protocolConfig["1"],
  },
  [SEPOLIA_CHAIN_ID]: {
    id: SEPOLIA_CHAIN_ID,
    name: "Sepolia",
    rpcUrls: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.drpc.org",
    ],
    blockscoutBaseUrl: "https://eth-sepolia.blockscout.com/api/v2/",
    explorerUrl: "https://sepolia.etherscan.io",
    testnet: true,
    nativeCurrency: ETHER,
    wethAddress: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
    wrappedSymbol: "WETH",
    simulation: true,
    protocols: protocolConfig["11155111"],
  },
  [MONAD_CHAIN_ID]: {
    id: MONAD_CHAIN_ID,
    name: "Monad",
    // Public endpoints from the Monad docs (QuickNode, Alchemy, Goldsky, Ankr).
    rpcUrls: [
      "https://rpc.monad.xyz",
      "https://rpc1.monad.xyz",
      "https://rpc2.monad.xyz",
      "https://rpc3.monad.xyz",
    ],
    // Monad has no Blockscout instance; contract age/verification come back
    // as unknown and the engine treats them conservatively.
    explorerUrl: "https://monadvision.com",
    testnet: false,
    nativeCurrency: MON,
    wethAddress: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
    wrappedSymbol: "WMON",
    simulation: false,
    protocols: protocolConfig["143"],
  },
  [HARDHAT_CHAIN_ID]: {
    id: HARDHAT_CHAIN_ID,
    name: "Hardhat",
    rpcUrls: ["http://127.0.0.1:8545"],
    testnet: true,
    nativeCurrency: ETHER,
    wethAddress: localDeployment.WETH9 as `0x${string}`,
    wrappedSymbol: "WETH",
    simulation: false,
    protocols: {
      [localDeployment.WETH9.toLowerCase()]: {
        protocol: "Wrapped Ether (WETH, local)",
        domains: ["*"],
      },
    },
  },
} as const satisfies Record<number, PlainSignChainConfig>;

export type SupportedChainId = keyof typeof CHAINS;

export function getChainConfig(
  chainId: number,
): PlainSignChainConfig | undefined {
  return CHAINS[chainId as SupportedChainId];
}

export function nativeSymbol(chainId: number | undefined): string {
  return (chainId !== undefined && getChainConfig(chainId)?.nativeCurrency.symbol) || "ETH";
}

export function wrappedSymbol(chainId: number | undefined): string {
  return (chainId !== undefined && getChainConfig(chainId)?.wrappedSymbol) || "WETH";
}

export function chainName(chainId: number): string {
  return getChainConfig(chainId)?.name ?? `chain ${chainId}`;
}

export function explorerAddressUrl(
  chainId: number,
  address: string,
): string | undefined {
  const base = getChainConfig(chainId)?.explorerUrl;
  return base ? `${base}/address/${address}` : undefined;
}
