# AI-Based Intrusion Detection System

Real-time network threat detection and autonomous response, powered by an
ensemble of four ML algorithms **trained on the NSL-KDD dataset** with
continuous self-improvement through Active Learning.

> **Major Project 2025-26** — Arkaprava Das · Anurup Samanta · Arkodeep Sen

---

## Headline numbers (real, on the held-out NSL-KDD test set)

| Model            | Accuracy | Precision | Recall  | F1     | FPR    |
|------------------|---------:|----------:|--------:|-------:|-------:|
| Isolation Forest |  80.94%  |   81.84%  | 85.75%  | 83.75% | 25.53% |
| Autoencoder NN   |  78.75%  |   81.48%  | 81.41%  | 81.45% | 24.82% |
| Random Forest    |  86.21%  |   93.01%  | 82.11%  | 87.22% |  8.28% |
| XGBoost          |  86.91%  |   88.77%  | 88.33%  | 88.55% | 14.99% |
| **Ensemble**     | **90.99%** | **87.72%** | **97.99%** | **92.57%** | 18.41% |
| LSTM (sequence)  |  78.73%  |   86.13%  | 73.93%  | 79.56% | 15.15% |

Trained on 25,000 stratified KDDTrain+ samples (with R2L/U2R oversampling
to address the well-known class imbalance), evaluated on 8,000 KDDTest+
samples. The LSTM is a separate model trained on sliding 8-flow windows
over the same dataset.  Metrics are written to `models/metrics.json` /
`models/lstm-metrics.json` and surfaced on the ML Models tab.

---

## What it does

- Captures (or simulates) network packets, projects them into the **41-feature
  NSL-KDD shape** and runs each through a weighted **4-model ensemble**:
  Isolation Forest, Autoencoder, Random Forest, XGBoost-style Gradient Boosting.
- A separate **LSTM sequence model** scores sliding 8-flow windows so the
  operator can compare flow-level vs. sequence-level evidence.
- Classifies traffic as `low` / `medium` / `high` / `critical` and triggers
  severity-driven **autonomous response** (alert, time-limited block, or
  permanent ban).
- Lets the operator validate, dismiss or correct each detection from the UI.
  An **Active Learning (HITL)** loop re-balances the ensemble weights every
  10 verified samples.
- Pushes detection events to the dashboard in real time via **Server-Sent
  Events** (`/api/events`) — high/critical detections surface as toast
  notifications system-wide.
- Ships a **Chrome (Manifest V3) extension** that polls the running
  dashboard via `chrome.alarms` and displays toolbar-badge + desktop
  notifications.
- Persists every packet, detection and block to a local **SQLite** database
  (zero-config, single file at `prisma/dev.db`).
- Computes **per-packet IP entropy** (octet entropy + rolling source
  fan-out) and exposes it on every detection row.
- Provides a Next.js 16 dashboard with real-time charts (Recharts), a live
  detection feed, and an integrated **Gemini AI** assistant (with offline
  fallback).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · Recharts · Lucide |
| Backend | Next.js Route Handlers (TypeScript) — no separate Python service |
| ML | Pure-TS Isolation Forest, MLP autoencoder, Random Forest, gradient-boosted trees |
| Storage | SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` |
| AI | `@google/generative-ai` for Gemini 1.5 Flash (with offline fallback) |
| Dataset | NSL-KDD (KDDTrain+ / KDDTest+) — 41 features per connection record |

---

## Run it

```bash
# 1. install deps
npm install

# 2. set up the SQLite DB
npx prisma migrate deploy

# 3. download NSL-KDD (one-time, ~22 MB)
npm run data:download

# 4. train the four ensemble models on NSL-KDD (~5 min)
npm run train

# 5. (optional) train the LSTM sequence model on NSL-KDD windows (~5 s)
npm run train:lstm

# 6. start the dashboard
npm run dev          # http://localhost:3000

# 7. (optional) populate ~7 days of demo data
curl -X POST http://localhost:3000/api/seed
```

The repository ships with `models/ensemble.json` + `models/lstm.json`
already trained, so steps 3-5 are optional — skip them and the runtime
loads the bundled weights.

### Optional: load the Chrome extension

1. `chrome://extensions` → enable Developer Mode → "Load unpacked".
2. Pick the `chrome-extension/` folder.
3. The toolbar icon shows a badge with the live anomaly count from the
   running dashboard; high/critical detections fire desktop notifications.

From the dashboard:

1. Click **Start Replay** to stream 6 packets every 2.5 s.
2. Click **Generate Attack ▾** and pick DDoS, Port Scan or Brute Force to
   see the auto-response queue light up.
3. Switch to the **Detections** tab to validate / dismiss anomalies — every
   click feeds the Active Learning loop.

---

## Repo layout

```
app/                        # Next.js App Router
  api/
    alerts/      detect/    detections/   stats/        # data + detection
    attack/      seed/      blocked-ips/                # demo control
    rlhf/        training/  metrics/                    # active learning
    auto-response/ analyze/                             # response + Gemini
  page.tsx                  # main dashboard with tabs
components/                 # React components (see docs/ARCHITECTURE.md)
lib/
  ml/
    isolation-forest.ts     # 80 trees, sample size 256
    autoencoder.ts          # 72 → 18 → 72 with sigmoid output
    random-forest.ts        # 40 trees, depth 12, gini, 50% feature subsampling
    xgboost.ts              # 80 boosting rounds, log-loss gradient
    ensemble.ts             # weighted vote (30/25/25/20) + serialise/deserialise
    nsl-kdd.ts              # NSL-KDD CSV parser + feature pipeline
    packet-to-kdd.ts        # adapter: live packet → KDD flow record
    features.ts             # extract 72-dim vector for the ensemble
    loader.ts               # loads trained models/*.json on startup
    metrics.ts              # baseline numbers (used if models/* missing)
  services/
    detection.ts            # singleton detector + DB persistence
    rlhf.ts                 # Active Learning weight adjustment
    auto-response.ts        # severity → block / alert / monitor
    auto-training.ts        # accumulates verified samples for retrain
  gemini.ts                 # Gemini wrapper with canned offline fallbacks
  prisma.ts                 # SQLite client via better-sqlite3
  utils.ts                  # synthetic packet + 3 attack pattern generators
  types.ts
prisma/
  schema.prisma             # SQLite schema
  migrations/
data/
  KDDTrain+.txt             # NSL-KDD train (gitignored, fetched by npm run data:download)
  KDDTest+.txt              # NSL-KDD test (gitignored)
models/
  ensemble.json             # serialised 4-model ensemble (committed)
  scaler.json               # min/max for feature normalisation (committed)
  metrics.json              # per-model accuracy/precision/recall/F1/FPR (committed)
  feature-meta.json         # feature ordering + train timestamp (committed)
scripts/
  download-nslkdd.sh        # curl KDDTrain+ / KDDTest+ from GitHub mirror
  train-nslkdd.ts           # full trainer with stratified sampling + eval
docs/
  ARCHITECTURE.md
  DEMO_SCRIPT.md
chrome-extension/           # Manifest V3 popup (kept; optional)
```

---

## Algorithms (and what they're good at)

### Isolation Forest (30% weight)
80 random trees, sample size 256. Anomalies isolate in shallow paths.
Unsupervised — works without labels. Weakness: high FPR (25%) because
flag-only normalisation can't tell some benign traffic from probes.

### Autoencoder (25% weight)
72 → 18 → 72 MLP, ReLU encoder, sigmoid decoder. Reconstruction error above
the 95th percentile of the training distribution flags as anomaly.

### Random Forest (25% weight)
40 trees, depth 12, gini split, 50% feature subsampling. **Best precision
on this benchmark (93%)**. Returns a most-common-attack-type estimate at the
leaf for downstream classification.

### XGBoost-style Gradient Boosting (20% weight)
80 rounds, learning rate 0.1, depth-5 stumps. Sigmoid-squashed for
ensemble combination. **Highest individual F1 (88.55%)**.

### Ensemble math
```
final_score = 0.30·IF + 0.25·AE + 0.25·RF + 0.20·XGB
is_anomaly  = final_score > 0.45
severity    = critical (>0.85) | high (>0.65) | medium (>0.5) | low
```

Active Learning re-blends the four weights toward per-model accuracy from
operator feedback (learning rate 0.05) every 10 verified samples.

---

## Feature pipeline

The trained models expect the full NSL-KDD 41-feature record (one-hot
encoded for `protocol_type`, top-20 `service`, and `flag`, plus 38
numeric features min-max normalised — 72 dimensions total).

For live traffic, `lib/ml/packet-to-kdd.ts` projects each packet into that
shape:

- `protocol_type` from `packet.protocol`
- `service` from `packet.destPort` (e.g. 22 → ssh, 80 → http, 443 → http)
- `flag` from `packet.flags` (SYN-only → S0, RST → RSTR, etc.)
- `src_bytes`, `urgent`, `land` from packet fields
- Aggregate fields (`count`, `srv_count`, `serror_rate`, etc.) default to
  zero or are explicitly stamped by the synthetic attack generators so the
  model sees a flow-level signature, not just a single packet.

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/stats?period=24h` | Dashboard counters |
| GET    | `/api/detections?limit=50&anomalyOnly=true` | DB-backed detection feed |
| POST   | `/api/detect` | Run a detection batch |
| POST   | `/api/attack` | Generate DDoS / Port Scan / Brute Force |
| POST   | `/api/seed` | Populate DB with 7 days of synthetic traffic |
| GET    | `/api/blocked-ips` | All blocks (DB ∪ in-memory) |
| POST   | `/api/blocked-ips` | Manually block an IP |
| DELETE | `/api/blocked-ips` | Unblock an IP |
| GET    | `/api/rlhf` | Active Learning metrics + ensemble weights |
| POST   | `/api/rlhf` | Submit feedback (Confirm / Dismiss) |
| PATCH  | `/api/rlhf` | `forceAdjust` / `reset` / `setLearningRate` |
| GET    | `/api/metrics` | Real per-model metrics from `models/metrics.json` |
| POST   | `/api/training` | `import` / `retrain` / `verify` |
| GET    | `/api/alerts` | DB-backed alerts |
| POST   | `/api/auto-response` | Block / whitelist / update config |
| POST   | `/api/analyze` | Gemini analyze / explain / advice |
| GET    | `/api/lstm` | LSTM sequence-model metrics |
| POST   | `/api/lstm` | Score the most recent N detections as a sequence |
| GET    | `/api/events` | Server-Sent Events stream of new detections |

---

## Demo script

See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the 8-minute talk track.

---

## Future work

- Online learning: drip new feedback into RF / XGBoost without full retrain.
- Transformer encoder over flow sequences (LSTM is in place).
- CICIDS-2017 secondary evaluation for cross-dataset generalisation.
- Multi-tenant deployment with per-tenant ensemble weights stored in S3.
- True distributed detection across hardware nodes.

---

## License

MIT
