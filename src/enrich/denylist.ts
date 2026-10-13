import seedDocument from "../../docs/denylist.json";

import { fetchWithTimeout } from "../lib/fetchWithTimeout";

export const COMMUNITY_DENYLIST_URL =
  "https://ess-cor.github.io/plainsign/denylist.json";
const CACHE_TTL_MS = 5 * 60 * 1_000;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export interface CommunityDenylistEntry {
  address: `0x${string}`;
  label: string;
  chains: number[];
  source: string;
}

interface CommunityDenylistDocument {
  version: number;
  updatedAt: string;
  allow: `0x${string}`[];
  deny: CommunityDenylistEntry[];
}

type DenylistFetcher = typeof fetchWithTimeout;

interface DenylistDeps {
  fetcher?: DenylistFetcher;
  now?: () => number;
}

let cached:
  { entries: CommunityDenylistEntry[]; expiresAt: number } | undefined;

export async function getCommunityDenylist(
  deps: DenylistDeps = {},
): Promise<CommunityDenylistEntry[]> {
  const fallback = parseDocument(seedDocument).deny;
  if (deps.fetcher) {
    try {
      return await loadRemote(deps.fetcher);
    } catch {
      return fallback;
    }
  }

  if (import.meta.env?.MODE === "test" || import.meta.env?.VITE_E2E === "1") {
    return fallback;
  }

  const now = deps.now?.() ?? Date.now();
  if (cached && cached.expiresAt > now) return cached.entries;

  let entries = fallback;
  try {
    entries = await loadRemote(fetchWithTimeout);
  } catch {
    // The signed-in user stays protected by the bundled seed when Pages is offline.
  }
  cached = { entries, expiresAt: now + CACHE_TTL_MS };
  return entries;
}

export function findCommunityDenylistEntry(
  entries: CommunityDenylistEntry[],
  address: string,
  chainId: number,
): CommunityDenylistEntry | undefined {
  const normalized = address.toLowerCase();
  return entries.find(
    (entry) =>
      entry.address.toLowerCase() === normalized &&
      entry.chains.includes(chainId),
  );
}

async function loadRemote(
  fetcher: DenylistFetcher,
): Promise<CommunityDenylistEntry[]> {
  const response = await fetcher(
    COMMUNITY_DENYLIST_URL,
    { headers: { accept: "application/json" } },
    1_500,
  );
  if (!response.ok) {
    throw new Error(`Community denylist returned HTTP ${response.status}.`);
  }
  return parseDocument(await response.json()).deny;
}

function parseDocument(value: unknown): CommunityDenylistDocument {
  if (!isRecord(value)) throw new TypeError("Denylist must be an object.");
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    typeof value.updatedAt !== "string"
  ) {
    throw new TypeError("Denylist metadata is invalid.");
  }
  if (!Array.isArray(value.allow) || !value.allow.every(isAddress)) {
    throw new TypeError("Denylist allow entries are invalid.");
  }
  if (!Array.isArray(value.deny)) {
    throw new TypeError("Denylist deny entries are invalid.");
  }

  const allowed = new Set(value.allow.map((address) => address.toLowerCase()));
  const deny = value.deny
    .map(parseEntry)
    .filter((entry) => !allowed.has(entry.address.toLowerCase()));
  return {
    version: value.version,
    updatedAt: value.updatedAt,
    allow: value.allow,
    deny,
  };
}

function parseEntry(value: unknown): CommunityDenylistEntry {
  if (
    !isRecord(value) ||
    !isAddress(value.address) ||
    typeof value.label !== "string" ||
    value.label.trim() === "" ||
    typeof value.source !== "string" ||
    value.source.trim() === "" ||
    !Array.isArray(value.chains) ||
    !value.chains.every((chain) => Number.isSafeInteger(chain) && chain > 0)
  ) {
    throw new TypeError("Denylist entry is invalid.");
  }
  return {
    address: value.address,
    label: value.label,
    chains: value.chains,
    source: value.source,
  };
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
