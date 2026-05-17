#!/usr/bin/env python3
"""
Render the ensemble subset ablation as a PNG figure.

Reads models/ablation-nslkdd.json and models/ablation-cicids.json (produced
by `scripts/eval-ablation.ts`) and writes models/ablation.png.

Used by docs/PROJECT_REPORT.md (new §9.10 finding: when does voting help vs
hurt?).
"""

import json
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
    import numpy as np
except ImportError:
    sys.exit("matplotlib + numpy required. Install with: pip install matplotlib")

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
OUT = MODELS / "ablation.png"

SHORT = {
    "Isolation Forest": "IF",
    "Autoencoder": "AE",
    "Random Forest": "RF",
    "XGBoost": "XGB",
}


def load(name: str):
    p = MODELS / name
    if not p.exists():
        return None
    return json.loads(p.read_text())


def axis(ax, data, title: str):
    if data is None:
        ax.set_visible(False)
        return
    rows = sorted(data["results"], key=lambda r: r["f1"], reverse=True)
    labels = ["+".join(SHORT[m] for m in r["subset"]) for r in rows]
    f1s = [r["f1"] * 100 for r in rows]
    fprs = [r["fpr"] * 100 for r in rows]
    sizes = [r["size"] for r in rows]

    colors = ["#1f77b4" if s == 1 else "#2ca02c" if s == 2 else "#ff7f0e" if s == 3 else "#d62728" for s in sizes]
    y = np.arange(len(rows))
    ax.barh(y, f1s, color=colors, alpha=0.85)
    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("F1 score (%) — per-subset threshold grid-searched")
    ax.set_title(title)
    ax.grid(True, axis="x", alpha=0.3)
    for i, (f, fp) in enumerate(zip(f1s, fprs)):
        ax.text(f + 0.3, i, f"{f:.1f} | FPR {fp:.1f}", va="center", fontsize=7, color="black")


def main():
    nsl = load("ablation-nslkdd.json")
    cic = load("ablation-cicids.json")
    if not nsl and not cic:
        sys.exit("Run `npm run eval:ablation` first.")

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 7))
    axis(a1, nsl, "NSL-KDD: F1 by model subset")
    axis(a2, cic, "CICIDS-2017: F1 by model subset")

    handles = [
        plt.Rectangle((0, 0), 1, 1, color="#1f77b4", alpha=0.85, label="1 model"),
        plt.Rectangle((0, 0), 1, 1, color="#2ca02c", alpha=0.85, label="2 models"),
        plt.Rectangle((0, 0), 1, 1, color="#ff7f0e", alpha=0.85, label="3 models"),
        plt.Rectangle((0, 0), 1, 1, color="#d62728", alpha=0.85, label="4 models (full)"),
    ]
    fig.legend(handles=handles, loc="lower center", ncol=4, fontsize=9, bbox_to_anchor=(0.5, -0.01))

    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(OUT, dpi=140, bbox_inches="tight")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
