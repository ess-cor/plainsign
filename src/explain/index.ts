import { formatEther, formatUnits, type Address } from "viem";

import { chainName, nativeSymbol, wrappedSymbol } from "../config/chains";
import { shortAddr } from "../lib/shortAddr";
import type {
  AddressInfo,
  Explanation,
  Intent,
  RiskResult,
  SimulationResult,
} from "../types";
import { templates, type TemplateContext } from "./templates";

export interface ExplainOptions {
  chainId?: number;
  now?: number;
  degraded?: boolean;
}

export function explain(
  intent: Intent,
  simulation: SimulationResult,
  risk: RiskResult,
  addresses: Record<string, AddressInfo>,
  options: ExplainOptions = {},
): Explanation {
  const context = templateContext(
    intent,
    simulation,
    addresses,
    options.now ?? unixNow(),
    options.chainId,
  );
  const template = templates[intent.kind];
  const beginner = [
    ...template.beginner(intent, context),
    ...simulationBullets(simulation),
  ];
  if (options.degraded || intent.decodeError) {
    beginner.push(
      "PlainSign could not fully analyze this request. Only continue if you trust this site.",
    );
  }
  return {
    summary: template.summary(intent, context),
    beginner,
    technical: technicalDetails(intent, options.chainId, addresses),
    whatCouldGoWrong: risk.reasons[0]?.detail,
    source: "template",
  };
}

function templateContext(
  intent: Intent,
  simulation: SimulationResult,
  addresses: Record<string, AddressInfo>,
  now: number,
  chainId?: number,
): TemplateContext {
  const party =
    intent.spender ?? intent.operator ?? intent.recipient ?? intent.to;
  return {
    party: party ? displayAddress(party, addresses) : "this address",
    amount: amountText(intent, simulation),
    deadline: deadlineText(intent.deadline, now),
    tokenIds: intent.tokenIds?.map(String).join(", ") || "unknown",
    value:
      intent.value === undefined
        ? "an unknown amount"
        : formatEther(intent.value),
    native: nativeSymbol(chainId),
    wrapped: wrappedSymbol(chainId),
  };
}

function displayAddress(
  address: Address,
  addresses: Record<string, AddressInfo>,
): string {
  const info = addresses[address.toLowerCase()] ?? addresses[address];
  let label =
    info?.allowlisted?.protocol ?? info?.contractName ?? shortAddr(address);
  const isPersonal = info?.isContract === false;
  if (isPersonal) label += " — a personal wallet, not an app";
  if (info?.ageDays !== undefined && info.ageDays < 30) {
    label += ` (created ${info.ageDays} days ago)`;
  }
  if (isPersonal) label += " —";
  return label;
}

function amountText(intent: Intent, simulation: SimulationResult): string {
  const matching = simulation.changes.find(
    (change) => change.token?.toLowerCase() === intent.token?.toLowerCase(),
  );
  const symbol = matching?.symbol ?? "tokens";
  if (intent.isUnlimited) return `all of your ${symbol}, forever`;
  if (intent.amount === undefined) return "an unknown amount";
  const formatted =
    matching?.decimals === undefined
      ? intent.amount.toString()
      : formatUnits(intent.amount, matching.decimals);
  return `${formatted} ${symbol}`;
}

function deadlineText(deadline: number | undefined, now: number): string {
  if (deadline === undefined) return "with no stated expiry";
  const seconds = deadline - now;
  if (seconds >= 365 * 86_400) return "with no practical expiry";
  if (seconds <= 0) return "until its expired deadline";
  const days = Math.max(1, Math.ceil(seconds / 86_400));
  return `for the next ${days} day${days === 1 ? "" : "s"}`;
}

function simulationBullets(simulation: SimulationResult): string[] {
  if (simulation.reverted) {
    return [
      `Simulation says this would fail${simulation.revertReason ? `: ${simulation.revertReason}` : "."}`,
    ];
  }
  return simulation.changes.map((change) => {
    const direction = change.delta < 0n ? "lose" : "receive";
    return `Simulation shows you ${direction} ${change.formatted}.`;
  });
}

function technicalDetails(
  intent: Intent,
  chainId: number | undefined,
  addresses: Record<string, AddressInfo>,
): string[] {
  const details = [
    `Method: ${intent.method}`,
    `Function: ${intent.functionSig ?? "n/a"}`,
    `Primary type: ${intent.primaryType ?? "n/a"}`,
    `Chain ID: ${chainId ?? intent.domain?.chainId ?? "unknown"}`,
  ];
  if (chainId !== undefined) details.push(`Network: ${chainName(chainId)}`);
  if (
    intent.domain?.chainId !== undefined &&
    chainId !== undefined &&
    intent.domain.chainId !== chainId
  ) {
    details.push(
      `Signature domain chain: ${intent.domain.chainId} (${chainName(intent.domain.chainId)})`,
    );
  }
  for (const [label, value] of [
    ["To", intent.to],
    ["Token", intent.token],
    ["Counterparty", intent.spender ?? intent.operator ?? intent.recipient],
  ] as const) {
    if (value) details.push(`${label}: ${value}`);
  }
  if (intent.amount !== undefined) details.push(`Raw amount: ${intent.amount}`);
  if (intent.value !== undefined) details.push(`Raw value: ${intent.value}`);
  if (intent.tokenIds)
    details.push(`Raw token IDs: ${intent.tokenIds.join(",")}`);
  const described = new Set<string>();
  for (const address of [
    intent.to,
    intent.token,
    intent.spender,
    intent.operator,
    intent.recipient,
  ]) {
    if (!address || described.has(address.toLowerCase())) continue;
    described.add(address.toLowerCase());
    const info = addresses[address.toLowerCase()] ?? addresses[address];
    if (!info) continue;
    const facts = [info.contractName, info.isContract ? "contract" : "personal wallet"];
    if (info.isContract && info.isVerified !== undefined) {
      facts.push(info.isVerified ? "verified source" : "unverified source");
    }
    if (info.ageDays !== undefined) facts.push(`created ${info.ageDays} days ago`);
    details.push(`${address}: ${facts.filter(Boolean).join(" · ")}`);
  }
  return details;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1_000);
}
