# PPR thesis benchmark

Reproduction archive for the Master's thesis on Partial Prerendering (PPR)
versus Server-Side Rendering (SSR) and Static Site Generation with
Client-Side Fetching (SSG+CSF).

## Layout

| Path | Role |
| --- | --- |
| `apps/benchmark-web/` | Next.js app (modern: SSG+CSF + PPR; classic: SSR) |
| `benchmark/` | Playwright runner and matrices |
| `docker/` | Compose stack for measurement |
| `data/seed/` | Deterministic SQLite seed data |
| `data/results/raw/` | Confirmatory `primary-*.jsonl` (+ manifest) |
| `analysis/` | Python scripts for Chapter 5 tables |

## Before you start

- **Level 1:** Python 3.12 or newer (`python3 --version`). Prefer `python3.12` if you have several interpreters.
- **Levels 2–3:** Start Docker Desktop (or your Engine) and wait until `docker info` succeeds. About **8 GB** Docker VM memory is enough.

Run all commands from the repository root.

## Level 1 — regenerate Chapter 5 numbers

No browser. Rebuilds tables from the confirmatory JSONL in the archive.

```bash
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r analysis/requirements.txt
python analysis/scripts/01_clean.py
python analysis/scripts/07_cell_effects.py
```

`01_clean.py` picks the latest `primary-*.jsonl` under `data/results/raw/`
and writes CSVs under `data/results/clean/`. Chapter 5 uses
`primary_full.csv` (0% ATF/BTF kept separate).
`07_cell_effects.py` writes medians, CIs, and Cliff’s δ under
`analysis/figures/`.

## Level 2 — smoke run

```bash
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml run --rm bench \
  npx tsx benchmark/runner/run-matrix.ts --matrix smoke
docker compose -f docker/docker-compose.yml down
```

Short check that SSG+CSF, PPR, and SSR return LCP and TTFB.

## Level 3 — full primary matrix

Same stack; default bench command runs the full primary matrix
(~45 minutes: 30 conditions × 3 warm-ups × 30 recorded loads).

```bash
docker compose -f docker/docker-compose.yml run --rm bench
docker compose -f docker/docker-compose.yml down
```

Absolute milliseconds can differ by host. Thesis Chapter 5 uses the
**patterns** from the confirmatory JSONL (Level 1). Re-run Level 3 only if
you want a new measurement on your machine.

## Local Node (optional)

Instead of Docker for Levels 2–3:

```bash
npm run setup
npm run build:both
npm run start:modern   # :3001 — SSG+CSF and PPR
npm run start:classic  # :3002 — SSR
npm run bench:smoke    # or: npm run bench:primary
```

## Design notes

- Dual Next.js build (`RENDER_CONFIG=modern|classic`) because
  `cacheComponents` cannot coexist with classic blocking SSR.
- Dynamic blocks use `weight × 10` ms through a size-4 latency pool;
  SSG+CSF uses the same model via `/api/blocks/[id]`.
- After `load`, the harness waits for skeletons to clear before reading LCP.