'use client';

import { useState } from 'react';
import type { DatasetInfo as DatasetInfoType } from '@/lib/types';
import { datasets } from '@/lib/utils';
import { Database, FileText, Layers } from 'lucide-react';

export default function DatasetInfo() {
  const [selectedDataset, setSelectedDataset] = useState<DatasetInfoType>(datasets[0]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium text-white">Dataset Information</h2>
          <p className="text-xs text-zinc-500">Benchmark datasets for IDS research</p>
        </div>
        <div className="flex gap-1">
          {datasets.map((ds) => (
            <button
              key={ds.name}
              onClick={() => setSelectedDataset(ds)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                selectedDataset.name === ds.name
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {ds.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dataset Overview */}
        <div className="space-y-3">
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-medium text-white">{selectedDataset.name}</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {selectedDataset.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-800/50 rounded">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span className="text-xs">Samples</span>
              </div>
              <p className="text-lg font-semibold text-white">
                {selectedDataset.totalSamples.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-xs">Features</span>
              </div>
              <p className="text-lg font-semibold text-white">
                {selectedDataset.features}
              </p>
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="space-y-3">
          <div className="p-3 bg-zinc-800/50 rounded">
            <span className="text-xs text-zinc-500">Class Distribution</span>
            <div className="flex gap-4 mt-2">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">Normal</span>
                  <span className="text-xs text-green-400">
                    {(selectedDataset.normalRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${selectedDataset.normalRatio * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">Attack</span>
                  <span className="text-xs text-red-400">
                    {(selectedDataset.attackRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{ width: `${selectedDataset.attackRatio * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-800/50 rounded">
            <p className="text-xs text-zinc-500 mb-2">Attack Types</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedDataset.attackTypes.map((type) => (
                <span
                  key={type}
                  className="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-xs"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Research Applications */}
      <div className="mt-4 p-3 bg-zinc-800/30 border border-zinc-800 rounded">
        <h4 className="text-xs font-medium text-white mb-2">Research Applications</h4>
        <ul className="grid grid-cols-2 gap-1.5 text-xs text-zinc-400">
          <li className="flex items-center gap-1.5">
            <span className="w-1 h-1 bg-blue-400 rounded-full" />
            Anomaly detection benchmarking
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-1 h-1 bg-blue-400 rounded-full" />
            False positive reduction
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-1 h-1 bg-blue-400 rounded-full" />
            Multi-class classification
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-1 h-1 bg-blue-400 rounded-full" />
            Real-time detection
          </li>
        </ul>
      </div>
    </div>
  );
}
