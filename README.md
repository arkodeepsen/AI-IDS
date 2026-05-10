# AI-Based Intrusion Detection System

Real-time network threat detection and autonomous response, powered by an
ensemble of four ML algorithms with continuous self-improvement through
Active Learning.

> **Major Project 2025-26** — Arkaprava Das · Anurup Samanta · Arkodeep Sen

---

## What it does

- Captures (or simulates) network packets and runs each one through a
  weighted **4-model ensemble**: Isolation Forest, Autoencoder NN,
  Random Forest, and Gradient Boosting (XGBoost-style).
- Classifies traffic as `normal` / `low` / `medium` / `high` / `critical` and
  triggers severity-driven **autonomous response** (alert, time-limited block
  or permanent ban).
- Lets the operator validate, dismiss or correct each detection from the UI.
  An **Active Learning (HITL)** loop re-balances the ensemble weights every
  10 verified samples.
- Persists every packet, detection and block to a local **SQLite** database
  (zero-config, single file at `prisma/dev.db`).
- Provides a Next.js 16 dashboard with real-time charts (Recharts), a live
  detection feed, and an integrated **Gemini AI** assistant (with offline
  fallback).

---

## Stack (verified)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · Recharts · Lucide |
| Backend | Next.js Route Handlers (TypeScript) — no separate Python service |
| ML | Pure-TS Isolation Forest, MLP autoencoder, Random Forest, gradient-boosted trees |
| Storage | SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` |
| AI | `@google/generative-ai` for Gemini 1.5 Flash (with offline canned-response fallback) |

> **Why no Python?** The project deck mentions Python+libpcap. Live capture
> needs admin and Npcap on Windows, which is fragile for a demo. We get the
> same architectural story by replaying synthetic traffic through the same
> ensemble, all in one Node process. See `docs/ARCHITECTURE.md` for the full
> rationale.

---

## Run it

```bash
# 1. install deps
npm install

# 2. set up the SQLite DB (one-time)
npx prisma migrate dev --name init   # generates prisma client + dev.db

# 3. start the dashboard
npm run dev          # http://localhost:3000

# 4. (optional) populate demo data
curl -X POST http://localhost:3000/api/seed
```

The dashboard auto-prompts you to seed if the DB is empty. From there:

1. Click **Start Replay** to stream 6 packets every 2.5 s.
2. Click **Generate Attack ▾** and pick DDoS, Port Scan or Brute Force to
   see the auto-response queue light up.
3. Switch to the **Detections** tab to validate / dismiss anomalies — every
   click feeds the Active Learning loop.

---

## Project structure

```
app/                         # Next.js App Router
  api/
    alerts/      detect/     detections/   stats/        # data + detection
    attack/      seed/       blocked-ips/                # demo control
    rlhf/        training/   metrics/                    # active learning
    auto-response/  analyze/                             # response + Gemini
  page.tsx                   # main dashboard with tabs
  layout.tsx
  globals.css

components/
  LiveControl.tsx            # Start replay / Generate attack / Seed
  EnsembleDonut.tsx          # 4-model weight donut (matches slide deck)
  StatsCards.tsx             # 6 summary cards driven by /api/stats
  TrafficChart.tsx           # area/line chart bucketed from real DB
  DetectionFeed.tsx          # live detection table (with Active Learning)
  BlockedIPsPanel.tsx        # auto-response queue
  ModelComparison.tsx        # bar/radar of 5 models
  AlertsPanel.tsx            # security alerts + threat distribution
  AIAssistant.tsx            # Gemini chat (with offline fallback)
  Navigation.tsx             # tab bar
  controls/
    RLHFFeedbackPanel.tsx    # weight visualisation + force re-balance
    AutoResponseControl.tsx  # config + manual blocks
    TrainingDataManager.tsx  # export/import + retrain trigger

lib/
  ml/
    isolation-forest.ts      # 50 trees, sample size 128
    autoencoder.ts           # 7 -> 3 -> 7 with sigmoid output
    random-forest.ts         # 25 trees, gini, feature subsampling
    xgboost.ts               # 40 boosting rounds, log-loss gradient
    ensemble.ts              # weighted vote (30/25/25/20)
    features.ts              # 7-feature vector per packet
    metrics.ts               # NSL-KDD baseline numbers
    training-data.ts         # synthetic labelled dataset for fit()
  services/
    detection.ts             # singleton detector + DB persistence
    rlhf.ts                  # Active Learning weight adjustment
    auto-response.ts         # severity -> block / alert / monitor
    auto-training.ts         # accumulates verified samples for retrain
  gemini.ts                  # Gemini wrapper with canned fallbacks
  prisma.ts                  # SQLite client via better-sqlite3 adapter
  utils.ts                   # packet generators (benign + 3 attack patterns)
  types.ts                   # shared TypeScript types

prisma/
  schema.prisma              # SQLite schema
  migrations/                # version-controlled migrations
  dev.db                     # the database (gitignored)

chrome-extension/            # Manifest V3 popup (kept; optional)
docs/
  ARCHITECTURE.md            # design notes + deck-vs-reality
  DEMO_SCRIPT.md             # 8-minute talk track for evaluation
```

---

## Algorithms

### Isolation Forest (30 % weight)
Random partitioning across 50 trees. Anomalous points isolate in shallow
paths, so short average path length → high anomaly score. Good at flagging
statistical outliers without supervision.

### Autoencoder NN (25 % weight)
Tiny 7→3→7 MLP with ReLU encoder and sigmoid decoder. Reconstruction error
above the training-time 95th-percentile is treated as an anomaly score.
Captures patterns the tree models miss.

### Random Forest (25 % weight)
25 trees, depth 8, Gini split, 70 % feature subsampling per split. Returns
the proportion of trees voting "attack" plus a most-common attack type.
Strong on the supervised attack labels in the synthetic training data.

### Gradient Boosting / XGBoost (20 % weight)
40 boosting rounds, learning rate 0.1, depth-4 regression stumps fitted to
the negative gradient of log-loss. Sigmoid-squashed for ensemble combination.

### Ensemble math
```
final_score =
    0.30 · IsolationForest +
    0.25 · Autoencoder    +
    0.25 · RandomForest   +
    0.20 · XGBoost
is_anomaly = final_score > 0.45
severity   = critical (>0.9) | high (>0.75) | medium (>0.5) | low (otherwise)
```

Active Learning re-blends the four weights toward the per-model accuracy
observed from human feedback (learning rate 0.05) every 10 verified samples,
then renormalises to 1.0.

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/stats?period=24h` | Dashboard counters (packets, anomalies, blocks) |
| GET    | `/api/detections?limit=50&anomalyOnly=true` | DB-backed detection feed |
| POST   | `/api/detections` | Run + persist a detection batch |
| POST   | `/api/detect` | Run a detection batch (with optional `attack` kind) |
| POST   | `/api/attack` | Generate a synthetic attack: `{kind: "ddos"\|"portscan"\|"bruteforce", count: 40}` |
| POST   | `/api/seed` | Populate DB with 7 days of synthetic traffic + attack bursts |
| GET    | `/api/seed` | Counts and `needsSeed` flag |
| GET    | `/api/blocked-ips` | All blocks (DB ∪ in-memory) |
| POST   | `/api/blocked-ips` | Manually block an IP |
| DELETE | `/api/blocked-ips` | Unblock an IP |
| GET    | `/api/rlhf` | Active Learning metrics + current ensemble weights |
| POST   | `/api/rlhf` | Submit feedback `{detectionId, isCorrect, modelMethod}` |
| PATCH  | `/api/rlhf` | `forceAdjust` / `reset` / `setLearningRate` |
| GET    | `/api/metrics` | Per-model accuracy / precision / recall / F1 / FPR |
| POST   | `/api/training` | `import` / `retrain` / `verify` / `updateConfig` |
| GET    | `/api/alerts` | DB-backed alerts |
| POST   | `/api/auto-response` | Block / whitelist / update config |
| POST   | `/api/analyze` | Gemini analyze / explain / advice (falls back offline) |

---

## Demo script

See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the talk track.

---

## Future scope

- Replace synthetic packet generator with actual PCAP replay using `pcap-parser`
  (still no admin needed, just file ingestion).
- Swap MLPRegressor autoencoder for a Keras/TensorFlow model when running
  on a GPU machine.
- Multi-tenant deployment with per-tenant model versions stored in S3.
- LSTM / Transformer models for sequential flow analysis.

---

## License

MIT
