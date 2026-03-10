/**
 * ML Module Barrel Export
 * Central export point for all ML algorithms and utilities
 */

// Algorithms
export { IsolationForest, IsolationTree } from './isolation-forest';
export { Autoencoder } from './autoencoder';
export { KMeansClustering } from './kmeans';
export { EnsembleDetector, type EnsembleWeights, type EnsemblePrediction } from './ensemble';

// Feature extraction
export {
    extractFeatures,
    extractExtendedFeatures,
    normalizeFeatures,
    calculateFeatureStats,
    ipToNumber,
    flagsToNumber
} from './features';

// Training data generation
export { generateTrainingData, generateLabeledTrainingData } from './training-data';

// Model metrics
export { getModelMetrics, type ModelMetricsData } from './metrics';
