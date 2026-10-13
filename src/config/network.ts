import type { NetworkInfo } from "../types";
import { getChainConfig } from "./chains";

export function networkInfo(chainId: number): NetworkInfo {
  const config = getChainConfig(chainId);
  return {
    chainId,
    name: config?.name ?? `Chain ${chainId}`,
    nativeSymbol: config?.nativeCurrency.symbol ?? "native token",
    explorerUrl: config?.explorerUrl,
    supported: config !== undefined,
  };
}
