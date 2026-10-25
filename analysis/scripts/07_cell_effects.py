"""Cell-level confirmatory contrasts for PPR vs SSG+CSF and PPR vs SSR.

Produces:
  - cell_descriptives_lcp_ttfb.csv / cell_descriptives_supporting.csv
  - cliffs_delta_by_cell.csv (PPR vs SSG+CSF / PPR vs SSR at each prop x placement)
  - cliffs_delta_ppr_ttfb_placement.csv (PPR TTFB ATF vs BTF at 0/25/50/75/100)
  - cliffs_delta_ppr_ttfb_proportion.csv (PPR TTFB adjacent props within placement)
  - cliffs_delta_ppr_lcp_proportion.csv (PPR LCP adjacent props within placement)
  - cost_table_delta_ms.csv
  - cell_analysis_report.txt
  - docs/thesis/tables-chapter5.tex

Uses uncollapsed 0% ATF/BTF from primary_full so placement-aware tables
include the static anchor. Confirmatory metrics: LCP and TTFB only.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from common import (
    FIG_DIR,
    PRIMARY_METRICS,
    PROPORTIONS,
    REPO,
    STRATEGY_ORDER,
    SUPPORTING_METRICS,
    load_placement_aware,
)

RNG = np.random.default_rng(20260728)
BOOT = 2000
OUT_LINES: list[str] = []
ADJACENT = list(zip(PROPORTIONS[:-1], PROPORTIONS[1:]))  # 0→25→50→75→100
STRATEGY_LABEL = {"ssg": "SSG+CSF", "ppr": "PPR", "ssr": "SSR"}


def emit(text: str = "") -> None:
    print(text)
    OUT_LINES.append(text)


def boot_ci_median(x: np.ndarray) -> tuple[float, float]:
    if len(x) == 0:
        return float("nan"), float("nan")
    medians = np.median(RNG.choice(x, size=(BOOT, len(x)), replace=True), axis=1)
    return float(np.percentile(medians, 2.5)), float(np.percentile(medians, 97.5))


def cliffs_delta(x: np.ndarray, y: np.ndarray) -> float:
    """Cliff's δ: P(x > y) − P(x < y). Positive => x tends larger than y."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(x) == 0 or len(y) == 0:
        return float("nan")
    diff = x[:, None] - y[None, :]
    return float(np.mean(diff > 0) - np.mean(diff < 0))


def magnitude(d: float) -> str:
    ad = abs(d)
    if ad < 0.147:
        return "negligible"
    if ad < 0.33:
        return "small"
    if ad < 0.474:
        return "medium"
    return "large"


def cell_descriptives(df: pd.DataFrame, metrics: list[str]) -> pd.DataFrame:
    rows = []
    for (strategy, proportion, placement), sub in df.groupby(
        ["strategy", "proportion", "placement"]
    ):
        for metric in metrics:
            x = sub[metric].dropna().to_numpy()
            if not len(x):
                continue
            lo, hi = boot_ci_median(x)
            rows.append(
                {
                    "strategy": strategy,
                    "proportion": int(proportion),
                    "placement": placement,
                    "metric": metric,
                    "n": len(x),
                    "median": float(np.median(x)),
                    "ci95_lo": lo,
                    "ci95_hi": hi,
                }
            )
    return pd.DataFrame(rows).round(3)


def wide_median_table(desc: pd.DataFrame, metric: str) -> pd.DataFrame:
    sub = desc[desc["metric"] == metric].copy()
    sub["cell"] = sub.apply(
        lambda r: f"{r['median']:.1f} [{r['ci95_lo']:.1f}, {r['ci95_hi']:.1f}]",
        axis=1,
    )
    pivot = sub.pivot_table(
        index=["proportion", "placement"],
        columns="strategy",
        values="cell",
        aggfunc="first",
    )
    cols = [c for c in STRATEGY_ORDER if c in pivot.columns]
    return pivot[cols]


def fmt_ci(median: float, lo: float, hi: float, decimals: int = 1) -> str:
    if decimals == 0:
        return f"${median:.0f}$ [${lo:.0f}$, ${hi:.0f}$]"
    return f"${median:.{decimals}f}$ [${lo:.{decimals}f}$, ${hi:.{decimals}f}$]"


def fmt_signed(x: float, decimals: int = 1) -> str:
    sign = "+" if x >= 0 else ""
    return f"${sign}{x:.{decimals}f}$"


def latex_median_table(desc: pd.DataFrame, metric: str, caption: str, label: str) -> str:
    sub = desc[desc["metric"] == metric]
    decimals = 1 if metric == "ttfb" else 0
    lines = [
        r"\begin{table}[htbp]",
        r"  \centering",
        rf"  \caption{{{caption}}}",
        rf"  \label{{{label}}}",
        r"  \begin{tabular}{@{}llccc@{}}",
        r"    \toprule",
        r"    Proportion & Placement & SSG{+}CSF & PPR & SSR \\",
        r"    \midrule",
    ]
    for prop in PROPORTIONS:
        for place in ("atf", "btf"):
            cells = []
            for strat in STRATEGY_ORDER:
                row = sub[
                    (sub["strategy"] == strat)
                    & (sub["proportion"] == prop)
                    & (sub["placement"] == place)
                ]
                if row.empty:
                    cells.append("---")
                else:
                    r = row.iloc[0]
                    cells.append(fmt_ci(r["median"], r["ci95_lo"], r["ci95_hi"], decimals))
            place_lab = place.upper()
            lines.append(
                f"    {prop}\\% & {place_lab:3} & {cells[0]} & {cells[1]} & {cells[2]} \\\\"
            )
        if prop != PROPORTIONS[-1]:
            lines.append(r"    \midrule")
    lines.extend(
        [
            r"    \bottomrule",
            r"  \end{tabular}",
            r"\end{table}",
            "",
        ]
    )
    return "\n".join(lines)


def latex_strategy_contrasts(contrasts: pd.DataFrame) -> str:
    lines = [
        r"\begin{table}[htbp]",
        r"  \centering",
        r"  \caption{Confirmatory cell contrasts. $\Delta$\,ms $=$ median(PPR) $-$"
        r" median(comparator); Cliff's $\delta$ with magnitude band"
        r" (negligible / small / medium / large). Negative $\Delta$ or $\delta$"
        r" means PPR is faster (lower). $N{=}30$ per arm. At 0\% and 100\%,"
        r" ATF and BTF pages are identical by construction.}",
        r"  \label{tab:cliffs-cell}",
        r"  \scriptsize",
        r"  \setlength{\tabcolsep}{4pt}",
        r"  \begin{tabular}{@{}llcrrlrrl@{}}",
        r"    \toprule",
        r"    & & & \multicolumn{3}{c}{PPR vs.\ SSG{+}CSF} & \multicolumn{3}{c}{PPR vs.\ SSR} \\",
        r"    \cmidrule(lr){4-6}\cmidrule(lr){7-9}",
        r"    Prop. & Place & Metric & $\Delta$\,ms & $\delta$ & Mag. & $\Delta$\,ms & $\delta$ & Mag. \\",
        r"    \midrule",
    ]
    for prop in PROPORTIONS:
        for place in ("atf", "btf"):
            for metric in PRIMARY_METRICS:
                ssg = contrasts[
                    (contrasts["contrast"] == "ppr_vs_ssg")
                    & (contrasts["proportion"] == prop)
                    & (contrasts["placement"] == place)
                    & (contrasts["metric"] == metric)
                ].iloc[0]
                ssr = contrasts[
                    (contrasts["contrast"] == "ppr_vs_ssr")
                    & (contrasts["proportion"] == prop)
                    & (contrasts["placement"] == place)
                    & (contrasts["metric"] == metric)
                ].iloc[0]
                dec = 1 if metric == "ttfb" else 0
                lines.append(
                    f"    {prop}\\% & {place.upper()} & {metric.upper():4} & "
                    f"{fmt_signed(ssg['delta_ms'], dec)} & "
                    f"{fmt_signed(ssg['cliffs_delta'], 2)} & {ssg['magnitude']:11} & "
                    f"{fmt_signed(ssr['delta_ms'], dec)} & "
                    f"{fmt_signed(ssr['cliffs_delta'], 2)} & {ssr['magnitude']} \\\\"
                )
        if prop != PROPORTIONS[-1]:
            lines.append(r"    \midrule")
    lines.extend(
        [
            r"    \bottomrule",
            r"  \end{tabular}",
            r"\end{table}",
            "",
        ]
    )
    return "\n".join(lines)


def latex_ttfb_placement(place_df: pd.DataFrame) -> str:
    lines = [
        r"\begin{table}[htbp]",
        r"  \centering",
        r"  \caption{PPR placement contrast on TTFB: ATF versus BTF at each"
        r" proportion. $\Delta$\,ms $=$ median(ATF) $-$ median(BTF)."
        r" $N{=}30$ per arm. At 0\% and 100\% ATF/BTF pages are identical"
        r" by construction.}",
        r"  \label{tab:ppr-ttfb-placement}",
        r"  \begin{tabular}{@{}lrrrrl@{}}",
        r"    \toprule",
        r"    Proportion & Median ATF & Median BTF & $\Delta$\,ms & Cliff's $\delta$ & Magnitude \\",
        r"    \midrule",
    ]
    for _, r in place_df.sort_values("proportion").iterrows():
        lines.append(
            f"    {int(r['proportion'])}\\% & ${r['median_atf']:.1f}$ & ${r['median_btf']:.1f}$ & "
            f"{fmt_signed(r['delta_ms'], 1)} & ${r['cliffs_delta']:.2f}$ & {r['magnitude']} \\\\"
        )
    lines.extend(
        [
            r"    \bottomrule",
            r"  \end{tabular}",
            r"\end{table}",
            "",
        ]
    )
    return "\n".join(lines)


def latex_proportion_contrasts(
    prop_df: pd.DataFrame, metric: str, caption: str, label: str
) -> str:
    lines = [
        r"\begin{table}[htbp]",
        r"  \centering",
        rf"  \caption{{{caption}}}",
        rf"  \label{{{label}}}",
        r"  \begin{tabular}{@{}llrrrrl@{}}",
        r"    \toprule",
        r"    Placement & Step & Median low & Median high & $\Delta$\,ms & Cliff's $\delta$ & Magnitude \\",
        r"    \midrule",
    ]
    for place in ("atf", "btf"):
        sub = prop_df[prop_df["placement"] == place].sort_values("prop_low")
        for i, (_, r) in enumerate(sub.iterrows()):
            step = f"{int(r['prop_low'])}\\% $\\rightarrow$ {int(r['prop_high'])}\\%"
            place_lab = place.upper() if i == 0 else ""
            lines.append(
                f"    {place_lab:3} & {step} & "
                f"${r['median_low']:.1f}$ & ${r['median_high']:.1f}$ & "
                f"{fmt_signed(r['delta_ms'], 1)} & ${r['cliffs_delta']:.2f}$ & "
                f"{r['magnitude']} \\\\"
            )
        if place == "atf":
            lines.append(r"    \midrule")
    lines.extend(
        [
            r"    \bottomrule",
            r"  \end{tabular}",
            r"\end{table}",
            "",
        ]
    )
    return "\n".join(lines)


def write_latex(
    conf: pd.DataFrame,
    contrasts: pd.DataFrame,
    ttfb_place: pd.DataFrame,
    ttfb_prop: pd.DataFrame,
    lcp_prop: pd.DataFrame,
) -> Path:
    out = REPO / "docs" / "thesis" / "tables-chapter5.tex"
    out.parent.mkdir(parents=True, exist_ok=True)
    parts = [
        r"% Auto-generated by analysis/scripts/07_cell_effects.py — do not hand-edit.",
        r"% Requires: \usepackage{booktabs}",
        "",
        latex_median_table(
            conf,
            "lcp",
            r"Median Largest Contentful Paint (LCP, ms) by strategy, dynamic "
            r"proportion, and placement. Bootstrap 95\% CI of the median in brackets "
            r"($N{=}30$ per cell). At 0\% and 100\%, ATF and BTF pages are identical "
            r"by construction.",
            "tab:lcp-cell",
        ),
        latex_median_table(
            conf,
            "ttfb",
            r"Median Time to First Byte (TTFB, ms) by strategy, dynamic "
            r"proportion, and placement. Bootstrap 95\% CI of the median in brackets "
            r"($N{=}30$ per cell). At 0\% and 100\%, ATF and BTF pages are identical "
            r"by construction.",
            "tab:ttfb-cell",
        ),
        latex_strategy_contrasts(contrasts),
        latex_ttfb_placement(ttfb_place),
        latex_proportion_contrasts(
            ttfb_prop,
            "ttfb",
            r"PPR TTFB adjacent proportion contrasts within placement "
            r"($0\rightarrow 25\rightarrow 50\rightarrow 75\rightarrow 100$). "
            r"$\Delta$\,ms $=$ median(higher) $-$ median(lower). $N{=}30$ per arm.",
            "tab:ppr-ttfb-proportion",
        ),
        latex_proportion_contrasts(
            lcp_prop,
            "lcp",
            r"PPR LCP adjacent proportion contrasts within placement "
            r"(ATF-only and BTF-only chains; "
            r"$0\rightarrow 25\rightarrow 50\rightarrow 75\rightarrow 100$). "
            r"$\Delta$\,ms $=$ median(higher) $-$ median(lower). $N{=}30$ per arm.",
            "tab:ppr-lcp-proportion",
        ),
    ]
    out.write_text("\n".join(parts), encoding="utf8")
    return out


def main() -> None:
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    df = load_placement_aware()
    emit(
        f"Placement-aware sample: {len(df)} rows; "
        f"proportions={sorted(df['proportion'].unique())}; "
        f"placements={sorted(df['placement'].unique())}"
    )

    # --- Confirmatory cell descriptives (LCP, TTFB) --------------------
    conf = cell_descriptives(df, PRIMARY_METRICS)
    conf.to_csv(FIG_DIR / "cell_descriptives_lcp_ttfb.csv", index=False)
    emit("=== Confirmatory cell medians + bootstrap 95% CI ===")
    for metric in PRIMARY_METRICS:
        emit(f"\nMedian {metric.upper()} (ms) [95% CI]:")
        emit(wide_median_table(conf, metric).to_string())

    # --- Supporting (kept for later payload/request refinement) --------
    supp = cell_descriptives(df, SUPPORTING_METRICS)
    supp.to_csv(FIG_DIR / "cell_descriptives_supporting.csv", index=False)

    # --- Cliff's δ: PPR vs SSG+CSF, PPR vs SSR by cell (incl. 0%) ------
    contrast_rows = []
    for (proportion, placement), cell in df.groupby(["proportion", "placement"]):
        for metric in PRIMARY_METRICS:
            ppr = cell[cell["strategy"] == "ppr"][metric].dropna().to_numpy()
            for other in ("ssg", "ssr"):
                alt = cell[cell["strategy"] == other][metric].dropna().to_numpy()
                d = cliffs_delta(ppr, alt)
                contrast_rows.append(
                    {
                        "contrast": f"ppr_vs_{other}",
                        "proportion": int(proportion),
                        "placement": placement,
                        "metric": metric,
                        "n_ppr": len(ppr),
                        "n_other": len(alt),
                        "median_ppr": float(np.median(ppr)),
                        "median_other": float(np.median(alt)),
                        "delta_ms": float(np.median(ppr) - np.median(alt)),
                        "cliffs_delta": d,
                        "magnitude": magnitude(d),
                    }
                )
    contrasts = pd.DataFrame(contrast_rows).round(4)
    contrasts.to_csv(FIG_DIR / "cliffs_delta_by_cell.csv", index=False)
    emit("\n=== Cliff's delta by cell (PPR vs SSG+CSF / PPR vs SSR) ===")
    emit(contrasts.to_string(index=False))

    # --- PPR TTFB: ATF vs BTF at each proportion -----------------------
    ppr = df[df["strategy"] == "ppr"]
    place_rows = []
    for proportion in PROPORTIONS:
        sub = ppr[ppr["proportion"] == proportion]
        atf = sub[sub["placement"] == "atf"]["ttfb"].dropna().to_numpy()
        btf = sub[sub["placement"] == "btf"]["ttfb"].dropna().to_numpy()
        d = cliffs_delta(atf, btf)
        place_rows.append(
            {
                "proportion": int(proportion),
                "metric": "ttfb",
                "n_atf": len(atf),
                "n_btf": len(btf),
                "median_atf": float(np.median(atf)),
                "median_btf": float(np.median(btf)),
                "delta_ms": float(np.median(atf) - np.median(btf)),
                "cliffs_delta": d,
                "magnitude": magnitude(d),
            }
        )
    ttfb_place = pd.DataFrame(place_rows).round(4)
    ttfb_place.to_csv(FIG_DIR / "cliffs_delta_ppr_ttfb_placement.csv", index=False)
    emit("\n=== Cliff's delta PPR ATF vs BTF (TTFB) ===")
    emit(ttfb_place.to_string(index=False))

    # --- Adjacent proportion contrasts within placement ----------------
    def adjacent_proportion_rows(metric: str) -> pd.DataFrame:
        rows = []
        for place in ("atf", "btf"):
            for lo, hi in ADJACENT:
                a = ppr[(ppr["placement"] == place) & (ppr["proportion"] == lo)][
                    metric
                ].dropna().to_numpy()
                b = ppr[(ppr["placement"] == place) & (ppr["proportion"] == hi)][
                    metric
                ].dropna().to_numpy()
                d = cliffs_delta(b, a)  # higher vs lower: positive => higher prop larger
                rows.append(
                    {
                        "placement": place,
                        "prop_low": lo,
                        "prop_high": hi,
                        "metric": metric,
                        "n_low": len(a),
                        "n_high": len(b),
                        "median_low": float(np.median(a)),
                        "median_high": float(np.median(b)),
                        "delta_ms": float(np.median(b) - np.median(a)),
                        "cliffs_delta": d,
                        "magnitude": magnitude(d),
                    }
                )
        return pd.DataFrame(rows).round(4)

    ttfb_prop = adjacent_proportion_rows("ttfb")
    ttfb_prop.to_csv(FIG_DIR / "cliffs_delta_ppr_ttfb_proportion.csv", index=False)
    emit("\n=== Cliff's delta PPR TTFB adjacent proportions ===")
    emit(ttfb_prop.to_string(index=False))

    lcp_prop = adjacent_proportion_rows("lcp")
    lcp_prop.to_csv(FIG_DIR / "cliffs_delta_ppr_lcp_proportion.csv", index=False)
    emit("\n=== Cliff's delta PPR LCP adjacent proportions ===")
    emit(lcp_prop.to_string(index=False))

    # --- Cost table ----------------------------------------------------
    cost = contrasts[
        ["contrast", "proportion", "placement", "metric", "delta_ms", "cliffs_delta", "magnitude"]
    ].copy()
    cost.to_csv(FIG_DIR / "cost_table_delta_ms.csv", index=False)

    # Remove obsolete LCP ATF-vs-BTF artifact if present
    obsolete = FIG_DIR / "cliffs_delta_ppr_placement.csv"
    if obsolete.exists():
        obsolete.unlink()

    tex_path = write_latex(conf, contrasts, ttfb_place, ttfb_prop, lcp_prop)
    emit(f"\nWrote LaTeX tables to {tex_path}")

    report_path = FIG_DIR / "cell_analysis_report.txt"
    report_path.write_text("\n".join(OUT_LINES), encoding="utf8")
    emit(f"Wrote cell analysis outputs to {FIG_DIR}")


if __name__ == "__main__":
    main()
