/**
 * Plan changes (#1239): the server resolves plan + billing period to the Stripe price,
 * refuses a raw price that isn't a plan, and refuses a plan change while the last payment
 * hasn't gone through. Also: Stripe's refusal of a promotion code reads as an invalid code.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  INVALID_PROMOTION_CODE_MESSAGE,
  PAUSED_BLOCKS_PLAN_CHANGE_MESSAGE,
  PAYMENT_ISSUE_BLOCKS_PLAN_CHANGE_MESSAGE,
} from '@intelliflow/validators';
import { billingRouter, clearBillingCache } from '../billing.router';
import type { UserSession } from '../../../context';

const ok = <T>(value: T) => ({ isSuccess: true, isFailure: false, value });
const fail = (message: string) => ({ isSuccess: false, isFailure: true, error: { message } });

const stripe = {
  listSubscriptions: vi.fn(),
  updateSubscription: vi.fn(),
  attachPaymentMethod: vi.fn(),
  createSubscription: vi.fn(),
  findActivePromotionCode: vi.fn(),
  getPriceProductId: vi.fn(),
};

class MockStripeAdapter {
  listSubscriptions = stripe.listSubscriptions;
  updateSubscription = stripe.updateSubscription;
  attachPaymentMethod = stripe.attachPaymentMethod;
  createSubscription = stripe.createSubscription;
  findActivePromotionCode = stripe.findActivePromotionCode;
  getPriceProductId = stripe.getPriceProductId;
}

vi.mock('@intelliflow/adapters', () => ({ StripeAdapter: MockStripeAdapter }));

const caller = () =>
  billingRouter.createCaller({
    user: {
      userId: 'user_1',
      email: 'owner@example.invalid',
      role: 'ADMIN',
      tenantId: 'tenant_1',
      stripeCustomerId: 'cus_1',
      emailVerified: true,
    } as UserSession,
    prisma: { user: { update: vi.fn() } },
  } as never);

const sub = (status: string, itemId: string | null = 'si_1') => ({
  id: 'sub_1',
  status,
  priceId: 'price_starter_monthly',
  itemId: itemId ?? undefined,
});

describe('updateSubscription — plan change (#1239)', () => {
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
    vi.unstubAllEnvs();
    vi.stubEnv('STRIPE_PRICE_PROFESSIONAL_MONTHLY', 'price_pro_monthly');
    vi.stubEnv('STRIPE_PRICE_PROFESSIONAL_ANNUAL', 'price_pro_annual');
    stripe.listSubscriptions.mockResolvedValue(ok([sub('active')]));
    stripe.updateSubscription.mockResolvedValue(ok({ id: 'sub_1', status: 'active' }));
  });

  it.each([
    ['monthly', 'price_pro_monthly'],
    ['annual', 'price_pro_annual'],
  ] as const)('resolves the plan and the %s period to the Stripe price', async (cycle, price) => {
    await caller().updateSubscription({ planId: 'professional', billingCycle: cycle });

    // The existing plan item is named, so Stripe replaces it instead of adding a second one.
    expect(stripe.updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ itemId: 'si_1', priceId: price })
    );
  });

  it('defaults to monthly when no period is given', async () => {
    await caller().updateSubscription({ planId: 'professional' });

    expect(stripe.updateSubscription.mock.calls[0][1].priceId).toBe('price_pro_monthly');
  });

  it('refuses a raw price that is not one of the plans', async () => {
    await expect(caller().updateSubscription({ priceId: 'price_anything' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(stripe.updateSubscription).not.toHaveBeenCalled();
  });

  it('still accepts a raw price that is a configured plan price', async () => {
    await caller().updateSubscription({ priceId: 'price_pro_annual' });

    expect(stripe.updateSubscription.mock.calls[0][1].priceId).toBe('price_pro_annual');
  });

  it('refuses both a plan and a price at once', async () => {
    await expect(
      caller().updateSubscription({ planId: 'professional', priceId: 'price_pro_monthly' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it.each(['past_due', 'unpaid', 'incomplete'])(
    'asks for the payment method first when the subscription is %s',
    async (status) => {
      stripe.listSubscriptions.mockResolvedValue(ok([sub(status)]));

      await expect(
        caller().updateSubscription({ planId: 'professional', billingCycle: 'monthly' })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: PAYMENT_ISSUE_BLOCKS_PLAN_CHANGE_MESSAGE,
      });
      expect(stripe.updateSubscription).not.toHaveBeenCalled();
    }
  );

  it('sends a paused subscription to support, not to the payment method', async () => {
    stripe.listSubscriptions.mockResolvedValue(ok([sub('paused')]));

    await expect(caller().updateSubscription({ planId: 'professional' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: PAUSED_BLOCKS_PLAN_CHANGE_MESSAGE,
    });
    expect(stripe.updateSubscription).not.toHaveBeenCalled();
  });
  it('refuses a plan change when the subscription has no item to change, rather than adding one', async () => {
    stripe.listSubscriptions.mockResolvedValue(ok([sub('active', null)]));

    await expect(
      caller().updateSubscription({ planId: 'professional', billingCycle: 'monthly' })
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(stripe.updateSubscription).not.toHaveBeenCalled();
  });

  it('can still cancel at period end without an item id', async () => {
    stripe.listSubscriptions.mockResolvedValue(ok([sub('active', null)]));

    await caller().updateSubscription({ cancelAtPeriodEnd: true });

    expect(stripe.updateSubscription.mock.calls[0][1]).toMatchObject({
      cancel_at_period_end: true,
    });
  });
  it('still says there is no subscription when the only one has ended', async () => {
    stripe.listSubscriptions.mockResolvedValue(ok([sub('canceled')]));

    await expect(caller().updateSubscription({ planId: 'professional' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('createCheckoutSubscription — Stripe refuses the code (#1239)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBillingCache();
    vi.unstubAllEnvs();
    process.env.STRIPE_SECRET_KEY = 'x'.repeat(16);
    vi.stubEnv('STRIPE_PRICE_PROFESSIONAL_MONTHLY', 'price_pro_monthly');
    stripe.attachPaymentMethod.mockResolvedValue(ok({ id: 'pm_1' }));
    stripe.findActivePromotionCode.mockResolvedValue(
      ok({ id: 'promo_1', customerId: null, productIds: null })
    );
  });

  const checkout = (promotionCode?: string) =>
    caller().createCheckoutSubscription({
      planId: 'professional',
      billingCycle: 'monthly',
      paymentMethodId: 'pm_1',
      ...(promotionCode ? { promotionCode } : {}),
    });

  it("reads Stripe's refusal of a code as an invalid code", async () => {
    stripe.createSubscription.mockResolvedValue(
      fail(
        'This promotion code cannot be redeemed because the associated customer has prior transactions.'
      )
    );

    await expect(checkout('FIRSTONLY')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: INVALID_PROMOTION_CODE_MESSAGE,
    });
  });

  it("keeps Stripe's own message for a failure that isn't about the code", async () => {
    stripe.createSubscription.mockResolvedValue(fail('Your card was declined.'));

    await expect(checkout('FOUNDING100')).rejects.toMatchObject({
      message: 'Your card was declined.',
    });
  });

  it('keeps the message when no code was used, whatever it says', async () => {
    stripe.createSubscription.mockResolvedValue(fail('No such coupon on this account'));

    await expect(checkout()).rejects.toMatchObject({ message: 'No such coupon on this account' });
  });
});
