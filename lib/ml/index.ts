/**
 * ML module barrel export.
 */

export {
  IsolationForest,
  IsolationTree,
  type SerialisedIsolationForest,
} from './isolation-forest';
export { Autoencoder, type SerialisedAutoencoder } from './autoencoder';
export { KMeansClustering } from './kmeans';
export { RandomForest, type SerialisedRandomForest } from './random-forest';
export { GradientBoosting, type SerialisedGradientBoosting } from './xgboost';
export {
  EnsembleDetector,
  DEFAULT_WEIGHTS,
  type EnsembleWeights,
  type EnsemblePrediction,
  type EnsembleScores,
  type SerialisedEnsemble,
} from './ensemble';

export {
  extractFeatures,
  extractKddFeatures,
  extractLegacyFeatures,
  extractExtendedFeatures,
  normalizeFeatures,
  calculateFeatureStats,
  ipToNumber,
  flagsToNumber,
} from './features';

export { generateTrainingData, generateLabeledTrainingData } from './training-data';
export { getModelMetrics, type ModelMetricsData } from './metrics';
export {
  loadTrainedArtefacts,
  getCachedMetrics,
  type TrainedMetric,
  type TrainedMetrics,
} from './loader';
export { packetToKddRow, type KddOverride } from './packet-to-kdd';
export {
  parseKDDRow,
  vectorise,
  fitScaler,
  loadCsvText,
  buildDataset,
  classifyLabel,
  FEATURE_LENGTH,
  PROTOCOL_TYPES,
  SERVICES,
  FLAGS,
  NUMERIC_FEATURE_NAMES,
  type KDDRow,
  type FeatureScaler,
  type AttackClass,
  type ParsedDataset,
} from './nsl-kdd';
