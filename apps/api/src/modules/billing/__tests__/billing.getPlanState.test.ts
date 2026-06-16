/**
 * Tests for billing.getPlanState and resolvePriceId
 *
 * @implements incident 2026-06-16 onboarding redesign
 *
 * Coverage:
 *   A. resolvePriceId — env hit + missing-env throw
 *   B. getPlanState   — trial derivation math
 *   C. getPlanState   — active subscription passthrough
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
// B. getPlanState — trial branch
// ============================================================

describe('billing.getPlanState — trial branch', () => {
  it('returns derived 14-day trial when no ACTIVE/PAST_DUE subscription exists', async () => {
    // No active subscription
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(null);

    const tenantCreatedAt = new Date('2026-06-10T00:00:00Z');
    prismaMock.tenant.findUnique.mockResolvedValue({
      createdAt: tenantCreatedAt,
    } as any);

    const ctx = createTestContext();
    const caller = billingRouter.createCaller(ctx as any);
    const result = await caller.getPlanState();

    expect(result.source).toBe('trial');
    expect(result.tier).toBe('PROFESSIONAL');
    expect(result.status).toBe('TRIALING');
    expect(result.currentPeriodEnd).toBeNull();

    // Trial ends 14 days after tenant creation
    const expectedTrialEnd = new Date('2026-06-24T00:00:00Z');
    expect(result.trialEndsAt).toBe(expectedTrialEnd.toISOString());

    // daysLeft: computed from now — just verify it's a non-negative number
    expect(typeof result.daysLeft).toBe('number');
    expect(result.daysLeft).toBeGreaterThanOrEqual(0);
  });

  it('returns daysLeft=0 when the trial has already expired', async () => {
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(null);

    // Tenant created 30 days ago
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    prismaMock.tenant.findUnique.mockResolvedValue({ createdAt: pastDate } as any);

    const ctx = createTestContext();
    const caller = billingRouter.createCaller(ctx as any);
    const result = await caller.getPlanState();

    expect(result.source).toBe('trial');
    expect(result.daysLeft).toBe(0);
  });

  it('uses now as trial start when tenant row is not found', async () => {
    prismaMock.stripeSubscription.findFirst.mockResolvedValue(null);
    prismaMock.tenant.findUnique.mockResolvedValue(null);

    const before = Date.now();
    const ctx = createTestContext();
    const caller = billingRouter.createCaller(ctx as any);
    const result = await caller.getPlanState();
    const after = Date.now();

    expect(result.source).toBe('trial');
    // trialEndsAt should be roughly 14 days from now
    const trialEnd = new Date(result.trialEndsAt!).getTime();
    const expectedMin = before + 14 * 24 * 60 * 60 * 1000 - 1000;
    const expectedMax = after + 14 * 24 * 60 * 60 * 1000 + 1000;
    expect(trialEnd).toBeGreaterThanOrEqual(expectedMin);
    expect(trialEnd).toBeLessThanOrEqual(expectedMax);
  });
});

// ============================================================
// C. getPlanState — active subscription passthrough
// ============================================================

describe('billing.getPlanState — active subscription branch', () => {
  it('returns stripe source with ACTIVE status when a subscription exists', async () => {
    const periodEnd = new Date('2026-07-10T00:00:00Z');
    prismaMock.stripeSubscription.findFirst.mockResolvedValue({
      id: 'rec_123',
      stripeSubscriptionId: 'sub_abc',
      stripeCustomerId: 'cus_abc',
      status: 'ACTIVE',
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      tenantId: 'tenant-1',
      tenantSlug: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createTestContext();
    const caller = billingRouter.createCaller(ctx as any);
    const result = await caller.getPlanState();

    expect(result.source).toBe('stripe');
    expect(result.status).toBe('ACTIVE');
    expect(result.currentPeriodEnd).toBe(periodEnd.toISOString());
    expect(result.trialEndsAt).toBeNull();
    expect(result.daysLeft).toBeNull();
    // Tenant query should NOT be called
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('returns stripe source with PAST_DUE status', async () => {
    prismaMock.stripeSubscription.findFirst.mockResolvedValue({
      id: 'rec_456',
      stripeSubscriptionId: 'sub_def',
      stripeCustomerId: 'cus_def',
      status: 'PAST_DUE',
      currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      tenantId: 'tenant-1',
      tenantSlug: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createTestContext();
    const caller = billingRouter.createCaller(ctx as any);
    const result = await caller.getPlanState();

    expect(result.source).toBe('stripe');
    expect(result.status).toBe('PAST_DUE');
  });

  it('queries by tenantId from ctx.tenant', async () => {
    prismaMock.stripeSubscription.findFirst.mockResolvedValue({
      id: 'rec_789',
      stripeSubscriptionId: 'sub_xyz',
      stripeCustomerId: 'cus_xyz',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      tenantId: 'tenant-1',
      tenantSlug: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createTestContext();
    const caller = billingRouter.createCaller(ctx as any);
    await caller.getPlanState();

    const tenant = (ctx as any).tenant as { tenantId: string };
    expect(prismaMock.stripeSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: tenant.tenantId,
          status: { in: ['ACTIVE', 'PAST_DUE'] },
        }),
      })
    );
  });
});
