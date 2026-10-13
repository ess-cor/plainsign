import type { AnalysisRequest, SimulationResult } from "../types";
import { getChainConfig } from "../config/chains";
import { loadSettings } from "../config/settings";
import { simulateWithAlchemy } from "./alchemy";

export interface SimulateDeps {
  apiKey?: string;
  enabled?: boolean;
  simulateWithAlchemy?: typeof simulateWithAlchemy;
}

export async function simulate(
  request: AnalysisRequest,
  deps: SimulateDeps = {},
): Promise<SimulationResult> {
  const apiKey = deps.apiKey ?? import.meta.env?.VITE_ALCHEMY_KEY?.trim();
  if (
    request.request.method !== "eth_sendTransaction" ||
    getChainConfig(request.chainId)?.simulation !== true ||
    !apiKey
  ) {
    return { ok: false, provider: "none", changes: [] };
  }

  const enabled = deps.enabled ?? (await loadSettings()).simulationEnabled;
  if (!enabled || !apiKey) {
    return { ok: false, provider: "none", changes: [] };
  }

  return (deps.simulateWithAlchemy ?? simulateWithAlchemy)(request, apiKey);
}
