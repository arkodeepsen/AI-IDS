'use client';

import { useState, useEffect } from 'react';
import { DatasetInfo } from '@/lib/types';
import { datasets } from '@/lib/utils';
import { Database, FileText, Layers, PieChart } from 'lucide-react';

export default function DatasetInfo() {
  const [selectedDataset, setSelectedDataset] = useState<DatasetInfo>(datasets[0]);

  return (
    <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Dataset Information</h2>
          <p className="text-gray-400 text-sm">Benchmark datasets for IDS research</p>
        </div>
        <div className="flex gap-2">
          {datasets.map((ds) => (
            <button
              key={ds.name}
              onClick={() => setSelectedDataset(ds)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedDataset.name === ds.name
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {ds.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dataset Overview */}
        <div className="space-y-4">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <Database className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-medium text-white">{selectedDataset.name}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              {selectedDataset.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Total Samples</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {selectedDataset.totalSamples.toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <Layers className="w-4 h-4" />
                <span className="text-sm">Features</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {selectedDataset.features}
              </p>
            </div>
          </div>
        </div>

        {/* Attack Types & Distribution */}
        <div className="space-y-4">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-2 text-gray-400 mb-3">
              <PieChart className="w-4 h-4" />
              <span className="text-sm">Class Distribution</span>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Normal</span>
                  <span className="text-sm text-green-400">
                    {(selectedDataset.normalRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${selectedDataset.normalRatio * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Attack</span>
                  <span className="text-sm text-red-400">
                    {(selectedDataset.attackRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 rounded-full"
                    style={{ width: `${selectedDataset.attackRatio * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/50 rounded-lg">
            <p className="text-sm text-gray-400 mb-3">Attack Types</p>
            <div className="flex flex-wrap gap-2">
              {selectedDataset.attackTypes.map((type) => (
                <span
                  key={type}
                  className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-sm"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Research Applications */}
      <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-2">Research Applications</h4>
        <ul className="grid grid-cols-2 gap-2 text-sm text-gray-300">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            Anomaly detection benchmarking
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            False positive reduction research
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            Multi-class attack classification
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            Real-time detection evaluation
          </li>
        </ul>
      </div>
    </div>
  );
}
