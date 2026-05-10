#!/usr/bin/env bash
# Downloads the NSL-KDD KDDTrain+ and KDDTest+ files into ./data/
# Source: https://github.com/jmnwong/NSL-KDD-Dataset (mirror of the original
# UNB Canadian Institute for Cybersecurity dataset)

set -euo pipefail

mkdir -p data

base="https://raw.githubusercontent.com/jmnwong/NSL-KDD-Dataset/master"

echo "Downloading KDDTrain+.txt …"
curl -fL --retry 3 -o data/KDDTrain+.txt "$base/KDDTrain%2B.txt"

echo "Downloading KDDTest+.txt …"
curl -fL --retry 3 -o data/KDDTest+.txt "$base/KDDTest%2B.txt"

echo "Done. Sizes:"
ls -lh data/KDDTrain+.txt data/KDDTest+.txt
