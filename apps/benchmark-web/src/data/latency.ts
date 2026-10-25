/**
 * Controlled server-side latency simulation.
 *
 * Each DYNAMIC block fetch pays `block.latencyMs + scenario.baseLatencyMs`,
 * executed through a bounded-concurrency gate that models a database
 * connection pool (default size 4, override with env DB_POOL_SIZE).
 *
 * React Server Components fetch sibling blocks in parallel; without a pool,
 * total request latency would be max(latencies) regardless of how many
 * blocks are dynamic, erasing the proportion effect on server time. The
 * pool makes aggregate server work grow monotonically with dynamic weight,
 * mirroring real backends with bounded connection pools.
 */

const POOL_SIZE = Math.max(1, Number(process.env.DB_POOL_SIZE ?? 4));

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < POOL_SIZE) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) {
    next();
  } else {
    active--;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulate one pooled backend query taking `ms` milliseconds. */
export async function simulateQueryLatency(ms: number): Promise<void> {
  if (ms <= 0) return;
  await acquire();
  try {
    await sleep(ms);
  } finally {
    release();
  }
}

export const LATENCY_POOL_SIZE = POOL_SIZE;
