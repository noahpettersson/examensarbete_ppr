/**
 * Experiment orchestrator.
 *
 *   npx tsx benchmark/runner/run-matrix.ts --matrix pilot|primary|extended
 *     [--network cable|fast3g|none] [--label mylabel]
 *
 * Protocol per plan section 7:
 *   1. Health-check both app servers; pre-warm with plain HTTP requests.
 *   2. Warmup phase: warmupReps recorded loads per condition (warmup=true).
 *   3. Recorded phase: reps loads per condition in seeded-random global
 *      order, each in a fresh browser context (cold cache) with the
 *      benchmark cookie, CDP Cable throttling, and injected observers.
 *   4. Append one JSONL row per load to data/results/raw/; write a run
 *      manifest with the full environment fingerprint.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";
import { chromium, type Browser } from "playwright";
import {
  INIT_SCRIPT,
  applyNetworkProfile,
  attachByteCounters,
  readPageMetrics,
  waitForSkeletonsCleared,
  type NetworkProfile,
} from "./collect-metrics";
import { prewarmServer, waitForHealthy } from "./warmup";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CONFIG_DIR = join(HERE, "..", "configs");
const RESULTS_DIR = join(REPO, "data", "results", "raw");
const MANIFEST_INDEX = join(
  REPO,
  "apps",
  "benchmark-web",
  "src",
  "scenarios",
  "manifests",
  "index.json",
);

const MODERN_BASE = process.env.MODERN_BASE_URL ?? "http://localhost:3001";
const CLASSIC_BASE = process.env.CLASSIC_BASE_URL ?? "http://localhost:3002";
const BENCH_COOKIE = { name: "BENCH_USER_ID", value: "user_42" };

interface Condition {
  strategy: string;
  scenarioId: string;
}
interface Run extends Condition {
  rep: number;
  warmup: boolean;
}

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

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseArgs(): {
  matrix: string;
  network: string | null;
  label: string;
  complete: string | null;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  return {
    matrix: get("--matrix") ?? "primary",
    network: get("--network"),
    label: get("--label") ?? "",
    complete: get("--complete"),
  };
}

function baseUrlFor(strategy: string): string {
  return strategy === "ssr" ? CLASSIC_BASE : MODERN_BASE;
}

function urlFor(condition: Condition): string {
  return `${baseUrlFor(condition.strategy)}/benchmark/${condition.strategy}/${condition.scenarioId}`;
}

function gitCommit(): string {
  try {
    // stdio pipe avoids a noisy "fatal: not a git repository" on stderr when
    // the Docker bench image has no .git directory (common for Level 2/3).
    return execSync("git rev-parse --short HEAD", {
      cwd: REPO,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

/** Resolve the Next.js version from node_modules, falling back to the
 *  lockfile (the bench container only installs the benchmark workspace). */
function nextVersion(): string {
  try {
    return JSON.parse(
      readFileSync(
        join(REPO, "apps", "benchmark-web", "node_modules", "next", "package.json"),
        "utf8",
      ),
    ).version as string;
  } catch {
    try {
      const lock = JSON.parse(readFileSync(join(REPO, "package-lock.json"), "utf8"));
      return (
        lock.packages?.["apps/benchmark-web/node_modules/next"]?.version ??
        lock.packages?.["node_modules/next"]?.version ??
        "unknown"
      );
    } catch {
      return "unknown";
    }
  }
}

async function main() {
  const { matrix, network, label, complete } = parseArgs();

  const matrixConfig = JSON.parse(
    readFileSync(join(CONFIG_DIR, `${matrix}-matrix.json`), "utf8"),
  ) as { name: string; conditions: Condition[] };
  const repetition = JSON.parse(readFileSync(join(CONFIG_DIR, "repetition.json"), "utf8"));
  const browserConfig = JSON.parse(readFileSync(join(CONFIG_DIR, "browser.json"), "utf8"));
  const networkConfig = JSON.parse(readFileSync(join(CONFIG_DIR, "network.json"), "utf8"));
  const scenarioIndex = JSON.parse(readFileSync(MANIFEST_INDEX, "utf8")) as Array<{
    id: string;
    proportionPct: number;
    placement: string;
    dynamicWeight: number;
    dynamicBlockCount: number;
    totalDynamicLatencyMs: number;
  }>;
  const scenarioById = new Map(scenarioIndex.map((s) => [s.id, s]));

  const profileName = network ?? networkConfig.default;
  const profile = networkConfig.profiles[profileName] as NetworkProfile | null;
  if (profile === undefined) throw new Error(`Unknown network profile: ${profileName}`);

  const reps: number = repetition[matrix]?.reps ?? 30;
  const warmupReps: number = repetition[matrix]?.warmupReps ?? 3;

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  mkdirSync(RESULTS_DIR, { recursive: true });

  // --complete <path>: append missing recorded reps to an existing JSONL.
  const existingCounts = new Map<string, { count: number; maxRep: number }>();
  let jsonlPath: string;
  let runId: string;
  if (complete) {
    jsonlPath = complete;
    const lines = readFileSync(jsonlPath, "utf8").trim().split("\n");
    runId = JSON.parse(lines[0]).runId;
    for (const line of lines) {
      const row = JSON.parse(line);
      if (row.warmup) continue;
      const key = `${row.strategy}/${row.scenarioId}`;
      const entry = existingCounts.get(key) ?? { count: 0, maxRep: 0 };
      entry.count += 1;
      entry.maxRep = Math.max(entry.maxRep, row.rep);
      existingCounts.set(key, entry);
    }
  } else {
    runId = `${matrix}${label ? `-${label}` : ""}-${stamp}`;
    jsonlPath = join(RESULTS_DIR, `${runId}.jsonl`);
  }
  const manifestPath = complete
    ? join(RESULTS_DIR, `${runId}.completion-${stamp}.manifest.json`)
    : join(RESULTS_DIR, `${runId}.manifest.json`);

  // 1. Health + pre-warm.
  console.log(`[${matrix}] waiting for servers...`);
  const strategies = new Set(matrixConfig.conditions.map((c) => c.strategy));
  if ([...strategies].some((s) => s !== "ssr")) await waitForHealthy(MODERN_BASE);
  if (strategies.has("ssr")) await waitForHealthy(CLASSIC_BASE);

  console.log(`[${matrix}] pre-warming servers (${repetition.serverPrewarmRequests} req/url)...`);
  const uniqueUrls = [...new Set(matrixConfig.conditions.map(urlFor))];
  await prewarmServer(uniqueUrls, repetition.serverPrewarmRequests);

  // 2. Build run schedule: warmup phase (in order), then seeded-random recorded phase.
  const warmupRuns: Run[] = [];
  const recordedRuns: Run[] = [];
  if (complete) {
    for (const condition of matrixConfig.conditions) {
      const key = `${condition.strategy}/${condition.scenarioId}`;
      const existing = existingCounts.get(key) ?? { count: 0, maxRep: 0 };
      const deficit = reps - existing.count;
      if (deficit <= 0) continue;
      warmupRuns.push({ ...condition, rep: 1, warmup: true });
      for (let k = 1; k <= deficit; k++) {
        recordedRuns.push({ ...condition, rep: existing.maxRep + k, warmup: false });
      }
    }
    console.log(`[${matrix}] completion mode: ${recordedRuns.length} missing recorded loads`);
  } else {
    for (const condition of matrixConfig.conditions) {
      for (let rep = 1; rep <= warmupReps; rep++) {
        warmupRuns.push({ ...condition, rep, warmup: true });
      }
    }
    for (const condition of matrixConfig.conditions) {
      for (let rep = 1; rep <= reps; rep++) {
        recordedRuns.push({ ...condition, rep, warmup: false });
      }
    }
  }
  const schedule = [...warmupRuns, ...seededShuffle(recordedRuns, 20260728)];

  const browser: Browser = await chromium.launch({ headless: browserConfig.headless });
  const chromiumVersion = browser.version();

  const env = {
    runId,
    matrix,
    networkProfile: profileName,
    nextVersion: nextVersion(),
    node: process.version,
    playwright: JSON.parse(
      readFileSync(join(REPO, "node_modules", "playwright", "package.json"), "utf8"),
    ).version as string,
    chromium: chromiumVersion,
    commit: gitCommit(),
    os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? "unknown",
    cpuCount: os.cpus().length,
    memGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    dbPoolSize: Number(process.env.DB_POOL_SIZE ?? 4),
    viewport: browserConfig.viewport,
    postLoadIdleMs: browserConfig.postLoadIdleMs,
    reps,
    warmupReps,
    conditionCount: matrixConfig.conditions.length,
    totalScheduledLoads: schedule.length,
    startedAt: startedAt.toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(env, null, 2) + "\n");
  console.log(`[${matrix}] ${schedule.length} loads (${warmupRuns.length} warmup + ${recordedRuns.length} recorded)`);
  console.log(`[${matrix}] network=${profileName} chromium=${chromiumVersion} next=${env.nextVersion}`);

  // 3. Execute serially (up to 3 attempts per load to absorb transient
  //    navigation timeouts; retries use a fresh context like any other run).
  let done = 0;
  const t0 = Date.now();
  for (const run of schedule) {
    const scenario = scenarioById.get(run.scenarioId);
    if (!scenario) throw new Error(`Unknown scenario in matrix: ${run.scenarioId}`);

    let lastError: unknown = null;
    let succeeded = false;
    for (let attempt = 1; attempt <= 3 && !succeeded; attempt++) {
      if (attempt > 1) {
        console.warn(
          `[${matrix}] retry ${attempt}/3 for ${run.strategy}/${run.scenarioId} rep ${run.rep}: ${lastError}`,
        );
      }
    const context = await browser.newContext({ viewport: browserConfig.viewport });
    try {
      const url = urlFor(run);
      await context.addCookies([
        { ...BENCH_COOKIE, url: baseUrlFor(run.strategy) },
      ]);
      const page = await context.newPage();
      await page.addInitScript(INIT_SCRIPT);

      const cdp = await context.newCDPSession(page);
      const counters = attachByteCounters(cdp);
      await applyNetworkProfile(cdp, profile);

      await page.goto(url, { waitUntil: "load", timeout: 60000 });

      // Wait for SSG client fetches / PPR streamed holes to replace skeletons
      // so LCP is not locked onto early placeholder content.
      const skeletonWait = await waitForSkeletonsCleared(page, 15000);

      // Trigger synthetic user interaction on the first visible island button to record INP
      try {
        const islandBtn = page.locator(".island-btn").first();
        if (await islandBtn.isVisible({ timeout: 500 })) {
          await islandBtn.click({ timeout: 500 });
        }
      } catch {}

      await page.waitForTimeout(browserConfig.postLoadIdleMs);

      const metrics = await readPageMetrics(page);
      await cdp.detach().catch(() => {});

      const row = {
        runId,
        matrix,
        strategy: run.strategy,
        scenarioId: run.scenarioId,
        dynamicWeightPct: scenario.proportionPct,
        realizedDynamicWeight: scenario.dynamicWeight,
        placement: scenario.placement,
        dynamicBlockCount: scenario.dynamicBlockCount,
        totalDynamicLatencyMs: scenario.totalDynamicLatencyMs,
        rep: run.rep,
        warmup: run.warmup,
        timestamp: new Date().toISOString(),
        skeletonWaitTimedOut: skeletonWait.timedOut,
        skeletonWaitMs: skeletonWait.waitMs,
        skeletonRemaining: skeletonWait.remaining,
        metrics: {
          ttfb: metrics.ttfb,
          fcp: metrics.fcp,
          lcp: metrics.lcp,
          cls: metrics.cls,
          inp: metrics.inp,
          elementTimings: metrics.elementTimings,
          hydrationMs: metrics.hydrationMs,
          hydratedIslands: metrics.hydratedIslands,
          domContentLoadedMs: metrics.domContentLoadedMs,
          loadEventMs: metrics.loadEventMs,
          streamCompleteMs: metrics.streamCompleteMs,
          htmlBytes: counters.htmlBytes,
          jsBytes: counters.jsBytes,
          cssBytes: counters.cssBytes,
          totalBytes: counters.totalBytes,
          requestCount: counters.requestCount,
        },
        env: {
          nextVersion: env.nextVersion,
          node: env.node,
          commit: env.commit,
          networkProfile: profileName,
        },
      };
      appendFileSync(jsonlPath, JSON.stringify(row) + "\n");
      succeeded = true;
    } catch (err) {
      lastError = err;
    } finally {
      await context.close();
    }
    }
    if (!succeeded) {
      throw new Error(
        `Load failed after 3 attempts: ${run.strategy}/${run.scenarioId} rep ${run.rep}: ${lastError}`,
      );
    }

    done++;
    if (done % 20 === 0 || done === schedule.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = done / elapsed;
      const etaMin = ((schedule.length - done) / rate / 60).toFixed(1);
      console.log(`[${matrix}] ${done}/${schedule.length} loads (${rate.toFixed(2)}/s, ETA ${etaMin} min)`);
    }
  }

  await browser.close();
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...env, finishedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`[${matrix}] DONE -> ${jsonlPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
