#!/usr/bin/env python3
"""
Render the adversarial robustness audit as a PNG figure.

Reads models/adversarial-audit.json (produced by
`scripts/eval-adversarial.ts`) and writes models/adversarial-audit.png.

Used by docs/PROJECT_REPORT.md §11.7 as the adversarial-robustness figure.
"""

import json
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
except ImportError:
    sys.exit("matplotlib required. Install with: pip install matplotlib")

ROOT = Path(__file__).resolve().parent.parent
IN_PATH = ROOT / "models" / "adversarial-audit.json"
OUT_PATH = ROOT / "models" / "adversarial-audit.png"


def main():
    if not IN_PATH.exists():
        sys.exit(f"Missing {IN_PATH}. Run `npm run eval:adversarial` first.")
    data = json.loads(IN_PATH.read_text())
    baseline = data["baseline"]
    eps = [r["epsilon"] for r in baseline]
    recall = [r["recall"] * 100 for r in baseline]
    evasions = [r["successfulEvasions"] / r["attackCount"] * 100 for r in baseline]
    mean_before = [r["meanScoreBefore"] for r in baseline]
    mean_after = [r["meanScoreAfter"] for r in baseline]

    fig, (ax_r, ax_s) = plt.subplots(1, 2, figsize=(11, 4.5))

    ax_r.plot(eps, recall, "C0o-", label="Recall after perturbation", linewidth=2)
    ax_r.plot(eps, evasions, "C3s--", label="Successful evasion rate", linewidth=1.6)
    ax_r.set_xlabel("Perturbation budget ε (L∞)")
    ax_r.set_ylabel("Percent (%)")
    ax_r.set_title(f"Score-based L∞ attack on {data['protocol']['auditSample']} attack rows")
    ax_r.grid(True, alpha=0.3)
    ax_r.legend(loc="best")

    ax_s.plot(eps, mean_before, "C2-", label="Mean ensemble score, original", linewidth=1.6)
    ax_s.plot(eps, mean_after, "C1-", label="Mean ensemble score, perturbed", linewidth=1.6)
    ax_s.axhline(data["protocol"]["ensembleThreshold"], color="gray", linestyle=":",
                 label=f"Anomaly threshold = {data['protocol']['ensembleThreshold']}")
    ax_s.set_xlabel("Perturbation budget ε (L∞)")
    ax_s.set_ylabel("Mean ensemble score")
    ax_s.set_title("Score collapse vs perturbation budget")
    ax_s.grid(True, alpha=0.3)
    ax_s.legend(loc="best")

    fig.tight_layout()
    fig.savefig(OUT_PATH, dpi=140, bbox_inches="tight")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
