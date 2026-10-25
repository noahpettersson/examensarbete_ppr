/** Server pre-warm: plain HTTP requests before any measurement. */

export async function waitForHealthy(baseUrl: string, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server at ${baseUrl} not healthy within ${timeoutMs}ms`);
}

export async function prewarmServer(urls: string[], requestsPerUrl: number): Promise<void> {
  for (const url of urls) {
    for (let i = 0; i < requestsPerUrl; i++) {
      const res = await fetch(url, { headers: { cookie: "BENCH_USER_ID=user_42" } });
      await res.arrayBuffer();
    }
  }
}
