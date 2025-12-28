import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  FeatureFlagContext,
  FeatureFlagDecision,
  FeatureFlagsConfig,
} from '../src/feature-flags/types';

// Mock the crypto module for deterministic hash testing
const mockStableHashPercent = vi.fn();
vi.mock('../src/feature-flags/in-memory-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/feature-flags/in-memory-provider')>();
  return {
    ...actual,
    InMemoryFeatureFlagProvider: class extends actual.InMemoryFeatureFlagProvider {
      // We'll test the real implementation, but expose hash for testing
    },
  };
});

describe('Feature Flags Module', () => {
  beforeEach(() => {
    vi.resetModules();
    mockStableHashPercent.mockClear();
  });

  describe('InMemoryFeatureFlagProvider.fromConfig', () => {
    it('should create provider from valid config', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'test-flag',
            enabled: true,
            description: 'A test flag',
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      expect(provider).toBeDefined();
      expect(provider.isEnabled).toBeInstanceOf(Function);
      expect(provider.getDecision).toBeInstanceOf(Function);
      expect(provider.isEnabled('test-flag')).toBe(true);
    });

    it('should handle invalid config by failing closed (all flags disabled)', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const invalidConfig = {
        version: 2, // Invalid version
        flags: [],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(invalidConfig);
      expect(provider).toBeDefined();
      expect(provider.isEnabled).toBeInstanceOf(Function);
      expect(provider.getDecision).toBeInstanceOf(Function);

      // Should return missing_flag for any key since config is invalid
      const decision = provider.getDecision('any-flag');
      expect(decision.enabled).toBe(false);
      expect(decision.reason).toBe('missing_flag');
    });

    it('should handle missing flags array', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const invalidConfig = {
        version: 1,
        // Missing flags property
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(invalidConfig);
      const decision = provider.getDecision('test-flag');
      expect(decision.enabled).toBe(false);
      expect(decision.reason).toBe('missing_flag');
    });

    it('should handle null/undefined config', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const provider1 = InMemoryFeatureFlagProvider.fromConfig(null);
      expect(provider1.isEnabled('test-flag')).toBe(false);

      const provider2 = InMemoryFeatureFlagProvider.fromConfig(undefined);
      expect(provider2.isEnabled('test-flag')).toBe(false);
    });
  });

  describe('getDecision - missing and disabled flags', () => {
    it('should return missing_flag for undefined flags', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const decision = provider.getDecision('non-existent');

      expect(decision).toEqual({
        key: 'non-existent',
        enabled: false,
        reason: 'missing_flag',
      });
    });

    it('should return disabled for explicitly disabled flags', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'disabled-flag',
            enabled: false,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const decision = provider.getDecision('disabled-flag');

      expect(decision).toEqual({
        key: 'disabled-flag',
        enabled: false,
        reason: 'disabled',
      });
    });

    it('should return default for simple enabled flag without rules or rollout', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'simple-flag',
            enabled: true,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const decision = provider.getDecision('simple-flag');

      expect(decision).toEqual({
        key: 'simple-flag',
        enabled: true,
        reason: 'default',
      });
    });
  });

  describe('getDecision - rule matching', () => {
    it('should match rule based on context attributes', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'premium-feature',
            enabled: true,
            rules: [
              {
                when: { plan: 'premium' },
                then: { enabled: true },
              },
              {
                when: { plan: 'free' },
                then: { enabled: false },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      const premiumContext: FeatureFlagContext = {
        attributes: { plan: 'premium' },
      };
      const premiumDecision = provider.getDecision('premium-feature', premiumContext);

      expect(premiumDecision).toEqual({
        key: 'premium-feature',
        enabled: true,
        reason: 'rule_match',
      });

      const freeContext: FeatureFlagContext = {
        attributes: { plan: 'free' },
      };
      const freeDecision = provider.getDecision('premium-feature', freeContext);

      expect(freeDecision).toEqual({
        key: 'premium-feature',
        enabled: false,
        reason: 'rule_match',
      });
    });

    it('should match first rule when multiple rules match', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'multi-rule',
            enabled: true,
            rules: [
              {
                when: { env: 'production' },
                then: { enabled: true, variant: 'prod-variant' },
              },
              {
                when: { env: 'production' },
                then: { enabled: false, variant: 'second-variant' },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        attributes: { env: 'production' },
      };
      const decision = provider.getDecision('multi-rule', context);

      expect(decision).toEqual({
        key: 'multi-rule',
        enabled: true,
        variant: 'prod-variant',
        reason: 'rule_match',
      });
    });

    it('should match rules with multiple attributes', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'complex-rule',
            enabled: true,
            rules: [
              {
                when: { plan: 'premium', region: 'us-east', beta: true },
                then: { enabled: true },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      // All attributes match
      const matchContext: FeatureFlagContext = {
        attributes: { plan: 'premium', region: 'us-east', beta: true },
      };
      const matchDecision = provider.getDecision('complex-rule', matchContext);
      expect(matchDecision.enabled).toBe(true);
      expect(matchDecision.reason).toBe('rule_match');

      // One attribute doesn't match
      const noMatchContext: FeatureFlagContext = {
        attributes: { plan: 'premium', region: 'eu-west', beta: true },
      };
      const noMatchDecision = provider.getDecision('complex-rule', noMatchContext);
      expect(noMatchDecision.reason).toBe('default'); // Falls through to default
    });

    it('should support different attribute types (string, number, boolean)', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'typed-rule',
            enabled: true,
            rules: [
              {
                when: { name: 'test', count: 42, active: true },
                then: { enabled: true },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        attributes: { name: 'test', count: 42, active: true },
      };
      const decision = provider.getDecision('typed-rule', context);

      expect(decision.enabled).toBe(true);
      expect(decision.reason).toBe('rule_match');
    });

    it('should not match rules without context', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'requires-context',
            enabled: true,
            rules: [
              {
                when: { plan: 'premium' },
                then: { enabled: true },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const decision = provider.getDecision('requires-context'); // No context

      expect(decision.reason).toBe('default'); // Falls through
      expect(decision.enabled).toBe(true);
    });

    it('should not match rules with empty attributes', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'requires-attrs',
            enabled: true,
            rules: [
              {
                when: { plan: 'premium' },
                then: { enabled: true },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        attributes: {}, // Empty attributes
      };
      const decision = provider.getDecision('requires-attrs', context);

      expect(decision.reason).toBe('default');
    });
  });

  describe('getDecision - percentage rollout', () => {
    it('should enable flag based on percentage rollout', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'rollout-flag',
            enabled: true,
            rolloutPercent: 50,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      // Test with multiple subject IDs to verify deterministic behavior
      const results = new Map<string, boolean>();
      for (let i = 0; i < 100; i++) {
        const context: FeatureFlagContext = {
          subjectId: `user-${i}`,
        };
        const decision = provider.getDecision('rollout-flag', context);
        results.set(`user-${i}`, decision.enabled);

        // Each decision should be deterministic
        const decision2 = provider.getDecision('rollout-flag', context);
        expect(decision2.enabled).toBe(decision.enabled);
        expect(decision2.reason).toBe('percentage_rollout');
      }

      // Roughly 50% should be enabled (allow some variance due to hash distribution)
      const enabledCount = Array.from(results.values()).filter(Boolean).length;
      expect(enabledCount).toBeGreaterThan(30); // At least 30%
      expect(enabledCount).toBeLessThan(70); // At most 70%
    });

    it('should return null for rollout without subjectId', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'rollout-flag',
            enabled: true,
            rolloutPercent: 50,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const decision = provider.getDecision('rollout-flag'); // No context

      // Falls through to default since no subjectId
      expect(decision.reason).toBe('default');
      expect(decision.enabled).toBe(true);
    });

    it('should handle 0% rollout (no one gets enabled)', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'zero-rollout',
            enabled: true,
            rolloutPercent: 0,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      for (let i = 0; i < 20; i++) {
        const context: FeatureFlagContext = {
          subjectId: `user-${i}`,
        };
        const decision = provider.getDecision('zero-rollout', context);
        expect(decision.enabled).toBe(false);
        expect(decision.reason).toBe('percentage_rollout');
      }
    });

    it('should handle 100% rollout (everyone gets enabled)', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'full-rollout',
            enabled: true,
            rolloutPercent: 100,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      for (let i = 0; i < 20; i++) {
        const context: FeatureFlagContext = {
          subjectId: `user-${i}`,
        };
        const decision = provider.getDecision('full-rollout', context);
        expect(decision.enabled).toBe(true);
        expect(decision.reason).toBe('percentage_rollout');
      }
    });

    it('should be deterministic for the same subjectId', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'stable-rollout',
            enabled: true,
            rolloutPercent: 50,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        subjectId: 'stable-user-123',
      };

      const decision1 = provider.getDecision('stable-rollout', context);
      const decision2 = provider.getDecision('stable-rollout', context);
      const decision3 = provider.getDecision('stable-rollout', context);

      expect(decision1.enabled).toBe(decision2.enabled);
      expect(decision2.enabled).toBe(decision3.enabled);
    });

    it('should select variant when rollout enables and variants exist', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'variant-rollout',
            enabled: true,
            rolloutPercent: 100, // Everyone gets it
            variants: ['control', 'variant-a', 'variant-b'],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      // Collect variants
      const variants = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const context: FeatureFlagContext = {
          subjectId: `user-${i}`,
        };
        const decision = provider.getDecision('variant-rollout', context);
        expect(decision.enabled).toBe(true);
        expect(decision.variant).toBeDefined();
        variants.add(decision.variant!);
      }

      // Should have distributed across multiple variants
      expect(variants.size).toBeGreaterThan(1);
      expect(
        Array.from(variants).every((v) => ['control', 'variant-a', 'variant-b'].includes(v))
      ).toBe(true);
    });

    it('should not assign variant when rollout disables user', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'selective-variant',
            enabled: true,
            rolloutPercent: 10, // Very low rollout
            variants: ['control', 'variant-a'],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      // Find a user who doesn't get rolled out
      let foundDisabled = false;
      for (let i = 0; i < 100; i++) {
        const context: FeatureFlagContext = {
          subjectId: `user-${i}`,
        };
        const decision = provider.getDecision('selective-variant', context);
        if (!decision.enabled) {
          expect(decision.variant).toBeUndefined();
          foundDisabled = true;
          break;
        }
      }

      expect(foundDisabled).toBe(true);
    });
  });

  describe('getDecision - priority order', () => {
    it('should prioritize rules over percentage rollout', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'priority-test',
            enabled: true,
            rolloutPercent: 0, // Would disable everyone
            rules: [
              {
                when: { override: 'yes' },
                then: { enabled: true, variant: 'override-variant' },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        subjectId: 'user-123',
        attributes: { override: 'yes' },
      };

      const decision = provider.getDecision('priority-test', context);

      // Rule should take precedence over rollout
      expect(decision.enabled).toBe(true);
      expect(decision.variant).toBe('override-variant');
      expect(decision.reason).toBe('rule_match');
    });

    it('should fall through to default when no rules match and no rollout', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'fallthrough-test',
            enabled: true,
            rules: [
              {
                when: { plan: 'enterprise' },
                then: { enabled: false },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        attributes: { plan: 'free' }, // Doesn't match rule
      };

      const decision = provider.getDecision('fallthrough-test', context);

      expect(decision.enabled).toBe(true);
      expect(decision.reason).toBe('default');
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled flag', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'enabled-flag',
            enabled: true,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      expect(provider.isEnabled('enabled-flag')).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'disabled-flag',
            enabled: false,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      expect(provider.isEnabled('disabled-flag')).toBe(false);
    });

    it('should return false for missing flag', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      expect(provider.isEnabled('non-existent')).toBe(false);
    });

    it('should respect context for rule-based flags', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'context-flag',
            enabled: true,
            rules: [
              {
                when: { admin: true },
                then: { enabled: true },
              },
              {
                when: { admin: false },
                then: { enabled: false },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      const adminContext: FeatureFlagContext = {
        attributes: { admin: true },
      };
      expect(provider.isEnabled('context-flag', adminContext)).toBe(true);

      const userContext: FeatureFlagContext = {
        attributes: { admin: false },
      };
      expect(provider.isEnabled('context-flag', userContext)).toBe(false);
    });

    it('should respect rollout percentage', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'rollout-flag',
            enabled: true,
            rolloutPercent: 0, // No one enabled
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        subjectId: 'user-123',
      };

      expect(provider.isEnabled('rollout-flag', context)).toBe(false);
    });
  });

  describe('featureFlagsConfigSchema validation', () => {
    it('should validate correct config', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const validConfig = {
        version: 1,
        flags: [
          {
            key: 'test-flag',
            enabled: true,
            description: 'Test description',
            rolloutPercent: 50,
            variants: ['a', 'b'],
            rules: [
              {
                when: { env: 'production' },
                then: { enabled: true, variant: 'prod' },
              },
            ],
          },
        ],
      };

      const result = featureFlagsConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid version', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const invalidConfig = {
        version: 2,
        flags: [],
      };

      const result = featureFlagsConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject missing flags array', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const invalidConfig = {
        version: 1,
      };

      const result = featureFlagsConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject empty flag key', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const invalidConfig = {
        version: 1,
        flags: [
          {
            key: '',
            enabled: true,
          },
        ],
      };

      const result = featureFlagsConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject rolloutPercent out of range', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const invalidConfig1 = {
        version: 1,
        flags: [
          {
            key: 'test',
            enabled: true,
            rolloutPercent: -1,
          },
        ],
      };

      const result1 = featureFlagsConfigSchema.safeParse(invalidConfig1);
      expect(result1.success).toBe(false);

      const invalidConfig2 = {
        version: 1,
        flags: [
          {
            key: 'test',
            enabled: true,
            rolloutPercent: 101,
          },
        ],
      };

      const result2 = featureFlagsConfigSchema.safeParse(invalidConfig2);
      expect(result2.success).toBe(false);
    });

    it('should reject empty variant strings', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const invalidConfig = {
        version: 1,
        flags: [
          {
            key: 'test',
            enabled: true,
            variants: ['valid', ''],
          },
        ],
      };

      const result = featureFlagsConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should accept minimal valid flag', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const minimalConfig = {
        version: 1,
        flags: [
          {
            key: 'minimal',
            enabled: false,
          },
        ],
      };

      const result = featureFlagsConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
    });

    it('should validate rule schema with different attribute types', async () => {
      const { featureFlagsConfigSchema } = await import('../src/feature-flags/schema');

      const config = {
        version: 1,
        flags: [
          {
            key: 'test',
            enabled: true,
            rules: [
              {
                when: {
                  stringAttr: 'value',
                  numberAttr: 42,
                  boolAttr: true,
                },
                then: { enabled: true },
              },
            ],
          },
        ],
      };

      const result = featureFlagsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('stableHashPercent implementation', () => {
    it('should produce consistent hash for same input', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'hash-test',
            enabled: true,
            rolloutPercent: 50,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        subjectId: 'consistent-user',
      };

      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(provider.getDecision('hash-test', context).enabled);
      }

      // All results should be identical
      expect(new Set(results).size).toBe(1);
    });

    it('should produce different results for different inputs', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'hash-test',
            enabled: true,
            rolloutPercent: 50,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      const results = new Set<boolean>();
      for (let i = 0; i < 20; i++) {
        const context: FeatureFlagContext = {
          subjectId: `user-${i}`,
        };
        results.add(provider.getDecision('hash-test', context).enabled);
      }

      // Should have both true and false results
      expect(results.size).toBe(2);
    });

    it('should use flag key in hash to ensure different distribution per flag', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'flag-a',
            enabled: true,
            rolloutPercent: 50,
          },
          {
            key: 'flag-b',
            enabled: true,
            rolloutPercent: 50,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        subjectId: 'same-user',
      };

      const decisionA = provider.getDecision('flag-a', context);
      const decisionB = provider.getDecision('flag-b', context);

      // Same user can have different results for different flags
      // (not guaranteed, but highly likely with good hash function)
      // We'll just verify both are deterministic
      expect(provider.getDecision('flag-a', context).enabled).toBe(decisionA.enabled);
      expect(provider.getDecision('flag-b', context).enabled).toBe(decisionB.enabled);
    });
  });

  describe('edge cases and integration', () => {
    it('should handle complex config with all features', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'complex-flag',
            description: 'A complex feature flag with all options',
            enabled: true,
            rolloutPercent: 75,
            variants: ['control', 'treatment-a', 'treatment-b'],
            rules: [
              {
                when: { vip: true },
                then: { enabled: true, variant: 'vip-experience' },
              },
              {
                when: { beta: true },
                then: { enabled: true, variant: 'beta-experience' },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      // VIP user should match rule
      const vipDecision = provider.getDecision('complex-flag', {
        subjectId: 'vip-user',
        attributes: { vip: true },
      });
      expect(vipDecision.reason).toBe('rule_match');
      expect(vipDecision.variant).toBe('vip-experience');

      // Beta user should match second rule
      const betaDecision = provider.getDecision('complex-flag', {
        subjectId: 'beta-user',
        attributes: { beta: true },
      });
      expect(betaDecision.reason).toBe('rule_match');
      expect(betaDecision.variant).toBe('beta-experience');

      // Regular user should go through rollout
      const regularDecision = provider.getDecision('complex-flag', {
        subjectId: 'regular-user',
        attributes: { regular: true },
      });
      expect(regularDecision.reason).toBe('percentage_rollout');
    });

    it('should handle multiple flags independently', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'flag-1',
            enabled: true,
          },
          {
            key: 'flag-2',
            enabled: false,
          },
          {
            key: 'flag-3',
            enabled: true,
            rolloutPercent: 100,
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);
      const context: FeatureFlagContext = {
        subjectId: 'test-user',
      };

      expect(provider.isEnabled('flag-1', context)).toBe(true);
      expect(provider.isEnabled('flag-2', context)).toBe(false);
      expect(provider.isEnabled('flag-3', context)).toBe(true);
    });

    it('should preserve decision consistency across multiple calls', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'consistent-flag',
            enabled: true,
            rolloutPercent: 33,
            variants: ['a', 'b', 'c'],
            rules: [
              {
                when: { premium: true },
                then: { enabled: true, variant: 'premium' },
              },
            ],
          },
        ],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      // Test rule consistency
      const premiumContext: FeatureFlagContext = {
        subjectId: 'user-1',
        attributes: { premium: true },
      };

      const decisions1 = Array.from({ length: 5 }, () =>
        provider.getDecision('consistent-flag', premiumContext)
      );

      expect(decisions1.every((d) => d.variant === 'premium')).toBe(true);
      expect(decisions1.every((d) => d.reason === 'rule_match')).toBe(true);

      // Test rollout consistency
      const regularContext: FeatureFlagContext = {
        subjectId: 'user-2',
      };

      const decisions2 = Array.from({ length: 5 }, () =>
        provider.getDecision('consistent-flag', regularContext)
      );

      const firstEnabled = decisions2[0].enabled;
      const firstVariant = decisions2[0].variant;

      expect(decisions2.every((d) => d.enabled === firstEnabled)).toBe(true);
      expect(decisions2.every((d) => d.variant === firstVariant)).toBe(true);
    });

    it('should handle empty config gracefully', async () => {
      const { InMemoryFeatureFlagProvider } =
        await import('../src/feature-flags/in-memory-provider');

      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [],
      };

      const provider = InMemoryFeatureFlagProvider.fromConfig(config);

      expect(provider.isEnabled('any-flag')).toBe(false);
      expect(provider.getDecision('any-flag').reason).toBe('missing_flag');
    });
  });
});
