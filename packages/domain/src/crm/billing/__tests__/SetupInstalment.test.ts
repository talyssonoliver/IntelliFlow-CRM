import { describe, it, expect } from 'vitest';
import {
  buildSetupInstalmentPlan,
  DEFAULT_SETUP_FEE_CENTS,
  DEFAULT_SETUP_CURRENCY,
  SETUP_PLANS,
  type DeliveryTier,
} from '../SetupInstalment';

const SIGNED = new Date('2026-06-01T00:00:00.000Z');

describe('buildSetupInstalmentPlan', () => {
  it('builds the documented default: 3 × £167 at day 0 / 7 / 14', () => {
    const plan = buildSetupInstalmentPlan({ signedAt: SIGNED });

    expect(plan).toHaveLength(3);
    expect(plan.map((i) => i.n)).toEqual([1, 2, 3]);
    expect(plan.every((i) => i.amountCents === DEFAULT_SETUP_FEE_CENTS)).toBe(true);
    expect(plan.every((i) => i.currency === DEFAULT_SETUP_CURRENCY)).toBe(true);
    expect(plan.every((i) => i.status === 'due')).toBe(true);
  });

  it('anchors due dates on signedAt at +0 / +7 / +14 days (UTC)', () => {
    const [a, b, c] = buildSetupInstalmentPlan({ signedAt: SIGNED });
    expect(a.dueAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(b.dueAt.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(c.dueAt.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('defaults to the core tier when tier is omitted', () => {
    const omitted = buildSetupInstalmentPlan({ signedAt: SIGNED });
    const core = buildSetupInstalmentPlan({ signedAt: SIGNED, tier: 'core' });
    expect(omitted).toEqual(core);
  });

  it.each<DeliveryTier>(['core', 'premium', 'pilot'])(
    'ships the standard 3 × £167 plan for tier %s',
    (tier) => {
      const plan = buildSetupInstalmentPlan({ signedAt: SIGNED, tier });
      expect(plan).toHaveLength(3);
      expect(plan.reduce((sum, i) => sum + i.amountCents, 0)).toBe(DEFAULT_SETUP_FEE_CENTS * 3);
    }
  );

  it('does not mutate the input signedAt', () => {
    const signed = new Date('2026-06-01T00:00:00.000Z');
    buildSetupInstalmentPlan({ signedAt: signed });
    expect(signed.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('crosses month boundaries correctly (signature near month end)', () => {
    const [, , third] = buildSetupInstalmentPlan({
      signedAt: new Date('2026-06-30T00:00:00.000Z'),
    });
    // 30 Jun + 14 days = 14 Jul
    expect(third.dueAt.toISOString()).toBe('2026-07-14T00:00:00.000Z');
  });

  it('exposes a per-tier plan map keyed by every DeliveryTier', () => {
    expect(Object.keys(SETUP_PLANS).sort()).toEqual(['core', 'pilot', 'premium']);
    expect(SETUP_PLANS.core.dayOffsets).toEqual([0, 7, 14]);
  });
});
