"""Shared helpers for the analysis pipeline."""
from __future__ import annotations

import glob
import json
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
RAW_DIR = REPO / "data" / "results" / "raw"
CLEAN_DIR = REPO / "data" / "results" / "clean"
FIG_DIR = REPO / "analysis" / "figures"

METRICS = [
    "ttfb", "fcp", "lcp", "cls", "inp", "hydrationMs", "domContentLoadedMs",
    "loadEventMs", "streamCompleteMs", "htmlBytes", "jsBytes", "totalBytes",
    "requestCount",
]
PRIMARY_METRICS = ["lcp", "ttfb"]
SECONDARY_METRICS = ["fcp", "cls", "requestCount", "hydrationMs", "htmlBytes", "jsBytes"]
SUPPORTING_METRICS = ["fcp", "cls", "requestCount"]

STRATEGY_ORDER = ["ssg", "ppr", "ssr"]
PLACEMENT_ORDER = ["baseline", "atf", "btf"]
PROPORTIONS = [0, 25, 50, 75, 100]


def latest_raw(prefix: str) -> Path:
    candidates = sorted(glob.glob(str(RAW_DIR / f"{prefix}-*.jsonl")))
    if not candidates:
        raise SystemExit(f"No {prefix} JSONL found in {RAW_DIR}")
    return Path(candidates[-1])


def load_jsonl(path: Path) -> pd.DataFrame:
    rows = []
    with open(path, encoding="utf8") as fh:
        for line in fh:
            r = json.loads(line)
            row = {
                "runId": r["runId"],
                "strategy": r["strategy"],
                "scenarioId": r["scenarioId"],
                "proportion": r["dynamicWeightPct"],
                "placement": r["placement"],
                "dynamicBlockCount": r["dynamicBlockCount"],
                "rep": r["rep"],
                "warmup": r["warmup"],
                "timestamp": r["timestamp"],
            }
            row.update({m: r["metrics"].get(m) for m in METRICS})
            rows.append(row)
    return pd.DataFrame(rows)


def load_clean() -> pd.DataFrame:
    path = CLEAN_DIR / "primary_clean.csv"
    if not path.exists():
        raise SystemExit("Run 01_clean.py first.")
    return pd.read_csv(path)


def load_full() -> pd.DataFrame:
    """Uncollapsed recorded rows (0% keeps ATF/BTF labels)."""
    path = CLEAN_DIR / "primary_full.csv"
    if not path.exists():
        raise SystemExit("Run 01_clean.py first.")
    return pd.read_csv(path)


def load_placement_aware() -> pd.DataFrame:
    """Thesis grid: uncollapsed 0% ATF/BTF plus all non-zero cells from clean."""
    full = load_full()
    clean = load_clean()
    zero = full[full["proportion"] == 0].copy()
    nonzero = clean[clean["proportion"] > 0].copy()
    return pd.concat([zero, nonzero], ignore_index=True)
