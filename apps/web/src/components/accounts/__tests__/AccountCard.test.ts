/**
 * AccountCard Tests (PG-134)
 *
 * Tests for getAccountTier, TIER_CONFIG, formatDate, and createAccountColumns utility.
 * Pure logic tests — no React rendering required.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAccountTier, TIER_CONFIG, createAccountColumns, type AccountRow } from '../AccountCard';

describe('getAccountTier()', () => {
  it('returns ENTERPRISE for revenue >= 10M', () => {
    expect(getAccountTier(10_000_000)).toBe('ENTERPRISE');
    expect(getAccountTier(50_000_000)).toBe('ENTERPRISE');
  });

  it('returns MID_MARKET for revenue >= 1M and < 10M', () => {
    expect(getAccountTier(1_000_000)).toBe('MID_MARKET');
    expect(getAccountTier(9_999_999)).toBe('MID_MARKET');
  });

  it('returns SMB for revenue >= 100K and < 1M', () => {
    expect(getAccountTier(100_000)).toBe('SMB');
    expect(getAccountTier(999_999)).toBe('SMB');
  });

  it('returns STARTUP for revenue < 100K', () => {
    expect(getAccountTier(0)).toBe('STARTUP');
    expect(getAccountTier(99_999)).toBe('STARTUP');
  });

  it('returns UNKNOWN for null revenue', () => {
    expect(getAccountTier(null)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined revenue', () => {
    expect(getAccountTier(undefined)).toBe('UNKNOWN');
  });
});

describe('TIER_CONFIG', () => {
  it('has label, color, dot, and avatarBg for every tier', () => {
    const tiers = ['ENTERPRISE', 'MID_MARKET', 'SMB', 'STARTUP', 'UNKNOWN'] as const;
    for (const tier of tiers) {
      const config = TIER_CONFIG[tier];
      expect(config.label).toBeTruthy();
      expect(config.color).toBeTruthy();
      expect(config.dot).toBeTruthy();
      expect(config.avatarBg).toBeTruthy();
    }
  });

  it('ENTERPRISE label is "Enterprise"', () => {
    expect(TIER_CONFIG.ENTERPRISE.label).toBe('Enterprise');
  });

  it('UNKNOWN label is "Unknown"', () => {
    expect(TIER_CONFIG.UNKNOWN.label).toBe('Unknown');
  });
});

describe('createAccountColumns()', () => {
  const handlers = {
    onView: vi.fn(),
    onEdit: vi.fn(),
    onCreateDeal: vi.fn(),
    onDelete: vi.fn(),
  };

  it('returns 7 column definitions', () => {
    const columns = createAccountColumns(handlers);
    expect(columns).toHaveLength(7);
  });

  it('includes expected column headers', () => {
    const columns = createAccountColumns(handlers);
    const headers = columns.map((c) => c.header);
    expect(headers).toContain('Name');
    expect(headers).toContain('Industry');
    expect(headers).toContain('Revenue');
    expect(headers).toContain('Employees');
    expect(headers).toContain('Owner');
    expect(headers).toContain('Created Date');
  });

  it('has an actions column', () => {
    const columns = createAccountColumns(handlers);
    const actionsCol = columns.find((c) => 'id' in c && c.id === 'actions');
    expect(actionsCol).toBeDefined();
    expect(actionsCol!.header).toBe('Actions');
  });
});
