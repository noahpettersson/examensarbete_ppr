# Benchmark application image (one image, two build modes).
# Build with:  --build-arg RENDER_CONFIG=modern   (SSG + PPR routes)
#         or:  --build-arg RENDER_CONFIG=classic  (SSR route)
FROM node:24.18.0-bookworm-slim AS base
WORKDIR /repo

# Native build tooling for better-sqlite3 (falls back to prebuilds when available)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/benchmark-web/package.json apps/benchmark-web/
COPY benchmark/package.json benchmark/
RUN npm ci --workspace apps/benchmark-web --include-workspace-root

COPY apps/benchmark-web apps/benchmark-web
COPY data/seed data/seed

ARG RENDER_CONFIG=modern
ENV RENDER_CONFIG=${RENDER_CONFIG}
ENV NEXT_TELEMETRY_DISABLED=1

# Seed the SQLite database deterministically (creates data/sqlite), then build.
RUN npm run seed:db --workspace apps/benchmark-web \
  && npm run build:${RENDER_CONFIG} --workspace apps/benchmark-web

EXPOSE 3000
# RENDER_CONFIG is set as ENV, so next.config.ts picks the matching distDir.
WORKDIR /repo/apps/benchmark-web
CMD ["npx", "next", "start", "-p", "3000"]
