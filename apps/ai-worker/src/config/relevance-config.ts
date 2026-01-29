/**
 * Relevance Evaluation Configuration
 *
 * Configuration for the retrieval service's relevance scoring system.
 * Defines weights, thresholds, and tuning parameters for hybrid search.
 *
 * @implements IFC-155 - Permissioned Indexing with relevance evaluation
 */

import { z } from 'zod';

/**
 * Source weight configuration schema
 */
export const SourceWeightSchema = z.object({
  leads: z.number().min(0).max(2).default(1.0),
  contacts: z.number().min(0).max(2).default(1.0),
  accounts: z.number().min(0).max(2).default(1.0),
  opportunities: z.number().min(0).max(2).default(1.2),
  documents: z.number().min(0).max(2).default(1.5),
  conversations: z.number().min(0).max(2).default(0.8),
  messages: z.number().min(0).max(2).default(0.6),
  tickets: z.number().min(0).max(2).default(1.0),
});

export type SourceWeights = z.infer<typeof SourceWeightSchema>;

/**
 * Relevance scoring configuration schema
 */
export const RelevanceConfigSchema = z.object({
  /**
   * Minimum score threshold for including results
   */
  minScore: z.number().min(0).max(1).default(0.3),

  /**
   * Weight for full-text search score (0-1)
   */
  textWeight: z.number().min(0).max(1).default(0.4),

  /**
   * Weight for semantic/vector similarity score (0-1)
   */
  semanticWeight: z.number().min(0).max(1).default(0.4),

  /**
   * Weight for recency boost (0-1)
   */
  recencyWeight: z.number().min(0).max(1).default(0.2),

  /**
   * Time decay factor for recency scoring
   * Higher values = faster decay
   */
  timeDecayFactor: z.number().min(0).max(1).default(0.1),

  /**
   * Boost multiplier for title/name matches
   */
  titleBoost: z.number().min(1).max(5).default(2.0),

  /**
   * Boost multiplier for exact phrase matches
   */
  exactMatchBoost: z.number().min(1).max(5).default(1.5),

  /**
   * Penalty factor for old content (days)
   * Content older than this gets reduced score
   */
  freshnessThresholdDays: z.number().min(1).default(90),

  /**
   * Maximum results per source before aggregation
   */
  maxPerSource: z.number().min(1).max(100).default(20),

  /**
   * Default limit for total results
   */
  defaultLimit: z.number().min(1).max(100).default(10),

  /**
   * Source-specific weight multipliers
   */
  sourceWeights: SourceWeightSchema.default({}),

  /**
   * Enable/disable specific scoring features
   */
  features: z.object({
    enableTimeDecay: z.boolean().default(true),
    enableTitleBoost: z.boolean().default(true),
    enableExactMatchBoost: z.boolean().default(true),
    enableSemanticSearch: z.boolean().default(true),
    enableFuzzyMatching: z.boolean().default(true),
  }).default({}),

  /**
   * Semantic search configuration
   */
  semantic: z.object({
    /**
     * Minimum cosine similarity for vector matches
     */
    minSimilarity: z.number().min(0).max(1).default(0.7),

    /**
     * Embedding model to use
     */
    embeddingModel: z.string().default('text-embedding-3-small'),

    /**
     * Embedding dimension size
     */
    embeddingDimension: z.number().default(1536),

    /**
     * Number of nearest neighbors to retrieve
     */
    topK: z.number().min(1).max(100).default(50),
  }).default({}),

  /**
   * Full-text search configuration
   */
  fullText: z.object({
    /**
     * PostgreSQL text search configuration
     */
    searchConfig: z.string().default('english'),

    /**
     * Enable stemming in text search
     */
    enableStemming: z.boolean().default(true),

    /**
     * Enable stop word removal
     */
    removeStopWords: z.boolean().default(true),

    /**
     * Fuzzy match distance threshold (Levenshtein)
     */
    fuzzyDistance: z.number().min(0).max(5).default(2),
  }).default({}),

  /**
   * Caching configuration
   */
  cache: z.object({
    /**
     * Enable result caching
     */
    enabled: z.boolean().default(true),

    /**
     * Cache TTL in seconds
     */
    ttlSeconds: z.number().min(0).default(300),

    /**
     * Maximum cache entries
     */
    maxEntries: z.number().min(0).default(1000),
  }).default({}),
});

export type RelevanceConfig = z.infer<typeof RelevanceConfigSchema>;

/**
 * Default relevance configuration
 */
export const DEFAULT_RELEVANCE_CONFIG: RelevanceConfig = {
  minScore: 0.3,
  textWeight: 0.4,
  semanticWeight: 0.4,
  recencyWeight: 0.2,
  timeDecayFactor: 0.1,
  titleBoost: 2.0,
  exactMatchBoost: 1.5,
  freshnessThresholdDays: 90,
  maxPerSource: 20,
  defaultLimit: 10,
  sourceWeights: {
    leads: 1.0,
    contacts: 1.0,
    accounts: 1.0,
    opportunities: 1.2,
    documents: 1.5,
    conversations: 0.8,
    messages: 0.6,
    tickets: 1.0,
  },
  features: {
    enableTimeDecay: true,
    enableTitleBoost: true,
    enableExactMatchBoost: true,
    enableSemanticSearch: true,
    enableFuzzyMatching: true,
  },
  semantic: {
    minSimilarity: 0.7,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimension: 1536,
    topK: 50,
  },
  fullText: {
    searchConfig: 'english',
    enableStemming: true,
    removeStopWords: true,
    fuzzyDistance: 2,
  },
  cache: {
    enabled: true,
    ttlSeconds: 300,
    maxEntries: 1000,
  },
};

/**
 * High-precision configuration (favor accuracy over recall)
 */
export const HIGH_PRECISION_CONFIG: RelevanceConfig = {
  ...DEFAULT_RELEVANCE_CONFIG,
  minScore: 0.5,
  semanticWeight: 0.5,
  textWeight: 0.35,
  recencyWeight: 0.15,
  semantic: {
    ...DEFAULT_RELEVANCE_CONFIG.semantic,
    minSimilarity: 0.8,
  },
};

/**
 * High-recall configuration (favor completeness over precision)
 */
export const HIGH_RECALL_CONFIG: RelevanceConfig = {
  ...DEFAULT_RELEVANCE_CONFIG,
  minScore: 0.2,
  semanticWeight: 0.3,
  textWeight: 0.5,
  recencyWeight: 0.2,
  maxPerSource: 50,
  semantic: {
    ...DEFAULT_RELEVANCE_CONFIG.semantic,
    minSimilarity: 0.5,
    topK: 100,
  },
  fullText: {
    ...DEFAULT_RELEVANCE_CONFIG.fullText,
    fuzzyDistance: 3,
  },
};

/**
 * Real-time configuration (optimized for speed)
 */
export const REALTIME_CONFIG: RelevanceConfig = {
  ...DEFAULT_RELEVANCE_CONFIG,
  maxPerSource: 10,
  defaultLimit: 5,
  features: {
    ...DEFAULT_RELEVANCE_CONFIG.features,
    enableSemanticSearch: false, // Skip vector search for speed
    enableFuzzyMatching: false,
  },
  cache: {
    enabled: true,
    ttlSeconds: 60,
    maxEntries: 500,
  },
};

/**
 * AI Agent configuration (balanced for agent context retrieval)
 */
export const AGENT_CONFIG: RelevanceConfig = {
  ...DEFAULT_RELEVANCE_CONFIG,
  minScore: 0.4,
  textWeight: 0.3,
  semanticWeight: 0.5,
  recencyWeight: 0.2,
  titleBoost: 1.8,
  maxPerSource: 15,
  defaultLimit: 20,
  sourceWeights: {
    leads: 1.2,
    contacts: 1.0,
    accounts: 1.0,
    opportunities: 1.5,
    documents: 1.3,
    conversations: 1.2,
    messages: 0.8,
    tickets: 1.0,
  },
  semantic: {
    ...DEFAULT_RELEVANCE_CONFIG.semantic,
    minSimilarity: 0.65,
    topK: 30,
  },
};

/**
 * Configuration presets for different use cases
 */
export const RELEVANCE_PRESETS = {
  default: DEFAULT_RELEVANCE_CONFIG,
  highPrecision: HIGH_PRECISION_CONFIG,
  highRecall: HIGH_RECALL_CONFIG,
  realtime: REALTIME_CONFIG,
  agent: AGENT_CONFIG,
} as const;

export type RelevancePreset = keyof typeof RELEVANCE_PRESETS;

/**
 * Get configuration by preset name
 */
export function getRelevanceConfig(preset: RelevancePreset = 'default'): RelevanceConfig {
  return RELEVANCE_PRESETS[preset];
}

/**
 * Merge custom config with base preset
 */
export function createRelevanceConfig(
  preset: RelevancePreset,
  overrides: Partial<RelevanceConfig>
): RelevanceConfig {
  const base = getRelevanceConfig(preset);
  return RelevanceConfigSchema.parse({
    ...base,
    ...overrides,
    sourceWeights: {
      ...base.sourceWeights,
      ...overrides.sourceWeights,
    },
    features: {
      ...base.features,
      ...overrides.features,
    },
    semantic: {
      ...base.semantic,
      ...overrides.semantic,
    },
    fullText: {
      ...base.fullText,
      ...overrides.fullText,
    },
    cache: {
      ...base.cache,
      ...overrides.cache,
    },
  });
}

/**
 * Validate configuration at runtime
 */
export function validateRelevanceConfig(config: unknown): RelevanceConfig {
  return RelevanceConfigSchema.parse(config);
}
