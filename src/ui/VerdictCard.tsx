import { useState } from "react";

import type { AnalysisResult, Verdict } from "../types";
import { AssetDiff } from "./AssetDiff";
import { Reasons } from "./Reasons";

export interface VerdictCardProps {
  result: AnalysisResult;
  showTechnicalByDefault?: boolean;
  canRevoke?: boolean;
  onContinue: () => void;
  onReject: () => void;
  onRevoke: () => void;
}

const verdictContent: Record<
  Verdict,
  { icon: string; label: string; cue: string }
> = {
  safe: { icon: "✓", label: "Safe", cue: "No major warning signs found" },
  caution: { icon: "!", label: "Caution", cue: "Check this request carefully" },
  danger: {
    icon: "×",
    label: "Danger",
    cue: "This request can put your assets at risk",
  },
};

export function VerdictCard({
  result,
  showTechnicalByDefault = false,
  canRevoke = false,
  onContinue,
  onReject,
  onRevoke,
}: VerdictCardProps) {
  const [view, setView] = useState<"beginner" | "technical">(
    showTechnicalByDefault ? "technical" : "beginner",
  );
  const content = verdictContent[result.risk.verdict];
  const details =
    view === "beginner"
      ? result.explanation.beginner
      : result.explanation.technical;

  return (
    <div className="ps-card">
      <header className={`ps-verdict ps-verdict-${result.risk.verdict}`}>
        <span className="ps-verdict-icon" aria-hidden="true">
          {content.icon}
        </span>
        <div>
          <h1>{content.label}</h1>
          <p>{content.cue}</p>
        </div>
        <span
          className="ps-score"
          aria-label={`Risk score ${result.risk.score} out of 100`}
        >
          {result.risk.score}
          <small>/100</small>
        </span>
      </header>

      <div className="ps-body">
        {result.network && (
          <p
            className={`ps-network${result.network.supported ? "" : " ps-network-unknown"}`}
            data-chain-id={result.network.chainId}
          >
            {result.network.supported
              ? `${result.network.name} · chain ${result.network.chainId} · ${result.network.nativeSymbol}`
              : `Unrecognized network · chain ${result.network.chainId}`}
          </p>
        )}
        <p className="ps-summary">{result.explanation.summary}</p>
        {result.explanation.source === "llm" && (
          <p className="ps-explanation-source">
            AI-reworded explanation · verdict remains rule-based
          </p>
        )}
        <AssetDiff changes={result.simulation.changes} />

        <div className="ps-toggle" role="group" aria-label="Explanation detail">
          <button
            type="button"
            aria-pressed={view === "beginner"}
            onClick={() => setView("beginner")}
          >
            Beginner
          </button>
          <button
            type="button"
            aria-pressed={view === "technical"}
            onClick={() => setView("technical")}
          >
            Technical
          </button>
        </div>

        <ul
          className={`ps-detail-list ${view === "technical" ? "ps-technical" : ""}`}
        >
          {details.map((detail, index) => (
            <li key={`${view}-${index}`}>{detail}</li>
          ))}
        </ul>

        <Reasons reasons={result.risk.reasons} />

        {view === "technical" && result.timings && (
          <p
            className="ps-stage-timings"
            data-total-ms={Math.round(result.durationMs)}
          >
            decoded {Math.round(result.timings.decodedMs)} ms · enriched{" "}
            {Math.round(result.timings.enrichedMs)} ms · rules{" "}
            {Math.round(result.timings.rulesMs)} ms
          </p>
        )}
      </div>

      <footer
        className={`ps-actions ${result.risk.verdict === "danger" ? "ps-danger-actions" : ""} ${canRevoke && result.risk.verdict === "danger" ? "ps-revoke-actions" : ""}`}
      >
        <button
          className="ps-button ps-reject"
          type="button"
          onClick={onReject}
        >
          Reject
        </button>
        {canRevoke && result.risk.verdict === "danger" && (
          <button
            className="ps-button ps-revoke"
            type="button"
            onClick={onRevoke}
          >
            Revoke instead
          </button>
        )}
        <button
          className="ps-button ps-continue"
          type="button"
          onClick={onContinue}
        >
          Continue to wallet
        </button>
      </footer>
    </div>
  );
}
