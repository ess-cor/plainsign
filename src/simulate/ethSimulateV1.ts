import {
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
} from "viem";

import { getChainConfig, nativeSymbol } from "../config/chains";
import type { AnalysisRequest, AssetChange, SimulationResult } from "../types";
import type { SimulationTransaction } from "./defaults";

const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));
const DEPOSIT_TOPIC = keccak256(stringToHex("Deposit(address,uint256)"));
const WITHDRAWAL_TOPIC = keccak256(stringToHex("Withdrawal(address,uint256)"));

interface SimulatedLog {
  address?: unknown;
  topics?: unknown;
  data?: unknown;
}

export function simulationFromEthSimulateV1(
  payload: unknown,
  request: AnalysisRequest,
  transaction: SimulationTransaction,
): SimulationResult | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.result)) return undefined;
  const calls = payload.result.flatMap((block) =>
    isRecord(block) && Array.isArray(block.calls) ? block.calls : [],
  );
  if (calls.length === 0) return undefined;

  for (const call of calls) {
    if (!isRecord(call) || typeof call.status !== "string") return undefined;
    if (call.status !== "0x1") {
      return {
        ok: false,
        provider: "alchemy",
        reverted: true,
        revertReason: "Simulation reverted.",
        changes: [],
      };
    }
  }

  const changes: AssetChange[] = [];
  const nativeChange = topLevelNativeChange(request.from, transaction, request.chainId);
  if (nativeChange) changes.push(nativeChange);

  for (const call of calls) {
    if (!isRecord(call) || !Array.isArray(call.logs)) continue;
    for (const log of call.logs) {
      const change = logChange(log, request.from, request.chainId);
      if (change) changes.push(change);
    }
  }

  return { ok: true, provider: "alchemy", changes: mergeChanges(changes) };
}

function topLevelNativeChange(
  account: Address,
  transaction: SimulationTransaction,
  chainId: number,
): AssetChange | undefined {
  const symbol = nativeSymbol(chainId);
  const magnitude = integerValue(transaction.value);
  if (magnitude === undefined || magnitude === 0n) return undefined;
  const owner = account.toLowerCase();
  const from = normalizeAddress(transaction.from);
  const to = normalizeAddress(transaction.to);
  const outgoing = from === owner && to !== owner;
  const incoming = to === owner && from !== owner;
  if (!outgoing && !incoming) return undefined;
  const delta = outgoing ? -magnitude : magnitude;
  return {
    kind: "native",
    symbol,
    delta,
    formatted: formatDelta(delta, 18, symbol),
  };
}

function logChange(
  value: unknown,
  account: Address,
  chainId: number,
): AssetChange | undefined {
  if (!isRecord(value)) return undefined;
  const log = value as SimulatedLog;
  if (
    typeof log.address !== "string" ||
    !isAddress(log.address) ||
    !Array.isArray(log.topics) ||
    typeof log.topics[0] !== "string"
  ) {
    return undefined;
  }

  const token = getAddress(log.address);
  const topic = log.topics[0].toLowerCase();
  if (isKnownWeth(token, chainId) && topic === DEPOSIT_TOPIC.toLowerCase()) {
    return wethLifecycleChange(log, account, token, false, chainId);
  }
  if (isKnownWeth(token, chainId) && topic === WITHDRAWAL_TOPIC.toLowerCase()) {
    return wethLifecycleChange(log, account, token, true, chainId);
  }
  if (topic === TRANSFER_TOPIC.toLowerCase()) {
    return transferChange(log, account, token, chainId);
  }
  return undefined;
}

function wethLifecycleChange(
  log: SimulatedLog,
  account: Address,
  token: Address,
  outgoing: boolean,
  chainId: number,
): AssetChange | undefined {
  const owner = topicAddress(log.topics, 1);
  const magnitude = integerValue(log.data);
  if (owner !== account.toLowerCase() || magnitude === undefined) return undefined;
  const delta = outgoing ? -magnitude : magnitude;
  return {
    kind: "erc20",
    token,
    symbol: getChainConfig(chainId)?.wrappedSymbol ?? "WETH",
    decimals: 18,
    delta,
    formatted: formatDelta(delta, 18, getChainConfig(chainId)?.wrappedSymbol ?? "WETH"),
  };
}

function transferChange(
  log: SimulatedLog,
  account: Address,
  token: Address,
  chainId: number,
): AssetChange | undefined {
  const from = topicAddress(log.topics, 1);
  const to = topicAddress(log.topics, 2);
  const owner = account.toLowerCase();
  const outgoing = from === owner && to !== owner;
  const incoming = to === owner && from !== owner;
  if (!outgoing && !incoming) return undefined;

  if (Array.isArray(log.topics) && log.topics.length >= 4) {
    const tokenId = integerValue(log.topics[3]);
    if (tokenId === undefined) return undefined;
    const delta = outgoing ? -1n : 1n;
    return {
      kind: "erc721",
      token,
      tokenId,
      delta,
      formatted: `${outgoing ? "-" : "+"}1 ERC721 #${tokenId}`,
    };
  }

  if (!isKnownWeth(token, chainId)) return undefined;
  const magnitude = integerValue(log.data);
  if (magnitude === undefined) return undefined;
  const delta = outgoing ? -magnitude : magnitude;
  return {
    kind: "erc20",
    token,
    symbol: getChainConfig(chainId)?.wrappedSymbol ?? "WETH",
    decimals: 18,
    delta,
    formatted: formatDelta(delta, 18, getChainConfig(chainId)?.wrappedSymbol ?? "WETH"),
  };
}

function mergeChanges(changes: AssetChange[]): AssetChange[] {
  const merged = new Map<string, AssetChange>();
  for (const change of changes) {
    const key = [change.kind, change.token?.toLowerCase(), change.tokenId].join(":");
    const current = merged.get(key);
    if (!current) {
      merged.set(key, change);
      continue;
    }
    const delta = current.delta + change.delta;
    merged.set(key, {
      ...current,
      delta,
      formatted:
        current.kind === "native"
          ? formatDelta(delta, 18, current.symbol ?? "ETH")
          : current.kind === "erc20" && current.decimals !== undefined
            ? formatDelta(delta, current.decimals, current.symbol ?? "TOKEN")
            : current.formatted,
    });
  }
  return [...merged.values()].filter((change) => change.delta !== 0n);
}

function formatDelta(delta: bigint, decimals: number, symbol: string): string {
  const magnitude = delta < 0n ? -delta : delta;
  const amount = trimFraction(formatUnits(magnitude, decimals));
  return `${delta < 0n ? "-" : "+"}${amount} ${symbol}`;
}

function topicAddress(topics: unknown, index: number): string | undefined {
  if (!Array.isArray(topics)) return undefined;
  const topic = topics[index];
  return typeof topic === "string" && /^0x[0-9a-fA-F]{64}$/.test(topic)
    ? `0x${topic.slice(-40)}`.toLowerCase()
    : undefined;
}

function integerValue(value: unknown): bigint | undefined {
  try {
    return typeof value === "string" && value.trim() ? BigInt(value) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAddress(value: unknown): string | undefined {
  return typeof value === "string" && isAddress(value)
    ? value.toLowerCase()
    : undefined;
}

function isKnownWeth(token: Address, chainId: number): boolean {
  const config = getChainConfig(chainId);
  return config?.simulation === true && token.toLowerCase() === config.wethAddress.toLowerCase();
}

function trimFraction(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
