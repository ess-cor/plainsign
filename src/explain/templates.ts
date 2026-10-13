import type { Intent, IntentKind } from "../types";

export interface TemplateContext {
  party: string;
  amount: string;
  deadline: string;
  tokenIds: string;
  value: string;
  /** Native gas token of the request's network (ETH, MON). */
  native: string;
  /** Wrapped form of the native token (WETH, WMON). */
  wrapped: string;
}

export interface ExplanationTemplate {
  summary: (intent: Intent, context: TemplateContext) => string;
  beginner: (intent: Intent, context: TemplateContext) => string[];
}

const simple = (
  summary: (intent: Intent, context: TemplateContext) => string,
  detail: (intent: Intent, context: TemplateContext) => string,
): ExplanationTemplate => ({
  summary,
  beginner: (intent, context) => [detail(intent, context)],
});

export const templates: Record<IntentKind, ExplanationTemplate> = {
  erc20_approve: simple(
    (_, c) => `This gives ${c.party} permission to take ${c.amount}.`,
    (_, c) => `The permission is valid ${c.deadline}.`,
  ),
  erc20_transfer: simple(
    (_, c) => `You'll send ${c.amount} to ${c.party}.`,
    () => "The tokens leave your wallet as soon as the transaction completes.",
  ),
  erc20_transferFrom: simple(
    (_, c) => `This moves ${c.amount} to ${c.party}.`,
    () => "The tokens are moved using an existing permission.",
  ),
  erc721_approve: simple(
    (_, c) => `This lets ${c.party} move NFT ${c.tokenIds}.`,
    () => "The permission applies to this NFT only.",
  ),
  erc721_setApprovalForAll: simple(
    (i, c) =>
      i.approved
        ? `This gives ${c.party} permission to move every NFT you own in this collection.`
        : `This removes ${c.party}'s permission to move NFTs in this collection.`,
    (i) =>
      i.approved
        ? "This address can move current and future NFTs from this collection."
        : "This address will no longer have collection-wide permission.",
  ),
  erc721_transfer: simple(
    (_, c) => `You'll send NFT ${c.tokenIds} to ${c.party}.`,
    () => "Ownership of the NFT moves out of your wallet.",
  ),
  erc1155_setApprovalForAll: simple(
    (i, c) =>
      i.approved
        ? `This gives ${c.party} permission to move every item you own in this collection.`
        : `This removes ${c.party}'s collection-wide permission.`,
    () => "This setting covers every token ID in the collection.",
  ),
  erc1155_transfer: simple(
    (_, c) => `You'll send collection item ${c.tokenIds} to ${c.party}.`,
    (_, c) => `The total raw quantity is ${c.amount}.`,
  ),
  permit_erc2612: simple(
    (_, c) => `This signature lets ${c.party} move ${c.amount}.`,
    (_, c) => `The signed permission is valid ${c.deadline}.`,
  ),
  permit2_single: simple(
    (_, c) => `This signature lets ${c.party} move ${c.amount} ${c.deadline}.`,
    () => "It can be used later without another wallet prompt.",
  ),
  permit2_batch: simple(
    (i, c) =>
      `This signature gives ${c.party} permission for ${i.children?.length ?? 0} tokens.`,
    (_, c) => `The signed permissions are valid ${c.deadline}.`,
  ),
  permit2_transferFrom: simple(
    (_, c) => `This signature can move ${c.amount} to ${c.party}.`,
    () => "Once submitted, it can move tokens without another wallet prompt.",
  ),
  seaport_order: simple(
    (i, c) =>
      i.considerationNearZero
        ? `This lists your NFT #${c.tokenIds} for sale for 0 ${c.native} — anyone can take it for free.`
        : `This signs a marketplace listing for NFT ${c.tokenIds}.`,
    (_, c) => `The listing is valid ${c.deadline}.`,
  ),
  native_transfer: simple(
    (_, c) => `You'll send ${c.value} ${c.native} to ${c.party}.`,
    (_, c) => `The ${c.native} leaves your wallet when the transaction completes.`,
  ),
  contract_deploy: simple(
    () => "You'll create a new smart contract.",
    () => "Creating a contract costs network fees and runs its setup code.",
  ),
  weth_wrap: simple(
    (_, c) => `You'll turn ${c.value} ${c.native} into the same amount of ${c.wrapped}.`,
    () => "Your value stays yours but changes into a token form.",
  ),
  weth_unwrap: simple(
    (_, c) => `You'll turn ${c.amount} ${c.wrapped} into ${c.native}.`,
    (_, c) => `Your value stays yours but changes back into native ${c.native}.`,
  ),
  swap: simple(
    (_, c) => `You'll exchange one asset for another ${c.deadline}.`,
    (_, c) => `The exchange must complete ${c.deadline}.`,
  ),
  multicall: simple(
    (i) =>
      `This groups ${i.children?.length ?? 0} actions into one transaction.`,
    () => "All grouped actions are submitted together.",
  ),
  siwe: simple(
    (i) =>
      `You're signing a login message for ${i.domain?.name ?? "this site"}. This can't move any assets.`,
    () => "This login message cannot move assets by itself.",
  ),
  plain_message: simple(
    () => "You're signing a readable message.",
    () => "Check that the displayed message matches what you expect.",
  ),
  raw_hash: simple(
    () => "You're being asked to sign an unreadable code. This could authorize anything.",
    () => "This could authorize something the page has not shown clearly.",
  ),
  unknown_function: simple(
    () => "PlainSign cannot identify what this transaction will do.",
    () => "Only continue if you trust this site and recognize the request.",
  ),
  unknown_typed_data: simple(
    () => "PlainSign cannot identify what this signature will allow.",
    () => "Only continue if you trust this site and recognize the request.",
  ),
};
