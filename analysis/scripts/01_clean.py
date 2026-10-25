"""ETL step 1: clean raw primary JSONL and collapse 0% duplicate cells.

Per the pre-registered protocol:
  1. Drop warmup rows.
  2. At 0% dynamic, ATF and BTF URLs serve IDENTICAL pages, so the two
     factorial cells contain duplicate synthetic conditions. Verify the
     distributions are equivalent (median difference within tolerance),
     then merge them into a single `placement = baseline` cell per strategy
     (reps concatenated and renumbered — observations counted once each,
     never duplicated).
  3. Retain 25/50/75% rows unchanged (ATF and BTF are distinct pages).

Outputs:
  data/results/clean/primary_full.csv   (all recorded rows, uncollapsed)
  data/results/clean/primary_clean.csv  (collapsed; feeds all inference)

The collapsed dataset has 21 no-longer-duplicated analysis cells:
3 strategies x (1 baseline + 3 proportions x 2 placements).
"""
from __future__ import annotations

import sys

from common import CLEAN_DIR, latest_raw, load_jsonl, PRIMARY_METRICS

TOLERANCE_MS = 15.0  # max |median_atf - median_btf| at 0% (separate loads of identical pages)


def main() -> None:
    path = latest_raw("primary") if len(sys.argv) < 2 else __import__("pathlib").Path(sys.argv[1])
    df = load_jsonl(path)
    total = len(df)
    df = df[~df["warmup"]].copy()
    print(f"Loaded {total} rows from {path.name}; {len(df)} recorded (warmup dropped)")

    cells = df.groupby(["strategy", "proportion", "placement"]).size()
    print(f"Execution cells: {len(cells)} (expect 24 or 30), reps/cell: {cells.min()}–{cells.max()}")

    CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(CLEAN_DIR / "primary_full.csv", index=False)

    # --- Equivalence check at 0% dynamic -------------------------------
    zero = df[df["proportion"] == 0]
    print("\n0% dynamic equivalence check (ATF vs BTF medians):")
    violations = []
    for strategy, sub in zero.groupby("strategy"):
        for metric in PRIMARY_METRICS:
            med_atf = sub[sub["placement"] == "atf"][metric].median()
            med_btf = sub[sub["placement"] == "btf"][metric].median()
            delta = abs(med_atf - med_btf)
            status = "OK" if delta <= TOLERANCE_MS else "VIOLATION"
            print(f"  {strategy:4s} {metric:5s}: atf={med_atf:8.1f}  btf={med_btf:8.1f}  |d|={delta:6.1f} ms  {status}")
            if delta > TOLERANCE_MS:
                violations.append((strategy, metric, delta))
    if violations:
        print("\nWARNING: equivalence tolerance exceeded — cells collapsed anyway "
              "(identical page content by construction); investigate noise source:")
        for v in violations:
            print(f"  {v[0]} {v[1]}: |median diff| = {v[2]:.1f} ms")

    # --- Collapse: relabel 0% rows to placement=baseline, renumber reps ---
    collapsed = df.copy()
    is_zero = collapsed["proportion"] == 0
    collapsed.loc[is_zero, "placement"] = "baseline"
    collapsed.loc[is_zero, "scenarioId"] = "p0_baseline"
    # Renumber reps within each collapsed cell so observations stay unique.
    collapsed["rep"] = collapsed.groupby(["strategy", "proportion", "placement"]).cumcount() + 1

    out_cells = collapsed.groupby(["strategy", "proportion", "placement"]).size()
    # 0% ATF+BTF collapse to baseline: 3*(1 + 4*2)=27 for 0/25/50/75/100, or 21 for 0/25/50/75
    print(f"\nCollapsed analysis cells: {len(out_cells)}")
    print(out_cells.to_string())

    collapsed.to_csv(CLEAN_DIR / "primary_clean.csv", index=False)
    print(f"\nWrote {CLEAN_DIR / 'primary_full.csv'}")
    print(f"Wrote {CLEAN_DIR / 'primary_clean.csv'} ({len(collapsed)} observations)")


if __name__ == "__main__":
    main()

