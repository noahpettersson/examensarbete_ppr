import type { ScenarioManifest, Strategy } from "@/scenarios/schema";

/** Shared page chrome carrying machine-readable scenario metadata. */
export function PageFrame({
  strategy,
  manifest,
  children,
}: {
  strategy: Strategy;
  manifest: ScenarioManifest;
  children: React.ReactNode;
}) {
  return (
    <main
      className="page"
      data-strategy={strategy}
      data-scenario={manifest.id}
      data-proportion={manifest.proportionPct}
      data-placement={manifest.placement}
      data-dynamic-weight={manifest.dynamicWeight}
      data-dynamic-count={manifest.dynamicBlockCount}
    >
      {children}
    </main>
  );
}
