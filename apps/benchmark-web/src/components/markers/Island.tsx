"use client";

import { useEffect, useState } from "react";

/**
 * Client-side interactive island with hydration instrumentation.
 *
 * The IDENTICAL component ships to every strategy, keeping client JS
 * constant across SSG/SSR/PPR. On hydration it emits
 * performance.mark("bench:hydrated:<blockId>"); the harness reads the max
 * mark as page hydration time.
 */
export function Island({ blockId, label }: { blockId: string; label: string }) {
  const [hydrated, setHydrated] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    performance.mark(`bench:hydrated:${blockId}`);
    setHydrated(true);
  }, [blockId]);

  return (
    <button
      className="island-btn"
      type="button"
      data-island={blockId}
      data-hydrated={hydrated ? "1" : "0"}
      onClick={() => setCount((c) => c + 1)}
    >
      {label}
      {count > 0 ? ` (${count})` : ""}
    </button>
  );
}
