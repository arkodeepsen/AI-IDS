#!/usr/bin/env python3
"""
Generate all the diagrammatic figures called out in the report TOC.

Reads model artefacts from models/ and writes PNG figures to docs/figures/.
The data-driven figures (confusion matrix, ROC) consume the JSON dumps the
trainers already produce; the architectural diagrams are pure graphviz so
they don't depend on the trained model state.

Run with: python3 scripts/generate-report-figures.py
"""

import json
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
    import numpy as np
    from graphviz import Digraph
except ImportError as e:
    sys.exit(f"Missing dep: {e}. Install with: pip install matplotlib graphviz")

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
FIG_DIR = ROOT / "docs" / "figures"
FIG_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------
# Figure 3.1 — High-level System Architecture
# --------------------------------------------------------------------------
def fig_3_1():
    g = Digraph("arch", format="png")
    g.attr(rankdir="TB", splines="polyline", nodesep="0.45", ranksep="0.55", fontname="Helvetica")
    g.attr("node", fontname="Helvetica", fontsize="11", style="filled")

    with g.subgraph(name="cluster_browser") as c:
        c.attr(label="Browser  (Next.js 16 dashboard + Chrome MV3 extension)",
               style="rounded,filled", fillcolor="#eef5ff", fontsize="10")
        c.node("UI", "Dashboard tabs:\nDetections · ML Models · Auto-Response\nTraining · Datasets · Alerts · AI Assistant",
               shape="box", fillcolor="#ffffff")
        c.node("EXT", "Chrome extension\n(polls /api/stats every 60 s)",
               shape="box", fillcolor="#ffffff")

    with g.subgraph(name="cluster_api") as c:
        c.attr(label="Next.js API Route Handlers  (TypeScript, server-only)",
               style="rounded,filled", fillcolor="#eafbe7", fontsize="10")
        c.node("API",
               "/api/{detect, attack, seed, detections, stats,\n"
               "       blocked-ips, rlhf, training, metrics, alerts,\n"
               "       auto-response, analyze, lstm, events}",
               shape="box", fillcolor="#ffffff")

    with g.subgraph(name="cluster_svc") as c:
        c.attr(label="Service Layer  (in-memory singletons + adapters)",
               style="rounded,filled", fillcolor="#fff6e1", fontsize="10")
        c.node("DET", "detection\n(ensemble.predict)", shape="box", fillcolor="#ffffff")
        c.node("AR", "auto-response\n(severity → block/alert/monitor)", shape="box", fillcolor="#ffffff")
        c.node("AL", "rlhf\n(Active Learning weight rebalance)", shape="box", fillcolor="#ffffff")
        c.node("ADAPT", "iptables / pcap / alert-sinks\n(opt-in adapters)", shape="box", fillcolor="#ffffff")

    with g.subgraph(name="cluster_ml") as c:
        c.attr(label="ML Layer  (pure TypeScript, no GPU)",
               style="rounded,filled", fillcolor="#fce8ff", fontsize="10")
        c.node("IF",  "Isolation Forest\n30 %", shape="box", fillcolor="#ffffff")
        c.node("AE",  "Autoencoder\n25 %",      shape="box", fillcolor="#ffffff")
        c.node("RF",  "Random Forest\n25 %",    shape="box", fillcolor="#ffffff")
        c.node("XGB", "XGBoost\n20 %",          shape="box", fillcolor="#ffffff")
        c.node("ENS", "Ensemble\n(weighted vote, threshold = 0.35)",
               shape="box", fillcolor="#dbf2c8", style="filled,bold")
        c.node("LSTM", "LSTM\n(sliding 8-flow windows, separate API)",
               shape="box", fillcolor="#ffffff")

    g.node("DB", "SQLite (via Prisma 7)\nNetworkPacket · DetectionResult\nAlert · BlockedIP · …",
           shape="cylinder", fillcolor="#fff", fontsize="10")

    # edges
    g.edge("UI", "API", label="fetch / EventSource", fontsize="9")
    g.edge("EXT", "API", label="poll /api/stats", fontsize="9")
    g.edge("API", "DET")
    g.edge("API", "AR")
    g.edge("API", "AL")
    g.edge("DET", "ENS")
    g.edge("IF", "ENS"); g.edge("AE", "ENS"); g.edge("RF", "ENS"); g.edge("XGB", "ENS")
    g.edge("DET", "DB", style="dashed", label="persist", fontsize="9")
    g.edge("AR", "ADAPT", style="dashed", label="block IP / fire alert", fontsize="9")
    g.edge("AL", "ENS", style="dashed", label="update weights", fontsize="9")
    g.edge("AR", "DB", style="dashed")

    out = FIG_DIR / "fig-3-1-system-architecture"
    g.render(out, cleanup=True)
    print(f"  fig-3-1-system-architecture.png")


# --------------------------------------------------------------------------
# Figure 4.1 — Feature Extraction Pipeline (72-dim)
# --------------------------------------------------------------------------
def fig_4_1():
    g = Digraph("feat", format="png")
    g.attr(rankdir="LR", splines="polyline", nodesep="0.3", ranksep="0.55", fontname="Helvetica")
    g.attr("node", fontname="Helvetica", fontsize="10", style="filled", fillcolor="#fff")

    g.node("PKT", "Live packet\nor NSL-KDD row", shape="cds", fillcolor="#eef5ff", fontsize="11")

    with g.subgraph(name="cluster_blocks") as c:
        c.attr(label="One-hot + numeric extraction\n(lib/ml/features.ts)",
               style="rounded,filled", fillcolor="#eafbe7", fontsize="10")
        c.node("PROTO", "protocol_type\none-hot — 3 dims\n{tcp, udp, icmp}", shape="box")
        c.node("SVC",   "service\none-hot — 20 dims\n(top-20 + 'other')", shape="box")
        c.node("FLAG",  "flag\none-hot — 11 dims\n{SF, S0, REJ, …}", shape="box")
        c.node("NUM",   "Numeric — 38 dims\nduration, src_bytes,\ndst_bytes, hot, …\nmin-max [0, 1]", shape="box")

    g.node("VEC", "72-dim feature vector\n(scaler.json applied)",
           shape="parallelogram", fillcolor="#fce8ff", fontsize="11")
    g.node("ENS", "Ensemble.predict()", shape="box3d", fillcolor="#dbf2c8", fontsize="11")

    g.edge("PKT", "PROTO"); g.edge("PKT", "SVC"); g.edge("PKT", "FLAG"); g.edge("PKT", "NUM")
    g.edge("PROTO", "VEC"); g.edge("SVC", "VEC"); g.edge("FLAG", "VEC"); g.edge("NUM", "VEC")
    g.edge("VEC", "ENS", label="x ∈ ℝ⁷²", fontsize="9")

    out = FIG_DIR / "fig-4-1-feature-pipeline"
    g.render(out, cleanup=True)
    print(f"  fig-4-1-feature-pipeline.png")


# --------------------------------------------------------------------------
# Figure 4.2 — Ensemble Voting Mechanism
# --------------------------------------------------------------------------
def fig_4_2():
    g = Digraph("vote", format="png")
    g.attr(rankdir="LR", splines="polyline", nodesep="0.35", ranksep="0.6", fontname="Helvetica")
    g.attr("node", fontname="Helvetica", fontsize="10", style="filled", fillcolor="#fff")

    g.node("X", "x ∈ ℝ⁷²", shape="parallelogram", fillcolor="#fce8ff", fontsize="11")

    with g.subgraph(name="cluster_m") as c:
        c.attr(label="Four base models", style="rounded,filled", fillcolor="#eef5ff", fontsize="10")
        c.node("IF",  "Isolation Forest\nscore ∈ [0, 1]\nweight w₁ = 0.30", shape="box")
        c.node("AE",  "MLP Autoencoder\nrecon error ∈ [0, 1]\nweight w₂ = 0.25", shape="box")
        c.node("RF",  "Random Forest\nattackProb ∈ [0, 1]\nweight w₃ = 0.25", shape="box")
        c.node("XGB", "XGBoost\nsigmoid(F(x)) ∈ [0, 1]\nweight w₄ = 0.20", shape="box")

    g.node("SUM", "Σ wᵢ · sᵢ(x)\nweighted vote",
           shape="diamond", fillcolor="#fff6e1", fontsize="11")
    g.node("TH", "score > 0.35 ?\n(F1-optimal threshold)",
           shape="diamond", fillcolor="#fff6e1", fontsize="11")
    g.node("OUT", "is_anomaly + severity\n(critical/high/medium/low)",
           shape="box3d", fillcolor="#dbf2c8", fontsize="11")

    g.edge("X", "IF"); g.edge("X", "AE"); g.edge("X", "RF"); g.edge("X", "XGB")
    g.edge("IF", "SUM"); g.edge("AE", "SUM"); g.edge("RF", "SUM"); g.edge("XGB", "SUM")
    g.edge("SUM", "TH"); g.edge("TH", "OUT")

    out = FIG_DIR / "fig-4-2-ensemble-voting"
    g.render(out, cleanup=True)
    print(f"  fig-4-2-ensemble-voting.png")


# --------------------------------------------------------------------------
# Figure 4.3 — LSTM Sequence Model Architecture
# --------------------------------------------------------------------------
def fig_4_3():
    g = Digraph("lstm", format="png")
    g.attr(rankdir="LR", splines="polyline", nodesep="0.25", ranksep="0.55", fontname="Helvetica")
    g.attr("node", fontname="Helvetica", fontsize="10", style="filled", fillcolor="#fff")

    with g.subgraph(name="cluster_in") as c:
        c.attr(label="Sliding 8-flow window\n(x_{t-7} … x_t)", style="rounded,filled", fillcolor="#eef5ff", fontsize="10")
        for i in range(8):
            label = f"x_{{t-{7-i}}}\n(72-dim)"
            c.node(f"X{i}", label, shape="box")

    for i in range(8):
        g.node(f"L{i}", f"LSTM cell\nhidden = 16", shape="component", fillcolor="#fff6e1")

    g.node("OUT", "y_t ∈ [0, 1]\n(anomalous-window\nprobability)",
           shape="box3d", fillcolor="#dbf2c8", fontsize="11")

    for i in range(8):
        g.edge(f"X{i}", f"L{i}")
    for i in range(7):
        g.edge(f"L{i}", f"L{i+1}", label="h_t", fontsize="9")
    g.edge("L7", "OUT", label="sigmoid", fontsize="9")

    out = FIG_DIR / "fig-4-3-lstm-architecture"
    g.render(out, cleanup=True)
    print(f"  fig-4-3-lstm-architecture.png")


# --------------------------------------------------------------------------
# Figure 5.1 — Active Learning Feedback Loop
# --------------------------------------------------------------------------
def fig_5_1():
    g = Digraph("al", format="png")
    g.attr(rankdir="TB", splines="curved", nodesep="0.4", ranksep="0.5", fontname="Helvetica")
    g.attr("node", fontname="Helvetica", fontsize="10", style="filled", fillcolor="#fff")

    g.node("PKT", "Incoming packet", shape="cds", fillcolor="#eef5ff", fontsize="11")
    g.node("ENS", "Ensemble.predict()", shape="box3d", fillcolor="#dbf2c8")
    g.node("UI",  "Dashboard detection feed\n(Confirm / Dismiss buttons)", shape="box", fillcolor="#fff6e1")
    g.node("OP",  "Operator", shape="oval", fillcolor="#fce8ff")
    g.node("FB",  "/api/rlhf POST\nfeedback record", shape="parallelogram")
    g.node("BUF", "Sliding feedback buffer\n(per-model accuracy)", shape="cylinder")
    g.node("RB",  "Every 10 samples:\nrebalance weights\nη = 0.05", shape="diamond", fillcolor="#fff6e1")
    g.node("W",   "Updated ensemble\nweights", shape="box")

    g.edge("PKT", "ENS")
    g.edge("ENS", "UI", label="score + per-model breakdown", fontsize="9")
    g.edge("UI", "OP", label="surfaces alert", fontsize="9")
    g.edge("OP", "FB", label="Confirm/Dismiss\nclick", fontsize="9")
    g.edge("FB", "BUF")
    g.edge("BUF", "RB", label="threshold = 10", fontsize="9")
    g.edge("RB", "W")
    g.edge("W",  "ENS", style="dashed", label="next predict() uses\nnew weights", fontsize="9", constraint="false")

    out = FIG_DIR / "fig-5-1-active-learning-loop"
    g.render(out, cleanup=True)
    print(f"  fig-5-1-active-learning-loop.png")


# --------------------------------------------------------------------------
# Figure 6.1 — Autonomous Response Decision Flow
# --------------------------------------------------------------------------
def fig_6_1():
    g = Digraph("ar", format="png")
    g.attr(rankdir="TB", splines="ortho", nodesep="0.35", ranksep="0.45", fontname="Helvetica")
    g.attr("node", fontname="Helvetica", fontsize="10", style="filled", fillcolor="#fff")

    g.node("DET", "DetectionResult\n(score, severity, ip)", shape="box", fillcolor="#eef5ff")
    g.node("ANO", "isAnomaly?", shape="diamond", fillcolor="#fff6e1")
    g.node("CONF", "confidence ≥\nthreatThreshold ?", shape="diamond", fillcolor="#fff6e1")
    g.node("WL", "sourceIP ∈\nwhitelist ?", shape="diamond", fillcolor="#fff6e1")
    g.node("SEV", "severity?", shape="diamond", fillcolor="#fff6e1")

    g.node("CRIT", "critical (≥ 0.85)\n→ Permanent block", shape="box", fillcolor="#ffc4c4")
    g.node("HIGH", "high (≥ 0.65)\n→ 24-hour block", shape="box", fillcolor="#ffd9a8")
    g.node("MED",  "medium (≥ 0.50)\n→ Alert only", shape="box", fillcolor="#fff0b3")
    g.node("LOW",  "low (< 0.50)\n→ Monitor (log only)", shape="box", fillcolor="#eafbe7")

    g.node("PERSIST", "BlockedIP row +\niptables DROP rule\n+ alert sinks fire", shape="box3d", fillcolor="#fce8ff")
    g.node("NOOP", "No action\n(continue)", shape="box", fillcolor="#e8e8e8")

    g.edge("DET", "ANO")
    g.edge("ANO", "NOOP", label="no", fontsize="9")
    g.edge("ANO", "CONF", label="yes", fontsize="9")
    g.edge("CONF", "NOOP", label="no", fontsize="9")
    g.edge("CONF", "WL", label="yes", fontsize="9")
    g.edge("WL", "NOOP", label="yes\n(allow)", fontsize="9")
    g.edge("WL", "SEV", label="no", fontsize="9")
    g.edge("SEV", "CRIT", label=">0.85", fontsize="9")
    g.edge("SEV", "HIGH", label=">0.65", fontsize="9")
    g.edge("SEV", "MED", label=">0.50", fontsize="9")
    g.edge("SEV", "LOW", label="else", fontsize="9")
    g.edge("CRIT", "PERSIST")
    g.edge("HIGH", "PERSIST")
    g.edge("MED", "PERSIST", style="dashed", label="alert only", fontsize="9")

    out = FIG_DIR / "fig-6-1-auto-response-flow"
    g.render(out, cleanup=True)
    print(f"  fig-6-1-auto-response-flow.png")


# --------------------------------------------------------------------------
# Figure 9.1 — Confusion Matrix (NSL-KDD ensemble)
# --------------------------------------------------------------------------
def fig_9_1():
    metrics = json.loads((MODELS / "metrics.json").read_text())
    ens = next(m for m in metrics["perModel"] if m["method"].lower() == "ensemble")
    matrix = np.array([
        [ens["tn"], ens["fp"]],
        [ens["fn"], ens["tp"]],
    ])

    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    im = ax.imshow(matrix, cmap="Blues", vmin=0, vmax=matrix.max())
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_xticklabels(["Predicted\nNormal", "Predicted\nAttack"])
    ax.set_yticklabels(["Actual\nNormal", "Actual\nAttack"])
    for i in range(2):
        for j in range(2):
            label = ["TN", "FP", "FN", "TP"][i * 2 + j]
            ax.text(j, i, f"{matrix[i, j]}\n({label})",
                    ha="center", va="center",
                    color="white" if matrix[i, j] > matrix.max() / 2 else "black",
                    fontsize=13, fontweight="bold")
    ax.set_title(
        f"NSL-KDD Ensemble confusion matrix\n"
        f"acc {ens['accuracy']*100:.2f} %  ·  F1 {ens['f1Score']*100:.2f} %  ·  "
        f"recall {ens['recall']*100:.2f} %  ·  FPR {ens['falsePositiveRate']*100:.2f} %",
        fontsize=10,
    )
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(FIG_DIR / "fig-9-1-confusion-matrix.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  fig-9-1-confusion-matrix.png")


# --------------------------------------------------------------------------
# Figure 9.2 — ROC Curve (Ensemble vs Individual Models)
# --------------------------------------------------------------------------
def fig_9_2():
    """
    Synthesises ROC curves from the per-model metrics by sweeping the
    threshold across a fine grid. The actual point on each curve we
    reported in §9.1 is overlaid as a marker.
    """
    metrics = json.loads((MODELS / "metrics.json").read_text())
    # We don't have the raw score arrays here (the training script didn't
    # persist them). Approximate the ROC curves analytically using each
    # model's reported confusion matrix at the trained threshold: at that
    # operating point we know the (FPR, TPR), so the curve is anchored
    # there and we interpolate to (0,0) and (1,1).
    #
    # This is sufficient for an illustrative figure. A true ROC requires
    # rerunning inference and sorting scores, which the train script
    # doesn't expose. The figure caption discloses the interpolation.

    fig, ax = plt.subplots(figsize=(7, 6))
    palette = {"Isolation Forest": "C1", "Autoencoder": "C2",
               "Random Forest": "C0", "XGBoost": "C3", "Ensemble": "k"}

    for row in metrics["perModel"]:
        name = row["method"]
        fpr_op = row["falsePositiveRate"]
        tpr_op = row["recall"]
        # Three-point ROC: (0,0) → operating point → (1,1). Smooth via a
        # convex interpolation so it looks like a curve, not a kink.
        # We bias the curve through the (FPR, TPR) point using a quarter-
        # sphere in the unit square.
        fprs = np.linspace(0, 1, 200)
        tprs = np.where(
            fprs <= fpr_op,
            tpr_op * (fprs / fpr_op) ** 0.7 if fpr_op > 0 else fprs,
            tpr_op + (1 - tpr_op) * ((fprs - fpr_op) / max(1e-6, 1 - fpr_op)) ** 1.4,
        )
        is_ens = name.lower() == "ensemble"
        ax.plot(fprs, tprs, color=palette.get(name, "C4"),
                linewidth=2.2 if is_ens else 1.4,
                linestyle="-" if is_ens else "--",
                label=f"{name}  (F1 {row['f1Score']*100:.1f} %)")
        ax.scatter([fpr_op], [tpr_op], color=palette.get(name, "C4"), zorder=3,
                   s=55 if is_ens else 35, edgecolors="white", linewidths=1.2)

    ax.plot([0, 1], [0, 1], color="gray", linestyle=":", linewidth=1, label="Random baseline")
    ax.set_xlabel("False Positive Rate (FPR)")
    ax.set_ylabel("True Positive Rate (recall)")
    ax.set_title("ROC — Ensemble vs Individual Models on NSL-KDD KDDTest+\n"
                 "(operating point marked; curves interpolated through (0,0), op, (1,1))")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="lower right", fontsize=9)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    fig.tight_layout()
    fig.savefig(FIG_DIR / "fig-9-2-roc-curve.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  fig-9-2-roc-curve.png")


# --------------------------------------------------------------------------
# Figure 10.1 — Dashboard Live Threats (best-effort: see helper script)
# --------------------------------------------------------------------------
def fig_10_1_instructions():
    """Print instructions instead of generating — needs a running browser."""
    msg = (
        "  fig-10-1-dashboard-live-threats.png  (SKIPPED — needs a live browser)\n"
        "      Reproduce locally:\n"
        "        1. npm run dev\n"
        "        2. curl -X POST http://localhost:3000/api/seed\n"
        "        3. open http://localhost:3000\n"
        "        4. Screenshot the Detections tab → save to docs/figures/fig-10-1-dashboard-live-threats.png"
    )
    print(msg)


def main():
    print(f"Writing figures to {FIG_DIR}")
    fig_3_1()
    fig_4_1()
    fig_4_2()
    fig_4_3()
    fig_5_1()
    fig_6_1()
    fig_9_1()
    fig_9_2()
    fig_10_1_instructions()
    print("\nDone.")


if __name__ == "__main__":
    main()
