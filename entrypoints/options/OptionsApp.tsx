import { useEffect, useState } from "react";

import {
  DEFAULT_SETTINGS,
  hasAlchemyKey,
  loadSettings,
  saveSettings,
  type PlainSignSettings,
} from "../../src/config/settings";
import type { AnalysisResult } from "../../src/types";
import { mountOverlay } from "../../src/ui/mount";

const sampleDanger: AnalysisResult = {
  id: "options-danger-preview",
  intent: {
    kind: "erc721_setApprovalForAll",
    method: "eth_sendTransaction",
    operator: "0x22222222222222222222222222222222222222aa",
    approved: true,
    raw: {},
  },
  simulation: {
    ok: true,
    provider: "alchemy",
    changes: [
      {
        kind: "erc721",
        token: "0x3333333333333333333333333333333333333333",
        tokenId: 1n,
        delta: -1n,
        formatted: "-1 Demo Cat #1",
      },
    ],
  },
  risk: {
    score: 85,
    verdict: "danger",
    reasons: [
      {
        id: "preview",
        weight: 45,
        severity: "critical",
        title: "Full collection permission",
        detail: "This address could move every NFT in the collection.",
      },
    ],
  },
  explanation: {
    summary:
      "This gives a personal wallet permission to move every NFT you own in Demo Cats.",
    beginner: ["The page calls this a mint, but it does not mint anything."],
    technical: [
      "Method: eth_sendTransaction",
      "Function: setApprovalForAll(address,bool)",
    ],
    source: "template",
  },
  durationMs: 42,
  timings: { decodedMs: 3, enrichedMs: 37, rulesMs: 2 },
};

export function OptionsApp() {
  const [settings, setSettings] = useState<PlainSignSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const alchemyAvailable = hasAlchemyKey();

  useEffect(() => {
    void loadSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });
  }, []);

  const update = async (next: PlainSignSettings): Promise<void> => {
    setSettings(next);
    setSaved(false);
    await saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_600);
  };

  const testOverlay = (): void => {
    const controller = mountOverlay(() => controller.unmount());
    controller.showResult(sampleDanger, settings.showTechnicalByDefault);
  };

  return (
    <main className="options-shell">
      <section className="options-panel" aria-labelledby="options-title">
        <header className="options-header">
          <div className="shield-mark" aria-hidden="true">
            PS
          </div>
          <div>
            <h1 id="options-title">PlainSign safety controls</h1>
            <p>Choose how wallet requests are explained before they reach your wallet.</p>
          </div>
        </header>

        <div className="verdict-key" aria-label="Verdict color key">
          <span className="safe">Safe</span>
          <span className="caution">Caution</span>
          <span className="danger">Danger</span>
        </div>

        <div className="control-list" aria-busy={!loaded}>
          <label className="control-row">
            <span>
              <strong>Show technical view by default</strong>
              <small>Open full methods, addresses, and timing details first.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.showTechnicalByDefault}
              disabled={!loaded}
              onChange={(event) =>
                void update({
                  ...settings,
                  showTechnicalByDefault: event.target.checked,
                })
              }
            />
          </label>

          <label className="control-row">
            <span>
              <strong>Enable simulation</strong>
              <small>
                {alchemyAvailable
                  ? "Preview expected balance changes on Sepolia. On Monad, PlainSign decodes and scores requests without a balance preview."
                  : "Unavailable in this build because no Alchemy key is configured."}
              </small>
            </span>
            <input
              type="checkbox"
              checked={alchemyAvailable && settings.simulationEnabled}
              disabled={!loaded || !alchemyAvailable}
              onChange={(event) =>
                void update({ ...settings, simulationEnabled: event.target.checked })
              }
            />
          </label>
        </div>

        <footer className="options-footer">
          <div className="save-state" role="status" aria-live="polite">
            {saved ? "Changes saved" : "Settings save automatically"}
          </div>
          <button type="button" onClick={testOverlay} disabled={!loaded}>
            Test danger overlay
          </button>
        </footer>
      </section>
    </main>
  );
}
