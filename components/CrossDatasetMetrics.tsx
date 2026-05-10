'use client';

/**
 * Cross-dataset comparison card for the Datasets tab.
 *
 * Pulls live metrics from /api/metrics. When the user has trained CICIDS-2017
 * (via `npm run train:cicids`), this card surfaces a side-by-side comparison
 * of the four-model ensemble's performance on NSL-KDD vs CICIDS-2017. If
 * CICIDS hasn't been trained yet, it shows the reproduction steps inline.
 */

import { useEffect, useState } from 'react';
import { GitCompare, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PerModel {
  method: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
}

interface CrossDatasetPayload {
  dataset: string;
  trainedAt: string;
  trainingSamples: number;
  testingSamples: number;
  perModel: PerModel[];
  perFamilyRecall: Record<string, number> | null;
  classDistribution: {
    train: Record<string, number>;
    test: Record<string, number>;
  };
}

interface MetricsResponse {
  metrics: PerModel[];
  training: { dataset?: string; trainingSamples?: number; testingSamples?: number };
  crossDataset: CrossDatasetPayload | null;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export default function CrossDatasetMetrics() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics')
      .then(r => r.json())
      .then(j => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-xs text-zinc-500">Loading cross-dataset metrics…</p>
      </div>
    );
  }

  const kddEnsemble = data?.metrics.find(m => m.method === 'Ensemble');
  const cicEnsemble = data?.crossDataset?.perModel.find(m => m.method === 'Ensemble');

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-cyan-400" />
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Cross-Dataset Evaluation
          </h2>
        </div>
        {data?.crossDataset ? (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Both datasets trained
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            CICIDS pending
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        The same four-model ensemble architecture (Isolation Forest, Autoencoder, Random Forest,
        XGBoost) is trained independently on each benchmark. Consistent F1 across structurally
        different feature spaces is evidence the methodology generalises rather than overfitting
        NSL-KDD quirks.
      </p>

      {data?.crossDataset && kddEnsemble && cicEnsemble ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DatasetCard
              title="NSL-KDD (KDDTrain+ / KDDTest+)"
              samples={data.training.trainingSamples ?? 0}
              testSamples={data.training.testingSamples ?? 0}
              ensemble={kddEnsemble}
              accent="emerald"
            />
            <DatasetCard
              title={`${data.crossDataset.dataset}`}
              samples={data.crossDataset.trainingSamples}
              testSamples={data.crossDataset.testingSamples}
              ensemble={cicEnsemble}
              accent="cyan"
            />
          </div>

          {data.crossDataset.perFamilyRecall && (
            <div className="p-3 bg-zinc-800/50 rounded">
              <p className="text-xs text-zinc-500 mb-2">
                CICIDS-2017 per-family recall — which attack families the ensemble catches
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(data.crossDataset.perFamilyRecall).map(([family, recall]) => (
                  <div
                    key={family}
                    className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded"
                  >
                    <p className="text-xs text-zinc-500">{family}</p>
                    <p
                      className={`text-sm font-semibold ${
                        recall >= 0.8
                          ? 'text-emerald-400'
                          : recall >= 0.5
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {fmtPct(recall)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 bg-zinc-800/30 border border-zinc-800 rounded">
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-white font-medium">Finding.</span> The architecture transfers:
              ensemble F1 differs by {Math.abs((kddEnsemble.f1Score - cicEnsemble.f1Score) * 100).toFixed(1)}{' '}
              percentage points across two datasets that share zero features. NSL-KDD has 41
              connection-level features; CICIDS-2017 has 78 CICFlowMeter flow statistics.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-zinc-800/30 border border-zinc-800 rounded">
            <p className="text-xs text-zinc-400 mb-2">
              Train CICIDS-2017 to enable cross-dataset comparison:
            </p>
            <pre className="text-xs text-cyan-300 bg-zinc-950 p-2 rounded overflow-x-auto">
{`# 1. Download CICIDS-2017 CSVs to data/cicids/raw/
#    Source: https://www.unb.ca/cic/datasets/ids-2017.html

# 2. Split into train/test (temporal split: Mon-Thu vs Fri)
npx tsx scripts/prepare-cicids.ts --temporal

# 3. Train the ensemble
npm run train:cicids`}
            </pre>
          </div>
          <p className="text-xs text-zinc-500">
            Full reproduction steps in <code className="text-zinc-300">docs/RESEARCH.md</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function DatasetCard({
  title,
  samples,
  testSamples,
  ensemble,
  accent,
}: {
  title: string;
  samples: number;
  testSamples: number;
  ensemble: PerModel;
  accent: 'emerald' | 'cyan';
}) {
  const accentBorder = accent === 'emerald' ? 'border-emerald-500/30' : 'border-cyan-500/30';
  const accentText = accent === 'emerald' ? 'text-emerald-400' : 'text-cyan-400';

  return (
    <div className={`p-3 bg-zinc-800/50 border ${accentBorder} rounded`}>
      <h3 className={`text-sm font-medium ${accentText} mb-2`}>{title}</h3>
      <p className="text-xs text-zinc-500 mb-3">
        {samples.toLocaleString()} train / {testSamples.toLocaleString()} test
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Accuracy" value={fmtPct(ensemble.accuracy)} />
        <Stat label="F1" value={fmtPct(ensemble.f1Score)} />
        <Stat label="Precision" value={fmtPct(ensemble.precision)} />
        <Stat label="Recall" value={fmtPct(ensemble.recall)} />
        <Stat label="FPR" value={fmtPct(ensemble.falsePositiveRate)} highlightLow />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlightLow,
}: {
  label: string;
  value: string;
  highlightLow?: boolean;
}) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className={highlightLow ? 'text-amber-300 font-semibold' : 'text-white font-semibold'}>
        {value}
      </p>
    </div>
  );
}
