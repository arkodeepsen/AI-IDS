'use client';

import { useState } from 'react';
import Navigation from '@/components/Navigation';
import StatsCards from '@/components/StatsCards';
import TrafficChart from '@/components/TrafficChart';
import DetectionFeed from '@/components/DetectionFeed';
import ModelComparison from '@/components/ModelComparison';
import AIAssistant from '@/components/AIAssistant';
import AlertsPanel from '@/components/AlertsPanel';
import DatasetInfo from '@/components/DatasetInfo';
import { RLHFFeedbackPanel, AutoResponseControl, TrainingDataManager } from '@/components/controls';
import { Shield } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">
            AI-Based Intrusion Detection System
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time network attack detection using Machine Learning
          </p>
        </div>

        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 fade-in">
            <StatsCards />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <TrafficChart />
              </div>
              <div>
                <AIAssistant />
              </div>
            </div>
            <AlertsPanel />
          </div>
        )}

        {/* Detection View */}
        {activeTab === 'detection' && (
          <div className="space-y-4 fade-in">
            <StatsCards />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrafficChart />
              <DetectionFeed />
            </div>
          </div>
        )}

        {/* ML Models View */}
        {activeTab === 'models' && (
          <div className="space-y-4 fade-in">
            <ModelComparison />
            <RLHFFeedbackPanel />

            {/* Research Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-base font-medium text-white mb-3">Research Contribution</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 bg-zinc-800/50 rounded">
                  <h3 className="text-sm font-medium text-white mb-1">
                    Anomaly Detection
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Comparison of Isolation Forest, Autoencoder, and K-Means for intrusion detection.
                  </p>
                </div>
                <div className="p-3 bg-zinc-800/50 rounded">
                  <h3 className="text-sm font-medium text-white mb-1">
                    False-Positive Reduction
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Ensemble approach combining 3 ML techniques.
                  </p>
                </div>
                <div className="p-3 bg-zinc-800/50 rounded">
                  <h3 className="text-sm font-medium text-white mb-1">
                    RLHF Integration
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Continuous improvement from human feedback.
                  </p>
                </div>
                <div className="p-3 bg-zinc-800/50 rounded">
                  <h3 className="text-sm font-medium text-white mb-1">
                    Auto-Response
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Automatic prevention with self-learning.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Response View */}
        {activeTab === 'auto-response' && (
          <div className="fade-in">
            <AutoResponseControl />
          </div>
        )}

        {/* Training View */}
        {activeTab === 'training' && (
          <div className="fade-in">
            <TrainingDataManager />
          </div>
        )}

        {/* Datasets View */}
        {activeTab === 'datasets' && (
          <div className="space-y-4 fade-in">
            <DatasetInfo />

            {/* Feature Engineering */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-base font-medium text-white mb-3">Feature Engineering</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-zinc-400 mb-2">Network Flow Features</h3>
                  <ul className="space-y-1.5 text-xs text-zinc-500">
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-400 rounded-full" />
                      Duration - Connection length
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-400 rounded-full" />
                      Protocol - TCP, UDP, ICMP
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-400 rounded-full" />
                      Src/Dst Bytes - Data transferred
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-400 rounded-full" />
                      Flag Status - TCP flags
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-400 rounded-full" />
                      Service - HTTP, FTP, SSH
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm text-zinc-400 mb-2">Statistical Features</h3>
                  <ul className="space-y-1.5 text-xs text-zinc-500">
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-400 rounded-full" />
                      Count - Connections to same host
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-400 rounded-full" />
                      Serror Rate - SYN error %
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-400 rounded-full" />
                      Same Srv Rate - Same service ratio
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-400 rounded-full" />
                      Dst Host Count - Destination conns
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-green-400 rounded-full" />
                      Packet Size Statistics
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts View */}
        {activeTab === 'alerts' && (
          <div className="space-y-4 fade-in">
            <StatsCards />
            <AlertsPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DetectionFeed />
              <AIAssistant />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500" />
              <span className="text-zinc-500 text-xs">
                AI-IDS | Major Project 2025-26
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span>NSL-KDD & CICIDS</span>
              <span>K-Means + RLHF</span>
              <span>Gemini AI</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
