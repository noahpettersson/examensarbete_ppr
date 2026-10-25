import allManifests from "./manifests/all.json";
import type { ScenarioManifest } from "./schema";

const MANIFESTS = allManifests as Record<string, ScenarioManifest>;

export function getManifest(scenarioId: string): ScenarioManifest {
  const manifest = MANIFESTS[scenarioId];
  if (!manifest) throw new Error(`Unknown scenario: ${scenarioId}`);
  return manifest;
}

export function allScenarioIds(): string[] {
  return Object.keys(MANIFESTS);
}
