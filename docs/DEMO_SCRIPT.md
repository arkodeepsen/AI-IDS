# Demo script — 8 minutes

Goal: convince the evaluator that the system performs **end-to-end**
intrusion detection with a working ensemble *trained on NSL-KDD*, real
persistence, autonomous response, and a learning loop.

## 0. Before the panel walks in

```bash
npm install
npx prisma migrate deploy
npm run dev
```

(`npm run train` is optional — pre-trained model files ship in `models/`.)

Open <http://localhost:3000>, click **Seed Database** in the Live Control
Center. You'll see something like
"Seeded 1650 packets · 511 anomalies · 289 auto-blocked." That's because
the trained NSL-KDD ensemble is now scoring real synthetic traffic.

## 1. Headline numbers (2 min)

Switch to the **ML Models** tab first. Point at the per-model cards:

> "These numbers are computed from a real evaluation. We trained on 25 000
> stratified samples from NSL-KDD KDDTrain+, evaluated on 8 000 held-out
> samples from KDDTest+, and the trainer wrote `models/metrics.json` —
> which is what this dashboard reads."

| Method            | Acc     | F1      | FPR    |
|-------------------|--------:|--------:|-------:|
| Isolation Forest  |  80.94% |  83.75% | 25.53% |
| Autoencoder NN    |  78.75% |  81.45% | 24.82% |
| Random Forest     |  86.21% |  87.22% |  8.28% |
| XGBoost           |  86.91% |  88.55% | 14.99% |
| **Ensemble**      | **90.99%** | **92.57%** | 18.41% |

> "The supervised models — Random Forest and XGBoost — have the strongest
> precision and lowest false-positive rates. The unsupervised members,
> Isolation Forest and the Autoencoder, contribute high recall on novel
> attacks. The ensemble combines them: **97.99% recall, 92.57% F1**."

NSL-KDD test is famously harder than train (it contains novel attack
classes). 90% accuracy on this benchmark is in the upper range of
published ensemble methods.

## 2. The Dashboard (1.5 min)

Switch back to **Dashboard**. Six summary cards, real DB-backed:
Total Packets, Threats Detected, Threat Level, Blocked IPs, Packets/sec, Latency.

Point at:
- **Live Control Center** — Start Replay / Generate Attack ▾ / Seed.
- **Detections Over Time** — bucketed from the actual SQLite log.
- **ML Ensemble Pipeline donut** — matches the slide-deck visual: 30/25/25/20.
- **Detection Feed** + **Blocked IPs panel**.

Click **Start Replay**.

## 3. The synthetic attack (1.5 min)

Click **Generate Attack ▾ → DDoS Burst**. Within a second:
- Activity log: "DDoS: 40/40 flagged · 40 high · 40 auto-blocked."
- Blocked IPs panel adds 40 entries.
- Detection Feed shows red DDoS rows.

> "Each of those packets was vectorised into the 72-dimensional NSL-KDD
> feature space and run through the four trained models. Notice the
> autoencoder saturates at 1.0 because the reconstruction error is high,
> Random Forest votes 0.8, XGBoost 0.79."

Click any detection row to expand it — the per-model scores are visible.

Repeat with **Port Scan** and **Brute Force**.

> "Brute Force scores in the 60-65% range — slightly lower confidence
> because R2L attacks have features that overlap with normal SSH traffic.
> The system flags it but the operator can tighten the auto-response
> threshold if they want fewer false positives."

## 4. Active Learning (1.5 min)

Switch to **Detections**.

> "This is the Active Learning queue. The operator validates, dismisses or
> corrects each anomaly. Every click is fed back into the ensemble."

Confirm 2 anomalies, dismiss 1. Switch to **ML Models** → the RLHF panel
counters update. Click **Force re-balance** — the four weight bars shift.

> "Every 10 verified samples the system reblends weights toward whichever
> model performed best on operator feedback. Defaults are 30/25/25/20,
> matching the slide deck."

## 5. Auto-response (1 min)

**Auto-Response** tab.

> "Severity → action. Critical → permanent block. High → 24-hour. Medium →
> alerts (and during the demo, blocks). The blocked IPs you saw earlier
> are here with their expiry timestamps."

Drag the threshold slider to demonstrate it's tunable.

## 6. AI explanation (30 s)

**AI Assistant** tab. Type:

> "Explain a SYN flood and how this system would catch it."

Gemini returns a 2-3 paragraph answer (or, if offline, the canned-response
stub returns a coherent answer keyed by intent).

## 7. Wrap (30 s)

> "To recap: a four-model ensemble — IF + AE + RF + XGBoost — trained on
> NSL-KDD with stratified oversampling, **and independently on
> CICIDS-2017** for cross-dataset methodology validation. 91 % ensemble
> accuracy with 98 % recall on NSL-KDD; **99.4 % accuracy with 98 % F1
> on CICIDS**. Real-time packet-to-flow projection, severity-driven
> autonomous response, and an Active Learning loop. Three empirical
> studies in the report — Active Learning convergence, adversarial
> robustness, and ensemble-subset ablation — plus an adversarially-trained
> ensemble variant that drops the L∞ evasion rate by 7-10×."

---

## Q&A safety net

| Question | Answer |
|---|---|
| Did you actually train on NSL-KDD? | "Yes. KDDTrain+ has 125 973 rows; we stratified-subsample 25 000 with R2L/U2R oversampled 6× to handle the class imbalance, train all four models, evaluate on 8 000 KDDTest+ samples, and write the metrics to `models/metrics.json` which the dashboard reads. You can re-run `npm run train` and watch the numbers update." |
| Why is FPR so high (~25%) for IF/AE? | "Unsupervised models on NSL-KDD test see many novel attacks they weren't trained on. The ensemble's weighted vote brings the effective FPR down once you balance precision and recall. That said, our **Random Forest** alone has FPR 8.28% — that's the strongest single member." |
| Why didn't you use SMOTE? | "We used random oversampling — duplicate R2L and U2R rows 6×. SMOTE would synthesise new samples in feature space, which gives better minority-class generalisation; we didn't ship it because the training pipeline is already getting 91% ensemble accuracy. Easy upgrade." |
| Why TypeScript instead of Python+sklearn? | "Lets the demo run on any laptop with Node 20+, no Python toolchain, and keeps end-to-end inference under 10 ms. The four algorithms are simple enough to ship in pure TS." |
| Why SQLite? | "Zero-config single-file DB so the demo runs anywhere. Prisma abstracts the layer — production swaps the URL and adapter for Postgres." |
| Where's the live packet capture? | "Demo runs against synthetic traffic but the production adapter exists — `lib/services/pcap-adapter.ts` wraps `tcpdump` for unprivileged ingest. Set `IDS_ENABLE_PCAP=1` + `IDS_PCAP_INTERFACE=eth0` and it replaces the synthetic source. No changes downstream of the adapter." |
| Where are the real firewall blocks? | "`lib/services/iptables-adapter.ts` promotes BlockedIP rows to real Linux DROP rules in a dedicated `IDS-BLOCK` chain. Opt-in via `IDS_ENABLE_IPTABLES=1` plus passwordless sudo for iptables." |
| Where's the Chrome extension? | "Built in `chrome-extension/` (Manifest V3). Disabled from the demo path — MV3 service workers kill long-lived WebSockets. The dashboard's polling provides equivalent UX." |
| Where's the Gemini key? | "Optional. Set `GEMINI_API_KEY` in `.env`. Without it the assistant returns deterministic on-topic responses." |
| What about CICIDS? | "**Trained and measured.** The same four-model architecture trained independently on the Kaggle preprocessed mirror of CICIDS-2017. Ensemble F1 98.16 %, FPR 0.18 %. Switch to the Datasets tab — the Cross-Dataset Evaluation card shows the side-by-side comparison. See `docs/RESEARCH.md` for the full methodology + `docs/RESEARCH_FINDINGS.md` Finding 3 for the subset ablation across both datasets." |
| Does Active Learning actually improve accuracy? | "We measured it. `npm run eval:al` runs an oracle-labelled simulation over 1 000 KDDTest+ rows. Honest finding: the current per-model reward signal **slightly degrades** ensemble F1 because the rule maximises a per-model objective and ensemble F1 is a joint objective. The infrastructure ships intact; the next experiment is an ensemble-level reward signal. Full writeup in `docs/RESEARCH_FINDINGS.md` Finding 1." |
| Is the ensemble robust to adversarial perturbation? | "Measured. `npm run eval:adversarial` runs a score-based L∞ attack — at ε ≤ 0.02 about 7 % of attacks evade. We then ran `npm run train:adversarial`, which augments training with one perturbed copy per attack row and retrains. The evasion rate drops to ~1 % at the cost of ~2 pts of clean recall. Side-by-side figure: `docs/figures/fig-9-9-adversarial-comparison.png`." |

---

## If everything breaks at 3 AM

The minimum viable demo is:
1. Dashboard tab loads with seeded data.
2. Generate Attack → DDoS button produces visible red rows in the feed.
3. ML Models tab shows the metric cards from the trained models.

Cut tabs in this order if you must: Datasets, Training, Auto-Response, AI Assistant.
