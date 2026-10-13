import { enrich } from ".";
import { getAllowlistedAddresses } from "./allowlist";

const SEPOLIA_CHAIN_ID = 11_155_111;
const MONAD_CHAIN_ID = 143;
const WARM_CHAINS = [SEPOLIA_CHAIN_ID, MONAD_CHAIN_ID] as const;

export interface WarmupDeps {
  enrich?: typeof enrich;
  getAllowlistedAddresses?: typeof getAllowlistedAddresses;
}

export async function warmAllowlistedAddresses(
  deps: WarmupDeps = {},
): Promise<void> {
  for (const chainId of WARM_CHAINS) {
    const addresses = (deps.getAllowlistedAddresses ?? getAllowlistedAddresses)(
      chainId,
    );
    if (addresses.length === 0) continue;
    try {
      await (deps.enrich ?? enrich)(
        addresses,
        chainId,
        "chrome-extension://plainsign-warmup",
      );
    } catch {
      // Warm-up is opportunistic; normal enrichment still runs on demand.
    }
  }
}
