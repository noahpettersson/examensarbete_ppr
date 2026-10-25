"use client";

import { useEffect, useState } from "react";
import type { BlockDef } from "@/scenarios/schema";
import type { BlockData } from "@/data/repositories";
import { BlockSkeleton } from "./BlockSkeleton";
import { BlockView } from "./BlockView";

/**
 * Client-side dynamic block for SSG + CSR (Client-Side Hydration/Fetching).
 *
 * The static build bakes the BlockSkeleton fallback into the HTML shell.
 * In the browser, this component fetches fresh dynamic data from the API
 * on mount, simulating standard Jamstack / SWR / client-fetch architecture.
 */
export function ClientFetchedBlock({
  def,
  baseLatencyMs = 0,
}: {
  def: BlockDef;
  baseLatencyMs?: number;
}) {
  const [data, setData] = useState<BlockData | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/blocks/${def.id}?baseLatencyMs=${baseLatencyMs}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: BlockData) => {
        if (active) setData(json);
      })
      .catch((err) => {
        console.error(`Failed to fetch dynamic block ${def.id}:`, err);
      });

    return () => {
      active = false;
    };
  }, [def.id, baseLatencyMs]);

  if (!data) {
    return <BlockSkeleton def={def} />;
  }

  return <BlockView def={def} data={data} />;
}
