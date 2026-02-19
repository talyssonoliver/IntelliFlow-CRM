import { describe, it, expect } from 'vitest';
import {
  getAccountTier,
  TIER_CONFIG,
  createAccountColumns,
  type AccountRowHandlers,
  type AccountTier,
} from '../AccountCard';

describe('getAccountTier', () => {
  it('should return ENTERPRISE for revenue >= 10M', () => {
    expect(getAccountTier(10_000_000)).toBe('ENTERPRISE');
    expect(getAccountTier(50_000_000)).toBe('ENTERPRISE');
  });

  it('should return MID_MARKET for revenue >= 1M and < 10M', () => {
    expect(getAccountTier(1_000_000)).toBe('MID_MARKET');
    expect(getAccountTier(5_000_000)).toBe('MID_MARKET');
    expect(getAccountTier(9_999_999)).toBe('MID_MARKET');
  });

  it('should return SMB for revenue >= 100K and < 1M', () => {
    expect(getAccountTier(100_000)).toBe('SMB');
    expect(getAccountTier(500_000)).toBe('SMB');
    expect(getAccountTier(999_999)).toBe('SMB');
  });

  it('should return STARTUP for revenue > 0 and < 100K', () => {
    expect(getAccountTier(1)).toBe('STARTUP');
    expect(getAccountTier(50_000)).toBe('STARTUP');
    expect(getAccountTier(99_999)).toBe('STARTUP');
  });

  it('should return STARTUP for zero revenue', () => {
    expect(getAccountTier(0)).toBe('STARTUP');
  });

  it('should return UNKNOWN for null revenue', () => {
    expect(getAccountTier(null)).toBe('UNKNOWN');
  });

  it('should return UNKNOWN for undefined revenue', () => {
    expect(getAccountTier(undefined)).toBe('UNKNOWN');
  });
});

describe('TIER_CONFIG', () => {
  const tiers: AccountTier[] = ['ENTERPRISE', 'MID_MARKET', 'SMB', 'STARTUP', 'UNKNOWN'];

  it('should have configs for all 5 tiers', () => {
    expect(Object.keys(TIER_CONFIG)).toHaveLength(5);
    for (const tier of tiers) {
      expect(TIER_CONFIG[tier]).toBeDefined();
    }
  });

  it.each(tiers)('should have label, color, dot, avatarBg for %s', (tier) => {
    const config = TIER_CONFIG[tier];
    expect(config.label).toBeTruthy();
    expect(config.color).toBeTruthy();
    expect(config.dot).toBeTruthy();
    expect(config.avatarBg).toBeTruthy();
  });
});

describe('createAccountColumns', () => {
  const handlers: AccountRowHandlers = {
    onView: () => {},
    onEdit: () => {},
    onCreateDeal: () => {},
    onDelete: () => {},
  };

  it('should return an array of column definitions', () => {
    const columns = createAccountColumns(handlers);
    expect(Array.isArray(columns)).toBe(true);
    expect(columns.length).toBeGreaterThan(0);
  });

  it('should include name, industry, revenue, employees, owner, createdAt, and actions columns', () => {
    const columns = createAccountColumns(handlers);
    const ids = columns.map((c) => (c as any).accessorKey || (c as any).id);

    expect(ids).toContain('name');
    expect(ids).toContain('industry');
    expect(ids).toContain('revenue');
    expect(ids).toContain('employees');
    expect(ids).toContain('owner');
    expect(ids).toContain('createdAt');
    expect(ids).toContain('actions');
  });

  it('should have 7 columns total', () => {
    const columns = createAccountColumns(handlers);
    expect(columns).toHaveLength(7);
  });
});
