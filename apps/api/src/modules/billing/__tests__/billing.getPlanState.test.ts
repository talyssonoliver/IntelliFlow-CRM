/**
 * Tests for billing.getPlanState and resolvePriceId
 *
 * @implements incident 2026-06-16 onboarding redesign
 *
 * Coverage:
 *   A. resolvePriceId — env hit + missing-env throw
 *   B. getPlanState   — one resolver: stored trial end, Tenant.plan tier, ended trials,
 *                       partner plans and paid subscriptions (#1220)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { resolvePriceId } from '../billing.router';
import { billingRouter } from '../billing.router';
import { prismaMock, createTestContext } from '../../../test/setup';

// ============================================================
// A. resolvePriceId
// ============================================================

describe('resolvePriceId', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the price ID from the correct env var', () => {
    vi.stubEnv('STRIPE_PRICE_STARTER_MONTHLY', 'price_real_starter_monthly');
    expect(resolvePriceId('starter', 'monthly')).toBe('price_real_starter_monthly');
  });

  it('is case-insensitive for planId (uppercase lookup)', () => {
    vi.stubEnv('STRIPE_PRICE_PROFESSIONAL_ANNUAL', 'price_real_pro_annual');
    expect(resolvePriceId('professional', 'annual')).toBe('price_real_pro_annual');
    expect(resolvePriceId('PROFESSIONAL', 'annual')).toBe('price_real_pro_annual');
    expect(resolvePriceId('Professional', 'annual')).toBe('price_real_pro_annual');
  });

  it('handles ENTERPRISE plan both cycles', () => {
    vi.stubEnv('STRIPE_PRICE_ENTERPRISE_MONTHLY', 'price_ent_mo');
    vi.stubEnv('STRIPE_PRICE_ENTERPRISE_ANNUAL', 'price_ent_yr');
    expect(resolvePriceId('enterprise', 'monthly')).toBe('price_ent_mo');
    expect(resolvePriceId('enterprise', 'annual')).toBe('price_ent_yr');
  });

  it('throws INTERNAL_SERVER_ERROR with the env var name when the env var is missing', () => {
    // Ensure env var is not set
    vi.stubEnv('STRIPE_PRICE_STARTER_MONTHLY', '');
    // Delete it so it's truly absent
    delete process.env['STRIPE_PRICE_STARTER_MONTHLY'];

    expect(() => resolvePriceId('starter', 'monthly')).toThrow(TRPCError);

    try {
      resolvePriceId('starter', 'monthly');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((err as TRPCError).message).toContain('STRIPE_PRICE_STARTER_MONTHLY');
    }
  });

  it('throws for an unknown plan tier if env var is absent', () => {
    delete process.env['STRIPE_PRICE_BOGUS_MONTHLY'];
    expect(() => resolvePriceId('bogus', 'monthly')).toThrow(TRPCError);
  });
});

// ============================================================
// B. getPlanState — one resolver for plan and trial (#1220)
// ============================================================

const NOW = new Date('2026-11-07T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const tenantRow = (over: Record<string, unknown> = {}) =>
  ({
    createdAt: new Date(NOW.getTime() - 3 * DAY),
    plan: 'STARTER',
    trialEndsAt: null,
    ...over,
  }) as any;

const subRow = (status: 'ACTIVE' | 'PAST_DUE', currentPeriodEnd: Date | null) =>
  ({ status, currentPeriodEnd }) as any;

async function planState() {
  return billingRouter.createCaller(createTestContext() as any).getPlanState();
}

describe('billing.getPlanState — trial', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it('uses the stored trial end, not the age of the workspace', async () => {
    // Created long ago, but the stored end is 5 days away: the badge must say 5, not 0.
    prismaMock.tenant.findUnique.mockResolvedValue(
      tenantRow({
        createdAt: new Date('2026-06-16T00:00:00Z'),
        trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
      })
    );

    const result = await planState();

    expect(result).toMatchObject({ source: 'trial', status: 'TRIALING', daysLeft: 5 });
    expect(result.trialEndsAt).toBe(new Date(NOW.getTime() + 5 * DAY).toISOString());
  });

  it('falls back to created + 14 days while a row has no stored trial end', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      tenantRow({ createdAt: new Date('2026-11-01T12:00:00Z'), trialEndsAt: null })
    );

    const result = await planState();

    expect(result.trialEndsAt).toBe('2026-11-15T12:00:00.000Z');
    expect(result).toMatchObject({ status: 'TRIALING', daysLeft: 8 });
  });

  it('reports the tier access enforcement uses (Tenant.plan), not a made-up PROFESSIONAL', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantRow({ plan: 'STARTER' }));

    expect((await planState()).tier).toBe('STARTER');
  });

  it('says the trial ended, instead of "0 days left", once the end has passed', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      tenantRow({ trialEndsAt: new Date(NOW.getTime() - DAY) })
    );

    expect(await planState()).toMatchObject({
      source: 'trial',
      status: 'TRIAL_ENDED',
      daysLeft: 0,
    });
  });

  it('counts a trial ending exactly now as ended', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantRow({ trialEndsAt: NOW }));

    expect((await planState()).status).toBe('TRIAL_ENDED');
  });

  it('rounds a part day up, so the last day still reads "1 day left"', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      tenantRow({ trialEndsAt: new Date(NOW.getTime() + 60 * 60 * 1000) })
    );

    expect(await planState()).toMatchObject({ status: 'TRIALING', daysLeft: 1 });
  });

  it('reads plan and trial end in the same query as the creation date', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantRow());

    await planState();

    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { createdAt: true, plan: true, trialEndsAt: true },
      })
    );
  });

  it('starts from now when the tenant row is missing', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(null);

    const result = await planState();

    expect(result).toMatchObject({ source: 'trial', tier: 'STARTER', daysLeft: 14 });
  });
});

describe('billing.getPlanState — PARTNER_FREE', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it('reports a partner plan with no trial dates, whatever the stored trial end', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      tenantRow({ plan: 'PARTNER_FREE', trialEndsAt: new Date(NOW.getTime() - DAY) })
    );

    expect(await planState()).toEqual({
      source: 'partner',
      tier: 'PARTNER_FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      trialEndsAt: null,
      daysLeft: null,
    });
  });
});

describe('billing.getPlanState — paid subscription', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('reports the purchased tier from Tenant.plan, with no trial', async () => {
    const periodEnd = new Date('2026-12-07T00:00:00Z');
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(subRow('ACTIVE', periodEnd));
    // The trial end has passed: it must not matter once a plan is paid for.
    prismaMock.tenant.findUnique.mockResolvedValue(
      tenantRow({ plan: 'PROFESSIONAL', trialEndsAt: new Date(NOW.getTime() - 30 * DAY) })
    );

    expect(await planState()).toEqual({
      source: 'stripe',
      tier: 'PROFESSIONAL',
      status: 'ACTIVE',
      currentPeriodEnd: periodEnd.toISOString(),
      trialEndsAt: null,
      daysLeft: null,
    });
  });

  it('keeps PAST_DUE visible', async () => {
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(subRow('PAST_DUE', null));
    prismaMock.tenant.findUnique.mockResolvedValue(tenantRow({ plan: 'PROFESSIONAL' }));

    expect(await planState()).toMatchObject({ source: 'stripe', status: 'PAST_DUE' });
  });

  it('queries live subscriptions by the tenant from ctx.tenant', async () => {
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(subRow('ACTIVE', null));
    prismaMock.tenant.findUnique.mockResolvedValue(tenantRow());
    const ctx = createTestContext();

    await billingRouter.createCaller(ctx as any).getPlanState();

    const tenant = (ctx as any).tenant as { tenantId: string };
    expect(prismaMock.stripeSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: tenant.tenantId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
      })
    );
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: tenant.tenantId } })
    );
  });
});
