"use cache";

/**
 * Build-time cached data access (modern build only: SSG + PPR static parts).
 *
 * File-level "use cache" + cacheLife("max") pins entries for the lifetime
 * of the build, so every consumer renders into the static shell at
 * `next build`. The cache key is derived automatically from the arguments.
 *
 * NOTE: this module must only be imported from *.modern.tsx route trees;
 * the classic (SSR) build has cacheComponents disabled and cannot compile
 * "use cache" directives.
 */
import { cacheLife } from "next/cache";
import { fetchBlockData, type BlockData } from "@/data/repositories";

export async function getCachedBlockData(
  blockId: string,
  dynamic: boolean,
): Promise<BlockData> {
  cacheLife("max");
  return fetchBlockData(blockId, { dynamic });
}
