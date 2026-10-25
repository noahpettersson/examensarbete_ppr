import { SSGPageComposer } from "@/rendering/SSGPageComposer";
import { getManifest, allScenarioIds } from "@/scenarios/loadManifest";

/** All scenario pages are fully prerendered at build time. */
export async function generateStaticParams() {
  return allScenarioIds().map((scenarioId) => ({ scenarioId }));
}

export default async function SSGPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  return <SSGPageComposer manifest={getManifest(scenarioId)} />;
}
