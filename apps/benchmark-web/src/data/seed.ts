/**
 * Deterministic seed pipeline: PRNG(seed=42) -> data/seed/*.json -> SQLite.
 *
 * Every block's content rows are generated from a fixed-seed mulberry32
 * PRNG, written to committed JSON fixtures, and loaded into
 * data/sqlite/benchmark.db (WAL mode). Re-running always produces
 * byte-identical fixtures and an equivalent database.
 *
 * Run: npm run seed:db --workspace apps/benchmark-web
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCKS } from "../scenarios/blocks";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SEED_DIR = join(REPO_ROOT, "data", "seed");
const SQLITE_DIR = join(REPO_ROOT, "data", "sqlite");
const DB_PATH = join(SQLITE_DIR, "benchmark.db");

const SEED = 42;

/** mulberry32: small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

const WORDS = [
  "alpine", "vertex", "cobalt", "meridian", "juniper", "lattice", "onyx",
  "harbor", "quartz", "sable", "tundra", "velvet", "willow", "zephyr",
  "amber", "birch", "cedar", "delta", "ember", "fjord",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function sentence(words: number): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) parts.push(pick(WORDS));
  const s = parts.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

interface ContentItem {
  blockId: string;
  idx: number;
  title: string;
  body: string;
  value: number;
}

interface UserRow {
  id: string;
  name: string;
  cartCount: number;
  segment: string;
}

interface LiveStateRow {
  key: string;
  numericValue: number;
  textValue: string;
}

function main() {
  mkdirSync(SEED_DIR, { recursive: true });
  mkdirSync(SQLITE_DIR, { recursive: true });

  // 1. Generate fixtures.
  const contentItems: ContentItem[] = [];
  for (const block of BLOCKS) {
    for (let idx = 0; idx < block.itemCount; idx++) {
      contentItems.push({
        blockId: block.id,
        idx,
        title: `${block.label} ${idx + 1}: ${pick(WORDS)} ${pick(WORDS)}`,
        body: sentence(10 + Math.floor(rand() * 8)),
        value: Math.round(rand() * 9900 + 100) / 100,
      });
    }
  }

  const users: UserRow[] = [];
  for (let i = 0; i < 50; i++) {
    users.push({
      id: `user_${i + 1}`,
      name: `${pick(WORDS)}_${i + 1}`,
      cartCount: Math.floor(rand() * 9),
      segment: pick(["new", "returning", "loyal", "vip"]),
    });
  }

  const liveState: LiveStateRow[] = [
    { key: "price", numericValue: 1299.9, textValue: "EUR" },
    { key: "discountPct", numericValue: 12, textValue: "summer-promo" },
    { key: "stockQty", numericValue: 37, textValue: "warehouse-A" },
    { key: "shippingDays", numericValue: 3, textValue: "standard" },
  ];

  writeFileSync(join(SEED_DIR, "content-items.json"), JSON.stringify(contentItems, null, 2) + "\n");
  writeFileSync(join(SEED_DIR, "users.json"), JSON.stringify(users, null, 2) + "\n");
  writeFileSync(join(SEED_DIR, "live-state.json"), JSON.stringify(liveState, null, 2) + "\n");

  // 2. Load into SQLite.
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE content_items (
      block_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      value REAL NOT NULL,
      PRIMARY KEY (block_id, idx)
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cart_count INTEGER NOT NULL,
      segment TEXT NOT NULL
    );
    CREATE TABLE live_state (
      key TEXT PRIMARY KEY,
      numeric_value REAL NOT NULL,
      text_value TEXT NOT NULL
    );
  `);

  const insertItem = db.prepare(
    "INSERT INTO content_items (block_id, idx, title, body, value) VALUES (?, ?, ?, ?, ?)",
  );
  const insertUser = db.prepare(
    "INSERT INTO users (id, name, cart_count, segment) VALUES (?, ?, ?, ?)",
  );
  const insertLive = db.prepare(
    "INSERT INTO live_state (key, numeric_value, text_value) VALUES (?, ?, ?)",
  );

  db.transaction(() => {
    for (const item of contentItems) {
      insertItem.run(item.blockId, item.idx, item.title, item.body, item.value);
    }
    for (const user of users) {
      insertUser.run(user.id, user.name, user.cartCount, user.segment);
    }
    for (const row of liveState) {
      insertLive.run(row.key, row.numericValue, row.textValue);
    }
  })();

  db.close();
  console.log(`Seeded ${contentItems.length} content items, ${users.length} users -> ${DB_PATH}`);
}

main();
