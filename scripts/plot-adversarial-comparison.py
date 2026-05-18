#!/usr/bin/env python3
"""
Render side-by-side adversarial audit for the clean-trained vs
adversarially-trained NSL-KDD ensembles.

Reads models/adversarial-comparison.json (produced by
`scripts/train-adversarial.ts`) and writes
docs/figures/fig-9-9-adversarial-comparison.png.
"""

import json
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
except ImportError:
    sys.exit("matplotlib required.")

ROOT = Path(__file__).resolve().parent.parent
IN = ROOT / "models" / "adversarial-comparison.json"
OUT = ROOT / "docs" / "figures" / "fig-9-9-adversarial-comparison.png"


def main():
    if not IN.exists():
        sys.exit("Run `npm run train:adversarial` first.")
    data = json.loads(IN.read_text())
    clean = data["cleanEnsemble"]["audit"]
    adv = data["adversarialEnsemble"]["audit"]
    eps = [r["epsilon"] for r in clean]
    clean_recall = [r["recall"] * 100 for r in clean]
    clean_evasion = [r["evasionRate"] * 100 for r in clean]
    adv_recall = [r["recall"] * 100 for r in adv]
    adv_evasion = [r["evasionRate"] * 100 for r in adv]

    fig, (ax_r, ax_e) = plt.subplots(1, 2, figsize=(11, 4.5))

    ax_r.plot(eps, clean_recall, "C3o-", label="Clean-trained ensemble", linewidth=2)
    ax_r.plot(eps, adv_recall, "C0s-", label="Adversarially-trained ensemble", linewidth=2)
    ax_r.set_xlabel("Perturbation budget ε (L∞)")
    ax_r.set_ylabel("Recall on perturbed attacks (%)")
    ax_r.set_title("Adversarial training: recall is restored")
    ax_r.grid(True, alpha=0.3)
    ax_r.legend(loc="lower right")

    ax_e.plot(eps, clean_evasion, "C3o-", label="Clean-trained ensemble", linewidth=2)
    ax_e.plot(eps, adv_evasion, "C0s-", label="Adversarially-trained ensemble", linewidth=2)
    ax_e.set_xlabel("Perturbation budget ε (L∞)")
    ax_e.set_ylabel("Successful evasion rate (%)")
    ax_e.set_title("Adversarial training: evasions collapse")
    ax_e.grid(True, alpha=0.3)
    ax_e.legend(loc="upper right")

    fig.suptitle(
        "Adversarial robustness — clean vs adversarially-augmented ensemble\n"
        f"(train augment: one ε = {data['protocol']['perturbationBudget']} copy per attack, top-{data['protocol']['topKFeatures']} score-rank perturbation)",
        fontsize=10,
    )
    fig.tight_layout()
    fig.savefig(OUT, dpi=150, bbox_inches="tight")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
