import type { BlockDef } from "@/scenarios/schema";

const CHROME_BLOCK_IDS = new Set(["header", "nav", "footer"]);

/**
 * Suspense fallback for dynamic blocks (PPR). Mirrors the block container
 * dimensions (min-height, card count) so the static shell approximates the
 * final layout — realistic skeleton practice. Residual layout shift remains
 * a measured outcome (CLS, exploratory).
 */
export function BlockSkeleton({ def }: { def: BlockDef }) {
  const chrome = CHROME_BLOCK_IDS.has(def.id);
  return (
    <section
      className={chrome ? "block block-chrome" : "block"}
      id={`block-${def.id}`}
      data-block={def.id}
      data-skeleton="1"
      style={{ minHeight: chrome ? undefined : def.weight * 24 }}
    >
      <h2>{def.label}</h2>
      {/* Sized non-text placeholder: reserves layout without becoming LCP. */}
      {def.id === "hero-gallery" ? <div className="hero hero-skeleton" /> : null}
      {chrome ? (
        <p className="chrome-meta skeleton-text">&nbsp;</p>
      ) : (
        <div className="block-grid">
          {Array.from({ length: def.itemCount }, (_, i) => (
            <div className="card skeleton" key={i} />
          ))}
        </div>
      )}
    </section>
  );
}
