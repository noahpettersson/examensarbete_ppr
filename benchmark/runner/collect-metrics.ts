import type { CDPSession, Page } from "playwright";

/**
 * Browser-side observers + CDP byte accounting.
 *
 * Injected before navigation via addInitScript; read after load + idle.
 * LCP/CLS/FCP come from standard PerformanceObserver entries; INP from
 * Event Timing observer on user interactions; hydration from
 * performance.mark("bench:hydrated:<blockId>") emitted by each client island;
 * TTFB and stream-complete from the Navigation Timing entry.
 */

export const INIT_SCRIPT = `
(() => {
  const bench = { lcp: null, cls: 0, inp: null, elementTimings: {} };
  window.__bench = bench;

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) bench.lcp = entries[entries.length - 1].startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) bench.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.interactionId || entry.name === "click") {
          bench.inp = Math.max(bench.inp ?? 0, entry.duration);
        }
      }
    }).observe({ type: "event", durationThreshold: 0, buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        bench.elementTimings[entry.identifier] = entry.startTime;
      }
    }).observe({ type: "element", buffered: true });
  } catch {}
})();
`;

export interface PageMetrics {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  elementTimings: Record<string, number>;
  hydrationMs: number | null;
  hydratedIslands: number;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  /** Full document received (incl. streamed chunks) relative to nav start. */
  streamCompleteMs: number | null;
}

/**
 * Wait until SSG/PPR skeleton placeholders are gone so LCP reflects filled
 * content (client fetches for SSG+CSF, streamed holes for PPR).
 */
export async function waitForSkeletonsCleared(
  page: Page,
  timeoutMs = 15000,
): Promise<{ timedOut: boolean; waitMs: number; remaining: number }> {
  const started = Date.now();
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-skeleton="1"]').length === 0,
      { timeout: timeoutMs, polling: 100 },
    );
    return {
      timedOut: false,
      waitMs: Date.now() - started,
      remaining: 0,
    };
  } catch {
    const remaining = await page.evaluate(
      () => document.querySelectorAll('[data-skeleton="1"]').length,
    );
    return {
      timedOut: true,
      waitMs: Date.now() - started,
      remaining,
    };
  }
}

export async function readPageMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    const bench = (
      window as unknown as {
        __bench?: {
          lcp: number | null;
          cls: number;
          inp: number | null;
          elementTimings: Record<string, number>;
        };
      }
    ).__bench ?? { lcp: null, cls: 0, inp: null, elementTimings: {} };

    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;

    const fcpEntry = performance
      .getEntriesByType("paint")
      .find((e) => e.name === "first-contentful-paint");

    const hydrationMarks = performance
      .getEntriesByType("mark")
      .filter((m) => m.name.startsWith("bench:hydrated:"));

    return {
      ttfb: nav ? nav.responseStart : null,
      fcp: fcpEntry ? fcpEntry.startTime : null,
      lcp: bench.lcp,
      cls: bench.cls,
      inp: bench.inp,
      elementTimings: bench.elementTimings ?? {},
      hydrationMs: hydrationMarks.length
        ? Math.max(...hydrationMarks.map((m) => m.startTime))
        : null,
      hydratedIslands: hydrationMarks.length,
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      loadEventMs: nav ? nav.loadEventEnd : null,
      streamCompleteMs: nav ? nav.responseEnd : null,
    };
  });
}

export interface ByteCounters {
  htmlBytes: number;
  jsBytes: number;
  cssBytes: number;
  totalBytes: number;
  requestCount: number;
}

/**
 * Attach CDP network accounting. encodedDataLength at loadingFinished is
 * the on-the-wire size including all streamed chunks of the document.
 */
export function attachByteCounters(cdp: CDPSession): ByteCounters {
  const counters: ByteCounters = {
    htmlBytes: 0,
    jsBytes: 0,
    cssBytes: 0,
    totalBytes: 0,
    requestCount: 0,
  };
  const typeByRequest = new Map<string, string>();

  cdp.on("Network.responseReceived", (event) => {
    typeByRequest.set(event.requestId, event.type);
  });
  cdp.on("Network.loadingFinished", (event) => {
    const type = typeByRequest.get(event.requestId);
    if (!type) return;
    counters.requestCount += 1;
    counters.totalBytes += event.encodedDataLength;
    if (type === "Document") counters.htmlBytes += event.encodedDataLength;
    else if (type === "Script") counters.jsBytes += event.encodedDataLength;
    else if (type === "Stylesheet") counters.cssBytes += event.encodedDataLength;
  });

  return counters;
}

export interface NetworkProfile {
  downloadThroughputBytesPerSec: number;
  uploadThroughputBytesPerSec: number;
  latencyMs: number;
}

export async function applyNetworkProfile(
  cdp: CDPSession,
  profile: NetworkProfile | null,
): Promise<void> {
  await cdp.send("Network.enable");
  if (!profile) return;
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: profile.downloadThroughputBytesPerSec,
    uploadThroughput: profile.uploadThroughputBytesPerSec,
    latency: profile.latencyMs,
  });
}
