# Cross-Dataset Methodology — NSL-KDD + CICIDS-2017

This document describes the dual-dataset evaluation methodology used by this
project, what it tests, and how to reproduce the CICIDS-2017 half of the
experiment.

The NSL-KDD half is fully reproducible from the repository's defaults (the
trained artefacts ship in `models/`). The CICIDS-2017 half requires a one-time
data download from CIC.

---

## Why two datasets

The IDS literature is dominated by NSL-KDD (a 1999-era dataset, cleaned up in
2009). It is small, well-known, and small enough to train on a laptop — but
its traffic captures predate modern attacks like Heartbleed, modern botnets,
and HTTP-layer DDoS. A model that scores 91 % F1 on NSL-KDD might be doing
nothing more than recognising 25-year-old artefacts.

CICIDS-2017 (Sharafaldin et al., 2018) was built to address this. It captures
five days of real traffic in 2017 with eight distinct attack scenarios
(brute force, DDoS, web attacks, Heartbleed, infiltration, botnet, port scan,
DoS family). Its 78 flow-level features are produced by CICFlowMeter and have
**zero overlap** with NSL-KDD's 41 connection-level features.

We train the same four-model ensemble — Isolation Forest, MLP autoencoder,
Random Forest, gradient-boosted trees — independently on each dataset. If the
methodology generalises, F1 should hold up across both. If it doesn't, we
learn something specific about which features matter.

---

## Methodology — parallel evaluation, not direct transfer

We deliberately do **not** attempt to apply NSL-KDD-trained models to CICIDS
rows or vice versa. The feature spaces are structurally different:

| Concept | NSL-KDD | CICIDS-2017 |
|---|---|---|
| Connection length | `duration` (s) | `Flow Duration` (μs) |
| Bytes | `src_bytes`, `dst_bytes` | 6 separate `*_Length_*` stats |
| Connection state | `flag` (categorical: SF/S0/REJ/…) | 8 separate flag counts |
| Service | `service` (one-hot: http/dns/…) | _not present_ |
| Protocol | `protocol_type` (tcp/udp/icmp) | _inferred from port_ |
| Host stats | `dst_host_*` counts | _not present_ |
| Flow stats | _not present_ | `Flow IAT *`, `Active *`, `Idle *` |

Forcing one feature set into the other's shape is research malpractice — the
resulting metrics measure the quality of the projection, not the model. We
publish two parallel evaluations instead, with the same ensemble architecture
and the same training pipeline, and compare the per-family detection
patterns.

This matters for production deployment: the runtime detector keeps using the
NSL-KDD-trained models (the project's `models/ensemble.json`), while the
CICIDS run is evidence that the methodology — not just one particular set of
weights — is sound.

---

## Reproduction — NSL-KDD half

```bash
npm install
npx prisma migrate deploy
npm run data:download    # downloads KDDTrain+.txt and KDDTest+.txt to data/
npm run train            # ~5 min on a single laptop CPU
npm run train:lstm       # optional sequence model (~5 s)
```

Outputs land in `models/`:

- `models/ensemble.json`   — serialised four-model ensemble
- `models/scaler.json`     — feature min/max
- `models/metrics.json`    — per-model accuracy / precision / recall / F1 / FPR
- `models/feature-meta.json` — column ordering and training metadata
- `models/lstm.json`       — LSTM weights
- `models/lstm-metrics.json` — LSTM metrics

Headline numbers (25 000 stratified train / 8 000 test):

| Model | Accuracy | F1 | FPR |
|---|---:|---:|---:|
| Isolation Forest | 80.94 % | 83.75 % | 25.53 % |
| Autoencoder | 78.75 % | 81.45 % | 24.82 % |
| Random Forest | 86.21 % | 87.22 % | 8.28 % |
| XGBoost | 86.91 % | 88.55 % | 14.99 % |
| **Ensemble** | **90.99 %** | **92.57 %** | 18.41 % |

---

## Reproduction — CICIDS-2017 half

### 1. Acquire the data (one-time)

Three options, in order of convenience:

**Kaggle preprocessed mirror (685 MB, single CSV)** — used by the headline
CICIDS results in `models/cicids/metrics.json`:

```python
import kagglehub
path = kagglehub.dataset_download(
    "ericanacletoribeiro/cicids2017-cleaned-and-preprocessed"
)
# move the cicids2017_cleaned.csv from <path> into data/cicids/raw/
```

Needs a Kaggle API token (`~/.kaggle/kaggle.json` or
`KAGGLE_USERNAME` / `KAGGLE_KEY` env vars).

**HuggingFace mirror (Apache-2.0, no token)** — `scripts/download-cicids.py`
pulls the 4-shard parquet from `sonnh-tech1/cic-ids-2017` and converts to
the expected CSV layout:

```bash
pip install pyarrow huggingface_hub
python3 scripts/download-cicids.py
```

**Official CIC release (raw, ~1.1 GB)** — fill in the academic-use form at
<https://www.unb.ca/cic/datasets/ids-2017.html>. Extract the eight per-day
CSVs into `data/cicids/raw/`. The loader handles the C1 control-byte
artefact in `Web Attack` labels and the `Flow Bytes/s` infinities.

### 2. Split into train + test

The `prepare:cicids` script auto-detects the input layout and picks the
right strategy:

```bash
npm run prepare:cicids       # auto-detect (default)
# or force a specific mode:
npx tsx scripts/prepare-cicids.ts --temporal     # Mon-Thu vs Fri (needs day-prefixed files)
npx tsx scripts/prepare-cicids.ts --random       # 80/20 IID
npx tsx scripts/prepare-cicids.ts --stratified   # 80/20 stratified per label (recommended for the Kaggle single-CSV)
```

For the Kaggle preprocessed mirror, `--stratified` is the right pick
because the file is a single combined CSV with no per-day prefix; the
script samples 80/20 per attack family to ensure rare classes appear in
both splits.

All modes write `data/cicids/train.csv` and `data/cicids/test.csv`.

### 4. Train the ensemble

```bash
npm run train:cicids
```

This streams the CSVs (the Friday capture is ~250 MB), stratifies by attack
family — keeping all WebAttack / Botnet / Infiltration rows because they are
rare — and trains the same four-model ensemble used for NSL-KDD.

Outputs land in `models/cicids/`:

- `models/cicids/ensemble.json`
- `models/cicids/scaler.json`
- `models/cicids/metrics.json` (includes a `perFamilyRecall` map)
- `models/cicids/feature-meta.json`

### 5. View the comparison

Open the dashboard → **Datasets** tab. The "Cross-Dataset Evaluation" card
shows the NSL-KDD numbers, the CICIDS-2017 numbers, the per-family CICIDS
recall, and the gap in ensemble F1 across the two datasets.

### CICIDS-2017 headline numbers (Kaggle preprocessed, `models/cicids/metrics.json`)

| Model | Accuracy | F1 | FPR |
|---|---:|---:|---:|
| Isolation Forest | 85.15 % | 39.76 % | 3.91 % |
| Autoencoder | 69.44 % | 45.12 % | 31.90 % |
| **Random Forest** | **99.69 %** | **99.05 %** | **0.18 %** |
| XGBoost | 98.34 % | 94.96 % | 0.99 % |
| **Ensemble** | **99.40 %** | **98.16 %** | **0.18 %** |

Per-attack-family recall (ensemble): Probe 99.7 %, DoS 97.4 %,
WebAttack 90.0 %, R2L 73.1 %, Botnet 33.3 % (3 test samples — sample
noise).

Honest finding: on CICIDS-2017 the ensemble F1 (98.16 %) is **slightly
below** Random Forest alone (99.05 %). The unsupervised pair injects
noise the dominant supervised model has to fight through. The same
methodology that lifts ensemble F1 +3.9 pts on NSL-KDD costs −1.4 pts
on CICIDS. See `docs/RESEARCH_FINDINGS.md` Finding 3 for the full subset
ablation that quantifies this.

---

## Implementation notes

### Imbalance handling

NSL-KDD: R2L and U2R are < 1 % of training rows. The trainer oversamples
them 6× before bootstrap sampling, otherwise the supervised models never see
them in a tree's bag.

CICIDS: WebAttack (~2 k rows), Botnet (~2 k), Infiltration (~36 rows) are
similarly rare. The trainer keeps **all** rows in those families and fills
the remainder of the budget proportionally from BENIGN / DoS / Probe / R2L.

Without stratification, Infiltration recall collapses to single-digit
percent because the family is statistically invisible in any random
subsample.

### Numeric edge cases

`Flow Bytes/s` and `Flow Packets/s` are computed by CIC as
`bytes / duration`; when `Flow Duration` is zero (single-packet flows) the
result is `Infinity`. The CICIDS loader clamps these to `1e12` so the
min-max scaler doesn't degenerate.

NaN values (rare, ~0.01 % of rows) are coerced to zero rather than dropped,
matching common practice in published CICIDS baselines.

### Label normalisation

CIC's CSV exporter leaks the C1 control byte `U+0096` between "Web Attack"
and the variant (a known artefact of their latin-1-then-utf-8 pipeline).
`classifyCICIDSLabel` strips C1 control bytes and collapses whitespace
before mapping to the canonical family taxonomy.

### Why the four-model ensemble (not deep learning end-to-end)?

The literature consistently shows that on tabular IDS data, gradient-boosted
trees and Random Forests beat deeper architectures (and beat them by larger
margins than on image / text tasks). The Isolation Forest and Autoencoder
contribute unsupervised signal that catches novel attack patterns the
supervised pair haven't seen. Weight-normalised voting (see
`lib/ml/ensemble.ts`) lets the active-learning loop rebalance the four
contributions from operator feedback at runtime.

The LSTM is a deliberately separate model trained on sliding 8-flow
windows. It exists to compare flow-level vs. sequence-level evidence, not
as a replacement for the ensemble. CICIDS-2017's flow records aren't
naturally ordered into sessions, so we don't train an LSTM on the CICIDS
half.

---

## File map

```
lib/ml/cicids.ts            — CICIDS feature pipeline (loader, scaler, classifier)
scripts/prepare-cicids.ts   — splits raw CIC CSVs → train.csv / test.csv
scripts/train-cicids.ts     — trains the four-model ensemble on CICIDS
components/CrossDatasetMetrics.tsx — Dashboard card showing the comparison
app/api/metrics/route.ts    — exposes both NSL-KDD and CICIDS metrics
lib/ml/loader.ts            — loadCICIDSMetrics() reads models/cicids/metrics.json
```

---

## References

- Tavallaee et al., 2009. _A detailed analysis of the KDD CUP 99 data set._
  IEEE CISDA.
- Sharafaldin, Lashkari, Ghorbani, 2018. _Toward generating a new intrusion
  detection dataset and intrusion traffic characterization._ ICISSP.
- Liu, Ting, Zhou, 2008. _Isolation Forest._ IEEE ICDM.
- Chen and Guestrin, 2016. _XGBoost: A scalable tree boosting system._ KDD.
