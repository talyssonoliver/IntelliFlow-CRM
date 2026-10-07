/**
 * Tenant-configurable account tiers (PG-196, ADR-073).
 *
 * The tier of an account is derived from its annual revenue through one pure
 * resolver. The default configuration reproduces the IFC-273 bands exactly, so
 * a tenant that never edits its tiers sees no change.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIER_CONFIG,
  MAX_TIERS,
  UNKNOWN_TIER_KEY,
  InvalidTierConfigError,
  resolveAccountTier,
  tierBand,
  validateTierConfig,
  type TierConfig,
  type TierDefinition,
} from '../AccountTierConfig';

const tier = (key: string, minRevenue: number, label = key): TierDefinition => ({
  key,
  label,
  minRevenue,
  colorToken: 'slate',
  benefits: [],
});

const config = (tiers: TierDefinition[], defaultTierKey: string | null = null): TierConfig => ({
  tiers,
  defaultTierKey,
});

describe('DEFAULT_TIER_CONFIG', () => {
  it('is the four canonical revenue tiers with no default tier', () => {
    expect(DEFAULT_TIER_CONFIG.defaultTierKey).toBeNull();
    expect(
      DEFAULT_TIER_CONFIG.tiers.map((t) => [t.key, t.label, t.minRevenue, t.colorToken])
    ).toEqual([
      ['ENTERPRISE', 'Enterprise', 10_000_000, 'purple'],
      ['MID_MARKET', 'Mid-Market', 1_000_000, 'blue'],
      ['SMB', 'SMB', 100_000, 'green'],
      ['STARTUP', 'Startup', 0, 'yellow'],
    ]);
    expect(DEFAULT_TIER_CONFIG.tiers.every((t) => t.benefits.length === 0)).toBe(true);
  });

  it('passes its own validation', () => {
    expect(validateTierConfig(DEFAULT_TIER_CONFIG).isSuccess).toBe(true);
  });

  it('exposes the reserved UNKNOWN key and the tier cap', () => {
    expect(UNKNOWN_TIER_KEY).toBe('UNKNOWN');
    expect(MAX_TIERS).toBe(10);
  });
});

describe('resolveAccountTier — default bands', () => {
  it.each([
    [99_999.99, 'STARTUP'],
    [100_000, 'SMB'],
    [100_000.01, 'SMB'],
    [999_999.99, 'SMB'],
    [1_000_000, 'MID_MARKET'],
    [1_000_000.01, 'MID_MARKET'],
    [9_999_999.99, 'MID_MARKET'],
    [10_000_000, 'ENTERPRISE'],
    [10_000_000.01, 'ENTERPRISE'],
    [0, 'STARTUP'],
  ])('revenue %s resolves to %s', (revenue, expected) => {
    expect(resolveAccountTier(revenue, DEFAULT_TIER_CONFIG)).toBe(expected);
  });

  it('resolves null and undefined revenue to UNKNOWN when no default tier is set', () => {
    expect(resolveAccountTier(null, DEFAULT_TIER_CONFIG)).toBe('UNKNOWN');
    expect(resolveAccountTier(undefined, DEFAULT_TIER_CONFIG)).toBe('UNKNOWN');
  });

  it('resolves negative revenue to the lowest tier so the resolver is total', () => {
    expect(resolveAccountTier(-5, DEFAULT_TIER_CONFIG)).toBe('STARTUP');
  });
});

describe('resolveAccountTier — custom configuration', () => {
  it('uses the default tier for null revenue when one is set', () => {
    const cfg = { ...DEFAULT_TIER_CONFIG, defaultTierKey: 'SMB' as const };
    expect(resolveAccountTier(null, cfg)).toBe('SMB');
    expect(resolveAccountTier(undefined, cfg)).toBe('SMB');
  });

  it('does not treat zero revenue as unknown', () => {
    const cfg = config([tier('LOW', 0), tier('HIGH', 50)], 'HIGH');
    expect(resolveAccountTier(0, cfg)).toBe('LOW');
  });

  it('sorts defensively and never mutates the input array', () => {
    const tiers = [tier('MID', 500), tier('TOP', 5_000), tier('BASE', 0)];
    const snapshot = tiers.map((t) => t.key);
    const cfg = config(tiers);
    expect(resolveAccountTier(499.99, cfg)).toBe('BASE');
    expect(resolveAccountTier(500, cfg)).toBe('MID');
    expect(resolveAccountTier(5_000, cfg)).toBe('TOP');
    expect(tiers.map((t) => t.key)).toEqual(snapshot);
  });

  it('resolves everything to the only tier of a single-tier config', () => {
    const cfg = config([tier('ALL', 0)]);
    expect(resolveAccountTier(0, cfg)).toBe('ALL');
    expect(resolveAccountTier(1e12, cfg)).toBe('ALL');
  });

  it('supports custom tiers beyond the four defaults', () => {
    const cfg = config([
      tier('STARTUP', 0),
      tier('SMB', 100_000),
      tier('GROWTH', 500_000),
      tier('MID_MARKET', 1_000_000),
      tier('ENTERPRISE', 10_000_000),
      tier('STRATEGIC', 50_000_000),
    ]);
    expect(resolveAccountTier(750_000, cfg)).toBe('GROWTH');
    expect(resolveAccountTier(60_000_000, cfg)).toBe('STRATEGIC');
  });

  it('returns UNKNOWN for an empty tier list with revenue present', () => {
    expect(resolveAccountTier(10, config([]))).toBe('UNKNOWN');
  });
});

describe('validateTierConfig', () => {
  const expectError = (cfg: TierConfig, fragment: string) => {
    const result = validateTierConfig(cfg);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidTierConfigError);
    expect(result.error.code).toBe('INVALID_TIER_CONFIG');
    expect(result.error.message).toContain(fragment);
  };

  it('rejects an empty tier list', () => {
    expectError(config([]), 'at least one tier');
  });

  it('rejects more than ten tiers', () => {
    const tiers = Array.from({ length: 11 }, (_, i) => tier(`T${i}`, i * 10));
    expectError(config(tiers), 'at most 10');
  });

  it('rejects keys that do not match the key format', () => {
    expectError(config([tier('lower', 0)]), 'key');
    expectError(config([tier('1ST', 0)]), 'key');
    expectError(config([tier('A'.repeat(41), 0)]), 'key');
  });

  it('rejects the reserved UNKNOWN key', () => {
    expectError(config([tier('UNKNOWN', 0)]), 'reserved');
  });

  it('rejects duplicate keys', () => {
    expectError(config([tier('A', 0), tier('A', 10)]), 'duplicate key');
  });

  it('rejects duplicate labels ignoring case and surrounding spaces', () => {
    expectError(config([tier('A', 0, 'Gold'), tier('B', 10, ' gold ')]), 'duplicate name');
  });

  it('rejects empty labels', () => {
    expectError(config([tier('A', 0, '  ')]), 'name');
  });

  it('rejects negative and non-finite minimum revenue', () => {
    expectError(config([tier('A', 0), tier('B', -1)]), 'minimum revenue');
    expectError(config([tier('A', 0), tier('B', Number.POSITIVE_INFINITY)]), 'minimum revenue');
    expectError(config([tier('A', 0), tier('B', Number.NaN)]), 'minimum revenue');
  });

  it('rejects two tiers with the same minimum revenue', () => {
    expectError(config([tier('A', 0), tier('B', 10), tier('C', 10)]), 'same minimum revenue');
  });

  it('rejects a configuration where no tier starts at 0', () => {
    expectError(config([tier('A', 5), tier('B', 10)]), 'start at 0');
  });

  it('rejects a default tier that is not one of the tiers', () => {
    expectError(config([tier('A', 0)], 'B'), 'default tier');
  });

  it('accepts a valid custom configuration with a default tier', () => {
    const cfg = config([tier('A', 0), tier('B', 10)], 'B');
    const result = validateTierConfig(cfg);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe(cfg);
  });
});

describe('tierBand', () => {
  it('returns the lowest band up to the next threshold', () => {
    expect(tierBand(DEFAULT_TIER_CONFIG, 'STARTUP')).toEqual({ gte: 0, lt: 100_000 });
  });

  it('returns a middle band', () => {
    expect(tierBand(DEFAULT_TIER_CONFIG, 'MID_MARKET')).toEqual({ gte: 1_000_000, lt: 10_000_000 });
  });

  it('returns an open-ended top band', () => {
    expect(tierBand(DEFAULT_TIER_CONFIG, 'ENTERPRISE')).toEqual({ gte: 10_000_000, lt: null });
  });

  it('returns null for an unknown key', () => {
    expect(tierBand(DEFAULT_TIER_CONFIG, 'PLATINUM')).toBeNull();
  });
});
