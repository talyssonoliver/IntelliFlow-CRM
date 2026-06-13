/**
 * Account Tier classification - Domain enum + pure revenue-band function (IFC-273, L-04).
 *
 * Moved out of apps/web AccountCard.tsx so the tier vocabulary is a single
 * source of truth in the domain layer (matching the CONTACT_STATUSES /
 * OPPORTUNITY_STAGES DRY-enum pattern).
 */
import { describe, it, expect } from 'vitest';
import { ACCOUNT_TIERS, getAccountTier, type AccountTier } from '../Account';

describe('ACCOUNT_TIERS (domain enum)', () => {
  it('is the canonical tier vocabulary', () => {
    expect(ACCOUNT_TIERS).toEqual(['ENTERPRISE', 'MID_MARKET', 'SMB', 'STARTUP', 'UNKNOWN']);
  });

  it('every value is a valid AccountTier', () => {
    for (const tier of ACCOUNT_TIERS) {
      const t: AccountTier = tier;
      expect(typeof t).toBe('string');
    }
  });
});

describe('getAccountTier (revenue band)', () => {
  it('returns UNKNOWN when revenue is null', () => {
    expect(getAccountTier(null)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when revenue is undefined', () => {
    expect(getAccountTier(undefined)).toBe('UNKNOWN');
  });

  it('returns ENTERPRISE at the >= 10M boundary', () => {
    expect(getAccountTier(10_000_000)).toBe('ENTERPRISE');
    expect(getAccountTier(25_000_000)).toBe('ENTERPRISE');
  });

  it('returns MID_MARKET at the >= 1M boundary (below 10M)', () => {
    expect(getAccountTier(1_000_000)).toBe('MID_MARKET');
    expect(getAccountTier(9_999_999)).toBe('MID_MARKET');
  });

  it('returns SMB at the >= 100K boundary (below 1M)', () => {
    expect(getAccountTier(100_000)).toBe('SMB');
    expect(getAccountTier(999_999)).toBe('SMB');
  });

  it('returns STARTUP below 100K', () => {
    expect(getAccountTier(99_999)).toBe('STARTUP');
    expect(getAccountTier(0)).toBe('STARTUP');
  });
});
