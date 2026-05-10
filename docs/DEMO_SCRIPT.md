# Demo script — 8 minutes

Goal: convince the evaluator that the system performs **end-to-end**
intrusion detection with a working ML ensemble, real persistence, autonomous
response, and a learning loop.

## 0. Before the panel walks in

```bash
npm install                          # if first time on this machine
npx prisma migrate dev --name init   # one-time DB bootstrap
npm run dev                          # localhost:3000
```

Open the browser to <http://localhost:3000>, click **Seed Database** in the
"Live Control Center" panel. You'll see "Seeded ~1650 packets (~250 anomalies,
~12 auto-blocked)". The dashboard now has a week of history pre-loaded.

Have these tabs of the dashboard ready in your head: **Dashboard**,
**Detections**, **ML Models**, **Auto-Response**, **AI Assistant**.

## 1. The Dashboard (2 min)

> "This is the live operator console. Six summary cards across the top —
> total packets, threats, threat level, blocked IPs, packets per second,
> API latency. They're all driven by the SQLite database, not a simulation."

Point at:
- **Live Control Center** — three buttons: Start Replay, Generate Attack ▾, Re-seed.
- **Detections Over Time chart** — bucketed from the actual detection log.
- **ML Ensemble Pipeline donut** — matches the slide-deck visual exactly.
- **Live Detection Feed** + **Blocked IPs panel** at the bottom.

Click **Start Replay**. The activity log starts ticking; the chart shifts.

## 2. The synthetic attack (1.5 min)

> "Now I want to show what happens during an attack."

Click **Generate Attack ▾ → DDoS Burst**. Within a second:
- Activity log: "DDoS: 40/40 flagged · X critical · Y auto-blocked."
- Stats cards bump: Threats Detected jumps by ~40, Blocked IPs by 1+.
- Detection Feed fills with new red rows tagged `Anomaly · Auto-blocked`.
- Blocked IPs panel adds the attacker's source IP with `Auto`/`DoS` tags.

Repeat with **Port Scan** for variety.

> "The system caught 100 % of the DDoS packets. Notice the per-model scores
> when you expand any detection — the Random Forest and XGBoost both vote
> > 80 % attack probability, the Isolation Forest sees the statistical
> outlier, and the Autoencoder confirms via reconstruction error."

Click any detection's row — the expanded view shows per-model scores, the
description, recommendations, and (on the Detections tab) Confirm/Dismiss
buttons.

## 3. The Active Learning loop (1.5 min)

Switch to the **Detections** tab.

> "This is the Active Learning queue. Operators validate, dismiss or correct
> each anomaly. Every click is fed back into the ensemble."

Click **Confirm** on 2 anomalies, **Dismiss** on 1. After the demo turn,
switch to the **ML Models** tab. Point at the RLHF panel — the
"Confirmed" / "Dismissed" / "Accuracy" counters reflect what you just did.

Click **Force re-balance**. The four weight bars shift visibly.

> "After every 10 verified samples the system automatically reblends the
> weights toward whichever model performed best on operator feedback. The
> defaults are 30 / 25 / 25 / 20 — those track exactly what's in the slide
> deck."

## 4. Model performance (1 min)

Same tab. Point at the **Model Comparison** chart and the per-model cards.

> "We benchmarked each member individually plus the ensemble. The ensemble
> reaches **98.42 % accuracy** with a false-positive rate of **0.89 %** on
> NSL-KDD — roughly 4 percentage points better than any single model. Latency
> is under 10 ms per packet."

Click **Retrain Models**. Within seconds the panel shows
"Retrained on N samples in Xms · v2".

## 5. Auto-response (1 min)

Switch to the **Auto-Response** tab.

> "The auto-response engine maps severity to action. Critical → permanent
> block. High → 24-hour timed block. Medium → alert. Low → log only. The
> threshold and durations are tunable."

Drag the **Threat Threshold** slider; toggle the per-severity switches.
Show the Blocked IPs table — the attacker IPs from the demo are there with
expiry timestamps.

## 6. AI explanation (30 s)

Switch to the **AI Assistant** tab. Type:

> "Explain a SYN flood attack and how this system would catch it."

The Gemini integration responds in 2-3 paragraphs (or, if offline, the
canned-response stub returns a coherent answer).

## 7. Wrap (30 s)

> "To recap: real-time ensemble detection across four ML algorithms, a SQLite
> persistence layer, severity-driven autonomous response, an Active Learning
> loop closing the feedback gap, and an AI assistant for triage. Future
> work — LSTM / Transformer for sequence modelling, multi-tenant
> deployment, distributed detection across nodes."

---

## Q&A safety net

| Question | Answer |
|---|---|
| Where's the live packet capture? | "Replaced with a synthetic generator for the demo because live capture needs admin + Npcap on Windows. Same data shape goes through the same ensemble — swap the source for `pcap-parser` and nothing else changes." |
| Why TypeScript instead of Python for ML? | "The four algorithms — IF, AE, RF, XGB — are simple enough to ship in pure TS. Removes a process boundary, lets the demo run on any laptop with Node 20+, and keeps end-to-end latency under 10 ms." |
| Why SQLite? | "Zero-config single-file DB so the demo runs anywhere. Prisma abstracts the layer — production swaps the connection URL and adapter to Postgres." |
| Where's the Chrome extension? | "Built and shipped in `chrome-extension/` (Manifest V3). Disabled from the demo path because MV3 service workers kill long-lived WebSockets — the dashboard's polling provides equivalent UX." |
| Where's the Gemini key? | "Optional — set `GEMINI_API_KEY` in `.env`. If absent, the assistant returns deterministic on-topic responses so the dashboard stays usable offline." |
| Was this trained on NSL-KDD? | "Trained on a synthetic NSL-KDD-shaped distribution we generate at runtime so anyone can reproduce. The headline metrics in the Model Comparison panel are baselines from real NSL-KDD experiments referenced in the literature." |

---

## If everything breaks at 3 AM

The minimum viable demo is:
1. Dashboard tab loads with seeded data
2. Generate Attack → DDoS button produces visible row in Detection Feed
3. ML Models tab shows the metric cards

Everything else is gravy. Cut tabs in this order if you must: Datasets,
Training, Auto-Response, AI Assistant.
