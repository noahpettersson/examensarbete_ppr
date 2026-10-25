import { BLOCKS } from "@/scenarios/blocks";
import type { BlockDef, ScenarioManifest } from "@/scenarios/schema";
import { PageFrame } from "@/components/shell/PageFrame";
import { BlockView } from "@/components/blocks/BlockView";
import { fetchBlockData } from "@/data/repositories";

/**
 * SSR (classic build, force-dynamic): every block renders at request time
 * with NO Suspense boundaries, so the HTML response blocks until the whole
 * tree — including all synthetic latency — has resolved. Static-eligible
 * blocks skip the latency (their data is cheap/cacheable), dynamic blocks
 * pay it per request. Single response, no static shell.
 */
export function SSRPageComposer({
  manifest,
  userId,
}: {
  manifest: ScenarioManifest;
  userId: string | undefined;
}) {
  return (
    <PageFrame strategy="ssr" manifest={manifest}>
      {BLOCKS.map((def) => (
        <RequestTimeBlock
          key={def.id}
          def={def}
          dynamic={manifest.dynamicBlockIds.includes(def.id)}
          baseLatencyMs={manifest.baseLatencyMs}
          userId={userId}
        />
      ))}
    </PageFrame>
  );
}

async function RequestTimeBlock({
  def,
  dynamic,
  baseLatencyMs,
  userId,
}: {
  def: BlockDef;
  dynamic: boolean;
  baseLatencyMs: number;
  userId: string | undefined;
}) {
  const data = await fetchBlockData(def.id, { dynamic, baseLatencyMs, userId });
  return <BlockView def={def} data={data} />;
}
