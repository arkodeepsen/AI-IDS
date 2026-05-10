# Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser — Next.js 16 (port 3000)                                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Dashboard tab                                                  │  │
│  │   StatsCards · LiveControl · TrafficChart · EnsembleDonut      │  │
│  │   DetectionFeed · BlockedIPsPanel                              │  │
│  │ Detections tab — Active Learning queue                         │  │
│  │ ML Models tab  — ModelComparison · RLHFFeedbackPanel           │  │
│  │ Auto-Response tab — AutoResponseControl · BlockedIPsPanel      │  │
│  │ Training tab   — TrainingDataManager                           │  │
│  │ AI Assistant   — Gemini chat (with offline fallback)           │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │  fetch() / Recharts
                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js API Route Handlers (server-side TypeScript)                 │
│  /api/detect /api/attack /api/seed /api/stats /api/detections        │
│  /api/blocked-ips /api/rlhf /api/training /api/metrics               │
│  /api/alerts /api/auto-response /api/analyze                         │
│         │                                                            │
│         ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Services (singleton, in-memory)                                │  │
│  │   detection  ◀── ensemble.predict() ─▶ auto-response           │  │
│  │       │                                       │                │  │
│  │       └─ persist ─▶ Prisma ─▶ SQLite          ▼                │  │
│  │                                            blockedIPs          │  │
│  │   rlhf       — feedback → reweight ensemble                    │  │
│  │   auto-train — accumulate verified samples → retrain trigger   │  │
│  └──────────────────────────┬─────────────────────────────────────┘  │
│                             ▼                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ML layer (pure TypeScript)                                     │  │
│  │   IsolationForest (30%) │ Autoencoder (25%) │                  │  │
│  │   RandomForest    (25%) │ XGBoost     (20%) │ → Ensemble       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │  Prisma 7 + better-sqlite3
                                       ▼
                            ┌──────────────────────┐
                            │ prisma/dev.db        │
                            │  NetworkPacket       │
                            │  DetectionResult     │
                            │  Alert               │
                            │  BlockedIP           │
                            │  ModelMetrics        │
                            │  SystemStats         │
                            │  AuditLog            │
                            └──────────────────────┘
```

## Why this shape

### One process, no Python sidecar

The original deck calls for a Python backend reading from libpcap. That's the
right architecture for a production deployment, but it has three demo
problems:

1. Live packet capture needs root/admin and Npcap on Windows.
2. A separate Python process introduces a second port and a second deploy
   path.
3. The four ensemble algorithms — Isolation Forest, Autoencoder, Random
   Forest, Gradient Boosting — are simple enough to implement directly in
   TypeScript without a noticeable performance hit at demo scale (<10 ms per
   packet end-to-end).

So the entire system runs in one Next.js process. The synthetic traffic
generator (`lib/utils.ts`) replaces the libpcap source. Swapping in real PCAP
reads is a one-file change to `lib/utils.ts`.

### SQLite, not Postgres

Prisma abstracts the layer; the schema works on either. SQLite was picked
for the demo because:

- No external service to start or auth.
- The `dev.db` file is portable — copy it onto another laptop and the
  history follows.
- Migrations still run via `prisma migrate dev`, so the path to Postgres is
  changing one provider line and re-running migrations.

### Singleton services, persisted detections

The `detection`, `rlhf`, `auto-response`, and `auto-training` services are
in-memory singletons (cheap state, fast access). When a detection happens,
`detection.ts` calls `persistDetection` which writes the packet, detection,
alert, and any block decision to SQLite in parallel. Reads (Stats, Detection
feed, Blocked IPs) come straight from SQLite so the dashboard can be
restarted and history survives.

### Active Learning loop

Every Confirm/Dismiss click hits `/api/rlhf` POST. The service tracks
per-model accuracy across recent feedback. After every 10 entries it blends
the current weights with the per-model accuracy proportion (learning rate
0.05) and renormalises to 1.0. The detector singleton picks up the new
weights through `getDetector().updateWeights(...)`.

## Inaccuracies in the original deck (and how we handled them)

| Slide claim | Reality | Resolution |
|---|---|---|
| "Manifest V3 Chrome extension WebSocket client" | MV3 service workers kill idle WebSockets. | Extension is shipped but not on the demo path. The dashboard polls every 4 s, providing equivalent UX. |
| "Python/libpcap backend" | Needs admin + Npcap on Windows. | Synthetic generator replays packets through the same ensemble. Architecture is identical from the detector down. |
| "Autoencoder Neural Network" | Implies Keras/TF. | Pure-TS encoder-decoder with sigmoid output. Works on the same feature vectors; no GPU required. |
| "Iptables/Windows Firewall integration" | Touching the host firewall during a demo is unsafe. | Replaced with a `BlockedIP` SQLite table that mirrors the same effect. |
| "Tested on CICIDS benchmark datasets" | We didn't actually run a CICIDS evaluation. | The Datasets tab references CICIDS for context. The headline metrics in the Model Comparison panel are NSL-KDD baselines from published literature for the same algorithms. |
| "Ensemble of supervised + unsupervised models" | Works fine, but the deck doesn't explain how the unsupervised scores are made comparable. | All scores are normalised to [0,1] (IF: anomaly score, AE: reconstruction error / threshold, RF: vote share, XGB: sigmoid logit) before the weighted sum. |

## Trade-offs we accepted

- **Synthetic training data.** We generate ~800 labelled packets at startup
  using `generateLabeledTrainingData(800)`. This is not as rich as NSL-KDD,
  but it makes the system reproducible without any dataset download.
  Swapping in NSL-KDD is one function call.
- **No GPU.** All four algorithms run on CPU, single-threaded. Adequate for
  the < 200 packets/s the demo generates; would need rework for production
  scale.
- **In-memory feedback.** The `rlhf` service holds feedback in RAM (not in
  the DB). Restarting the server resets the Active Learning state — fine for
  a demo, would move to a `Feedback` table for production.
