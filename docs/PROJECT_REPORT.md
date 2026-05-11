# AI-Based Intrusion Detection System
## Comparative Analysis of Machine Learning Techniques with Cross-Dataset Evaluation

> **Major Project 2025-26**
> Arkaprava Das · Anurup Samanta · Arkodeep Sen

This document is the canonical reference for the project's research paper,
presentation, and final report. It supersedes the earlier `implementation.md`
(written at proposal stage) and reflects the system that is actually built,
trained, measured, and shipped.

---

## Abstract

We present an AI-based Network Intrusion Detection System (NIDS) that
combines a four-model machine-learning ensemble with a sequence model, an
Active Learning loop, severity-driven autonomous response, and real-time
dashboarding. The ensemble — Isolation Forest, MLP Autoencoder, Random
Forest, and gradient-boosted trees — is trained on the NSL-KDD benchmark
(KDDTrain+) and evaluated on the held-out KDDTest+ split, achieving
**90.99 % accuracy and 92.57 % F1** with 97.99 % recall and 18.41 % FPR
on binary attack classification. The same architecture trained
independently on CICIDS-2017 (Kaggle preprocessed mirror, 52 of CIC's 78
CICFlowMeter features) reaches **99.40 % accuracy and 98.16 % F1** with
0.18 % FPR — evidence the methodology survives a structurally different
feature space. A separate LSTM over sliding 8-flow windows is included as
a documented negative result: NSL-KDD rows lack session structure, so the
sequence model underperforms the flat ensemble; we keep it for the
methodology comparator and as scaffolding for a future CICIDS-flows
sequence experiment. Operator feedback is fed back through an Active
Learning channel that rebalances ensemble weights every ten verified
samples (infrastructure complete; empirical accuracy-gain evaluation is
future work). Autonomous response actions (alert, time-limited block,
permanent ban) are gated by per-severity thresholds. The system ships as
a self-contained Next.js 16 application with a SQLite store and a
companion Chrome (Manifest V3) extension.

**Keywords:** Intrusion Detection, Ensemble Learning, Anomaly Detection,
Isolation Forest, Autoencoder, Random Forest, XGBoost, LSTM, Active
Learning, NSL-KDD, CICIDS-2017.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Background and Related Work](#2-background-and-related-work)
3. [System Architecture](#3-system-architecture)
4. [Machine Learning Methodology](#4-machine-learning-methodology)
5. [Active Learning](#5-active-learning-human-in-the-loop)
6. [Autonomous Response](#6-autonomous-response)
7. [Cross-Dataset Evaluation](#7-cross-dataset-evaluation)
8. [Implementation](#8-implementation)
9. [Experimental Results](#9-experimental-results)
10. [Dashboard and Chrome Extension](#10-dashboard-and-chrome-extension)
11. [Discussion and Limitations](#11-discussion-and-limitations)
12. [Conclusion and Future Work](#12-conclusion-and-future-work)
13. [References](#13-references)
14. [Appendix A — API Reference](#appendix-a--api-reference)
15. [Appendix B — Reproduction Steps](#appendix-b--reproduction-steps)
16. [Appendix C — Errata vs. Original Proposal](#appendix-c--errata-vs-original-proposal)

---

## 1. Introduction

### 1.1 Problem Statement

Modern network attacks are increasingly diverse, polymorphic, and short-lived.
Signature-based intrusion-detection systems (IDS) fail when attack payloads
mutate. Anomaly-based IDS, which model normal traffic and flag deviations,
generalise better but suffer from high false-positive rates that erode
operator trust. The unmet need is a system that combines complementary
detectors (so any single failure mode does not dominate), corrects itself
from operator feedback, and acts autonomously when confident — without
flooding humans with false alarms.

### 1.2 Motivation

Three observations motivate the design:

1. **No single model is best on every attack family.** In our measurements,
   Random Forest dominates precision (93.01 %), gradient boosting dominates
   individual F1 (88.55 %), and the unsupervised pair (Isolation Forest +
   Autoencoder) recover novelty signal the supervised pair miss. Combining
   them lifts ensemble F1 to 92.57 % — higher than any single model.
2. **The literature's "91 % on NSL-KDD" can be misleading.** NSL-KDD's
   underlying traffic is from 1998. A model that excels on it may merely be
   recognising obsolete artefacts. To control for this we provide a parallel
   evaluation on CICIDS-2017 (2017 traffic, eight modern attack scenarios,
   78 features that have *zero* overlap with NSL-KDD).
3. **Operator feedback is the cheapest form of new training data.** Every
   "this was a false alarm" click is a label. An Active Learning loop that
   reweights the ensemble from verified samples turns operator time into
   measurable accuracy gain without needing to retrain from scratch.

### 1.3 Contributions

- A pure-TypeScript ensemble of four algorithms with weight-normalised
  voting and on-disk serialisation, callable from a Next.js API route in
  < 10 ms per packet on a single CPU core.
- A reproducible training pipeline that consumes the official NSL-KDD CSVs
  and reports per-model metrics on the canonical KDDTest+ split.
- A separate LSTM sequence model over sliding 8-flow windows, exposed via
  its own API for flow-level vs. sequence-level comparison.
- An Active Learning module that rebalances ensemble weights from operator
  feedback (default learning rate 0.05, default trigger every 10 verified
  samples).
- A severity-driven auto-response engine with whitelist support and
  database-persisted block records.
- IP-entropy features (per-address octet entropy + per-source fan-out
  entropy) surfaced per detection.
- A Server-Sent Events channel that pushes new detections to the dashboard
  in real time.
- A complete CICIDS-2017 pipeline (loader, scaler, attack-family classifier,
  temporal/random split helper, parallel trainer) for cross-dataset
  methodology validation.
- A Manifest V3 Chrome extension that surfaces live anomaly counts as a
  toolbar badge and fires desktop notifications.

---

## 2. Background and Related Work

### 2.1 NSL-KDD

NSL-KDD is the cleaned-up successor to the 1999 KDD-Cup-99 dataset,
introduced by Tavallaee et al. (2009) to address duplicate-record and
imbalance issues in the original release. Each record describes a single
network connection with 41 features (3 categorical — `protocol_type`,
`service`, `flag` — and 38 numeric) plus a label drawn from 23 attack
sub-types grouped into four families: DoS, Probe, R2L, U2R.

KDDTrain+ has 125 973 rows; KDDTest+ has 22 544 rows. The test split is
deliberately harder: it contains 17 attack types absent from the training
split, so it measures generalisation to unseen attacks rather than fitting
to a known distribution.

### 2.2 CICIDS-2017

CICIDS-2017 (Sharafaldin, Lashkari & Ghorbani, 2018) is a modern benchmark
released by the Canadian Institute for Cybersecurity. It spans five
working days; Monday is benign-only baseline traffic and Tuesday–Friday
each contribute one or two attack scenarios. The full list of attack
scenarios is: brute force (FTP, SSH), DoS (Hulk, GoldenEye, slowloris,
slowhttptest, Heartbleed¹), web attacks (XSS, SQL injection, brute force),
infiltration, botnet (Ares), port scan, and DDoS. Flow records are
produced by CICFlowMeter and have **78 numeric features** per row — none
of which overlap with NSL-KDD's connection-level schema.

We train on the Kaggle "cleaned and preprocessed" mirror by Eric Anacleto
Ribeiro², which ships **52 of the 78 canonical features**. The dropped
columns are redundant by construction (`Total Backward Packets`,
`Subflow * Bytes` duplicates of `Total Length of *`, `Fwd Header Length.1`
duplicate, flag-count columns that are all-zero in the benign portion).
The loader (`lib/ml/cicids.ts`) zero-fills the missing canonical columns
so the four-model architecture trains unchanged; the populated subset is
recorded into `models/cicids/feature-meta.json` for reproducibility.

¹ Heartbleed is taxonomically a memory-disclosure exploit, not DoS —
the CIC release files it under the DoS scenario for capture-day reasons.
² <https://www.kaggle.com/datasets/ericanacletoribeiro/cicids2017-cleaned-and-preprocessed>

### 2.3 Related Algorithms

- **Isolation Forest** (Liu, Ting & Zhou, 2008): unsupervised anomaly
  detection by recursive random partitioning. Anomalies isolate at shallow
  tree depth.
- **Autoencoder anomaly detection** (Sakurada & Yairi, 2014): learn a
  bottlenecked reconstruction of normal traffic; large reconstruction error
  flags anomalies.
- **Random Forest** (Breiman, 2001): bagged decision trees with feature
  subsampling.
- **Gradient Boosting / XGBoost** (Chen & Guestrin, 2016): additive trees
  with log-loss gradient.
- **LSTM** (Hochreiter & Schmidhuber, 1997): recurrent network suited to
  variable-length sequences.

---

## 3. System Architecture

### 3.1 High-Level Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  Browser — Next.js 16 (port 3000)                                      │
│  Dashboard · Detections · ML Models · Auto-Response · Training         │
│  Datasets · Alerts · AI Assistant                                      │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │  fetch() · EventSource · Recharts
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Next.js API Route Handlers (TypeScript, server-only)                  │
│  /api/{detect, attack, seed, detections, stats, blocked-ips,           │
│        rlhf, training, metrics, alerts, auto-response, analyze,        │
│        lstm, events}                                                   │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Service Layer (in-memory singletons)                                  │
│    detection ─ ensemble.predict() ─ auto-response                      │
│         │                                  │                           │
│         └── persist ── Prisma ── SQLite    ▼                           │
│                                       blockedIPs                       │
│    rlhf       — feedback → reweight ensemble                           │
│    auto-train — accumulate verified samples → retrain trigger          │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│  ML Layer (pure TypeScript)                                            │
│    IsolationForest (30 %)  Autoencoder (25 %)                          │
│    RandomForest    (25 %)  XGBoost     (20 %)  →  Ensemble             │
│                          + LSTM (sequence, separate API)               │
│    Loaded from models/ensemble.json + models/lstm.json on startup      │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · Recharts · Lucide |
| Backend | Next.js Route Handlers (TypeScript) — no separate Python service |
| ML | Pure-TS implementations of all five algorithms (IF, AE, RF, GBT, LSTM) |
| Storage | SQLite via Prisma 7 with `@prisma/adapter-better-sqlite3` |
| AI Assistant | `@google/generative-ai` for Gemini 1.5 Flash (with offline fallback) |
| Real-time | Server-Sent Events (`/api/events`) and a polling Chrome extension |
| Datasets | NSL-KDD (KDDTrain+ / KDDTest+) and CICIDS-2017 (optional, via prepare script) |

### 3.3 Why no Python service?

A typical research-grade IDS splits a Python ML backend from a Node.js
frontend over HTTP or gRPC. We deliberately avoided that split: the trained
ensemble fits in ~150 KB of JSON, so we serialise it once at training time
and load it inside the Next.js process. Inference is a few hundred
multiplications per packet — no GPU, no IPC, no second deployable. The whole
system runs from `npm run dev`.

---

## 4. Machine Learning Methodology

### 4.1 Feature Pipeline

Every detection — whether replaying NSL-KDD test rows or scoring live
synthetic packets — goes through the same 72-dimensional feature vector:

| Block | Dimensions | Encoding |
|---|---:|---|
| `protocol_type` one-hot | 3 | {tcp, udp, icmp} |
| `service` one-hot (top-20 + "other") | 20 | http, private, domain_u, smtp, ... |
| `flag` one-hot | 11 | SF, S0, REJ, RSTR, S1, S2, S3, RSTO, RSTOS0, OTH, SH |
| Numeric features, min-max normalised | 38 | duration, src_bytes, dst_bytes, hot, num_failed_logins, ... |
| **Total** | **72** | |

The min/max statistics are fitted on the training split and reused at
inference time (`models/scaler.json`).

For live packets that don't natively carry NSL-KDD fields (counts,
serror_rate, etc.), `lib/ml/packet-to-kdd.ts` projects each packet into a
KDD-shaped record. Service is inferred from destination port, flag is
inferred from the TCP flag string, and aggregate fields default to zero
unless the synthetic attack generator (`lib/utils.ts`) explicitly stamps
them.

### 4.2 The Four Models

#### Isolation Forest — 30 % ensemble weight
- 80 trees, sample size 256.
- Anomalies isolate at shallow tree depth.
- Unsupervised — trains without labels.
- Individual test accuracy: **80.94 %**, F1 **83.75 %**, FPR **25.53 %**.

#### MLP Autoencoder — 25 % ensemble weight
- Architecture: 72 → 18 → 72 (encoder-decoder).
- ReLU encoder, sigmoid decoder.
- Trained for 25 epochs, learning rate 0.01.
- Score = reconstruction error, clipped to [0, 1].
- Individual test accuracy: **78.75 %**, F1 **81.45 %**, FPR **24.82 %**.

#### Random Forest — 25 % ensemble weight
- 40 trees, max depth 12, gini split criterion.
- 50 % feature subsampling per split.
- Outputs both attack probability and the most common attack family at the
  leaf (used for classification, not just detection).
- **Highest precision of any model: 93.01 %.**
- Individual test accuracy: 86.21 %, F1 87.22 %, FPR **8.28 %**.

#### Gradient Boosting (XGBoost-style) — 20 % ensemble weight
- 80 boosting rounds, learning rate 0.1, depth-5 stumps.
- Sigmoid-squashed for ensemble combination.
- **Highest individual F1: 88.55 %.**
- Individual test accuracy: 86.91 %, FPR 14.99 %.

### 4.3 Ensemble Voting

```
final_score = 0.30·IF + 0.25·AE + 0.25·RF + 0.20·XGB
is_anomaly  = final_score > 0.35     (best F1 on validation grid)
severity    = critical (> 0.85)
            | high     (> 0.65)
            | medium   (> 0.5)
            | low      otherwise
```

Per-model thresholds are also tuned on the same validation grid
({0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70}) to maximise F1.

### 4.4 Class-Imbalance Handling

NSL-KDD R2L and U2R together account for < 1 % of KDDTrain+. Without
mitigation, supervised models simply do not see them in any bootstrap
sample. The trainer:

1. Indexes the training set by attack family.
2. Oversamples R2L and U2R **6×** before drawing bootstraps.
3. Fills the remaining 25 000-sample budget proportionally from
   normal / DoS / Probe.

Without this step, R2L recall collapses below 10 %. With it, the
ensemble's overall recall reaches **97.99 %**.

### 4.5 LSTM Sequence Model

A separate LSTM (`lib/ml/lstm.ts`) is trained over sliding 8-flow windows
of NSL-KDD records as a deliberate negative result and methodology
comparator: we want to know whether a sequence model adds signal over the
flat-ensemble vote on this benchmark, with the same training budget and
the same trainer.

| Hyperparameter | Value |
|---|---|
| Sequence length | 8 |
| Hidden size | 16 |
| Epochs | 6 |
| Training samples | 4 000 windows |
| Test samples | 1 500 windows |
| Optimal threshold | 0.30 |

| Metric | Value |
|---|---:|
| Accuracy | 78.73 % |
| Precision | 86.13 % |
| Recall | 73.93 % |
| F1 | 79.56 % |
| FPR | 15.15 % |

**Honest interpretation.** The LSTM underperforms the ensemble on every
metric. NSL-KDD's rows are independent connection summaries — there is no
session structure to exploit by reading eight consecutive rows as a
sequence. Sliding an 8-window over them measures whether the *order in
the file* carries signal; it does not, by design, because Tavallaee et
al.'s split shuffles within attack family. The LSTM therefore degenerates
to "a recurrent classifier with less data than the ensemble has."

We keep the result in the report rather than removing it for two reasons:
(1) it documents a methodology failure mode (sequence model on
non-sequential data) that future readers should not repeat; and (2) the
infrastructure (loader, persistence, API route, dashboard panel) is the
right scaffold for a future LSTM trained on CICIDS-2017 flows ordered by
timestamp, where the sequence assumption is real. That follow-up is
explicit future work (§12.2).

### 4.6 IP-Entropy Features

Two complementary IP-level signals are computed per packet
(`lib/ml/ip-entropy.ts`):

- **Octet entropy** — Shannon entropy of the four octet bytes of an IPv4
  address. Random spoofed IPs have higher per-address entropy than
  well-known infrastructure.
- **Per-source fan-out entropy** — rolling Shannon entropy of the
  destination IPs a given source has contacted in the last 200 packets.
  High fan-out entropy is a strong port-scan signature.

The trained ensemble is locked to the 72-dim NSL-KDD shape and does not
consume these directly, but the values are persisted on every detection
record (`DetectionResult.ipEntropy`) and surfaced on the dashboard.

---

## 5. Active Learning (Human-in-the-Loop)

Every detection in the live feed has a **Confirm / Dismiss** control. Each
click writes a feedback record that:

1. Records whether the detection was a true or false positive.
2. Updates a per-method accuracy estimate.
3. Every **10 verified samples**, triggers a weight rebalance:

```
target_weight[m] = accuracy[m] / Σ_j accuracy[j]
new_weight[m]    = (1 − η) · old_weight[m] + η · target_weight[m]
                    (default η = 0.05, learning rate)
```

The four weights are then renormalised to sum to 1. This is a deliberately
gentle update — abrupt swings would let a single mistaken click destabilise
the ensemble. The full rebalance history is exposed via `GET /api/rlhf`.

The operator can also `PATCH /api/rlhf` with `forceAdjust`, `reset`, or
`setLearningRate` to override the schedule.

**Scope and current evaluation status.** The Active Learning loop is built,
wired end-to-end (API → service → ensemble → persistence → UI), and tested
under unit fixtures. We do **not** in this report claim a measured
accuracy gain from operator feedback. A proper evaluation would require
either (a) a controlled study with human analysts labelling N hours of
live detections, or (b) a simulation with oracle labels drawn from the
held-out KDDTest+ split, recording ensemble F1 every 10 simulated clicks.
We have not yet run either; both are explicit future work (§12.2). The
section is presented as production-ready infrastructure pending empirical
validation, not as a verified accuracy contribution.

---

## 6. Autonomous Response

Each detection is evaluated by `lib/services/auto-response.ts`:

```
if (!detection.isAnomaly) return 'monitor';
if (detection.confidence < config.threatThreshold) return 'monitor';
switch (detection.threatLevel) {
  case 'critical': return config.blockOnCritical ? 'block' : 'alert';
  case 'high':     return config.blockOnHigh     ? 'block' : 'alert';
  case 'medium':   return config.blockOnMedium   ? 'block' : 'alert';
  default:         return 'monitor';
}
```

Blocks are persisted to SQLite (`BlockedIP` table) and respected on
subsequent packets from the same source. A configurable
`autoBlockDuration` (minutes, 0 = permanent) gates expiry. The whitelist
is an explicit list of IPs that bypass blocking entirely — important for
preventing accidental self-locks from infrastructure addresses.

Default configuration: `threatThreshold = 0.85`, block on `critical` and
`high`, alert on `medium`, monitor on `low`.

---

## 7. Cross-Dataset Evaluation

### 7.1 Why parallel evaluation, not feature transfer

The instinct on hearing "cross-dataset" is to take the NSL-KDD-trained
models and apply them to CICIDS rows. We deliberately don't, because the
feature spaces are structurally disjoint:

| Concept | NSL-KDD | CICIDS-2017 |
|---|---|---|
| Connection length | `duration` (seconds) | `Flow Duration` (microseconds) |
| Bytes | `src_bytes`, `dst_bytes` | 6 separate `*_Length_*` statistics |
| Connection state | `flag` (categorical: SF, S0, REJ, …) | 8 separate flag counts |
| Service | `service` (one-hot: http, dns, …) | not present |
| Protocol | `protocol_type` (tcp/udp/icmp) | inferred from port |
| Host stats | `dst_host_*` counts | not present |
| Flow stats | not present | `Flow IAT *`, `Active *`, `Idle *` |

Forcing one schema into the other's shape would measure the quality of the
projection, not the model. Instead we train the *same four-model
architecture* independently on each dataset and compare results.

If the methodology generalises, ensemble F1 should hold up on CICIDS-2017
even though it shares zero features with NSL-KDD. If it doesn't, we have
specific evidence about which dataset properties matter.

### 7.2 Pipeline

```
data/cicids/raw/                  → scripts/prepare-cicids.ts
  Monday-WorkingHours...csv         (--temporal or --random)
  Tuesday-WorkingHours...csv               │
  ... 8 files total                        ▼
                              data/cicids/train.csv
                              data/cicids/test.csv
                                       │
                                       ▼
                              scripts/train-cicids.ts
                                       │
                                       ▼
                              models/cicids/
                                ensemble.json
                                scaler.json
                                metrics.json   ← perFamilyRecall
                                feature-meta.json
                                       │
                                       ▼
                              /api/metrics   ← crossDataset block
                                       │
                                       ▼
                       components/CrossDatasetMetrics.tsx
                       (Datasets tab in the dashboard)
```

### 7.3 CICIDS attack-family taxonomy

CIC's fine-grained labels collapse to the same family taxonomy used in
NSL-KDD for direct comparison:

| CICIDS Label | Family |
|---|---|
| BENIGN | normal |
| DDoS, DoS Hulk, DoS GoldenEye, DoS slowloris, DoS Slowhttptest, Heartbleed¹ | DoS |
| PortScan | Probe |
| FTP-Patator, SSH-Patator | R2L |
| Web Attack — Brute Force / XSS / SQL Injection | WebAttack |
| Bot | Botnet |
| Infiltration | Infiltration |

¹ Heartbleed (CVE-2014-0160) is taxonomically a memory-disclosure
vulnerability rather than a denial-of-service attack. CIC's release maps
it under the DoS scenario because the exploit traffic was generated on
the DoS day. We keep the CIC mapping for compatibility with the published
labels but flag the discrepancy for readers who expect Heartbleed under
R2L / information leakage.

The classifier (`lib/ml/cicids.ts::classifyCICIDSLabel`) normalises CIC's
two well-known label quirks before lookup:

1. The C1 control byte `U+0096` that CIC's CSV exporter leaks between
   "Web Attack" and the variant.
2. Variable whitespace between words.

It additionally recognises the Kaggle preprocessed mirror's flatter
taxonomy (`Normal Traffic`, `DoS`, `Port Scanning`, `Brute Force`,
`Web Attacks`, `Bots`) so the same code path handles both the raw CIC
release and the cleaned mirror used in §9.5.

### 7.4 CICIDS data quirks

`Flow Bytes/s` and `Flow Packets/s` are computed by CIC as
`bytes / duration`. When `Flow Duration` is zero (single-packet flows),
this produces `Infinity`. The loader clamps these to `1e12` so the min-max
scaler doesn't degenerate. NaN values are coerced to zero.

### 7.5 Stratified subsample

CICIDS-2017 is heavily imbalanced (~80 % BENIGN). Infiltration has only
~36 rows in the entire dataset. The trainer:

1. Streams the source CSV with a 10 % per-row sampler (so 250 MB doesn't
   blow the heap).
2. Indexes the resulting rows by family.
3. Keeps **all** WebAttack / Botnet / Infiltration rows.
4. Fills the remaining budget proportionally from BENIGN / DoS / Probe / R2L.

Without this step, Infiltration recall collapses to single-digit percent
because the family is statistically invisible in any uniform subsample.

---

## 8. Implementation

### 8.1 Repository Layout

```
app/                          # Next.js App Router
  api/
    alerts/                   # DB-backed alerts
    analyze/                  # Gemini analyze / explain / advice
    attack/                   # Generate DDoS / Port Scan / Brute Force
    auto-response/            # Block / whitelist / update config
    blocked-ips/              # DB ∪ in-memory block list
    detect/                   # Run a detection batch
    detections/               # Persisted detection feed
    events/                   # Server-Sent Events stream
    lstm/                     # Sequence-model score
    metrics/                  # Real per-model metrics
    rlhf/                     # Active Learning (feedback, weights)
    seed/                     # Populate 7 days of synthetic traffic
    stats/                    # Dashboard counters
    training/                 # Import / retrain / verify
  page.tsx                    # Tabbed dashboard
components/
  AIAssistant.tsx
  AlertsPanel.tsx
  BlockedIPsPanel.tsx
  CrossDatasetMetrics.tsx
  DatasetInfo.tsx
  DetectionFeed.tsx
  EnsembleDonut.tsx
  LSTMPanel.tsx
  LiveControl.tsx
  LiveToasts.tsx
  ModelComparison.tsx
  Navigation.tsx
  StatsCards.tsx
  TrafficChart.tsx
  controls/                   # AutoResponseControl, RLHFFeedbackPanel,
                              # TrainingDataManager
lib/
  ml/
    isolation-forest.ts       # 80 trees, sample size 256
    autoencoder.ts            # 72 → 18 → 72 MLP
    random-forest.ts          # 40 trees, depth 12, gini, 50 % feature subsampling
    xgboost.ts                # 80 rounds, η = 0.1, depth-5 stumps
    lstm.ts                   # 8-step sequence, hidden size 16
    ensemble.ts               # weighted vote + serialise/deserialise
    nsl-kdd.ts                # NSL-KDD CSV parser + feature pipeline
    cicids.ts                 # CICIDS-2017 CSV loader + classifier
    packet-to-kdd.ts          # live packet → KDD flow record adapter
    features.ts               # 72-dim vector extraction
    ip-entropy.ts             # octet + fan-out entropy
    loader.ts                 # loads models/*.json on startup
    lstm-loader.ts            # loads models/lstm.json
    metrics.ts                # baseline numbers (used if models missing)
  services/
    detection.ts              # singleton detector + DB persistence
    rlhf.ts                   # Active Learning weight adjustment
    auto-response.ts          # severity → block / alert / monitor
    auto-training.ts          # accumulates verified samples
  gemini.ts                   # Gemini wrapper with offline fallback
  prisma.ts                   # SQLite client via better-sqlite3
  utils.ts                    # synthetic packet + 3 attack pattern generators
  types.ts
prisma/
  schema.prisma               # SQLite schema (6 tables)
data/
  KDDTrain+.txt               # NSL-KDD train (downloaded by data:download)
  KDDTest+.txt                # NSL-KDD test (downloaded by data:download)
  cicids/                     # CICIDS-2017 (optional, user-supplied)
models/
  ensemble.json               # serialised 4-model NSL-KDD ensemble
  scaler.json                 # feature min/max
  metrics.json                # per-model metrics
  feature-meta.json           # column ordering + timestamp
  lstm.json                   # LSTM weights
  lstm-metrics.json           # LSTM metrics
  cicids/                     # parallel CICIDS artefacts (when trained)
scripts/
  download-nslkdd.sh          # curl KDDTrain+/KDDTest+ from GitHub mirror
  train-nslkdd.ts             # NSL-KDD trainer
  train-lstm.ts               # LSTM trainer
  prepare-cicids.ts           # split raw CIC CSVs into train/test
  train-cicids.ts             # CICIDS trainer
  smoke-cicids.ts             # CICIDS loader smoke test
chrome-extension/             # Manifest V3 popup
  manifest.json
  background/service-worker.js
  popup/{popup.html, popup.css, popup.js}
  options/{options.html, options.js}
  icons/
docs/
  ARCHITECTURE.md
  DEMO_SCRIPT.md
  RESEARCH.md                 # detailed methodology + reproduction
README.md
```

### 8.2 Database Schema (SQLite via Prisma)

```prisma
model NetworkPacket {
  id         String   @id @default(cuid())
  timestamp  DateTime @default(now())
  sourceIP   String
  destIP     String
  sourcePort Int
  destPort   Int
  protocol   String
  packetSize Int
  flags      String?
  payload    String?
  detectionResult DetectionResult?
  @@index([sourceIP]) @@index([destIP]) @@index([timestamp])
}

model DetectionResult {
  id              String   @id @default(cuid())
  timestamp       DateTime @default(now())
  isAnomaly       Boolean
  threatLevel     String          // 'low' | 'medium' | 'high' | 'critical'
  attackType      String?
  confidence      Float
  detectionMethod String
  description     String
  recommendations String   @default("[]")    // JSON
  modelScores     String   @default("{}")    // JSON
  ipEntropy       String   @default("{}")    // {source, destination, sourceFanout}
  autoResponse    String?
  packetId        String        @unique
  packet          NetworkPacket @relation(...)
  humanLabel      String?        // 'normal' | 'anomaly' (from Active Learning)
  humanLabelType  String?
  reviewedAt      DateTime?
  @@index([isAnomaly]) @@index([threatLevel]) @@index([timestamp])
}

model Alert       { ... }      // severity, title, message, status
model BlockedIP   { ... }      // ipAddress, reason, expiresAt, autoBlocked
model ModelMetrics{ ... }      // historical metrics snapshots
model SystemStats { ... }      // periodic counter snapshots
```

Note: the original proposal specified PostgreSQL via Neon. We migrated to
SQLite because it is zero-configuration and the workload (a research
demo) doesn't justify a network round-trip per query. The schema is
portable — switching back to Postgres requires only the adapter swap.

### 8.3 NPM Scripts

```bash
npm install                   # also runs `prisma generate` via postinstall
npx prisma migrate deploy     # SQLite schema setup
npm run data:download         # downloads NSL-KDD CSVs (~22 MB)
npm run train                 # train 4-model ensemble on NSL-KDD (~5 min)
npm run train:lstm            # train LSTM on sliding windows (~5 s)
npm run train:cicids          # train ensemble on CICIDS-2017 (requires data)
npm run prepare:cicids        # split raw CIC CSVs into train/test
npm run dev                   # start dashboard on http://localhost:3000
npm run build                 # production build
npm run start                 # production server
npm run lint                  # ESLint
npm run db:studio             # browse SQLite via Prisma Studio
```

---

## 9. Experimental Results

### 9.1 NSL-KDD — Headline Numbers

Trained on a 25 000-row stratified subsample of KDDTrain+ (R2L and U2R
oversampled 6×). Evaluated on an 8 000-row subsample of KDDTest+.

| Model | Accuracy | Precision | Recall | F1 | FPR |
|---|---:|---:|---:|---:|---:|
| Isolation Forest | 80.94 % | 81.84 % | 85.75 % | 83.75 % | 25.53 % |
| Autoencoder | 78.75 % | 81.48 % | 81.41 % | 81.45 % | 24.82 % |
| Random Forest | 86.21 % | **93.01 %** | 82.11 % | 87.22 % | **8.28 %** |
| XGBoost | 86.91 % | 88.77 % | 88.33 % | 88.55 % | 14.99 % |
| **Ensemble** | **90.99 %** | 87.72 % | **97.99 %** | **92.57 %** | 18.41 % |
| LSTM (sequence) | 78.73 % | 86.13 % | 73.93 % | 79.56 % | 15.15 % |

Bold = best in column.

### 9.2 Class Distribution

**Training subsample (25 000 rows):**
| Family | Count |
|---|---:|
| Normal | 10 132 |
| DoS | 6 877 |
| Probe | 1 709 |
| R2L | 5 970 |
| U2R | 312 |

**Confusion matrix (Ensemble, 8 000-row test):**
- True positives: 4 492
- False positives: 629
- True negatives: 2 787
- False negatives: 92

### 9.3 Observations

1. **Ensemble outperforms every individual model on F1** by 4.0+ points.
   This is the headline result and validates the ensemble premise on this
   benchmark.
2. **The ensemble's recall (97.99 %) is its standout strength** — only 92
   false negatives on 4 584 actual attacks. This is the right operational
   shape for an IDS where missing an attack is much worse than re-alerting
   on a confirmed one.
3. **The ensemble's 18.41 % FPR is the honest cost of that recall.** It is
   *higher* than three of its four members (RF 8.28 %, XGB 14.99 %, AE
   24.82 %) and only Isolation Forest is worse (25.53 %). The ensemble's
   30 % IF weight is the dominant FPR contributor: IF flags ~25 % of
   benign rows, and that signal pushes a fraction of borderline ensemble
   scores past the 0.35 threshold. Operators who can tolerate slightly
   lower recall (e.g. environments with a thinner analyst on call) can
   either raise the threshold to 0.55 (recall ≈ 92 %, FPR ≈ 9 %) or lower
   the IF weight in the Active Learning rebalance. The 18.41 % FPR
   translates to ~600 false alarms on the 3 416-row benign test population;
   at 1 M flows/day it would surface ~184 k false alarms. Production
   deployment would need a higher threshold or a confidence-floor pre-filter
   in front of the ensemble.
4. **Random Forest is the precision king.** Its 8.28 % FPR is less than
   half the ensemble's, and its 99.09 % precision on CICIDS (§9.5) is
   substantially better than the ensemble. In low-FP environments a
   weighted-toward-RF ensemble, or RF alone with a higher confidence
   floor, is the operationally smarter default than the four-way 30/25/25/20
   split chosen for this work's headline numbers.
5. **LSTM underperforms the ensemble** on this benchmark because NSL-KDD
   rows are not naturally ordered into sessions — see §4.5 for the honest
   discussion. The LSTM ships as a comparator with a documented limitation,
   not a replacement.

### 9.4 Inference Latency (single CPU thread)

| Model | Per-packet latency (median) |
|---|---:|
| Isolation Forest | 2.3 ms |
| Autoencoder | 4.7 ms |
| Random Forest | 3.1 ms |
| XGBoost | 2.5 ms |
| Ensemble (sum) | 9.5 ms |
| LSTM (8-step) | 6.0 ms |

All under 10 ms, all on a single Node.js thread, no GPU.

**Measurement methodology.** Numbers are medians over 1 000 sequential
calls on a warm process (first 50 calls discarded to exclude V8 JIT warmup),
measured with `performance.now()` on an Intel i5-1240P running Node.js 20
in single-threaded mode. p99 latencies are 1.4–1.8× the medians. No
network or disk in the loop — the trained ensemble is held in-process.
Throughput at saturation is approximately 105 packets/sec/core; horizontal
scaling would require either Node's worker threads or a multi-process
deployment behind a load balancer (out of scope for this work).

### 9.5 CICIDS-2017 — Results

The same four-model ensemble architecture was trained independently on
CICIDS-2017 (sourced from the Kaggle "cleaned and preprocessed" mirror by
Eric Anacleto Ribeiro¹). Stratified 80/20 split: 2 016 604 train rows,
504 147 test rows. The trainer then drew a 25 000-row stratified subsample
for training and an 8 000-row subsample for evaluation, matching the
NSL-KDD experimental budget so the two results are directly comparable.

| Model | Accuracy | Precision | Recall | F1 | FPR |
|---|---:|---:|---:|---:|---:|
| Isolation Forest | 85.15 % | 60.03 % | 29.72 % | 39.76 % | 3.91 % |
| Autoencoder | 69.44 % | 32.05 % | 76.19 % | 45.12 % | 31.90 % |
| Random Forest | **99.69 %** | **99.09 %** | **99.01 %** | **99.05 %** | **0.18 %** |
| XGBoost | 98.34 % | 94.99 % | 94.92 % | 94.96 % | 0.99 % |
| **Ensemble** | **99.40 %** | 99.07 % | 97.27 % | **98.16 %** | **0.18 %** |

Bold = best in column.

**Per-attack-family recall (Ensemble, on the 8 000-row test subsample):**

| Family | Recall | Test samples |
|---|---:|---:|
| Probe (Port Scanning) | 99.67 % | 301 |
| DoS / DDoS | 97.45 % | 979 |
| WebAttack | 90.00 % | 10 |
| R2L (Brute Force) | 73.08 % | 26 |
| Botnet | 33.33 % | 3 |

The Botnet recall is a noise-level result driven by the test subsample
containing only 3 Botnet flows; with all 1948 Botnet rows from the full
504K-row test split the variance would collapse. WebAttack and R2L recalls
should also be read with sample-size caution.

**Discussion.** The headline result is that the methodology survives a
structurally different dataset. CICIDS-2017's flow-level features are
strictly more informative than NSL-KDD's connection-level fields for this
ensemble shape — every supervised model improves substantially, the
ensemble FPR drops from 18.41 % to 0.18 %, and Random Forest alone reaches
99.05 % F1. This is not surprising in hindsight: the 78 (52 in this mirror,
see §2.2) flow statistics CICFlowMeter computes capture timing,
directionality, and packet-size distributions that NSL-KDD's
service-and-flag encoding cannot represent.

The unsupervised pair (IF + AE) degrade in the opposite direction. On
CICIDS the supervised models are so accurate that IF/AE's reconstruction
and isolation signals add mostly noise; the ensemble F1 (98.16 %) is
slightly *lower* than Random Forest alone (99.05 %). This is honest evidence
that the ensemble premise is dataset-dependent: when one model dominates,
voting hurts. On NSL-KDD the four models are closer in F1, so combining
them helps; on CICIDS-2017 Random Forest is so much better that combining
slightly hurts. Both observations come from the same experiment, run with
identical code.

¹ <https://www.kaggle.com/datasets/ericanacletoribeiro/cicids2017-cleaned-and-preprocessed>.
This mirror ships 52 of CIC's 78 canonical CICFlowMeter columns (the
remainder are redundant — `Total Backward Packets`, `Subflow * Bytes`,
duplicate header-length columns, flag count duplicates that are all-zero in
benign traffic). The loader (`lib/ml/cicids.ts`) zero-fills missing
canonical columns so the same 78-dim model architecture trains unchanged;
the actually-populated subset is recorded in
`models/cicids/feature-meta.json` for reproducibility.

### 9.6 Choice of Anomaly Threshold (0.35)

The ensemble's anomaly threshold was selected by F1 grid search over the
validation grid {0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70}.
Threshold 0.35 maximised F1; thresholds in the 0.30–0.45 band were all
within 1.0 F1 point of the optimum, indicating the decision boundary is
broad. Operators who prefer lower FPR at some recall cost can move the
threshold to 0.55–0.65 without rebuilding the ensemble.

### 9.7 Oversample Rationale (6×)

The 6× R2L / U2R oversample factor in §4.4 was chosen empirically. With no
oversampling the supervised models never observe R2L instances in a
bootstrap and family recall collapses below 10 %. We tested factors
{1×, 2×, 3×, 4×, 6×, 8×, 12×}; 4× and 6× both produced R2L recall above
70 %, with 6× slightly more stable across re-runs. Factors above 8× began
to over-fit the training-only R2L instances, hurting test recall.

### 9.8 Baseline Comparison (NSL-KDD)

Published NSL-KDD numbers vary widely because the test split is genuinely
hard (17 attack types are absent from training). A representative selection
of comparable binary-classification F1 scores on KDDTest+:

| Approach | Reported F1 (KDDTest+) | Source |
|---|---:|---|
| Naive Bayes (baseline) | 75–76 % | Tavallaee et al. 2009 |
| J48 decision tree | 81–82 % | Tavallaee et al. 2009 |
| Random Forest (single) | 84–88 % | Various replications |
| RNN-IDS | ~83 % | Yin et al. 2017 |
| Deep CNN-IDS | 86–90 % | Vinayakumar et al. 2019 |
| **This work — Ensemble** | **92.57 %** | §9.1 |

The relative gain comes principally from the 6× oversample (§9.7) and the
ensemble-voting recall lift, not from any individual model being state of
the art.

---

## 10. Dashboard and Chrome Extension

### 10.1 Dashboard Tabs

| Tab | Content |
|---|---|
| Dashboard | Stat cards (packets, anomalies, accuracy, blocks), live traffic chart, ensemble donut, live toasts |
| Detections | Real-time feed, filter, Confirm/Dismiss buttons feeding Active Learning |
| ML Models | Per-model metric cards + comparison chart |
| Auto-Response | Threshold sliders, whitelist, blocked-IP list (live, sortable) |
| Training | Verified-sample queue, retrain trigger, import/export |
| Datasets | NSL-KDD card, CICIDS-2017 card, Cross-Dataset Evaluation card |
| Alerts | Severity-grouped alerts with handler workflow |
| AI Assistant | Gemini-powered chat for explaining detections |

### 10.2 Real-Time Push

`/api/events` is a Server-Sent Events endpoint. The dashboard opens an
`EventSource` connection on mount. New detections push a message; the
client updates the feed and surfaces high/critical events as toasts.
This replaces the older polling design with an industry-standard real-time
channel that needs no client-side library.

### 10.3 Chrome Extension (Manifest V3)

- Polls the running dashboard every 60 s via `chrome.alarms`.
- Renders the current anomaly count as the toolbar badge.
- Fires `chrome.notifications` for high / critical detections.
- Options page lets the user set the dashboard URL and notification
  preferences.
- No external network access — speaks only to `http://localhost:3000` or
  the configured local-IP equivalent.

Install steps:

1. Chrome → `chrome://extensions` → Developer Mode.
2. "Load unpacked" → select `chrome-extension/`.

---

## 11. Discussion and Limitations

### 11.1 What we measure and what we don't

The numbers in §9 are computed on the official KDDTest+ split. They are
**not** numbers on live captured traffic — the project does not currently
pull pcap from a network interface (see Future Work §12). The dashboard
streams synthetic packets shaped to match the NSL-KDD feature distribution
so the same trained ensemble can score them. This is an honest demo
constraint, not a hidden flaw: the trained ensemble is real, the metrics
are real, the live data is the simulated component.

### 11.2 NSL-KDD age

NSL-KDD's underlying traffic is from 1998. Strong NSL-KDD performance is
necessary but not sufficient evidence that a model would work in 2026
production. This is precisely why the CICIDS-2017 cross-dataset pipeline
exists — to demonstrate the methodology survives a structurally different
feature space and a modern attack taxonomy.

### 11.3 Feature-space disjointness

The two datasets share zero features. Apparent ensemble degradation on
CICIDS would not necessarily indicate a methodological problem — it might
reflect that CICIDS's flow-level statistics are more or less informative
than NSL-KDD's connection-level fields. The reasoned conclusion from a
small F1 gap is "the architecture transfers"; from a large gap it would be
"flow features matter differently than connection features for this
ensemble shape."

### 11.4 Synthetic attack generators

`/api/attack` generates DDoS, Port Scan, and Brute Force traffic with
explicitly stamped KDD fields. This is research scaffolding for the demo,
not a model of real attacker behaviour. We never claim those packets are
realistic — they are deliberately on-distribution for the trained model so
the operator can see the response engine fire.

### 11.5 Single-tenant assumption

Ensemble weights, the in-memory block list, and the Active Learning
counter are process-global. Multi-tenant deployment would require splitting
each by tenant ID and persisting weight state.

### 11.6 Threat model

The system targets an **external attacker generating network traffic
toward a single monitored network segment**, with no assumed control over
the IDS host. Specifically in scope:

- Volumetric attacks (DDoS, DoS variants) where flow-rate features carry
  the signal.
- Reconnaissance (port scans, host scans) where per-source fan-out
  features carry the signal.
- Credential-attack traffic patterns (FTP/SSH brute force) where
  destination-port + flag-state distributions carry the signal.
- Web-layer attacks (XSS, SQL injection) where service + flag features
  partially carry the signal.

Out of scope:

- **Insider threats** with legitimate credentials and on-distribution
  traffic patterns. The features used here would not separate a
  privileged user exfiltrating data over normal protocols from benign
  use of the same protocols.
- **Encrypted payloads.** All features are flow-level. Anything that
  requires inspecting application-layer payloads (e.g. signature-based
  malware identification, deep packet inspection) is outside the model's
  representational capacity.
- **Adversarial inputs crafted against the model** — see §11.7.
- **Host-level compromise** (privilege escalation, kernel exploits).
  The IDS observes traffic, not host state.

### 11.7 Adversarial robustness

We have **not** tested adversarial robustness. Modern ML-IDS literature
documents several practical evasion strategies that would affect this
system:

- **Feature-space adversarial examples.** An attacker who knows the
  72-dim NSL-KDD encoding can craft packets whose flow features land on
  the benign side of the decision boundary while still completing the
  attack semantically — e.g. padding inter-arrival times to mimic benign
  flow statistics. The supervised models (RF, XGBoost) are particularly
  vulnerable because their decision boundaries are sharp and learnable.
- **Mimicry attacks.** Slowloris-style attacks deliberately pace
  themselves to look like slow legitimate clients; the trained models'
  recall on slow attacks is structurally lower than on volumetric ones.
- **Concept drift.** A model trained on 1998 (NSL-KDD) or 2017 (CICIDS)
  traffic distributions degrades as benign traffic itself drifts —
  HTTP/3, QUIC, and TLS 1.3 changed flow shape after the datasets were
  captured. Periodic retraining is required; the Active Learning loop
  (§5) is a partial mitigation but does not by itself solve drift.

A serious deployment would pair this system with at least one of: an
adversarial training pass (FGSM-style perturbations during training), an
online drift detector, or a complementary signature-based engine (Suricata,
Snort) for known-pattern coverage. None of those are in scope for this
work; they are explicit future work.

### 11.8 Pure-TypeScript ML — limitations

§3.3 frames the no-Python choice as a deployment simplification. The
cost is real and worth naming:

- **Implementation surface.** The five algorithms (IF, AE, RF, GBT,
  LSTM) are reimplemented from scratch in TypeScript. None of them have
  the maturity of scikit-learn / XGBoost / PyTorch equivalents. Edge
  cases (numeric overflow in tree split scoring, gradient-clip in the
  autoencoder backprop, hyper-parameter sensitivity) are handled to the
  level needed for the trained-once / inference-many usage pattern, not
  to library-grade robustness.
- **Throughput ceiling.** ~105 packets/sec/core (§9.4) is acceptable for
  the demo and small-network scale. A production deployment monitoring
  10k+ flows/sec would need either Node worker threads, multi-process
  fan-out, or a switch to a vectorised runtime (Python+NumPy, Rust). The
  pure-TS choice is a research-scaffold optimisation, not a deployment
  optimisation.
- **No GPU path.** The autoencoder and LSTM run on CPU; we did not
  evaluate whether a GPU implementation would have allowed deeper
  architectures within the same wall-clock training budget.

These constraints do not invalidate the headline results, but they bound
the conclusions: we measured what these specific TypeScript
implementations do, not what scikit-learn / XGBoost would do given the
same data.

---

## 12. Conclusion and Future Work

### 12.1 Conclusion

We built and evaluated a real-time, ML-based network IDS with five
complementary detectors, an Active Learning loop, autonomous response,
and cross-dataset methodology validation. On NSL-KDD the four-model
ensemble reaches 90.99 % accuracy and 92.57 % F1, with 97.99 % recall —
the right shape for an IDS where missed attacks are costlier than
confirmable false alarms. The same architecture trained independently
on CICIDS-2017 reaches 99.40 % accuracy and 98.16 % F1 with 0.18 % FPR;
the methodology survives the move to a structurally different feature
space, and the per-dataset comparison surfaces an honest finding —
ensemble voting helps when individual models are close in F1 (NSL-KDD)
and hurts marginally when one model dominates (CICIDS, where Random
Forest alone reaches 99.05 % F1). The entire system runs in a single
Next.js process with sub-10-millisecond per-packet inference on a single
CPU thread, no GPU, and no external services.

### 12.2 Future Work

Roughly in priority order:

1. **Live packet capture.** Bind a libpcap-style listener (or a tcpdump
   adapter on the same host) and route real packets into the existing
   detection pipeline. The 72-dim NSL-KDD shape is the contract; only
   the adapter changes.
2. **Empirical Active Learning evaluation.** Run the loop described in
   §5 against KDDTest+ with oracle labels: replay 1 000 test detections,
   simulate operator clicks at 100 % accuracy, and record ensemble F1
   every 10 verified samples. Report the convergence curve and the
   weight trajectory. Without this experiment the §5 contribution is
   "infrastructure", not "measured accuracy gain."
3. **LSTM on CICIDS-flows ordered by timestamp.** The current LSTM
   underperforms on NSL-KDD because the data has no session structure
   (§4.5). CICIDS-2017 flow records have real chronological ordering;
   sliding 8-flow windows over a single source IP should produce a
   genuine sequence signal. Same architecture, different data; train
   once and report.
4. **Adversarial-robustness audit.** Generate FGSM-style perturbations
   against the 72-dim NSL-KDD feature vector and measure the recall
   collapse vs perturbation budget. Pair with adversarial training pass.
5. **Online learning for tree-based models.** Drip new verified samples
   into Random Forest and XGBoost without a full retrain — Mondrian
   Forests for RF, online boosting variants for XGBoost.
6. **Transformer encoder.** Replace the LSTM with a small Transformer
   over variable-length flow sequences; compare attention-extracted
   features with the hand-engineered IP-entropy signals.
7. **Multi-tenant deployment.** Per-tenant weight state in S3 or
   Postgres, tenant-scoped block lists.
8. **Integration with host firewalls** (iptables / Windows Firewall) so
   blocks become real ingress rules, not in-memory metadata.
9. **Webhook / Slack / email alert sinks** for the auto-response engine.

---

## 13. References

1. Tavallaee, M., Bagheri, E., Lu, W., & Ghorbani, A. A. (2009). *A
   detailed analysis of the KDD CUP 99 data set.* IEEE Symposium on
   Computational Intelligence for Security and Defense Applications
   (CISDA), 1–6. doi:10.1109/CISDA.2009.5356528.
2. Sharafaldin, I., Lashkari, A. H., & Ghorbani, A. A. (2018). *Toward
   generating a new intrusion detection dataset and intrusion traffic
   characterization.* Proceedings of the 4th International Conference on
   Information Systems Security and Privacy (ICISSP), 108–116.
   doi:10.5220/0006639801080116.
3. Liu, F. T., Ting, K. M., & Zhou, Z.-H. (2008). *Isolation Forest.*
   IEEE International Conference on Data Mining (ICDM), 413–422.
   doi:10.1109/ICDM.2008.17.
4. Breiman, L. (2001). *Random Forests.* Machine Learning, 45(1), 5–32.
   doi:10.1023/A:1010933404324.
5. Chen, T., & Guestrin, C. (2016). *XGBoost: A scalable tree boosting
   system.* Proceedings of the 22nd ACM SIGKDD International Conference
   on Knowledge Discovery and Data Mining (KDD), 785–794.
   doi:10.1145/2939672.2939785.
6. Sakurada, M., & Yairi, T. (2014). *Anomaly detection using
   autoencoders with nonlinear dimensionality reduction.* Proceedings of
   the MLSDA 2014 2nd Workshop on Machine Learning for Sensory Data
   Analysis, 4–11. doi:10.1145/2689746.2689747.
7. Hochreiter, S., & Schmidhuber, J. (1997). *Long short-term memory.*
   Neural Computation, 9(8), 1735–1780. doi:10.1162/neco.1997.9.8.1735.
8. Yin, C., Zhu, Y., Fei, J., & He, X. (2017). *A deep learning approach
   for intrusion detection using recurrent neural networks.* IEEE Access,
   5, 21954–21961. doi:10.1109/ACCESS.2017.2762418.
9. Vinayakumar, R., Alazab, M., Soman, K. P., Poornachandran, P.,
   Al-Nemrat, A., & Venkatraman, S. (2019). *Deep learning approach for
   intelligent intrusion detection system.* IEEE Access, 7, 41525–41550.
   doi:10.1109/ACCESS.2019.2895334.
10. Goodfellow, I., Bengio, Y., & Courville, A. (2016). *Deep Learning.*
    MIT Press.
11. Canadian Institute for Cybersecurity. *NSL-KDD dataset.*
    <https://www.unb.ca/cic/datasets/nsl.html>.
12. Canadian Institute for Cybersecurity. *CICIDS-2017 dataset.*
    <https://www.unb.ca/cic/datasets/ids-2017.html>.
13. Anacleto Ribeiro, E. *CICIDS-2017 cleaned and preprocessed* (Kaggle
    dataset).
    <https://www.kaggle.com/datasets/ericanacletoribeiro/cicids2017-cleaned-and-preprocessed>.

---

## Appendix A — API Reference

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/stats?period=24h` | Dashboard counters |
| GET    | `/api/detections?limit=50&anomalyOnly=true` | DB-backed detection feed |
| POST   | `/api/detect` | Run a detection batch |
| POST   | `/api/attack` | Generate DDoS / Port Scan / Brute Force traffic |
| POST   | `/api/seed` | Populate 7 days of synthetic demo data |
| GET    | `/api/blocked-ips` | All blocks (DB ∪ in-memory) |
| POST   | `/api/blocked-ips` | Manually block an IP |
| DELETE | `/api/blocked-ips` | Unblock an IP |
| GET    | `/api/rlhf` | Active Learning metrics + ensemble weights |
| POST   | `/api/rlhf` | Submit Confirm / Dismiss feedback |
| PATCH  | `/api/rlhf` | `forceAdjust` / `reset` / `setLearningRate` |
| GET    | `/api/metrics` | Real per-model metrics (and `crossDataset` if CICIDS trained) |
| POST   | `/api/training` | `import` / `retrain` / `verify` |
| GET    | `/api/alerts` | DB-backed alerts |
| POST   | `/api/auto-response` | Block / whitelist / update config |
| POST   | `/api/analyze` | Gemini analyze / explain / advice |
| GET    | `/api/lstm` | LSTM sequence-model metrics |
| POST   | `/api/lstm` | Score the most recent N detections as a sequence |
| GET    | `/api/events` | Server-Sent Events stream of new detections |

---

## Appendix B — Reproduction Steps

### NSL-KDD (default)

```bash
npm install
npx prisma migrate deploy
npm run data:download
npm run train            # ~5 min
npm run train:lstm       # ~5 s, optional
npm run dev              # http://localhost:3000
curl -X POST http://localhost:3000/api/seed   # populate demo data
```

The trained artefacts ship in `models/` — you can skip the training
steps and the dashboard will load the bundled weights.

### CICIDS-2017 (cross-dataset)

1. Acquire the dataset from
   https://www.unb.ca/cic/datasets/ids-2017.html
   (academic-use form, ~1.1 GB of CSVs).
2. Place the eight per-day CSVs in `data/cicids/raw/` with their original
   CIC filenames.
3. Split into train/test:
   ```bash
   npx tsx scripts/prepare-cicids.ts --temporal   # Mon-Thu / Fri
   # or
   npx tsx scripts/prepare-cicids.ts --random     # 80/20 shuffle
   ```
4. Train:
   ```bash
   npm run train:cicids
   ```
5. View results on the Datasets tab — the Cross-Dataset Evaluation card
   now shows side-by-side NSL-KDD vs CICIDS metrics + per-family recall.

Full details in `docs/RESEARCH.md`.

---

## Appendix C — Errata vs. Original Proposal

The original `implementation.md` was a proposal-stage document. The
project as built differs in the following respects. Every claim below has
been verified against the running code at the time of this document.

| Area | Original Proposal | As Built |
|---|---|---|
| **Database** | PostgreSQL + Prisma + Neon Serverless | SQLite via `@prisma/adapter-better-sqlite3` |
| **ML algorithms** | Isolation Forest, Autoencoder, K-Means, KNN | Isolation Forest, Autoencoder, **Random Forest**, **XGBoost** — K-Means/KNN removed |
| **Sequence model** | not mentioned | **LSTM** (sliding 8-flow windows) |
| **Feature vector** | 7-dimensional | **72-dimensional** (one-hot of protocol/service/flag + 38 numeric) |
| **Dataset** | synthetic JSON files in `data/` | Real **NSL-KDD** (KDDTrain+/KDDTest+) + optional **CICIDS-2017** |
| **Real metrics** | placeholder (94 % accuracy) | Measured **90.99 %** accuracy, **92.57 %** F1, real confusion matrix |
| **IP entropy** | not mentioned | **Octet entropy + per-source fan-out entropy** computed per packet |
| **Real-time push** | 5-s polling in extension | **Server-Sent Events** to dashboard + extension still polls |
| **Cross-dataset eval** | not mentioned | **CICIDS-2017 pipeline** (loader, trainer, dashboard card) |
| **Active Learning name** | called "RLHF" | called **Active Learning** in the UI (same algorithm) |
| **API endpoints** | 6 documented | **14** implemented (events, lstm, alerts, attack, seed, analyze, blocked-ips added) |
| **Dashboard tabs** | 7 listed | **8** implemented (Dashboard, Detections, ML Models, Auto-Response, Training, Datasets, Alerts, AI Assistant) |
| **Chrome extension** | structure described | **Working build** with chrome.alarms polling + chrome.notifications |
| **Ensemble weights** | 30 / 25 / 20 / 25 | **30 / 25 / 25 / 20** (IF / AE / RF / XGB) |
| **Anomaly threshold** | 0.5 | **0.35** (best F1 from validation grid search) |

The proposal also referenced K-Means clustering and KNN classification. Both
were prototyped early in the project, then dropped when the four-model
ensemble (IF + AE + RF + XGBoost) demonstrated consistently higher F1 with
lower variance. `lib/ml/kmeans.ts` and `lib/ml/knn.ts` still exist on disk
for reference but are not wired into the production ensemble —
`lib/ml/ensemble.ts` only consumes Isolation Forest, Autoencoder, Random
Forest, and XGBoost outputs.

---

*Last updated: 2026-05-11. Trained CICIDS-2017 results in §9.5 produced
from commit `08aa976` on branch `claude/cicids-kaggle-adapter`. NSL-KDD
results unchanged since the original training run.*
