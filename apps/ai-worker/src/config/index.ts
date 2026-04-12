/**
 * AI Worker Configuration
 *
 * Centralized configuration exports for the AI worker service.
 */

// Relevance evaluation configuration (IFC-155)
export {
  type RelevanceConfig,
  type RelevancePreset,
  type SourceWeights,
  RelevanceConfigSchema,
  SourceWeightSchema,
  DEFAULT_RELEVANCE_CONFIG,
  HIGH_PRECISION_CONFIG,
  HIGH_RECALL_CONFIG,
  REALTIME_CONFIG,
  AGENT_CONFIG,
  RELEVANCE_PRESETS,
  getRelevanceConfig,
  createRelevanceConfig,
  validateRelevanceConfig,
} from './relevance-config';
