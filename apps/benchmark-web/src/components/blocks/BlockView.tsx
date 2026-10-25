import type { BlockDef } from "@/scenarios/schema";
import type { BlockData } from "@/data/repositories";
import { Island } from "../markers/Island";

/**
 * Compact chrome blocks: their weight still drives server latency / item
 * generation, but rendering a full card grid here pushes the product hero
 * below a 720px viewport, so LCP can never see ATF content and placement
 * contrast collapses to whichever header card <p> paints first.
 */
const CHROME_BLOCK_IDS = new Set(["header", "nav", "footer"]);

/**
 * Renders one content block. Used verbatim by all three strategies, so DOM
 * structure and client JS are identical; only the data-fetch wrapper
 * (cached / request-time / suspended) differs per strategy.
 */
export function BlockView({ def, data }: { def: BlockDef; data: BlockData }) {
  const chrome = CHROME_BLOCK_IDS.has(def.id);
  return (
    <section
      className={chrome ? "block block-chrome" : "block"}
      id={`block-${def.id}`}
      data-block={def.id}
      data-dynamic={data.dynamic ? "1" : "0"}
      data-rendered-at={data.renderedAt}
      elementtiming={`block-${def.id}`}
      style={{ minHeight: chrome ? undefined : def.weight * 24 }}
    >
      <h2>{def.label}</h2>
      <BlockSpecificContent def={def} data={data} />
      {!chrome ? (
        <div className="block-grid">
          {data.items.map((item) => (
            <div className="card" key={item.idx}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <span className="badge">
                #{item.idx + 1} — {item.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="chrome-meta">
          {data.items.length} links · {def.label}
        </p>
      )}
      {def.hasIsland ? <Island blockId={def.id} label={`Interact: ${def.label}`} /> : null}
    </section>
  );
}

/**
 * Hero LCP surface. Must expose a large *contentful* paint candidate in the
 * static shell for BTF scenarios. A CSS-colored <div> is invisible to LCP;
 * Chrome also ignores low-entropy placeholder images. A block-level title
 * with a large painted text area is a valid LCP element and is static in
 * p50_btf / dynamic (behind Suspense) in p50_atf — restoring placement contrast.
 */
function BlockSpecificContent({ def, data }: { def: BlockDef; data: BlockData }) {
  const { live, user } = data;
  switch (def.id) {
    case "hero-gallery":
      return (
        <div className="hero">
          <p className="hero-title">Aurora X1 Wireless Headphones</p>
          <p className="hero-sub">Studio Edition — product gallery</p>
        </div>
      );
    case "price": {
      const base = live.price?.numericValue ?? 0;
      const discount = data.dynamic ? (live.discountPct?.numericValue ?? 0) : 0;
      const final = base * (1 - discount / 100);
      return (
        <p className="price" data-price={final.toFixed(2)}>
          {final.toFixed(2)} {live.price?.textValue}
          {discount > 0 ? <span className="badge"> −{discount}% applied</span> : null}
        </p>
      );
    }
    case "stock":
      return (
        <p>
          <span className="badge">{live.stockQty?.numericValue ?? 0} in stock</span>{" "}
          at {live.stockQty?.textValue}
        </p>
      );
    case "user-greeting":
      return <p>Welcome back, <strong>{user?.name ?? "guest"}</strong> ({user?.segment ?? "anonymous"})</p>;
    case "cart-badge":
      return <p>Cart items: <span className="badge">{user?.cartCount ?? 0}</span></p>;
    case "shipping-estimate":
      return (
        <p>
          Estimated delivery: <strong>{live.shippingDays?.numericValue ?? "?"} days</strong>{" "}
          ({live.shippingDays?.textValue})
        </p>
      );
    default:
      return null;
  }
}
