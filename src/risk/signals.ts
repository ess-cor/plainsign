import type { AddressInfo, Intent, RiskContext } from "../types";

export type Signal = (context: RiskContext, argument?: string) => boolean;

export function flattenIntents(intent: Intent): Intent[] {
  return [intent, ...(intent.children ?? []).flatMap(flattenIntents)];
}

export const isEthSign: Signal = ({ intent }) => intent.method === "eth_sign";

export const isPersonalSignHexHash: Signal = ({ intent }) =>
  intent.method === "personal_sign" && intent.kind === "raw_hash";

export const isSpenderEOA: Signal = (context) =>
  flattenIntents(context.intent).some((intent) => {
    const party = intent.spender ?? intent.operator;
    return (
      party !== undefined && addressInfo(context, party)?.isContract === false
    );
  });

export const isUnlimitedApprovalToUnknown: Signal = (context) =>
  flattenIntents(context.intent).some(
    (intent) =>
      (intent.kind === "erc20_approve" || intent.kind === "permit_erc2612") &&
      intent.isUnlimited === true &&
      !isAllowlisted(context, intent.spender),
  );

export const isSetApprovalForAllToUnknown: Signal = (context) =>
  flattenIntents(context.intent).some(
    (intent) =>
      (intent.kind === "erc721_setApprovalForAll" ||
        intent.kind === "erc1155_setApprovalForAll") &&
      intent.approved === true &&
      !isAllowlisted(context, intent.operator),
  );

export const isPermitLongOrUnlimited: Signal = (context) =>
  flattenIntents(context.intent).some(
    (intent) =>
      (intent.kind === "permit_erc2612" ||
        intent.kind === "permit2_single" ||
        intent.kind === "permit2_batch") &&
      (intent.isUnlimited === true ||
        (intent.deadline !== undefined &&
          intent.deadline - context.now > 30 * 86_400)),
  );

export const isPermit2TransferFrom: Signal = ({ intent }) =>
  flattenIntents(intent).some((item) => item.kind === "permit2_transferFrom");

export const isMarketplaceOrderNearZero: Signal = ({ intent }) =>
  flattenIntents(intent).some(
    (item) =>
      item.kind === "seaport_order" && item.considerationNearZero === true,
  );

export const isKnownDrainer: Signal = (context) =>
  flattenIntents(context.intent).some((intent) =>
    [intent.to, intent.spender, intent.operator, intent.recipient]
      .filter((address): address is `0x${string}` => address !== undefined)
      .some(
        (address) => addressInfo(context, address)?.denylisted !== undefined,
      ),
  );

export const isTargetYoungerThanDays: Signal = (context, argument) => {
  const days = Number(argument);
  return targetInfos(context).some(
    (info) => info.ageDays !== undefined && info.ageDays < days,
  );
};

export const isTargetUnverified: Signal = (context) =>
  targetInfos(context).some(
    (info) => info.isContract && info.isVerified === false,
  );

export const isDomainMismatch: Signal = (context) =>
  targetInfos(context).some(
    (info) =>
      info.allowlisted !== undefined &&
      !domainMatches(context.request.origin, info),
  );

export const isNetOutflowNoInflow: Signal = ({ simulation }) =>
  simulation.changes.some((change) => change.delta < 0n) &&
  !simulation.changes.some((change) => change.delta > 0n);

export const didSimulationRevert: Signal = ({ simulation }) =>
  simulation.reverted === true;

export const isUnknownFunction: Signal = ({ intent }) =>
  flattenIntents(intent).some(
    (item) =>
      item.kind === "unknown_function" || item.kind === "unknown_typed_data",
  );

export const isTargetAllowlistedAndDomainOk: Signal = (context) => {
  const infos = targetInfos(context);
  return infos.some(
    (info) =>
      info.allowlisted !== undefined &&
      domainMatches(context.request.origin, info),
  );
};

/**
 * A typed-data signature names the chain it is valid on. When that chain is
 * not the network the wallet is connected to (for example a Permit2 approval
 * for Ethereum requested while the wallet is on Monad), the site is asking for
 * a permission the user cannot see in context. Permit2, Seaport and many
 * tokens share addresses across chains, so the contract alone looks familiar.
 */
export const isTypedDataChainMismatch: Signal = ({ intent, request }) => {
  const domainChain = intent.domain?.chainId;
  return (
    domainChain !== undefined &&
    request.chainId > 0 &&
    domainChain !== request.chainId
  );
};

export const signalRegistry: Record<string, Signal> = {
  isEthSign,
  isPersonalSignHexHash,
  isSpenderEOA,
  isUnlimitedApprovalToUnknown,
  isSetApprovalForAllToUnknown,
  isPermitLongOrUnlimited,
  isPermit2TransferFrom,
  isMarketplaceOrderNearZero,
  isKnownDrainer,
  isTargetYoungerThanDays,
  isTargetUnverified,
  isDomainMismatch,
  isNetOutflowNoInflow,
  didSimulationRevert,
  isUnknownFunction,
  isTargetAllowlistedAndDomainOk,
  isTypedDataChainMismatch,
};

function targetInfos(context: RiskContext): AddressInfo[] {
  const targets = flattenIntents(context.intent).flatMap((intent) =>
    [intent.to, intent.spender, intent.operator].filter(
      (address): address is `0x${string}` => address !== undefined,
    ),
  );
  return targets
    .map((address) => addressInfo(context, address))
    .filter((info): info is AddressInfo => info !== undefined);
}

function addressInfo(
  context: RiskContext,
  address: string,
): AddressInfo | undefined {
  return context.addresses[address.toLowerCase()] ?? context.addresses[address];
}

function isAllowlisted(
  context: RiskContext,
  address: string | undefined,
): boolean {
  return (
    address !== undefined &&
    addressInfo(context, address)?.allowlisted !== undefined
  );
}

function domainMatches(origin: string, info: AddressInfo): boolean {
  const domains = info.allowlisted?.domains;
  if (!domains) return false;
  if (domains.includes("*")) return true;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => {
    const normalized = domain.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}
