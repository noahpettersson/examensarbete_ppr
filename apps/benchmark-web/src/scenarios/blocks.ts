import type { BlockDef } from "./schema";

/**
 * The 20 canonical content blocks of the e-commerce product page.
 *
 * Weights sum to exactly 100 and are calibrated so cumulative weight hits
 * 25 / 50 / 75 exactly from BOTH ends of the layout:
 *
 *   top-down:   header..stock          = 25
 *               header..description    = 50
 *               header..recommendations= 75
 *   bottom-up:  footer..recently-viewed= 25
 *               footer..spec-table     = 50
 *               footer..buy-box        = 75
 *
 * This lets ATF and BTF scenarios select dynamic block sets whose realized
 * weight equals the target proportion with zero tolerance error.
 *
 * latencyMs = weight * 10 (mean 50ms/block, plan default), itemCount scales
 * DOM size with weight so weight consistently proxies "server work".
 */
function block(
  id: string,
  label: string,
  order: number,
  weight: number,
  hasIsland = false,
): BlockDef {
  return {
    id,
    label,
    order,
    weight,
    latencyMs: weight * 10,
    itemCount: weight * 2,
    hasIsland,
  };
}

export const BLOCKS: BlockDef[] = [
  block("header", "Store Header", 0, 4, true),
  block("nav", "Category Navigation", 1, 4),
  block("hero-gallery", "Product Image Gallery", 2, 8, true),
  block("product-title", "Product Title", 3, 3),
  block("price", "Price", 4, 3),
  block("stock", "Stock Availability", 5, 3),
  block("buy-box", "Buy Box", 6, 5, true),
  block("user-greeting", "User Greeting", 7, 2),
  block("cart-badge", "Shopping Cart", 8, 3, true),
  block("shipping-estimate", "Shipping Estimate", 9, 4),
  block("promo-banner", "Promotions", 10, 4),
  block("product-description", "Product Description", 11, 7),
  block("spec-table", "Specifications", 12, 6),
  block("reviews-summary", "Review Summary", 13, 4),
  block("reviews-list", "Customer Reviews", 14, 8, true),
  block("recommendations", "Recommended For You", 15, 7),
  block("recently-viewed", "Recently Viewed", 16, 6),
  block("faq", "Product FAQ", 17, 7, true),
  block("brand-story", "About The Brand", 18, 8),
  block("footer", "Store Footer", 19, 4),
];

export const TOTAL_WEIGHT = BLOCKS.reduce((sum, b) => sum + b.weight, 0);

export function blockById(id: string): BlockDef {
  const found = BLOCKS.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown block id: ${id}`);
  return found;
}
