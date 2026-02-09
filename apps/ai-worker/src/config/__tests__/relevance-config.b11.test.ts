/**
 * Relevance Config - B11 coverage tests
 *
 * Targets 0% coverage: all exports
 * - SourceWeightSchema validation
 * - RelevanceConfigSchema validation and defaults
 * - Preset configs (DEFAULT, HIGH_PRECISION, HIGH_RECALL, REALTIME, AGENT)
 * - getRelevanceConfig function
 * - createRelevanceConfig function
 * - validateRelevanceConfig function
 * - RELEVANCE_PRESETS object
 */
import { describe, it, expect } from 'vitest';
import {
  SourceWeightSchema,
  RelevanceConfigSchema,
  DEFAULT_RELEVANCE_CONFIG,
  HIGH_PRECISION_CONFIG,
  HIGH_RECALL_CONFIG,
  REALTIME_CONFIG,
  AGENT_CONFIG,
  RELEVANCE_PRESETS,
  getRelevanceConfig,
  createRelevanceConfig,
  validateRelevanceConfig,
} from '../relevance-config';

describe('Relevance Config - b11 coverage', () => {
  describe('SourceWeightSchema', () => {
    it('should validate default source weights', () => {
      const result = SourceWeightSchema.parse({});
      expect(result.leads).toBe(1.0);
      expect(result.contacts).toBe(1.0);
      expect(result.accounts).toBe(1.0);
      expect(result.opportunities).toBe(1.2);
      expect(result.documents).toBe(1.5);
      expect(result.conversations).toBe(0.8);
      expect(result.messages).toBe(0.6);
      expect(result.tickets).toBe(1.0);
    });

    it('should validate custom source weights', () => {
      const result = SourceWeightSchema.parse({ leads: 1.5, documents: 2.0 });
      expect(result.leads).toBe(1.5);
      expect(result.documents).toBe(2.0);
    });

    it('should reject out-of-range weights', () => {
      expect(() => SourceWeightSchema.parse({ leads: -1 })).toThrow();
      expect(() => SourceWeightSchema.parse({ leads: 3 })).toThrow();
    });
  });

  describe('RelevanceConfigSchema', () => {
    it('should fill all defaults when parsing empty object', () => {
      const result = RelevanceConfigSchema.parse({});
      expect(result.minScore).toBe(0.3);
      expect(result.textWeight).toBe(0.4);
      expect(result.semanticWeight).toBe(0.4);
      expect(result.recencyWeight).toBe(0.2);
      expect(result.timeDecayFactor).toBe(0.1);
      expect(result.titleBoost).toBe(2.0);
      expect(result.exactMatchBoost).toBe(1.5);
      expect(result.freshnessThresholdDays).toBe(90);
      expect(result.maxPerSource).toBe(20);
      expect(result.defaultLimit).toBe(10);
    });

    it('should fill nested defaults for features', () => {
      const result = RelevanceConfigSchema.parse({});
      expect(result.features.enableTimeDecay).toBe(true);
      expect(result.features.enableTitleBoost).toBe(true);
      expect(result.features.enableExactMatchBoost).toBe(true);
      expect(result.features.enableSemanticSearch).toBe(true);
      expect(result.features.enableFuzzyMatching).toBe(true);
    });

    it('should fill nested defaults for semantic config', () => {
      const result = RelevanceConfigSchema.parse({});
      expect(result.semantic.minSimilarity).toBe(0.7);
      expect(result.semantic.embeddingModel).toBe('text-embedding-3-small');
      expect(result.semantic.embeddingDimension).toBe(1536);
      expect(result.semantic.topK).toBe(50);
    });

    it('should fill nested defaults for fullText config', () => {
      const result = RelevanceConfigSchema.parse({});
      expect(result.fullText.searchConfig).toBe('english');
      expect(result.fullText.enableStemming).toBe(true);
      expect(result.fullText.removeStopWords).toBe(true);
      expect(result.fullText.fuzzyDistance).toBe(2);
    });

    it('should fill nested defaults for cache config', () => {
      const result = RelevanceConfigSchema.parse({});
      expect(result.cache.enabled).toBe(true);
      expect(result.cache.ttlSeconds).toBe(300);
      expect(result.cache.maxEntries).toBe(1000);
    });

    it('should reject invalid minScore', () => {
      expect(() => RelevanceConfigSchema.parse({ minScore: -1 })).toThrow();
      expect(() => RelevanceConfigSchema.parse({ minScore: 2 })).toThrow();
    });
  });

  describe('Preset configs', () => {
    it('should define DEFAULT_RELEVANCE_CONFIG correctly', () => {
      expect(DEFAULT_RELEVANCE_CONFIG.minScore).toBe(0.3);
      expect(DEFAULT_RELEVANCE_CONFIG.textWeight).toBe(0.4);
      expect(DEFAULT_RELEVANCE_CONFIG.semanticWeight).toBe(0.4);
      expect(DEFAULT_RELEVANCE_CONFIG.sourceWeights.opportunities).toBe(1.2);
    });

    it('should define HIGH_PRECISION_CONFIG with higher minScore', () => {
      expect(HIGH_PRECISION_CONFIG.minScore).toBe(0.5);
      expect(HIGH_PRECISION_CONFIG.semanticWeight).toBe(0.5);
      expect(HIGH_PRECISION_CONFIG.semantic.minSimilarity).toBe(0.8);
    });

    it('should define HIGH_RECALL_CONFIG with lower minScore', () => {
      expect(HIGH_RECALL_CONFIG.minScore).toBe(0.2);
      expect(HIGH_RECALL_CONFIG.textWeight).toBe(0.5);
      expect(HIGH_RECALL_CONFIG.maxPerSource).toBe(50);
      expect(HIGH_RECALL_CONFIG.semantic.minSimilarity).toBe(0.5);
      expect(HIGH_RECALL_CONFIG.semantic.topK).toBe(100);
      expect(HIGH_RECALL_CONFIG.fullText.fuzzyDistance).toBe(3);
    });

    it('should define REALTIME_CONFIG for speed', () => {
      expect(REALTIME_CONFIG.maxPerSource).toBe(10);
      expect(REALTIME_CONFIG.defaultLimit).toBe(5);
      expect(REALTIME_CONFIG.features.enableSemanticSearch).toBe(false);
      expect(REALTIME_CONFIG.features.enableFuzzyMatching).toBe(false);
      expect(REALTIME_CONFIG.cache.ttlSeconds).toBe(60);
      expect(REALTIME_CONFIG.cache.maxEntries).toBe(500);
    });

    it('should define AGENT_CONFIG for agent context retrieval', () => {
      expect(AGENT_CONFIG.minScore).toBe(0.4);
      expect(AGENT_CONFIG.semanticWeight).toBe(0.5);
      expect(AGENT_CONFIG.titleBoost).toBe(1.8);
      expect(AGENT_CONFIG.defaultLimit).toBe(20);
      expect(AGENT_CONFIG.sourceWeights.leads).toBe(1.2);
      expect(AGENT_CONFIG.sourceWeights.opportunities).toBe(1.5);
      expect(AGENT_CONFIG.semantic.minSimilarity).toBe(0.65);
      expect(AGENT_CONFIG.semantic.topK).toBe(30);
    });
  });

  describe('RELEVANCE_PRESETS', () => {
    it('should contain all presets', () => {
      expect(RELEVANCE_PRESETS.default).toBe(DEFAULT_RELEVANCE_CONFIG);
      expect(RELEVANCE_PRESETS.highPrecision).toBe(HIGH_PRECISION_CONFIG);
      expect(RELEVANCE_PRESETS.highRecall).toBe(HIGH_RECALL_CONFIG);
      expect(RELEVANCE_PRESETS.realtime).toBe(REALTIME_CONFIG);
      expect(RELEVANCE_PRESETS.agent).toBe(AGENT_CONFIG);
    });
  });

  describe('getRelevanceConfig', () => {
    it('should return default config with no argument', () => {
      const config = getRelevanceConfig();
      expect(config).toBe(DEFAULT_RELEVANCE_CONFIG);
    });

    it('should return default config with "default" argument', () => {
      expect(getRelevanceConfig('default')).toBe(DEFAULT_RELEVANCE_CONFIG);
    });

    it('should return highPrecision config', () => {
      expect(getRelevanceConfig('highPrecision')).toBe(HIGH_PRECISION_CONFIG);
    });

    it('should return highRecall config', () => {
      expect(getRelevanceConfig('highRecall')).toBe(HIGH_RECALL_CONFIG);
    });

    it('should return realtime config', () => {
      expect(getRelevanceConfig('realtime')).toBe(REALTIME_CONFIG);
    });

    it('should return agent config', () => {
      expect(getRelevanceConfig('agent')).toBe(AGENT_CONFIG);
    });
  });

  describe('createRelevanceConfig', () => {
    it('should merge overrides with base preset', () => {
      const config = createRelevanceConfig('default', { minScore: 0.7 });
      expect(config.minScore).toBe(0.7);
      expect(config.textWeight).toBe(0.4); // from default
    });

    it('should merge nested sourceWeights', () => {
      const config = createRelevanceConfig('default', {
        sourceWeights: { leads: 1.8 },
      });
      expect(config.sourceWeights.leads).toBe(1.8);
      expect(config.sourceWeights.documents).toBe(1.5); // preserved
    });

    it('should merge nested features', () => {
      const config = createRelevanceConfig('default', {
        features: { enableSemanticSearch: false },
      });
      expect(config.features.enableSemanticSearch).toBe(false);
      expect(config.features.enableTimeDecay).toBe(true); // preserved
    });

    it('should merge nested semantic config', () => {
      const config = createRelevanceConfig('highPrecision', {
        semantic: { topK: 10 },
      });
      expect(config.semantic.topK).toBe(10);
      expect(config.semantic.minSimilarity).toBe(0.8); // from highPrecision
    });

    it('should merge nested fullText config', () => {
      const config = createRelevanceConfig('default', {
        fullText: { fuzzyDistance: 4 },
      });
      expect(config.fullText.fuzzyDistance).toBe(4);
      expect(config.fullText.enableStemming).toBe(true);
    });

    it('should merge nested cache config', () => {
      const config = createRelevanceConfig('default', {
        cache: { ttlSeconds: 600 },
      });
      expect(config.cache.ttlSeconds).toBe(600);
      expect(config.cache.enabled).toBe(true);
    });
  });

  describe('validateRelevanceConfig', () => {
    it('should validate a valid config', () => {
      const config = validateRelevanceConfig(DEFAULT_RELEVANCE_CONFIG);
      expect(config.minScore).toBe(0.3);
    });

    it('should fill defaults on partial config', () => {
      const config = validateRelevanceConfig({ minScore: 0.5 });
      expect(config.minScore).toBe(0.5);
      expect(config.textWeight).toBe(0.4);
    });

    it('should throw for invalid config', () => {
      expect(() => validateRelevanceConfig({ minScore: 'not-a-number' })).toThrow();
    });
  });
});
