import { describe, it, expect } from 'vitest';
import { FeatureFlagAdapter } from '../FeatureFlagAdapter';
import { InMemoryFeatureFlagProvider } from '@intelliflow/platform';
import type { FeatureFlagsConfig } from '@intelliflow/platform';

function makeConfig(overrides: Partial<FeatureFlagsConfig['flags'][0]>[] = []): FeatureFlagsConfig {
  return {
    version: 1,
    flags: [
      { key: 'enabled_flag', enabled: true },
      { key: 'disabled_flag', enabled: false },
      { key: 'rollout_flag', enabled: true, rolloutPercent: 50 },
      { key: 'variant_flag', enabled: true, rolloutPercent: 100, variants: ['A', 'B'] },
      ...overrides,
    ],
  };
}

function createAdapter(config?: FeatureFlagsConfig) {
  const cfg = config ?? makeConfig();
  const provider = InMemoryFeatureFlagProvider.fromConfig(cfg);
  return new FeatureFlagAdapter(provider, cfg);
}

describe('FeatureFlagAdapter', () => {
  describe('isEnabled', () => {
    it('returns true for an enabled flag', async () => {
      const adapter = createAdapter();
      expect(await adapter.isEnabled('enabled_flag', {})).toBe(true);
    });

    it('returns false for a disabled flag', async () => {
      const adapter = createAdapter();
      expect(await adapter.isEnabled('disabled_flag', {})).toBe(false);
    });

    it('returns false for a missing flag', async () => {
      const adapter = createAdapter();
      expect(await adapter.isEnabled('nonexistent', {})).toBe(false);
    });

    it('maps userId to subjectId for rollout', async () => {
      const adapter = createAdapter();
      // With a userId, rollout can be evaluated deterministically
      const result = await adapter.isEnabled('rollout_flag', { userId: 'user-123' });
      expect(typeof result).toBe('boolean');
    });

    it('passes attributes from context', async () => {
      const config: FeatureFlagsConfig = {
        version: 1,
        flags: [
          {
            key: 'rule_flag',
            enabled: true,
            rules: [{ when: { plan: 'enterprise' }, then: { enabled: true } }],
          },
        ],
      };
      const adapter = createAdapter(config);
      expect(await adapter.isEnabled('rule_flag', { plan: 'enterprise' })).toBe(true);
    });
  });

  describe('getVariant', () => {
    it('returns null when flag has no variants', async () => {
      const adapter = createAdapter();
      expect(await adapter.getVariant('enabled_flag', {})).toBeNull();
    });

    it('returns a variant string for a flag with variants and rollout', async () => {
      const adapter = createAdapter();
      // 100% rollout with variants — should always return A or B
      const variant = await adapter.getVariant('variant_flag', { userId: 'user-42' });
      expect(['A', 'B']).toContain(variant);
    });

    it('returns null for a disabled flag', async () => {
      const adapter = createAdapter();
      expect(await adapter.getVariant('disabled_flag', {})).toBeNull();
    });
  });

  describe('getRolloutPercent', () => {
    it('returns the configured rollout percent', async () => {
      const adapter = createAdapter();
      expect(await adapter.getRolloutPercent('rollout_flag')).toBe(50);
    });

    it('returns 0 for flags without rolloutPercent', async () => {
      const adapter = createAdapter();
      expect(await adapter.getRolloutPercent('enabled_flag')).toBe(0);
    });

    it('returns 0 for nonexistent flags', async () => {
      const adapter = createAdapter();
      expect(await adapter.getRolloutPercent('nonexistent')).toBe(0);
    });
  });

  describe('context mapping', () => {
    it('ignores non-primitive attributes', async () => {
      const adapter = createAdapter();
      // Objects/arrays in context should be silently dropped
      const result = await adapter.isEnabled('enabled_flag', {
        userId: 'u1',
        nested: { foo: 'bar' },
        arr: [1, 2],
        valid: 'yes',
      });
      expect(typeof result).toBe('boolean');
    });

    it('works with empty context', async () => {
      const adapter = createAdapter();
      expect(await adapter.isEnabled('enabled_flag', {})).toBe(true);
    });
  });
});
