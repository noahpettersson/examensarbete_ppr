import "server-only";
import { getDb } from "./db";
import { simulateQueryLatency } from "./latency";
import { blockById } from "../scenarios/blocks";

/**
 * Single repository used by ALL rendering strategies.
 *
 * - Static rendering path: fetchBlockData(blockId, { dynamic: false })
 *   -> plain SQLite read, no synthetic latency (data considered
 *      build-time-known / cacheable).
 * - Dynamic rendering path: fetchBlockData(blockId, { dynamic: true })
 *   -> identical SQLite read + synthetic pooled latency
 *      (block.latencyMs + baseLatencyMs) + per-request personalization.
 *
 * Content rows are identical in both paths, so DOM output differs only in
 * the request-scoped fields (renderedAt, user), never in structure.
 */

export interface BlockItem {
  idx: number;
  title: string;
  body: string;
  value: number;
}

export interface BlockData {
  blockId: string;
  items: BlockItem[];
  dynamic: boolean;
  renderedAt: string;
  user: { id: string; name: string; cartCount: number; segment: string } | null;
  live: Record<string, { numericValue: number; textValue: string }>;
}

const FALLBACK_USER = "user_42";

export interface FetchOptions {
  dynamic: boolean;
  baseLatencyMs?: number;
  userId?: string;
}

export async function fetchBlockData(
  blockId: string,
  options: FetchOptions,
): Promise<BlockData> {
  const block = blockById(blockId);

  if (options.dynamic) {
    await simulateQueryLatency(block.latencyMs + (options.baseLatencyMs ?? 0));
  }

  const db = getDb();
  const items = db
    .prepare(
      "SELECT idx, title, body, value FROM content_items WHERE block_id = ? ORDER BY idx",
    )
    .all(blockId) as BlockItem[];

  const liveRows = db
    .prepare("SELECT key, numeric_value, text_value FROM live_state")
    .all() as Array<{ key: string; numeric_value: number; text_value: string }>;
  const live: BlockData["live"] = {};
  for (const row of liveRows) {
    live[row.key] = { numericValue: row.numeric_value, textValue: row.text_value };
  }

  const userId = options.userId ?? FALLBACK_USER;
  const user = db
    .prepare("SELECT id, name, cart_count AS cartCount, segment FROM users WHERE id = ?")
    .get(userId) as BlockData["user"];

  return {
    blockId,
    items,
    dynamic: options.dynamic,
    renderedAt: new Date().toISOString(),
    user: user ?? null,
    live,
  };
}
