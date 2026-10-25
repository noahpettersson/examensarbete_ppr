import { BLOCKS } from "@/scenarios/blocks";
import type { ScenarioManifest, BlockDef } from "@/scenarios/schema";
import { PageFrame } from "@/components/shell/PageFrame";
import { BlockView } from "@/components/blocks/BlockView";
import { ClientFetchedBlock } from "@/components/blocks/ClientFetchedBlock";
import { getCachedBlockData } from "./cached";

/**
 * SSG + Client-Side Fetching / Hydration (SSG + CSR):
 * - Static blocks resolve through the build-time cache ("use cache" + cacheLife("max"))
 *   and are baked into the static HTML page at build time.
 * - Dynamic blocks are rendered with a loading skeleton fallback at build time and
 *   fetch their fresh data from the client after hydration via /api/blocks/[id].
 */
export function SSGPageComposer({ manifest }: { manifest: ScenarioManifest }) {
  return (
    <PageFrame strategy="ssg" manifest={manifest}>
      {BLOCKS.map((def) => {
        const isDynamic = manifest.dynamicBlockIds.includes(def.id);
        return isDynamic ? (
          <ClientFetchedBlock
            key={def.id}
            def={def}
            baseLatencyMs={manifest.baseLatencyMs}
          />
        ) : (
          <StaticBlock key={def.id} def={def} />
        );
      })}
    </PageFrame>
  );
}

async function StaticBlock({ def }: { def: BlockDef }) {
  const data = await getCachedBlockData(def.id, false);
  return <BlockView def={def} data={data} />;
}
