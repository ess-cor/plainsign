import type { Address, Hex } from "viem";

export type Verdict = "safe" | "caution" | "danger"; // 🟢 🟡 🔴

export type InterceptedMethod =
  | "eth_sendTransaction" | "eth_signTypedData_v4" | "eth_signTypedData_v3"
  | "personal_sign" | "eth_sign";

export interface RawRequest { method: InterceptedMethod; params: unknown[]; } // never mutated

export interface AnalysisRequest {
  id: string; origin: string; chainId: number; from: Address; request: RawRequest;
}

export type IntentKind =
  | "erc20_approve" | "erc20_transfer" | "erc20_transferFrom"
  | "erc721_approve" | "erc721_setApprovalForAll" | "erc721_transfer"
  | "erc1155_setApprovalForAll" | "erc1155_transfer"
  | "permit_erc2612" | "permit2_single" | "permit2_batch" | "permit2_transferFrom"
  | "seaport_order" | "native_transfer" | "contract_deploy"
  | "weth_wrap" | "weth_unwrap" | "swap" | "multicall"
  | "siwe" | "plain_message" | "raw_hash"
  | "unknown_function" | "unknown_typed_data";

export interface Intent {
  kind: IntentKind; method: InterceptedMethod;
  to?: Address; spender?: Address; operator?: Address; token?: Address; recipient?: Address;
  tokenIds?: bigint[]; amount?: bigint; isUnlimited?: boolean; deadline?: number; value?: bigint;
  approved?: boolean;                 // setApprovalForAll flag
  functionName?: string; functionSig?: string; primaryType?: string;
  domain?: { name?: string; verifyingContract?: Address; chainId?: number };
  considerationNearZero?: boolean;    // seaport
  children?: Intent[]; raw: unknown; decodeError?: string;
}

export interface AssetChange {
  kind: "native" | "erc20" | "erc721" | "erc1155"; token?: Address; symbol?: string;
  decimals?: number; tokenId?: bigint; delta: bigint; formatted: string;
}
export interface SimulationResult {
  ok: boolean; reverted?: boolean; revertReason?: string; changes: AssetChange[];
  provider: "alchemy" | "none"; error?: string;
}
export interface AddressInfo {
  address: Address; isContract?: boolean; isVerified?: boolean; contractName?: string;
  ageDays?: number; allowlisted?: { protocol: string; domains: string[] };
  denylisted?: { label: string; source: string }; fetchedAt: number;
}
export interface RiskReason {
  id: string; weight: number; severity: "info" | "warn" | "critical"; title: string; detail: string;
}
export interface RiskResult { score: number; verdict: Verdict; reasons: RiskReason[]; instantVerdict?: Verdict; }
export interface RiskContext {
  request: AnalysisRequest; intent: Intent; simulation: SimulationResult;
  addresses: Record<string, AddressInfo>; now: number;
}
export interface Explanation {
  summary: string; beginner: string[]; technical: string[]; whatCouldGoWrong?: string; source: "template" | "llm";
}
export interface AnalysisTimings {
  decodedMs: number; enrichedMs: number; rulesMs: number;
}
export interface AnalysisResult {
  id: string; intent: Intent; simulation: SimulationResult; risk: RiskResult;
  explanation: Explanation; durationMs: number; timings?: AnalysisTimings; degraded?: string;
  /** Network the wallet was on when the request was made. */
  network?: NetworkInfo;
}
export interface NetworkInfo {
  chainId: number; name: string; nativeSymbol: string; explorerUrl?: string; supported: boolean;
}

export interface RevokeTransaction {
  from: Address;
  to: Address;
  data: Hex;
}

export type UserDecision = "continue" | "reject" | "revoke";

// Bridge messages (all payloads pass through bridge/protocol serialize/deserialize)
export type MainToContent   = { type: "PS_ANALYZE"; payload: AnalysisRequest } | { type: "PS_PING" };
export type ContentToMain   = { type: "PS_DECISION"; id: string; decision: UserDecision; transaction?: RevokeTransaction } | { type: "PS_PONG" };
export type ContentToBg     = { type: "PS_BG_ANALYZE"; payload: AnalysisRequest };
export type BgToContent     = { type: "PS_BG_RESULT"; payload: AnalysisResult };
