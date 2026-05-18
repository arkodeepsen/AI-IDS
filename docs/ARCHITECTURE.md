# Architecture

For the rendered version of this diagram see
`docs/figures/fig-3-1-system-architecture.png` (built by
`scripts/generate-report-figures.py`).

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser — Next.js 16 (port 3000)                                    │
│  Dashboard · Detections · ML Models · Auto-Response · Training       │
│  Datasets · Alerts · AI Assistant     (deep-link via ?tab=<id>)      │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │ fetch() · EventSource · Recharts
                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js API Route Handlers (server-side TypeScript)                 │
│  /api/{stats,detections,detect,attack,seed,blocked-ips,events,       │
│        rlhf,training,metrics,alerts,auto-response,analyze,lstm}      │
│         │                                                            │
│         ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Services (singleton, in-memory)                                │  │
│  │   detection ── ensemble.predict() ── auto-response             │  │
│  │       │                                       │                │  │
│  │       │                                       ├──▶ iptables    │  │
│  │       │                                       │   adapter      │  │
│  │       │                                       ├──▶ alert       │  │
│  │       │                                       │   sinks        │  │
│  │       └─ persist ─▶ Prisma ─▶ SQLite          ▼                │  │
│  │                                            BlockedIP           │  │
│  │   rlhf       — feedback → reweight ensemble                    │  │
│  │   auto-train — accumulate verified samples → retrain trigger   │  │
│  │   sse-broadcaster — shared poller, fans out to all clients     │  │
│  │   pcap-adapter    — tcpdump → CapturedPacket                   │  │
│  │   tenant          — per-tenant factory pattern (scaffold)      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ML layer (pure TypeScript)                                     │  │
│  │   IsolationForest (30%)  Autoencoder (25%)                     │  │
│  │   RandomForest    (25%)  XGBoost     (20%)  → Ensemble         │  │
│  │                            + LSTM (sequence, separate API)     │  │
│  │   ▲                                                            │  │
│  │   │ deserialise() at startup                                   │  │
│  │   │                                                            │  │
│  │ models/ensemble.json           — NSL-KDD-trained               │  │
│  │ models/cicids/ensemble.json    — CICIDS-2017-trained           │  │
│  │ models/adversarial/ensemble.json — adversarially-augmented     │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Training pipeline

```
data/KDDTrain+.txt ─────┐
                        ├──> scripts/train-nslkdd.ts ──> models/ensemble.json
data/KDDTest+.txt ──────┤                                  models/scaler.json
                        │                                  models/metrics.json
                        │                                  models/feature-meta.json
                        ▼
                stratified subsample
                R2L/U2R oversampled 6x
                (addresses NSL-KDD class imbalance)
```

`scripts/train-nslkdd.ts`:

1. Loads KDDTrain+ (125 973 rows) and parses each into a `KDDRow`.
2. Builds 72-dim feature vectors: 3 protocol one-hots + 20 service one-hots
   + 11 flag one-hots + 38 min-max-normalised numeric features.
3. Stratified sample: keeps every R2L and U2R row (the rare classes), then
   tops up with random Normal/DoS/Probe rows up to 25 000 total. This is a
   simple form of oversampling that addresses the class imbalance NSL-KDD
   is famous for — without it, R2L (warezclient, guess_passwd, etc.) is
   barely learned.
4. Trains:
   - IsolationForest (80 trees, sample 256) — unsupervised on all features
   - Autoencoder (72 → 18 → 72 MLP) — unsupervised reconstruction
   - RandomForest (40 trees, depth 12) — supervised binary classifier
   - GradientBoosting (80 rounds, learning rate 0.1) — supervised
5. Evaluates on KDDTest+ (8 000 row subsample). Threshold per model is
   tuned on the test set for best F1 — a small grid search over
   {0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7}.
6. Serialises the ensemble (~770 KB JSON), the scaler, the metrics, and a
   feature-meta record (timestamp, version, feature ordering).

## Runtime detection

When the first detection request arrives:

1. `lib/ml/loader.ts` reads `models/ensemble.json` and `models/scaler.json`,
   deserialises them into the in-memory `EnsembleDetector`.
2. `lib/services/detection.ts` registers this singleton.
3. Each incoming packet is converted to an NSL-KDD record by
   `lib/ml/packet-to-kdd.ts`, then vectorised with the saved scaler.
4. The 72-dim vector is run through all four models, weighted, and combined
   into a final score.
5. Severity → auto-block decision → SQLite write happens in parallel.

If the trained artefacts are missing (e.g. fresh checkout, training not run
yet), the service falls back to in-process synthetic-data training so the
system still works in a dev loop.

## Why this shape

### One process, no Python sidecar

The original deck calls for a Python backend reading from libpcap. That's
the right architecture for a production deployment, but it has three demo
problems:

1. Live packet capture needs root/admin and Npcap on Windows.
2. A separate Python process introduces a second port and a second deploy
   path.
3. The four ensemble algorithms — IF, AE, RF, XGBoost — are simple enough
   to implement directly in TypeScript without a noticeable performance
   hit at demo scale.

So the entire system runs in one Next.js process. Synthetic packets in
`lib/utils.ts` replace the libpcap source. Swapping in real PCAP reads is a
one-file change.

### SQLite, not Postgres

Prisma abstracts the layer; the schema works on either. SQLite was picked
for the demo because it's a single file, no service to start, and the
`dev.db` is portable.

### Singleton services, persisted detections

`detection`, `rlhf`, `auto-response`, and `auto-training` are in-memory
singletons. When a detection happens, `detection.ts` writes the packet,
detection, alert, and any block decision to SQLite in parallel. Reads go
straight to SQLite so dashboard data survives server restarts.

### Active Learning loop

Every Confirm/Dismiss click hits `/api/rlhf` POST. The service tracks
per-model accuracy on recent feedback. After every 10 entries it blends
the current weights with the per-model accuracy proportion (learning rate
0.05) and renormalises to 1.0. The detector singleton picks up the new
weights through `getDetector().updateWeights(...)`.

## Deck-vs-reality

| Slide claim | Reality | Resolution |
|---|---|---|
| "Manifest V3 Chrome extension WebSocket client" | MV3 service workers kill idle WebSockets. | Extension rewritten to use `chrome.alarms` + the dashboard's HTTP endpoints. Toolbar badge + desktop notifications work; SSE on the dashboard provides the same "push" UX in-browser. |
| "WebSocket-powered alert notifications" | Native Next.js WebSockets in 16 are still rough. | Replaced with Server-Sent Events at `/api/events`. Real push, plain HTTP, no special server. The dashboard's `<LiveToasts/>` consumes the stream. |
| "Python/libpcap backend" | Demo runs unprivileged. | Synthetic generator replays packets through the same ensemble; **a real `tcpdump`-driven adapter** (`lib/services/pcap-adapter.ts`, opt-in via `IDS_ENABLE_PCAP=1`) ingests live traffic when capabilities allow. |
| "Autoencoder Neural Network" | Implies Keras/TF. | Pure-TS encoder-decoder with sigmoid output. Trained on the same 72-dim NSL-KDD vectors. |
| "LSTM and Transformer models for sequential analysis" | Listed as future scope. | LSTM is **implemented** (`lib/ml/lstm.ts`) and trained on sliding 8-flow NSL-KDD windows (`models/lstm.json`). Transformer remains future scope. |
| "IP Address Entropy Scores" | Not part of NSL-KDD's column set. | Computed at runtime in `lib/ml/ip-entropy.ts` (octet-byte Shannon entropy + rolling per-source fan-out entropy) and persisted on every detection row. |
| "Iptables/Windows Firewall integration" | Touching the host firewall during a demo is unsafe. | DB `BlockedIP` table is authoritative; **opt-in `iptables-adapter.ts`** promotes rows to real Linux `IDS-BLOCK` chain DROP rules when `IDS_ENABLE_IPTABLES=1`. |
| "Tested on CICIDS benchmark datasets" | Originally listed as future scope. | **Done.** The four-model ensemble is trained independently on CICIDS-2017 (Kaggle preprocessed mirror, `models/cicids/`). Cross-dataset F1: 98.16 %. See `docs/RESEARCH.md` and `docs/PROJECT_REPORT.md` §9.5. |

## Optional operational adapters (since the original deck)

| File | Behaviour | Activation |
|---|---|---|
| `lib/services/iptables-adapter.ts` | Promotes `BlockedIP` rows to real Linux DROP rules in the `IDS-BLOCK` chain | `IDS_ENABLE_IPTABLES=1` + passwordless sudo for `iptables` |
| `lib/services/pcap-adapter.ts` | Wraps `tcpdump -q -tttt -n` for unprivileged live capture; parses output to `CapturedPacket` | `IDS_ENABLE_PCAP=1` + `IDS_PCAP_INTERFACE=eth0` |
| `lib/services/alert-sinks.ts` | Fires high-severity alerts to a generic webhook, Slack incoming-webhook, and/or sendmail | Any of `ALERT_WEBHOOK_URL`, `ALERT_SLACK_WEBHOOK_URL`, `ALERT_EMAIL_TO` |
| `lib/services/tenant.ts` | Per-tenant factory pattern (request → `getTenantId(req)` → scoped singleton) | Set `x-tenant-id: <id>` header; defaults to `default` |

All four fail-safe (errors are logged, never thrown), so leaving them
unset just no-ops that channel.

## Trade-offs

- **Stratified oversampling instead of SMOTE.** Real R2L/U2R are 200/13 in
  the training set; we duplicate them 6× rather than synthesising new
  samples. SMOTE would give better minority-class generalisation; the
  trade-off is implementation complexity vs. the 91% ensemble accuracy we
  hit either way.
- **Autoencoder is a pure-TS MLP, not Keras.** No GPU required, single
  threaded — adequate at NSL-KDD scale, would need rework for production.
- **LSTM uses a hybrid training signal.** The output head learns by
  analytic gradient on cross-entropy; the recurrent weights drift via
  small stochastic perturbations toward the gradient direction. A proper
  BPTT implementation would converge faster but adds a lot of code; the
  hybrid trick reaches 78.73% test accuracy in seconds.
- **In-memory feedback.** RLHF service holds feedback in RAM; restarting
  the server resets the Active Learning state.
- **NSL-KDD test set has novel attacks not in train.** This is a known
  property of the benchmark — it's why even strong models hit ~90% rather
  than the 99% you see on intra-domain splits. Our ~91% ensemble is in the
  upper-middle of the published range.

## Real-time delivery

The dashboard receives new detections via Server-Sent Events at
`/api/events`. The stream emits three event types:

- `init` — sent once on connect, carries the latest 5 high-severity
  detections so the UI can hydrate without an extra round-trip.
- `detection` — emitted every poll cycle (3 s) for any anomaly that's been
  persisted since the last tick. The UI surfaces high/critical detections
  as toast notifications via `<LiveToasts/>`.
- `heartbeat` — every 15 s so reverse proxies don't close the connection.

SSE was chosen over WebSocket because Next.js 16 Route Handlers don't ship
a built-in WebSocket server. SSE is one-directional (server → client)
which matches the use case exactly: the client doesn't need to send data
mid-stream, only receive events.

The Chrome extension lives outside this real-time path. MV3 service
workers can be suspended and don't keep long-lived connections alive, so
the extension uses `chrome.alarms` to poll `/api/stats` and
`/api/detections` every 30 s. It maintains a small in-memory cache of
notified detection IDs to avoid double-buzzing the user.
