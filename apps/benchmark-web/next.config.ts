import type { NextConfig } from "next";

/**
 * Dual-build configuration.
 *
 * Next.js 16 makes `cacheComponents` a global flag. Under it, a classic
 * blocking-SSR page (uncached IO without <Suspense>) is a build error, so a
 * single build cannot faithfully express all three rendering strategies.
 *
 * The SAME codebase is therefore built twice:
 *   - RENDER_CONFIG=modern  -> cacheComponents: true  -> serves /benchmark/ssg + /benchmark/ppr
 *   - RENDER_CONFIG=classic -> cacheComponents: false -> serves /benchmark/ssr (force-dynamic)
 *
 * Route trees are selected per build via pageExtensions:
 *   *.shared.tsx  -> included in both builds (layout, health route)
 *   *.modern.tsx  -> modern build only (SSG, PPR pages)
 *   *.classic.tsx -> classic build only (SSR page)
 *
 * All components, the data layer, and scenario manifests are identical across
 * both builds; only the flag and the served route tree differ.
 */
const renderConfig = process.env.RENDER_CONFIG === "classic" ? "classic" : "modern";

const nextConfig: NextConfig = {
  cacheComponents: renderConfig === "modern",
  distDir: renderConfig === "modern" ? ".next-modern" : ".next-classic",
  pageExtensions:
    renderConfig === "modern"
      ? ["shared.tsx", "shared.ts", "modern.tsx", "modern.ts"]
      : ["shared.tsx", "shared.ts", "classic.tsx", "classic.ts"],
  serverExternalPackages: ["better-sqlite3"],
  env: {
    RENDER_CONFIG: renderConfig,
  },
};

export default nextConfig;
