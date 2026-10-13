import { createPublicClient, defineChain, fallback, http } from "viem";

import {
  CHAINS,
  MAINNET_CHAIN_ID,
  MONAD_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  type SupportedChainId,
} from "./chains";

export function createPlainSignPublicClient(chainId: SupportedChainId) {
  const config = CHAINS[chainId];
  const configuredRpc =
    chainId === SEPOLIA_CHAIN_ID
      ? import.meta.env?.VITE_SEPOLIA_RPC?.trim()
      : chainId === MAINNET_CHAIN_ID
        ? import.meta.env?.VITE_MAINNET_RPC?.trim()
        : chainId === MONAD_CHAIN_ID
          ? import.meta.env?.VITE_MONAD_RPC?.trim()
          : undefined;
  const rpcUrls = configuredRpc
    ? [configuredRpc, ...config.rpcUrls]
    : [...config.rpcUrls];

  const chain = defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: rpcUrls },
    },
    testnet: config.testnet,
  });

  return createPublicClient({
    chain,
    transport: fallback(rpcUrls.map((url) => http(url))),
  });
}
