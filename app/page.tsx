'use client';

import { useState, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import StatsCards from '@/components/StatsCards';
import TrafficChart from '@/components/TrafficChart';
import DetectionFeed from '@/components/DetectionFeed';
import ModelComparison from '@/components/ModelComparison';
import AIAssistant from '@/components/AIAssistant';
import AlertsPanel from '@/components/AlertsPanel';
import DatasetInfo from '@/components/DatasetInfo';
import LiveControl from '@/components/LiveControl';
import EnsembleDonut from '@/components/EnsembleDonut';
import BlockedIPsPanel from '@/components/BlockedIPsPanel';
import LSTMPanel from '@/components/LSTMPanel';
import {
  RLHFFeedbackPanel,
  AutoResponseControl,
  TrainingDataManager,
} from '@/components/controls';
import { Shield } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  // Bumped whenever something changes server-side so children re-fetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-wide">
              AI-Based Intrusion Detection System
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Ensemble ML · Active Learning · Autonomous response
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
            <span className="status-dot active" />
            Detector online · 4-model ensemble
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-4 fade-in">
            <StatsCards />
            <LiveControl onChange={triggerRefresh} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <TrafficChart refreshKey={refreshKey} />
              </div>
              <EnsembleDonut />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DetectionFeed refreshKey={refreshKey} />
              </div>
              <BlockedIPsPanel refreshKey={refreshKey} />
            </div>
          </div>
        )}

        {activeTab === 'detection' && (
          <div className="space-y-4 fade-in">
            <StatsCards />
            <LiveControl onChange={triggerRefresh} />
            <DetectionFeed
              anomalyOnly
              showFeedback
              intervalMs={3000}
              refreshKey={refreshKey}
            />
          </div>
        )}

        {activeTab === 'models' && (
          <div className="space-y-4 fade-in">
            <ModelComparison />
            <LSTMPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RLHFFeedbackPanel />
              <EnsembleDonut />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-base font-semibold text-white mb-3 tracking-wide uppercase">
                Research Contribution
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  {
                    title: 'Ensemble Detection',
                    body:
                      'Comparison of Isolation Forest, Autoencoder, Random Forest and XGBoost for IDS.',
                  },
                  {
                    title: 'False-Positive Reduction',
                    body: 'Weighted scoring across 4 ML methods drives the FPR below 1%.',
                  },
                  {
                    title: 'Active Learning (HITL)',
                    body:
                      'Operator feedback re-balances ensemble weights every 10 verified samples.',
                  },
                  {
                    title: 'Autonomous Response',
                    body: 'Severity-driven auto-block with configurable thresholds and TTLs.',
                  },
                ].map(card => (
                  <div key={card.title} className="p-3 bg-zinc-800/50 rounded border border-zinc-800">
                    <h3 className="text-sm font-medium text-white mb-1">{card.title}</h3>
                    <p className="text-xs text-zinc-400">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'auto-response' && (
          <div className="space-y-4 fade-in">
            <AutoResponseControl />
            <BlockedIPsPanel refreshKey={refreshKey} />
          </div>
        )}

        {activeTab === 'training' && (
          <div className="fade-in">
            <TrainingDataManager />
          </div>
        )}

        {activeTab === 'datasets' && (
          <div className="space-y-4 fade-in">
            <DatasetInfo />
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-base font-semibold text-white mb-3 tracking-wide uppercase">
                Feature Engineering
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-zinc-400 mb-2">Network Flow Features</h3>
                  <ul className="space-y-1.5 text-xs text-zinc-500">
                    {[
                      'Duration — Connection length',
                      'Protocol — TCP, UDP, ICMP',
                      'Src/Dst Bytes — Data transferred',
                      'Flag Status — TCP flags',
                      'Service — HTTP, FTP, SSH',
                    ].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-cyan-400 rounded-full" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm text-zinc-400 mb-2">Statistical Features</h3>
                  <ul className="space-y-1.5 text-xs text-zinc-500">
                    {[
                      'IP entropy — randomness of source/dst',
                      'Connection count — same-host history',
                      'SYN error rate',
                      'Same-service ratio',
                      'Packet size statistics',
                    ].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-emerald-400 rounded-full" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-4 fade-in">
            <StatsCards />
            <AlertsPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DetectionFeed anomalyOnly refreshKey={refreshKey} />
              <AIAssistant />
            </div>
          </div>
        )}

        {activeTab === 'assistant' && (
          <div className="space-y-4 fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <AIAssistant />
              </div>
              <EnsembleDonut />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span className="text-zinc-500 text-xs">
                AI-IDS · Major Project 2025-26 · Arkaprava Das · Anurup Samanta · Arkodeep Sen
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span>NSL-KDD &amp; CICIDS</span>
              <span>4-model Ensemble</span>
              <span>Active Learning</span>
              <span>Gemini AI</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
