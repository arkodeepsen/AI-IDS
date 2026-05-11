#!/usr/bin/env python3
"""
Download the CICIDS-2017 cleaned/preprocessed mirror from Hugging Face and
convert it to the single-CSV layout that `scripts/prepare-cicids.ts`
expects in `data/cicids/raw/`.

Source: sonnh-tech1/cic-ids-2017 (Apache-2.0). The dataset ships three
configs; we pull the `raw` config which preserves CIC's original string
labels ("BENIGN", "DoS Hulk", etc.) so the existing
`classifyCICIDSLabel` mapping in `lib/ml/cicids.ts` keeps working
unchanged.

We chose this HF mirror over the originally-mentioned Kaggle dataset
(`ericanacletoribeiro/cicids2017-cleaned-and-preprocessed`) because
Kaggle requires authenticated downloads. The underlying CIC release is
the same.

Run with:
    python3 scripts/download-cicids.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

try:
    import pyarrow.parquet as pq
except ImportError:
    sys.exit("pyarrow required. Install with: pip install pyarrow")

try:
    from huggingface_hub import hf_hub_download
except ImportError:
    sys.exit("huggingface_hub required. Install with: pip install huggingface_hub")


REPO_ID = "sonnh-tech1/cic-ids-2017"
CONFIG = "raw"
NUM_SHARDS = 4
SHARD_TEMPLATE = "raw/train-{:05d}-of-{:05d}.parquet"

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "cicids" / "raw"
OUT_PATH = RAW_DIR / "cicids2017_cleaned.csv"


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    shard_paths: list[Path] = []
    for i in range(NUM_SHARDS):
        rel = SHARD_TEMPLATE.format(i, NUM_SHARDS)
        print(f"Downloading shard {i + 1}/{NUM_SHARDS}: {rel}")
        local = hf_hub_download(
            repo_id=REPO_ID,
            filename=rel,
            repo_type="dataset",
            cache_dir=str(ROOT / "data" / "cicids" / ".cache"),
        )
        shard_paths.append(Path(local))

    # First shard supplies the column order; later shards reuse it. We
    # write CSV with the canonical CIC column names so the existing
    # loader's normalised lookup matches without any per-column hint.
    print(f"\nMerging {len(shard_paths)} shards into {OUT_PATH} ...")
    header_written = False
    total_rows = 0
    with OUT_PATH.open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        for shard in shard_paths:
            table = pq.read_table(shard)
            cols = list(table.column_names)
            if not header_written:
                writer.writerow(cols)
                header_written = True
            # Iterate row-by-row over the shard. Parquet stores columnar
            # so we convert to pylist per column once and zip.
            arrays = [c.to_pylist() for c in table.columns]
            for row in zip(*arrays):
                writer.writerow(row)
                total_rows += 1
            print(f"  {shard.name}: +{table.num_rows} rows (running total {total_rows})")

    print(f"\nDone. Wrote {total_rows} rows to {OUT_PATH}")
    print("Next: npm run prepare:cicids && npm run train:cicids")


if __name__ == "__main__":
    main()
