import { networkInfo } from "./config/network";
import { decode } from "./decoder";
import { collectAddresses, enrich } from "./enrich";
import { explain } from "./explain";
import { rewordExplanation } from "./explain/llm";
import { log } from "./lib/log";
import { evaluate } from "./risk/engine";
import { simulate } from "./simulate";
import type {
  AnalysisRequest,
  AnalysisResult,
  AnalysisTimings,
  Explanation,
  Intent,
  RiskReason,
  RiskResult,
  SimulationResult,
} from "./types";

const ANALYSIS_BUDGET_MS = 4_000;
export const DEGRADED_EXPLANATION =
  "PlainSign could not fully analyze this request. Only continue if you trust this site.";

const analysisFailedReason: RiskReason = {
  id: "analysis_failed",
  weight: 0,
  severity: "warn",
  title: "Analysis could not finish",
  detail:
    "PlainSign could not complete every safety check before the request timed out.",
};

export interface AnalyzeDeps {
  decode?: typeof decode;
  collectAddresses?: typeof collectAddresses;
  enrich?: typeof enrich;
  simulate?: typeof simulate;
  evaluate?: typeof evaluate;
  explain?: typeof explain;
  reword?: typeof rewordExplanation;
  now?: () => number;
  budgetMs?: number;
  debug?: (stage: string, data: { durationMs: number }) => void;
  debugTable?: (timings: AnalysisTimings & { totalMs: number }) => void;
}

export async function analyze(
  request: AnalysisRequest,
  deps: AnalyzeDeps = {},
): Promise<AnalysisResult> {
  const startedAt = now(deps);
  let latestIntent: Intent | undefined;
  let latestRisk: RiskResult | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pipeline = (async (): Promise<AnalysisResult> => {
    const decodeStartedAt = now(deps);
    latestIntent = await (deps.decode ?? decode)(request);
    const decodedMs = now(deps) - decodeStartedAt;
    report(deps, "decode", decodeStartedAt);

    const parallelStartedAt = now(deps);
    const addresses = (deps.collectAddresses ?? collectAddresses)(latestIntent);
    const [addressInfo, simulation] = await Promise.all([
      (deps.enrich ?? enrich)(addresses, request.chainId, request.origin),
      (deps.simulate ?? simulate)(request),
    ]);
    const enrichedMs = now(deps) - parallelStartedAt;
    report(deps, "enrich+simulate", parallelStartedAt);

    const evaluateStartedAt = now(deps);
    const risk = (deps.evaluate ?? evaluate)({
      request,
      intent: latestIntent,
      simulation,
      addresses: addressInfo,
      now: Math.floor(now(deps) / 1_000),
    });
    const incomplete = addresses.some(
      (address) => addressInfo[address.toLowerCase()]?.isContract === undefined,
    );
    if (incomplete) {
      risk.reasons.push({
        id: "address_checks_incomplete",
        weight: 0,
        severity: "warn",
        title: "Address checks incomplete",
        detail: "Some addresses could not be checked on this network. The request may carry risks PlainSign could not detect.",
      });
      if (risk.verdict === "safe") {
        risk.verdict = "caution";
        risk.score = Math.max(25, risk.score);
      }
    }
    latestRisk = risk;
    const rulesMs = now(deps) - evaluateStartedAt;
    report(deps, "evaluate", evaluateStartedAt);

    const explainStartedAt = now(deps);
    const templateExplanation = (deps.explain ?? explain)(
      latestIntent,
      simulation,
      risk,
      addressInfo,
      { chainId: request.chainId, now: Math.floor(now(deps) / 1_000) },
    );
    const explanation = await (deps.reword ?? rewordExplanation)(
      latestIntent,
      simulation,
      risk,
      templateExplanation,
    );
    report(deps, "explain", explainStartedAt);

    const durationMs = now(deps) - startedAt;
    const timings = { decodedMs, enrichedMs, rulesMs };
    reportTable(deps, { ...timings, totalMs: durationMs });
    return {
      id: request.id,
      intent: latestIntent,
      simulation,
      risk,
      explanation,
      durationMs,
      timings,
      network: networkInfo(request.chainId),
    };
  })();

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Analysis timed out.")),
      deps.budgetMs ?? ANALYSIS_BUDGET_MS,
    );
  });

  try {
    return await Promise.race([pipeline, timeout]);
  } catch (error) {
    const degraded = createDegradedResult(
      request,
      latestIntent,
      now(deps) - startedAt,
      error,
      latestRisk,
    );
    report(deps, "degraded", startedAt);
    return degraded;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createDegradedResult(
  request: AnalysisRequest,
  intent: Intent | undefined,
  durationMs: number,
  error?: unknown,
  completedRisk?: RiskResult,
): AnalysisResult {
  const fallbackIntent = intent ?? fallbackIntentFor(request, error);
  const simulation: SimulationResult = {
    ok: false,
    provider: "none",
    changes: [],
    error: errorMessage(error),
  };
  // Keep established warnings if a later stage fails, and retain locally
  // detectable dangers even when enrichment never completes.
  const risk = completedRisk ?? evaluate({
    request,
    intent: fallbackIntent,
    simulation,
    addresses: {},
    now: Math.floor(Date.now() / 1_000),
  });
  const explanation: Explanation = {
    summary: DEGRADED_EXPLANATION,
    beginner: [DEGRADED_EXPLANATION],
    technical: [
      `Method: ${request.request.method}`,
      `Chain ID: ${request.chainId}`,
    ],
    whatCouldGoWrong: analysisFailedReason.detail,
    source: "template",
  };
  return {
    id: request.id,
    intent: fallbackIntent,
    simulation,
    risk: {
      ...risk,
      score: Math.max(25, risk.score),
      verdict: risk.verdict === "safe" ? "caution" : risk.verdict,
      reasons: [...risk.reasons, analysisFailedReason],
    },
    explanation,
    durationMs,
    degraded: errorMessage(error) ?? "Analysis failed.",
    network: networkInfo(request.chainId),
  };
}

function fallbackIntentFor(request: AnalysisRequest, error: unknown): Intent {
  const method = request.request.method;
  return {
    kind:
      method === "eth_sendTransaction"
        ? "unknown_function"
        : method === "eth_signTypedData_v3" || method === "eth_signTypedData_v4"
          ? "unknown_typed_data"
          : method === "eth_sign"
            ? "raw_hash"
            : "plain_message",
    method,
    raw: request.request.params,
    decodeError: errorMessage(error) ?? "Analysis failed.",
  };
}

function now(deps: AnalyzeDeps): number {
  return deps.now?.() ?? Date.now();
}

function report(deps: AnalyzeDeps, stage: string, startedAt: number): void {
  const data = { durationMs: now(deps) - startedAt };
  (deps.debug ?? ((name, value) => log(`analyze:${name}`, value)))(stage, data);
}

function reportTable(
  deps: AnalyzeDeps,
  timings: AnalysisTimings & { totalMs: number },
): void {
  if (deps.debugTable) {
    deps.debugTable(timings);
    return;
  }
  if (
    import.meta.env?.DEV ||
    import.meta.env?.VITE_PLAINSIGN_DEBUG === "1"
  ) {
    console.table(
      Object.entries(timings).map(([stage, durationMs]) => ({ stage, durationMs })),
    );
  }
}

function errorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return error instanceof Error ? error.message : String(error);
}

export { networkInfo };
