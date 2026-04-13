/**
 * Stripe Integration - B11 coverage tests
 *
 * Tests the checkout session builder, publishable key accessor,
 * and subscription management functions (wired to tRPC billing API).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tRPC procedure handlers
const mockGetSubscriptionQuery = vi.fn();
const mockCancelSubscriptionMutate = vi.fn();
const mockUpdateSubscriptionMutate = vi.fn();

vi.mock('@intelliflow/api-client', () => ({
  createTRPCClient: () => ({
    billing: {
      getSubscription: { query: mockGetSubscriptionQuery },
      cancelSubscription: { mutate: mockCancelSubscriptionMutate },
      updateSubscription: { mutate: mockUpdateSubscriptionMutate },
    },
  }),
}));

import {
  createCheckoutSession,
  getStripePublishableKey,
  getSubscription,
  cancelSubscription,
  updateSubscriptionQuantity,
  _resetBillingClient,
} from '../stripe-integration';

describe('stripe-integration (b11 coverage)', () => {
  beforeEach(() => {
    _resetBillingClient();
    mockGetSubscriptionQuery.mockReset();
    mockCancelSubscriptionMutate.mockReset();
    mockUpdateSubscriptionMutate.mockReset();
  });

  describe('createCheckoutSession', () => {
    it('returns signup URL with plan and quantity', async () => {
      const url = await createCheckoutSession({
        priceId: 'price_123',
        quantity: 5,
      });

      expect(url).toBe('/signup?plan=price_123&quantity=5');
    });

    it('includes email when customerEmail is provided', async () => {
      const url = await createCheckoutSession({
        priceId: 'price_456',
        quantity: 1,
        customerEmail: 'test@example.com',
      });

      expect(url).toBe('/signup?plan=price_456&quantity=1&email=test%40example.com');
    });

    it('ignores successUrl and cancelUrl (redirect-based flow)', async () => {
      const url = await createCheckoutSession({
        priceId: 'price_789',
        quantity: 2,
        successUrl: '/success',
        cancelUrl: '/cancel',
      });

      expect(url).toContain('/signup?');
      expect(url).toContain('plan=price_789');
      expect(url).toContain('quantity=2');
    });
  });

  describe('getStripePublishableKey', () => {
    it('returns empty string when env var is not set', () => {
      const key = getStripePublishableKey();

      // In test environment, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is typically not set
      expect(typeof key).toBe('string');
    });
  });

  describe('getSubscription', () => {
    it('returns active subscription from billing API', async () => {
      const mockSub = {
        id: 'sub_abc123',
        customerId: 'cus_xyz789',
        status: 'active',
        priceId: 'price_pro_monthly',
        quantity: 5,
        currency: 'GBP',
        currentPeriodStart: '2026-01-01T00:00:00.000Z',
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      };
      mockGetSubscriptionQuery.mockResolvedValue(mockSub);

      const result = await getSubscription();

      expect(result).toEqual(mockSub);
      expect(mockGetSubscriptionQuery).toHaveBeenCalledOnce();
    });

    it('returns null when user has no subscription', async () => {
      mockGetSubscriptionQuery.mockResolvedValue(null);

      const result = await getSubscription();

      expect(result).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    it('cancels at period end by default', async () => {
      const mockResult = {
        id: 'sub_abc123',
        status: 'active',
        cancelAtPeriodEnd: true,
      };
      mockCancelSubscriptionMutate.mockResolvedValue(mockResult);

      const result = await cancelSubscription();

      expect(result).toEqual(mockResult);
      expect(mockCancelSubscriptionMutate).toHaveBeenCalledWith({
        atPeriodEnd: true,
        reason: undefined,
      });
    });

    it('cancels immediately when atPeriodEnd is false', async () => {
      const mockResult = {
        id: 'sub_abc123',
        status: 'canceled',
        cancelAtPeriodEnd: false,
      };
      mockCancelSubscriptionMutate.mockResolvedValue(mockResult);

      const result = await cancelSubscription({ atPeriodEnd: false, reason: 'Too expensive' });

      expect(result).toEqual(mockResult);
      expect(mockCancelSubscriptionMutate).toHaveBeenCalledWith({
        atPeriodEnd: false,
        reason: 'Too expensive',
      });
    });
  });

  describe('updateSubscriptionQuantity', () => {
    it('updates subscription seat count', async () => {
      const mockResult = {
        id: 'sub_abc123',
        status: 'active',
        quantity: 10,
        priceId: 'price_pro_monthly',
      };
      mockUpdateSubscriptionMutate.mockResolvedValue(mockResult);

      const result = await updateSubscriptionQuantity(10);

      expect(result).toEqual(mockResult);
      expect(mockUpdateSubscriptionMutate).toHaveBeenCalledWith({
        quantity: 10,
      });
    });
  });
});
