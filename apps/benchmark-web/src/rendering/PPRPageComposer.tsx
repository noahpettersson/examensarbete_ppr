import { Suspense } from "react";
import { cookies } from "next/headers";
import { BLOCKS } from "@/scenarios/blocks";
import type { BlockDef, ScenarioManifest } from "@/scenarios/schema";
import { PageFrame } from "@/components/shell/PageFrame";
import { BlockView } from "@/components/blocks/BlockView";
import { BlockSkeleton } from "@/components/blocks/BlockSkeleton";
import { fetchBlockData } from "@/data/repositories";
import { getCachedBlockData } from "./cached";

/**
 * PPR: static blocks resolve through the build-time cache and land in the
 * prerendered shell; each dynamic block is a Server Component inside its
 * own <Suspense> boundary whose data access (cookies + latency) happens at
 * request time and streams into the shell's holes.
 */
export function PPRPageComposer({ manifest }: { manifest: ScenarioManifest }) {
  return (
    <PageFrame strategy="ppr" manifest={manifest}>
      {BLOCKS.map((def) =>
        manifest.dynamicBlockIds.includes(def.id) ? (
          <Suspense key={def.id} fallback={<BlockSkeleton def={def} />}>
            <DynamicBlock def={def} baseLatencyMs={manifest.baseLatencyMs} />
          </Suspense>
        ) : (
          <StaticBlock key={def.id} def={def} />
        ),
      )}
    </PageFrame>
  );
}

async function StaticBlock({ def }: { def: BlockDef }) {
  const data = await getCachedBlockData(def.id, false);
  return <BlockView def={def} data={data} />;
}

async function DynamicBlock({
  def,
  baseLatencyMs,
}: {
  def: BlockDef;
  baseLatencyMs: number;
}) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("BENCH_USER_ID")?.value;
  const data = await fetchBlockData(def.id, { dynamic: true, baseLatencyMs, userId });
  return <BlockView def={def} data={data} />;
}
