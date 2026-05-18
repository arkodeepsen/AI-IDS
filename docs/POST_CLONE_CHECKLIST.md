# Post-Clone Checklist

Everything you need to do after `git clone` to get the project running,
ship the report, and demo the system. Each step has an estimated time
and a "skip if" hint.

---

## 1. Minimum viable setup (~5 minutes)

```bash
git clone <repo-url> && cd <repo>
npm install                                # ~2 min
npx prisma migrate deploy                  # creates prisma/dev.db
```

The repo ships pre-trained model artefacts in `models/` — you do **not**
have to retrain to demo.

---

## 2. Run the dashboard locally (~30 seconds)

```bash
npm run dev                                # http://localhost:3000
curl -X POST 'http://localhost:3000/api/seed?force=1'
```

The `force=1` flag wipes the existing seed and writes ~1.6k fresh
synthetic packets timestamped within the last 7 days, so the dashboard's
"24h" stat cards actually show non-zero numbers.

Browse to <http://localhost:3000>. Click around the tabs. Verify:

- **Dashboard** tab — Total Packets / Threats Detected / etc are non-zero.
- **Detections** tab — anomalies with Confirm/Dismiss buttons.
- **ML Models** tab — per-model metrics for NSL-KDD ensemble.
- **Datasets** tab — NSL-KDD + CICIDS-2017 side-by-side.

Skip if: you only want to inspect the code without running it.

---

## 3. (Optional) Re-shoot dashboard screenshots for the report (~10 min)

The committed dashboard screenshots in `docs/figures/fig-10-1-*.png` were
captured under sandbox conditions where the SSE event stream kept Chrome
alive past its budget and some shots show empty stat cards. On your
laptop the captures will look right.

```bash
# Make sure dev server is running and seeded (see step 2).
# Then screenshot each tab:
for tab in dashboard detection models auto-response training datasets alerts assistant; do
  google-chrome \
    --headless=new --disable-gpu \
    --window-size=1440,1500 \
    --hide-scrollbars \
    --virtual-time-budget=10000 \
    --screenshot=docs/figures/fig-10-1-$tab.png \
    "http://localhost:3000/?tab=$tab"
done
```

The `?tab=<id>` query param is supported by `app/page.tsx` (added in this
branch). Tab IDs: `dashboard`, `detection`, `models`, `auto-response`,
`training`, `datasets`, `alerts`, `assistant`.

Skip if: the existing screenshots are fine for your needs.

---

## 4. (Optional) Retrain the ensembles from scratch (~12 minutes total)

```bash
npm run data:download                      # ~5 s   — fetches KDDTrain+/Test+
npm run train                              # ~5 min — NSL-KDD ensemble
npm run train:lstm                         # ~5 s   — LSTM sequence model
# CICIDS requires the Kaggle file in data/cicids/raw/ (see docs/RESEARCH.md §1)
npm run prepare:cicids                     # ~1 min — stratified 80/20 split
npm run train:cicids                       # ~2 min — CICIDS ensemble
npm run train:adversarial                  # ~6 min — adversarially-augmented retrain
```

Skip if: you trust the pre-committed model artefacts (they're real and
were used to generate the report figures).

---

## 5. (Optional) Run the empirical studies (~10 minutes total)

```bash
pip install matplotlib graphviz huggingface_hub pyarrow    # one-time Python deps

npm run eval:al                            # ~30 s — Active Learning convergence
python3 scripts/plot-al-curve.py           # writes models/active-learning-curve.png

npm run eval:adversarial                   # ~3 min — robustness audit
python3 scripts/plot-adversarial.py        # writes models/adversarial-audit.png

npm run eval:ablation                      # ~1 min — subset ablation
python3 scripts/plot-ablation.py           # writes models/ablation.png

# After train:adversarial (step 4):
python3 scripts/plot-adversarial-comparison.py
# writes docs/figures/fig-9-9-adversarial-comparison.png

# Regenerate architecture diagrams + confusion matrix + ROC:
python3 scripts/generate-report-figures.py
```

Skip if: the JSON + PNG artefacts already in `models/` and
`docs/figures/` are what you want to ship.

---

## 6. Drop figures into the report (~20 min)

The 17 paper figures live in `docs/figures/`. The mapping to the report
TOC is in `docs/figures/README.md`:

| Report ref | File |
|---|---|
| Fig 3.1 | `docs/figures/fig-3-1-system-architecture.png` |
| Fig 4.1 | `docs/figures/fig-4-1-feature-pipeline.png` |
| Fig 4.2 | `docs/figures/fig-4-2-ensemble-voting.png` |
| Fig 4.3 | `docs/figures/fig-4-3-lstm-architecture.png` |
| Fig 5.1 | `docs/figures/fig-5-1-active-learning-loop.png` |
| Fig 6.1 | `docs/figures/fig-6-1-auto-response-flow.png` |
| Fig 9.1 | `docs/figures/fig-9-1-confusion-matrix.png` |
| Fig 9.2 | `docs/figures/fig-9-2-roc-curve.png` |
| Fig 9.9 | `docs/figures/fig-9-9-adversarial-comparison.png` (adv-training comparison) |
| Fig 10.1 | `docs/figures/fig-10-1-{dashboard,detection,models,auto-response,training,datasets,alerts,assistant}.png` |
| AL curve | `models/active-learning-curve.png` (referenced from §9.8) |
| Adv audit | `models/adversarial-audit.png` (referenced from §9.9) |
| Ablation | `models/ablation.png` (referenced from §9.10) |

If the Word doc was hand-typed (not auto-generated from
`docs/PROJECT_REPORT.md`), also apply the front-matter fixes in
`docs/REPORT_PDF_FIXES.md` — supervisor name spelling, three different
front-matter dates, broken acknowledgement grammar, Word section
auto-numbering reset.

Skip if: you're regenerating the report PDF from the canonical markdown
(`docs/PROJECT_REPORT.md`) via pandoc / similar.

---

## 7. (Optional) Turn on the operational adapters

Only relevant if you want the dashboard to actually block IPs / send
alerts / capture real packets.

```bash
# Linux iptables enforcement (needs passwordless sudo for iptables)
export IDS_ENABLE_IPTABLES=1

# Real packet capture (Linux, tcpdump must be installed)
export IDS_ENABLE_PCAP=1
export IDS_PCAP_INTERFACE=eth0       # your active NIC

# Outbound alert sinks
export ALERT_WEBHOOK_URL='https://...'
export ALERT_SLACK_WEBHOOK_URL='https://hooks.slack.com/...'
export ALERT_EMAIL_TO='you@example.com'   # uses local sendmail
export ALERT_MIN_SEVERITY=high            # default

npm run dev                                # restart so the adapters pick up env
```

All four adapters are fail-safe: if a webhook is down or iptables isn't
available, errors are logged and the system continues. The in-database
`BlockedIP` table stays the authoritative source.

Skip if: you're only running the demo.

---

## 8. (Optional) Chrome extension

1. `chrome://extensions` → enable Developer Mode.
2. "Load unpacked" → pick the `chrome-extension/` folder.
3. Pin the icon. The badge shows the live anomaly count from the running
   dashboard.

Skip if: not relevant for the panel.

---

## 9. Decide what to do with the open PRs

This branch (`claude/future-work-batch`) is PR #5. Earlier PRs:

- **PR #1, #2, #3, #4** — all merged into main.
- **PR #5** — current branch with the empirical studies, figures, and
  operational adapters. Review and merge when ready.

After merging PR #5, the canonical `main` will have everything.

---

## What to read first

Order of importance:

1. **`README.md`** — the new headline numbers + contributions list.
2. **`docs/RESEARCH_FINDINGS.md`** — the three empirical studies.
   Suitable as a paper appendix.
3. **`docs/PROJECT_REPORT.md` §§9.5–9.10** — same findings tightened into
   report subsections.
4. **`docs/figures/README.md`** — figure manifest.
5. **`docs/REPORT_PDF_FIXES.md`** — Word doc cleanup checklist.
6. **`docs/RESEARCH.md`** — CICIDS reproduction recipe (Kaggle / HF /
   official CIC).
7. **`docs/ARCHITECTURE.md`** — service-layer detail + the new
   operational adapter table.
8. **`docs/DEMO_SCRIPT.md`** — 8-minute demo talk track for the panel.

---

## If anything is broken

The build invariant is:

```bash
npx tsc --noEmit                           # zero errors
npm run build                              # all 14 routes compile
```

Both pass cleanly on this branch.

If the dashboard "24h" stat cards show zero despite seeding, the seed
timestamps were older than 24h. Re-seed with `?force=1` (which back-dates
the synthetic packets across the past week with the most recent in the
last hour).
