/**
 * Shared types for the weighted block model and scenario manifests.
 *
 * "Dynamic proportion" is operationalized by BLOCK WEIGHT, not visual area:
 * each block carries a weight proportional to its simulated server work
 * (DOM size + synthetic latency). Scenario percentages select blocks whose
 * total weight matches the target exactly (weights are calibrated so that
 * top-down and bottom-up prefix sums hit 25/50/75).
 */

export type Placement = "atf" | "btf" | "mixed";
export type Strategy = "ssg" | "ssr" | "ppr";

export interface BlockDef {
  /** Stable identifier, also used as DOM anchor and repository key. */
  id: string;
  /** Human-readable label rendered in the block heading. */
  label: string;
  /** 0-based position in the fixed page layout (top to bottom). */
  order: number;
  /**
   * Weight in percent of total page work. All 20 weights sum to 100.
   * Prefix sums from the top and from the bottom both hit 25/50/75 exactly.
   */
  weight: number;
  /**
   * Synthetic server latency in ms applied when this block renders
   * DYNAMICALLY (request-time repository call). latencyMs = weight * 10,
   * giving a mean of 50ms per block (plan default) while honoring the
   * weight-proportional work model.
   */
  latencyMs: number;
  /** Number of data items rendered (DOM size scales with weight). */
  itemCount: number;
  /** Whether the block contains a client-side interactive island. */
  hasIsland: boolean;
}

export interface ScenarioManifest {
  /** e.g. "p50_atf" */
  id: string;
  /** Target dynamic proportion by weight, in percent. */
  proportionPct: 0 | 25 | 50 | 75 | 100;
  placement: Placement;
  /** Block ids rendered dynamically (request-time data + latency). */
  dynamicBlockIds: string[];
  /** Realized dynamic weight (must equal proportionPct for primary). */
  dynamicWeight: number;
  dynamicBlockCount: number;
  /** Sum of latencyMs across dynamic blocks (serial upper bound). */
  totalDynamicLatencyMs: number;
  /** Additional per-scenario base latency (ms) added to each dynamic fetch. */
  baseLatencyMs: number;
  /** Whether this scenario belongs to the primary matrix. */
  inPrimary: boolean;
}

export interface ScenarioConfigFile {
  name: string;
  description: string;
  scenarioIds: string[];
  strategies: Strategy[];
  conditionCount: number;
}
