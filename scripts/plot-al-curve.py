#!/usr/bin/env python3
"""
Render the Active Learning learning curve as a PNG figure.

Reads models/active-learning-curve.json (produced by
`scripts/eval-active-learning.ts`) and writes models/active-learning-curve.png
showing:
  - Ensemble F1 vs samples processed (left axis)
  - Ensemble FPR vs samples processed (right axis)
  - Weight trajectory (subplot below)

Used by docs/PROJECT_REPORT.md §5 as Figure 1 of the AL evaluation.
Run with: python3 scripts/plot-al-curve.py
"""

import json
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
except ImportError:
    sys.exit("matplotlib required. Install with: pip install matplotlib")

ROOT = Path(__file__).resolve().parent.parent
IN_PATH = ROOT / "models" / "active-learning-curve.json"
OUT_PATH = ROOT / "models" / "active-learning-curve.png"


def main():
    if not IN_PATH.exists():
        sys.exit(f"Missing {IN_PATH}. Run `npm run eval:al` first.")

    data = json.loads(IN_PATH.read_text())
    curve = data["curve"]
    samples = [pt["samplesProcessed"] for pt in curve]
    f1 = [pt["ensembleF1"] * 100 for pt in curve]
    fpr = [pt["ensembleFPR"] * 100 for pt in curve]
    rec = [pt["ensembleRecall"] * 100 for pt in curve]

    fig, (ax_metrics, ax_w) = plt.subplots(2, 1, figsize=(10, 7), sharex=True)

    # ---- Top: F1 / Recall / FPR over samples ----
    ax_metrics.plot(samples, f1, "C0-", label="Ensemble F1", linewidth=2)
    ax_metrics.plot(samples, rec, "C2-", label="Ensemble Recall", linewidth=1.4, alpha=0.85)
    ax_metrics.set_ylabel("F1 / Recall (%)", color="C0")
    ax_metrics.tick_params(axis="y", labelcolor="C0")
    ax_metrics.grid(True, alpha=0.3)
    ax_metrics.legend(loc="lower left")

    ax_fpr = ax_metrics.twinx()
    ax_fpr.plot(samples, fpr, "C3--", label="Ensemble FPR", linewidth=1.4)
    ax_fpr.set_ylabel("FPR (%)", color="C3")
    ax_fpr.tick_params(axis="y", labelcolor="C3")
    ax_fpr.legend(loc="lower right")

    ax_metrics.set_title(
        f"Active Learning learning curve "
        f"(replay {data['protocol']['replaySize']} / eval {data['protocol']['evalSize']}, "
        f"η = {data['protocol']['learningRate']}, batch = {data['protocol']['batchSize']})"
    )

    # ---- Bottom: weight trajectory ----
    w_if = [pt["weights"]["isolationForest"] * 100 for pt in curve]
    w_ae = [pt["weights"]["autoencoder"] * 100 for pt in curve]
    w_rf = [pt["weights"]["randomForest"] * 100 for pt in curve]
    w_xgb = [pt["weights"]["xgboost"] * 100 for pt in curve]
    ax_w.plot(samples, w_if, label="Isolation Forest", linewidth=1.5)
    ax_w.plot(samples, w_ae, label="Autoencoder", linewidth=1.5)
    ax_w.plot(samples, w_rf, label="Random Forest", linewidth=1.5)
    ax_w.plot(samples, w_xgb, label="XGBoost", linewidth=1.5)
    ax_w.set_xlabel("Verified samples processed")
    ax_w.set_ylabel("Ensemble weight (%)")
    ax_w.set_title("Per-model weight trajectory")
    ax_w.grid(True, alpha=0.3)
    ax_w.legend(loc="best", ncol=2)

    fig.tight_layout()
    fig.savefig(OUT_PATH, dpi=140, bbox_inches="tight")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
