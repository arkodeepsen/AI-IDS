'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    ThumbsUp,
    ThumbsDown,
    RefreshCw,
    TrendingUp,
    Settings,
    BarChart3
} from 'lucide-react';

interface RLHFMetrics {
    totalFeedback: number;
    correctPredictions: number;
    incorrectPredictions: number;
    accuracyRate: number;
    weightAdjustments: number;
    lastUpdate: string | null;
}

interface ModelWeights {
    isolationForest: number;
    autoencoder: number;
    kMeans: number;
    knn: number;
}

export default function RLHFFeedbackPanel() {
    const [metrics, setMetrics] = useState<RLHFMetrics | null>(null);
    const [weights, setWeights] = useState<ModelWeights | null>(null);
    const [loading, setLoading] = useState(true);
    const [adjusting, setAdjusting] = useState(false);

    const fetchRLHFData = useCallback(async () => {
        try {
            const response = await fetch('/api/rlhf');
            const data = await response.json();
            if (data.success) {
                setMetrics(data.metrics);
                setWeights(data.weights);
            }
        } catch (error) {
            console.error('Failed to fetch RLHF data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRLHFData();
        const interval = setInterval(fetchRLHFData, 10000);
        return () => clearInterval(interval);
    }, [fetchRLHFData]);

    const handleForceAdjust = async () => {
        setAdjusting(true);
        try {
            const response = await fetch('/api/rlhf', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'forceAdjust' })
            });
            const data = await response.json();
            if (data.success) {
                setWeights(data.weights);
                fetchRLHFData();
            }
        } catch (error) {
            console.error('Failed to adjust weights:', error);
        } finally {
            setAdjusting(false);
        }
    };

    const handleResetWeights = async () => {
        try {
            const response = await fetch('/api/rlhf', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset' })
            });
            const data = await response.json();
            if (data.success) {
                setWeights(data.weights);
                fetchRLHFData();
            }
        } catch (error) {
            console.error('Failed to reset weights:', error);
        }
    };

    if (loading) {
        return (
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="text-center text-gray-400 py-8">Loading RLHF data...</div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-white">RLHF Feedback System</h2>
                    <p className="text-gray-400 text-sm">Reinforcement Learning from Human Feedback</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchRLHFData}
                        className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ThumbsUp className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-gray-400">Correct</span>
                    </div>
                    <p className="text-2xl font-bold text-green-400">
                        {metrics?.correctPredictions || 0}
                    </p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ThumbsDown className="w-4 h-4 text-red-400" />
                        <span className="text-xs text-gray-400">Incorrect</span>
                    </div>
                    <p className="text-2xl font-bold text-red-400">
                        {metrics?.incorrectPredictions || 0}
                    </p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-gray-400">Accuracy</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">
                        {((metrics?.accuracyRate || 0) * 100).toFixed(1)}%
                    </p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Settings className="w-4 h-4 text-purple-400" />
                        <span className="text-xs text-gray-400">Adjustments</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-400">
                        {metrics?.weightAdjustments || 0}
                    </p>
                </div>
            </div>

            {/* Model Weights */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-medium text-white">Model Weights</h3>
                </div>

                <div className="space-y-3">
                    {weights && Object.entries(weights).map(([model, weight]) => (
                        <div key={model} className="flex items-center gap-4">
                            <span className="text-sm text-gray-400 w-32 capitalize">
                                {model.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                                    style={{ width: `${weight * 100}%` }}
                                />
                            </div>
                            <span className="text-sm text-white font-medium w-16 text-right">
                                {(weight * 100).toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleForceAdjust}
                    disabled={adjusting}
                    className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                >
                    {adjusting ? 'Adjusting...' : 'Force Weight Adjustment'}
                </button>
                <button
                    onClick={handleResetWeights}
                    className="px-4 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                    Reset Weights
                </button>
            </div>

            {/* Last Update */}
            {metrics?.lastUpdate && (
                <p className="text-xs text-gray-500 mt-4 text-center">
                    Last weight adjustment: {new Date(metrics.lastUpdate).toLocaleString()}
                </p>
            )}
        </div>
    );
}
