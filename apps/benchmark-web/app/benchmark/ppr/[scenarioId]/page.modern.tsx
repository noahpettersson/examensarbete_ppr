import { PPRPageComposer } from "@/rendering/PPRPageComposer";
import { getManifest, allScenarioIds } from "@/scenarios/loadManifest";

/** Static shells (static blocks + skeleton holes) prerender at build time. */
export async function generateStaticParams() {
  return allScenarioIds().map((scenarioId) => ({ scenarioId }));
}

export default async function PPRPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  return <PPRPageComposer manifest={getManifest(scenarioId)} />;
}
