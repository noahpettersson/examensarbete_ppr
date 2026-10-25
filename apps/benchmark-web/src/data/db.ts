import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Read-only SQLite access (WAL mode set at seed time).
 * The database file lives at <repo>/data/sqlite/benchmark.db and is
 * produced deterministically by src/data/seed.ts from committed JSON.
 */

function resolveDbPath(): string {
  const candidates = [
    process.env.BENCH_DB_PATH,
    join(process.cwd(), "..", "..", "data", "sqlite", "benchmark.db"),
    join(process.cwd(), "data", "sqlite", "benchmark.db"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `benchmark.db not found. Run "npm run seed:db" first. Tried: ${candidates.join(", ")}`,
  );
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
  }
  return db;
}
