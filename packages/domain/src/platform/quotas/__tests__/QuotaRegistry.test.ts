import { describe, it, expect } from 'vitest';
import {
  QUOTA_KEYS,
  QUOTA_PLAN_MAP,
  getQuotaLimitsForPlan,
  getQuotaPeriod,
  isMonthlyQuotaKey,
  isQuotaKey,
  isWithinQuota,
} from '../QuotaRegistry';
import { QuotaExceededError, QUOTA_EXCEEDED_CODE } from '../QuotaExceededError';
import { MODULE_PLAN_MAP, PLAN_TIERS } from '../../modules/ModuleRegistry';

describe('QUOTA_PLAN_MAP', () => {
  it('defines every quota key for every plan tier', () => {
    for (const tier of PLAN_TIERS) {
      expect(Object.keys(QUOTA_PLAN_MAP[tier]).sort()).toEqual([...QUOTA_KEYS].sort());
    }
  });

  it('gives PARTNER_FREE the capped defaults with paid capabilities disabled', () => {
    expect(QUOTA_PLAN_MAP.PARTNER_FREE).toEqual({
      contacts: 500,
      seats: 2,
      emailsPerMonth: 0,
      aiSpendCentsPerMonth: 0,
      workflowsActive: 0,
    });
  });

  it('matches the STARTER and PROFESSIONAL defaults', () => {
    expect(QUOTA_PLAN_MAP.STARTER).toEqual({
      contacts: 2000,
      seats: 3,
      emailsPerMonth: 500,
      aiSpendCentsPerMonth: 2000,
      workflowsActive: 3,
    });
    expect(QUOTA_PLAN_MAP.PROFESSIONAL).toEqual({
      contacts: 20000,
      seats: 10,
      emailsPerMonth: 5000,
      aiSpendCentsPerMonth: 20000,
      workflowsActive: 25,
    });
  });

  it('leaves ENTERPRISE and CUSTOM unlimited', () => {
    for (const tier of ['ENTERPRISE', 'CUSTOM'] as const) {
      for (const key of QUOTA_KEYS) {
        expect(QUOTA_PLAN_MAP[tier][key]).toBeNull();
      }
    }
  });
});

describe('PARTNER_FREE module entitlement', () => {
  it('includes only CORE_CRM and is the first tier', () => {
    expect(PLAN_TIERS[0]).toBe('PARTNER_FREE');
    expect(MODULE_PLAN_MAP.PARTNER_FREE).toEqual(['CORE_CRM']);
  });
});

describe('helpers', () => {
  it('recognises quota keys', () => {
    expect(isQuotaKey('contacts')).toBe(true);
    expect(isQuotaKey('nope')).toBe(false);
    expect(isQuotaKey(42)).toBe(false);
  });

  it('flags monthly keys', () => {
    expect(isMonthlyQuotaKey('emailsPerMonth')).toBe(true);
    expect(isMonthlyQuotaKey('aiSpendCentsPerMonth')).toBe(true);
    expect(isMonthlyQuotaKey('contacts')).toBe(false);
  });

  it('returns a copy of the plan limits', () => {
    const limits = getQuotaLimitsForPlan('STARTER');
    limits.contacts = 1;
    expect(QUOTA_PLAN_MAP.STARTER.contacts).toBe(2000);
  });

  it('buckets monthly keys by UTC month and others under all', () => {
    const now = new Date('2026-03-31T23:59:59Z');
    expect(getQuotaPeriod('emailsPerMonth', now)).toBe('2026-03');
    expect(getQuotaPeriod('aiSpendCentsPerMonth', new Date('2026-12-01T00:00:00Z'))).toBe(
      '2026-12'
    );
    expect(getQuotaPeriod('contacts', now)).toBe('all');
    expect(getQuotaPeriod('emailsPerMonth')).toMatch(/^\d{4}-\d{2}$/);
  });

  it('checks used + increment against the limit', () => {
    expect(isWithinQuota(499, 1, 500)).toBe(true);
    expect(isWithinQuota(500, 1, 500)).toBe(false);
    expect(isWithinQuota(0, 1, 0)).toBe(false);
    expect(isWithinQuota(0, 0, 0)).toBe(true);
    expect(isWithinQuota(10_000_000, 5, null)).toBe(true);
    expect(isWithinQuota(600, 1, 500)).toBe(false);
  });
});

describe('QuotaExceededError', () => {
  it('carries the key, usage and limit', () => {
    const err = new QuotaExceededError('contacts', 500, 500, 2);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('QuotaExceededError');
    expect(err.code).toBe(QUOTA_EXCEEDED_CODE);
    expect(err.key).toBe('contacts');
    expect(err.used).toBe(500);
    expect(err.limit).toBe(500);
    expect(err.increment).toBe(2);
    expect(err.message).toContain('contacts');
  });

  it('defaults the increment to 1', () => {
    expect(new QuotaExceededError('seats', 2, 2).increment).toBe(1);
  });
});
