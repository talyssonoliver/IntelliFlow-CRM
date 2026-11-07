/**
 * Checkout with a promotion code (#1220): a live code is applied by its id, and an
 * unknown, expired or used-up one is refused instead of silently charging full price.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { INVALID_PROMOTION_CODE_MESSAGE } from '@intelliflow/validators';
import { billingRouter, clearBillingCache } from '../billing.router';
import type { UserSession } from '../../../context';

const ok = <T>(value: T) => ({ isSuccess: true, isFailure: false, value });
const fail = (message: string) => ({ isSuccess: false, isFailure: true, error: { message } });
const promo = (over: Record<string, unknown> = {}) => ({
  id: 'promo_1',
  customerId: null,
  productIds: null,
  ...over,
});

const stripe = {
  attachPaymentMethod: vi.fn(),
  createSubscription: vi.fn(),
  findActivePromotionCode: vi.fn(),
  getPriceProductId: vi.fn(),
  createCustomer: vi.fn(),
};

class MockStripeAdapter {
  attachPaymentMethod = stripe.attachPaymentMethod;
  createSubscription = stripe.createSubscription;
  findActivePromotionCode = stripe.findActivePromotionCode;
  getPriceProductId = stripe.getPriceProductId;
  createCustomer = stripe.createCustomer;
}

vi.mock('@intelliflow/adapters', () => ({ StripeAdapter: MockStripeAdapter }));

const caller = () =>
  billingRouter.createCaller({
    user: {
      userId: 'user_1',
      email: 'owner@example.invalid',
      name: 'Owner',
      role: 'ADMIN',
      tenantId: 'tenant_1',
      stripeCustomerId: 'cus_1',
      emailVerified: true,
    } as UserSession,
    prisma: { user: { update: vi.fn() } },
  } as never);

const checkout = (promotionCode?: string) =>
  caller().createCheckoutSubscription({
    planId: 'professional',
    billingCycle: 'monthly',
    paymentMethodId: 'pm_1',
    ...(promotionCode === undefined ? {} : { promotionCode }),
  });

describe('createCheckoutSubscription — promotion code (#1220)', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  beforeAll(() => {
    // Never used to reach Stripe: the adapter is mocked.
    process.env.STRIPE_SECRET_KEY = 'x'.repeat(16);
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearBillingCache();
    vi.stubEnv('STRIPE_PRICE_PROFESSIONAL_MONTHLY', 'price_pro_monthly');
    stripe.attachPaymentMethod.mockResolvedValue(ok({ id: 'pm_1' }));
    stripe.createSubscription.mockResolvedValue(
      ok({
        id: 'sub_1',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-07T00:00:00Z'),
        latestInvoicePaymentIntentClientSecret: null,
      })
    );
  });

  it('applies a live code to the subscription by its id', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(promo()));

    await checkout('FOUNDING100');

    // The buyer is passed in, so a code reserved to them is found among other customers' copies.
    expect(stripe.findActivePromotionCode).toHaveBeenCalledWith('FOUNDING100', 'cus_1');
    expect(stripe.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_pro_monthly',
        promotionCodeId: 'promo_1',
        metadata: expect.objectContaining({ tenantId: 'tenant_1', planTier: 'PROFESSIONAL' }),
      })
    );
  });

  it('refuses a code reserved for another customer', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(promo({ customerId: 'cus_other' })));

    await expect(checkout('VIP')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: INVALID_PROMOTION_CODE_MESSAGE,
    });
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });

  it('accepts a code reserved for this customer', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(promo({ customerId: 'cus_1' })));

    await checkout('VIP');

    expect(stripe.createSubscription.mock.calls[0][0].promotionCodeId).toBe('promo_1');
  });

  it("refuses a code whose coupon doesn't cover this plan's product, instead of charging full price", async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(promo({ productIds: ['prod_starter'] })));
    stripe.getPriceProductId.mockResolvedValue(ok('prod_pro'));

    await expect(checkout('STARTERONLY')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: INVALID_PROMOTION_CODE_MESSAGE,
    });
    expect(stripe.getPriceProductId).toHaveBeenCalledWith('price_pro_monthly');
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });

  it("accepts a code whose coupon covers this plan's product", async () => {
    stripe.findActivePromotionCode.mockResolvedValue(
      ok(promo({ productIds: ['prod_starter', 'prod_pro'] }))
    );
    stripe.getPriceProductId.mockResolvedValue(ok('prod_pro'));

    await checkout('FOUNDING100');

    expect(stripe.createSubscription.mock.calls[0][0].promotionCodeId).toBe('promo_1');
  });

  it('skips the product lookup when the coupon covers every product', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(promo({ productIds: [] })));

    await checkout('FOUNDING100');

    expect(stripe.getPriceProductId).not.toHaveBeenCalled();
  });

  it('fails the checkout when the product lookup fails', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(promo({ productIds: ['prod_pro'] })));
    stripe.getPriceProductId.mockResolvedValue(fail('Stripe unavailable'));

    await expect(checkout('FOUNDING100')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });
  it('refuses an unknown or used-up code and creates no subscription', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(ok(null));

    await expect(checkout('NOPE')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: INVALID_PROMOTION_CODE_MESSAGE,
    });
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });

  it('fails the checkout when the code lookup fails, rather than charging full price', async () => {
    stripe.findActivePromotionCode.mockResolvedValue(fail('Stripe unavailable'));

    await expect(checkout('FOUNDING100')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });

  it.each([
    ['no code', undefined],
    ['a blank code', '   '],
  ])('skips the lookup with %s', async (_label, code) => {
    await checkout(code);

    expect(stripe.findActivePromotionCode).not.toHaveBeenCalled();
    expect(stripe.createSubscription.mock.calls[0][0].promotionCodeId).toBeUndefined();
  });

  it('refuses a code that cannot be a Stripe code before any lookup', async () => {
    await expect(checkout('FREE!; DROP')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(stripe.findActivePromotionCode).not.toHaveBeenCalled();
  });
});
