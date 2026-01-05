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
import { Shield, Cpu, Brain, Database, Sparkles } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-black grid-pattern">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            AI-Based Intrusion Detection System
          </h1>
          <p className="text-gray-400">
            Real-time network attack detection using Machine Learning
          </p>
          
          {/* Tech badges */}
          <div className="flex flex-wrap gap-3 mt-4">
            <span className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-full text-sm">
              <Brain className="w-4 h-4" />
              Isolation Forest
            </span>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-full text-sm">
              <Cpu className="w-4 h-4" />
              Autoencoders
            </span>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-full text-sm">
              <Database className="w-4 h-4" />
              K-Means Clustering
            </span>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-full text-sm">
              <Sparkles className="w-4 h-4" />
              Gemini AI
            </span>
          </div>
        </div>

        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 slide-in">
            <StatsCards />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
          <div className="space-y-6 slide-in">
            <StatsCards />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TrafficChart />
              <DetectionFeed />
            </div>
          </div>
        )}

        {/* ML Models View */}
        {activeTab === 'models' && (
          <div className="space-y-6 slide-in">
            <ModelComparison />
            
            {/* Research Contribution Section */}
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Research Contribution</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <h3 className="text-lg font-medium text-blue-400 mb-2">
                    Anomaly Detection Comparison
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Comprehensive evaluation of Isolation Forest, Autoencoders, and K-Means 
                    clustering for network intrusion detection on benchmark datasets.
                  </p>
                </div>
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <h3 className="text-lg font-medium text-green-400 mb-2">
                    False-Positive Reduction
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Novel ensemble approach combining multiple ML techniques to minimize 
                    false alarms while maintaining high detection rates.
                  </p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <h3 className="text-lg font-medium text-purple-400 mb-2">
                    AI-Enhanced Analysis
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Integration of Large Language Models (Gemini) for intelligent threat 
                    analysis and automated security recommendations.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Datasets View */}
        {activeTab === 'datasets' && (
          <div className="space-y-6 slide-in">
            <DatasetInfo />
            
            {/* Feature Engineering */}
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Feature Engineering</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-3">
                    Network Flow Features
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full" />
                      Duration - Length of the connection
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full" />
                      Protocol Type - TCP, UDP, ICMP
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full" />
                      Src/Dst Bytes - Data transferred
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full" />
                      Flag Status - TCP flags
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full" />
                      Service - HTTP, FTP, SSH, etc.
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-3">
                    Statistical Features
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
                      Count - Connections to same host
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
                      Serror Rate - SYN error percentage
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
                      Same Srv Rate - Same service ratio
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
                      Dst Host Count - Destination connections
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
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
          <div className="space-y-6 slide-in">
            <StatsCards />
            <AlertsPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DetectionFeed />
              <AIAssistant />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-400" />
              <span className="text-gray-400 text-sm">
                AI-Based Intrusion Detection System | Major Project 2025-26
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <span>NSL-KDD & CICIDS Datasets</span>
              <span>•</span>
              <span>Powered by Gemini AI</span>
              <span>•</span>
              <span>Built with Next.js</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
