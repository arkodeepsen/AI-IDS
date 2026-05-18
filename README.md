# AI-Based Intrusion Detection System

Real-time network threat detection and autonomous response, powered by an
ensemble of four ML algorithms trained on **NSL-KDD** *and* **CICIDS-2017**
with continuous self-improvement through Active Learning, optional firewall
enforcement, and three measured empirical studies.

> **Major Project 2025-26** — Arkaprava Das · Anurup Samanta · Arkodeep Sen

---

## Headline numbers (real, on held-out test sets)

### NSL-KDD (KDDTest+ — `models/metrics.json`)

| Model            | Accuracy | Precision | Recall  | F1     | FPR    |
|------------------|---------:|----------:|--------:|-------:|-------:|
| Isolation Forest |  80.94 % |  81.84 %  | 85.75 % | 83.75 % | 25.53 % |
| Autoencoder NN   |  78.75 % |  81.48 %  | 81.41 % | 81.45 % | 24.82 % |
| Random Forest    |  86.21 % |  93.01 %  | 82.11 % | 87.22 % |  8.28 % |
| XGBoost          |  86.91 % |  88.77 %  | 88.33 % | 88.55 % | 14.99 % |
| **Ensemble**     | **90.99 %** | **87.72 %** | **97.99 %** | **92.57 %** | 18.41 % |
| LSTM (sequence)  |  78.73 % |  86.13 %  | 73.93 % | 79.56 % | 15.15 % |

### CICIDS-2017 (Kaggle preprocessed mirror — `models/cicids/metrics.json`)

| Model            | Accuracy | Precision | Recall  | F1     | FPR    |
|------------------|---------:|----------:|--------:|-------:|-------:|
| Isolation Forest |  85.15 % |  60.03 %  | 29.72 % | 39.76 % |  3.91 % |
| Autoencoder NN   |  69.44 % |  32.05 %  | 76.19 % | 45.12 % | 31.90 % |
| **Random Forest** | **99.69 %** | **99.09 %** | **99.01 %** | **99.05 %** | **0.18 %** |
| XGBoost          |  98.34 % |  94.99 %  | 94.92 % | 94.96 % |  0.99 % |
| **Ensemble**     | **99.40 %** | **99.07 %** | **97.27 %** | **98.16 %** | **0.18 %** |

The same four-model architecture trained independently on each dataset.
Per-attack-family recall on CICIDS: Probe 99.7 %, DoS 97.4 %, WebAttack
90.0 %, R2L 73.1 %, Botnet 33.3 % (3 test samples — sample-size noise).
See `docs/RESEARCH_FINDINGS.md` Finding 3 for the ensemble-subset ablation
that shows when voting helps vs hurts.

---

## What it does

- Trains an **ensemble of four models** (Isolation Forest, MLP autoencoder,
  Random Forest, XGBoost-style boosting) on the official NSL-KDD release
  AND, in parallel, on CICIDS-2017 for cross-dataset methodology validation.
- A separate **LSTM sequence model** scores sliding 8-flow windows so the
  operator can compare flow-level vs. sequence-level evidence.
- Classifies traffic as `low` / `medium` / `high` / `critical` and triggers
  severity-driven **autonomous response** — alert, time-limited block, or
  permanent ban — with optional Linux **iptables enforcement**.
- **Active Learning (HITL) loop** re-balances the ensemble weights from
  operator Confirm/Dismiss clicks every 10 verified samples. Measured
  end-to-end with an oracle-labelled replay; results in
  `docs/RESEARCH_FINDINGS.md` Finding 1.
- Pushes detection events to the dashboard in real time via **Server-Sent
  Events**; high/critical detections surface as toast notifications and
  optionally forward to **webhook / Slack / email** sinks.
- Ships a **Chrome (Manifest V3) extension** with a toolbar-badge anomaly
  counter + desktop notifications.
- Persists every packet, detection and block to a local **SQLite** database
  (zero-config single file at `prisma/dev.db`).
- Includes a measured **adversarial robustness audit** + an
  adversarially-trained ensemble variant (`models/adversarial/`) that
  drops the score-based-attack evasion rate by 7-10×.
- Captures **per-packet IP entropy** (octet entropy + rolling source
  fan-out) and surfaces it on every detection row.
- Provides a Next.js 16 dashboard with a Recharts live traffic chart, an
  Ensemble pipeline donut, a live detection feed, and an integrated
  **Gemini AI** assistant (with offline fallback).
- Three optional **operational adapters** that turn database decisions
  into real effects: `lib/services/{iptables-adapter,pcap-adapter,alert-sinks}.ts`,
  plus `lib/services/tenant.ts` scaffolding for multi-tenant deployments.

---

## Empirical contributions (paper-worthy)

Three measured studies — full writeups in `docs/RESEARCH_FINDINGS.md`,
results tables in `docs/PROJECT_REPORT.md` §§9.8–9.10, figures in
`docs/figures/`.

1. **Empirical Active Learning evaluation** — `npm run eval:al`.
   Honest negative finding: per-model reward signals slightly degrade
   ensemble F1 (~1.7 pts) because the rule maximises a per-model
   objective whereas ensemble F1 is a joint objective. Curve plot:
   `models/active-learning-curve.png`.
2. **Adversarial robustness audit + adversarial training** —
   `npm run eval:adversarial` + `npm run train:adversarial`. Score-based
   L∞ attack achieves 6–9 % evasion at ε ≤ 0.02; adversarial training
   recovers recall to within 3 pts of clean while collapsing evasion to
   <1.5 %. Figures: `models/adversarial-audit.png` and
   `docs/figures/fig-9-9-adversarial-comparison.png`.
3. **Ensemble subset ablation** — `npm run eval:ablation`.
   Finding: voting helps when per-model F1 spread is moderate (NSL-KDD,
   +3.9 pts), hurts when one model dominates (CICIDS-2017, −1.4 pts).
   Practical implication: serve only the winning subset and save
   50–75 % of inference cost. Figure: `models/ablation.png`.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · Recharts · Lucide |
| Backend | Next.js Route Handlers (TypeScript) — no separate Python service |
| ML | Pure-TS Isolation Forest, MLP autoencoder, Random Forest, gradient-boosted trees, LSTM |
| Storage | SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` |
| AI Assistant | `@google/generative-ai` for Gemini 1.5 Flash (with offline fallback) |
| Real-time | Server-Sent Events (`/api/events`) + Chrome MV3 polling |
| Datasets | NSL-KDD (KDDTrain+/KDDTest+) and CICIDS-2017 (Kaggle preprocessed mirror) |
| Optional ops | iptables · libpcap/tcpdump · webhook/Slack/email sinks · per-tenant scaffolding |

---

## Run it

```bash
# 1. install deps
npm install

# 2. set up the SQLite DB
npx prisma migrate deploy

# 3. download NSL-KDD (one-time, ~22 MB)
npm run data:download

# 4. (optional) re-train the four ensemble models on NSL-KDD (~5 min)
npm run train

# 5. (optional) re-train the LSTM sequence model (~5 s)
npm run train:lstm

# 6. start the dashboard
npm run dev          # http://localhost:3000

# 7. seed demo data (puts ~1.6k synthetic packets into the DB)
curl -X POST 'http://localhost:3000/api/seed?force=1'
```

`models/ensemble.json` + `models/lstm.json` + `models/cicids/ensemble.json` +
`models/adversarial/ensemble.json` are all **committed pre-trained**, so steps
3-5 are optional — skip them and the runtime loads the bundled weights.

### Optional: train on CICIDS-2017

Either provide a Kaggle token and run `kagglehub.dataset_download(...)`
on `ericanacletoribeiro/cicids2017-cleaned-and-preprocessed`, or download
the cleaned CSV manually and drop it in `data/cicids/raw/`. Then:

```bash
npm run prepare:cicids       # stratified 80/20 split
npm run train:cicids         # ~2 min, writes models/cicids/
```

### Optional: run the empirical studies

```bash
npm run eval:al              # Active Learning convergence curve
npm run eval:adversarial     # adversarial-attack robustness audit
npm run eval:ablation        # subset ablation (NSL-KDD + CICIDS)
npm run train:adversarial    # ~6 min — adversarially-augmented retrain
```

After each, render the corresponding figure:

```bash
python3 -m pip install matplotlib graphviz
python3 scripts/plot-al-curve.py
python3 scripts/plot-adversarial.py
python3 scripts/plot-adversarial-comparison.py
python3 scripts/plot-ablation.py
python3 scripts/generate-report-figures.py    # arch diagrams + 9.1/9.2
```

### Optional: turn on operational adapters

```bash
# Linux iptables enforcement (needs NOPASSWD sudo for iptables)
export IDS_ENABLE_IPTABLES=1

# Live tcpdump-driven packet capture (Linux only)
export IDS_ENABLE_PCAP=1
export IDS_PCAP_INTERFACE=eth0

# Outbound alert sinks
export ALERT_WEBHOOK_URL='https://...'
export ALERT_SLACK_WEBHOOK_URL='https://hooks.slack.com/...'
export ALERT_EMAIL_TO='you@example.com'   # uses local sendmail
export ALERT_MIN_SEVERITY=high            # filter
```

All four adapters are fire-and-forget (errors logged, never thrown), so
leaving any unset just no-ops that channel.

### Optional: load the Chrome extension

1. `chrome://extensions` → enable Developer Mode → "Load unpacked".
2. Pick the `chrome-extension/` folder.
3. The toolbar icon shows a badge with the live anomaly count from the
   running dashboard; high/critical detections fire desktop notifications.

---

## Demo flow

1. Open the dashboard. Click **Re-seed (force)** to populate ~1.6k recent
   synthetic packets.
2. Click **Start Replay** to stream 6 packets every 2.5 s.
3. Click **Generate Attack ▾** and pick DDoS, Port Scan or Brute Force to
   see the auto-response queue light up.
4. Switch to the **Detections** tab to validate / dismiss anomalies —
   every click feeds the Active Learning loop.
5. The **ML Models** tab surfaces real per-model metrics and the ensemble
   pipeline donut from the actually-trained ensemble.
6. The **Datasets** tab shows cross-dataset (NSL-KDD vs CICIDS-2017)
   F1/recall comparisons.

Talk track: `docs/DEMO_SCRIPT.md`.

---

## Repo layout

```
app/                              # Next.js App Router
  api/{14 endpoints}              # see docs/PROJECT_REPORT.md Appendix A
  page.tsx                        # tabbed dashboard, deep-linked via ?tab=
components/                       # React components (see docs/ARCHITECTURE.md)
lib/
  ml/                             # five algorithms in pure TypeScript
    isolation-forest.ts · autoencoder.ts · random-forest.ts · xgboost.ts
    lstm.ts · ensemble.ts         # core models + weighted vote
    nsl-kdd.ts · cicids.ts        # dataset loaders + feature pipelines
    packet-to-kdd.ts              # live packet → KDD record adapter
    features.ts · ip-entropy.ts   # 72-dim vector + IP entropy
    loader.ts · lstm-loader.ts    # disk-backed model loading
  services/
    detection.ts · rlhf.ts        # detector + Active Learning
    auto-response.ts              # severity-driven response gate
    auto-training.ts              # verified-sample buffer
    sse-broadcaster.ts            # shared SSE poller (multi-client safe)
    iptables-adapter.ts           # block IP → Linux DROP rule       (opt-in)
    pcap-adapter.ts               # live tcpdump → CapturedPacket    (opt-in)
    alert-sinks.ts                # webhook / Slack / email          (opt-in)
    tenant.ts                     # multi-tenant factory pattern     (scaffold)
prisma/schema.prisma              # 6-table SQLite schema
models/                           # all four ensembles ship pre-trained
  ensemble.json scaler.json metrics.json feature-meta.json   # NSL-KDD
  lstm.json lstm-metrics.json                                # LSTM
  cicids/{ensemble,scaler,metrics,feature-meta}.json         # CICIDS-2017
  adversarial/{ensemble,scaler,metrics,feature-meta}.json    # adv-trained
  active-learning-curve.{json,png}                           # Finding 1
  adversarial-audit.{json,png}                               # Finding 2
  ablation-{nslkdd,cicids}.json · ablation.png               # Finding 3
  adversarial-comparison.json                                # adv-train pass
scripts/
  download-nslkdd.sh · download-cicids.py
  train-nslkdd.ts · train-lstm.ts · train-cicids.ts · train-adversarial.ts
  prepare-cicids.ts · smoke-cicids.ts
  eval-active-learning.ts · eval-adversarial.ts · eval-ablation.ts
  generate-report-figures.py · plot-*.py
chrome-extension/                 # Manifest V3 popup
data/
  KDDTrain+.txt · KDDTest+.txt    # gitignored, fetched on demand
  cicids/                         # gitignored, user-supplied
docs/
  PROJECT_REPORT.md               # canonical report source (~1400 lines)
  RESEARCH_FINDINGS.md            # the three empirical studies
  RESEARCH.md                     # cross-dataset methodology
  ARCHITECTURE.md                 # service-layer detail
  DEMO_SCRIPT.md                  # 8-minute demo talk track
  REPORT_PDF_FIXES.md             # Word/PDF cleanup checklist
  figures/                        # 17 PNGs called out in the report TOC
  figures/README.md               # figure manifest
```

---

## Algorithms (and what they're good at)

### Isolation Forest (30 % default weight)
80 random trees, sample size 256. Anomalies isolate in shallow paths.
Unsupervised — works without labels. On NSL-KDD: F1 83.75 % with high
FPR (25.53 %) because the unlabelled signal also flags some benign traffic.
The high weight is deliberate — it contributes the recall lift the
supervised models miss on unseen attack types.

### Autoencoder (25 %)
72 → 18 → 72 MLP, ReLU encoder, sigmoid decoder. Reconstruction error
above the threshold flags as anomaly. Complementary novelty signal to IF.

### Random Forest (25 %)
40 trees, depth 12, gini split, 50 % feature subsampling. Best precision
on both datasets (93 % NSL-KDD, 99 % CICIDS). Returns a most-common-attack
estimate at the leaf for downstream classification.

### XGBoost-style Gradient Boosting (20 %)
80 rounds, learning rate 0.1, depth-5 stumps. Sigmoid-squashed for
ensemble combination. Highest individual F1 on NSL-KDD (88.55 %).

### Ensemble math
```
final_score = 0.30·IF + 0.25·AE + 0.25·RF + 0.20·XGB
is_anomaly  = final_score > 0.35     (best-F1 grid choice)
severity    = critical (>0.85) | high (>0.65) | medium (>0.50) | low
```

Active Learning re-blends the four weights toward per-model accuracy from
operator feedback (learning rate η = 0.05) every 10 verified samples.
See `docs/RESEARCH_FINDINGS.md` Finding 1 for the measured effect.

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/stats?period=24h` | Dashboard counters |
| GET    | `/api/detections?limit=50&anomalyOnly=true` | DB-backed detection feed |
| POST   | `/api/detect` | Run a detection batch |
| POST   | `/api/attack` | Generate DDoS / Port Scan / Brute Force |
| POST   | `/api/seed` | Populate DB with ~1.6k synthetic packets |
| GET    | `/api/blocked-ips` | All blocks (DB ∪ in-memory) |
| POST   | `/api/blocked-ips` | Manually block an IP |
| DELETE | `/api/blocked-ips` | Unblock an IP |
| GET    | `/api/rlhf` | Active Learning metrics + ensemble weights |
| POST   | `/api/rlhf` | Submit feedback (Confirm / Dismiss) |
| PATCH  | `/api/rlhf` | `forceAdjust` / `reset` / `setLearningRate` |
| GET    | `/api/metrics` | Per-model metrics + `crossDataset` block if CICIDS trained |
| POST   | `/api/training` | `import` / `retrain` / `verify` |
| GET    | `/api/alerts` | DB-backed alerts |
| POST   | `/api/auto-response` | Block / whitelist / update config |
| POST   | `/api/analyze` | Gemini analyze / explain / advice |
| GET    | `/api/lstm` | LSTM sequence-model metrics |
| POST   | `/api/lstm` | Score the most recent N detections as a sequence |
| GET    | `/api/events` | Server-Sent Events stream of new detections |

---

## Future work

Items that **landed** since the original proposal (now in code with
measurement or scaffolding):

- ✅ Empirical Active Learning evaluation (§9.8, measured)
- ✅ Adversarial robustness audit + adversarially-trained ensemble (§9.9)
- ✅ Ensemble subset ablation across datasets (§9.10)
- ✅ Live packet capture (tcpdump adapter)
- ✅ Host-firewall integration (iptables adapter)
- ✅ Webhook / Slack / email alert sinks
- ✅ Multi-tenant scaffold (factory pattern in `lib/services/tenant.ts`)
- ✅ CICIDS-2017 cross-dataset evaluation (results live)

Items that remain genuinely future:

- LSTM on time-ordered CICIDS flows (the Kaggle mirror dropped the
  Timestamp column; needs the raw CIC release).
- Ensemble-level reward signal for Active Learning (§9.8 shows the
  per-model signal slightly degrades F1).
- Online learning for tree-based models — Mondrian Forests for RF.
- Transformer encoder over flow sequences.
- Full multi-tenant migration (thread tenantId through every route;
  swap to per-tenant Postgres).

---

## License

MIT
