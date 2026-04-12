/**
 * Stripe Subscription Handler Tests
 * Tests for Stripe subscription operations: create, update, cancel, get, list.
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripeCreateSubscriptionParams } from '../../types';
import { StripeConnectionError, StripeInvalidRequestError } from '../../errors';

// ==================== Mock Setup ====================

// Mock the http-client module
vi.mock('../../http-client', () => ({
  makeRequest: vi.fn(),
}));

// Mock the mappers module
vi.mock('../../mappers', () => ({
  mapToCustomer: vi.fn(),
  mapToPaymentMethod: vi.fn(),
  mapToPaymentIntent: vi.fn(),
  mapToRefund: vi.fn(),
  mapToSubscription: vi.fn(),
  mapToInvoice: vi.fn(),
}));

import { makeRequest } from '../../http-client';
import { mapToSubscription } from '../../mappers';
import {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscription,
  listSubscriptions,
} from '../subscriptions';

const mockMakeRequest = makeRequest as ReturnType<typeof vi.fn>;
const mockMapToSubscription = mapToSubscription as ReturnType<typeof vi.fn>;

function createConfig(): StripeConfig {
  return {
    secretKey: 'sk_test_123',
    webhookSecret: 'whsec_123',
  };
}

function createSubscriptionApiResponse(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'sub_123',
    customer: 'cus_456',
    status: 'active',
    items: {
      data: [
        {
          price: { id: 'price_789' },
          quantity: 1,
        },
      ],
    },
    currency: 'usd',
    current_period_start: 1704067200,
    current_period_end: 1706745600,
    cancel_at_period_end: false,
    ...overrides,
  };
}

function createMappedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    customerId: 'cus_456',
    status: 'active',
    priceId: 'price_789',
    quantity: 1,
    currency: 'usd',
    currentPeriodStart: new Date(1704067200 * 1000),
    currentPeriodEnd: new Date(1706745600 * 1000),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

// ==================== Tests ====================

describe('Stripe Subscription Handlers', () => {
  let config: StripeConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createConfig();
    mockMapToSubscription.mockImplementation((data: Record<string, unknown>) =>
      createMappedSubscription({ id: data.id })
    );
  });

  describe('createSubscription', () => {
    it('should create a subscription with required params', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const params: StripeCreateSubscriptionParams = {
        customerId: 'cus_456',
        priceId: 'price_789',
      };

      const result = await createSubscription(config, params);

      expect(result.isSuccess).toBe(true);
      expect(mockMakeRequest).toHaveBeenCalledWith(
        config,
        'POST',
        '/subscriptions',
        expect.any(URLSearchParams)
      );

      // Verify URLSearchParams contents
      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('customer')).toBe('cus_456');
      expect(body.get('items[0][price]')).toBe('price_789');
    });

    it('should create subscription with all optional params', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const params: StripeCreateSubscriptionParams = {
        customerId: 'cus_456',
        priceId: 'price_789',
        quantity: 5,
        trialPeriodDays: 14,
        cancelAtPeriodEnd: true,
        metadata: { plan: 'enterprise', source: 'web' },
      };

      const result = await createSubscription(config, params);

      expect(result.isSuccess).toBe(true);

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('customer')).toBe('cus_456');
      expect(body.get('items[0][price]')).toBe('price_789');
      expect(body.get('items[0][quantity]')).toBe('5');
      expect(body.get('trial_period_days')).toBe('14');
      expect(body.get('cancel_at_period_end')).toBe('true');
      expect(body.get('metadata[plan]')).toBe('enterprise');
      expect(body.get('metadata[source]')).toBe('web');
    });

    it('should not include optional params when not provided', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      await createSubscription(config, {
        customerId: 'cus_456',
        priceId: 'price_789',
      });

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.has('items[0][quantity]')).toBe(false);
      expect(body.has('trial_period_days')).toBe(false);
      expect(body.has('cancel_at_period_end')).toBe(false);
    });

    it('should return error on API failure', async () => {
      const error = new StripeInvalidRequestError('Customer not found');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await createSubscription(config, {
        customerId: 'bad_customer',
        priceId: 'price_789',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should return connection error on exception', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Network error'));

      const result = await createSubscription(config, {
        customerId: 'cus_456',
        priceId: 'price_789',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(StripeConnectionError);
      expect(result.error.message).toContain('Network error');
    });

    it('should handle non-Error thrown objects', async () => {
      mockMakeRequest.mockRejectedValue('string error');

      const result = await createSubscription(config, {
        customerId: 'cus_456',
        priceId: 'price_789',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });

    it('should call mapToSubscription with API response', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      await createSubscription(config, {
        customerId: 'cus_456',
        priceId: 'price_789',
      });

      expect(mockMapToSubscription).toHaveBeenCalledWith(apiResponse);
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription with new price', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const result = await updateSubscription(config, 'sub_123', {
        priceId: 'price_new',
      });

      expect(result.isSuccess).toBe(true);
      expect(mockMakeRequest).toHaveBeenCalledWith(
        config,
        'POST',
        '/subscriptions/sub_123',
        expect.any(URLSearchParams)
      );

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('items[0][price]')).toBe('price_new');
    });

    it('should update subscription with quantity', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      await updateSubscription(config, 'sub_123', { quantity: 10 });

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('items[0][quantity]')).toBe('10');
    });

    it('should update cancel_at_period_end', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      await updateSubscription(config, 'sub_123', { cancelAtPeriodEnd: true });

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('cancel_at_period_end')).toBe('true');
    });

    it('should update with cancelAtPeriodEnd = false', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      await updateSubscription(config, 'sub_123', { cancelAtPeriodEnd: false });

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('cancel_at_period_end')).toBe('false');
    });

    it('should update with metadata', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      await updateSubscription(config, 'sub_123', {
        metadata: { key1: 'val1', key2: 'val2' },
      });

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('metadata[key1]')).toBe('val1');
      expect(body.get('metadata[key2]')).toBe('val2');
    });

    it('should return error on API failure', async () => {
      const error = new StripeInvalidRequestError('Subscription not found');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await updateSubscription(config, 'sub_bad', { priceId: 'price_new' });

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Timeout'));

      const result = await updateSubscription(config, 'sub_123', {});

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(StripeConnectionError);
    });

    it('should handle non-Error thrown objects', async () => {
      mockMakeRequest.mockRejectedValue(undefined);

      const result = await updateSubscription(config, 'sub_123', {});

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel immediately with DELETE when atPeriodEnd is false', async () => {
      const apiResponse = createSubscriptionApiResponse({ status: 'canceled' });
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const result = await cancelSubscription(config, 'sub_123', false);

      expect(result.isSuccess).toBe(true);
      expect(mockMakeRequest).toHaveBeenCalledWith(config, 'DELETE', '/subscriptions/sub_123');
    });

    it('should cancel at period end with POST when atPeriodEnd is true', async () => {
      const apiResponse = createSubscriptionApiResponse({ cancel_at_period_end: true });
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const result = await cancelSubscription(config, 'sub_123', true);

      expect(result.isSuccess).toBe(true);
      expect(mockMakeRequest).toHaveBeenCalledWith(
        config,
        'POST',
        '/subscriptions/sub_123',
        expect.any(URLSearchParams)
      );

      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('cancel_at_period_end')).toBe('true');
    });

    it('should default to immediate cancel when atPeriodEnd not specified', async () => {
      const apiResponse = createSubscriptionApiResponse({ status: 'canceled' });
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const result = await cancelSubscription(config, 'sub_123');

      expect(result.isSuccess).toBe(true);
      expect(mockMakeRequest).toHaveBeenCalledWith(config, 'DELETE', '/subscriptions/sub_123');
    });

    it('should return error on API failure (immediate cancel)', async () => {
      const error = new StripeInvalidRequestError('No such subscription');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await cancelSubscription(config, 'sub_bad', false);

      expect(result.isFailure).toBe(true);
    });

    it('should return error on API failure (cancel at period end)', async () => {
      const error = new StripeInvalidRequestError('No such subscription');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await cancelSubscription(config, 'sub_bad', true);

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Network failure'));

      const result = await cancelSubscription(config, 'sub_123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(StripeConnectionError);
    });

    it('should handle non-Error thrown objects', async () => {
      mockMakeRequest.mockRejectedValue(null);

      const result = await cancelSubscription(config, 'sub_123');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });
  });

  describe('getSubscription', () => {
    it('should get subscription successfully', async () => {
      const apiResponse = createSubscriptionApiResponse();
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const result = await getSubscription(config, 'sub_123');

      expect(result.isSuccess).toBe(true);
      expect(mockMakeRequest).toHaveBeenCalledWith(config, 'GET', '/subscriptions/sub_123');
    });

    it('should return null for STRIPE_INVALID_REQUEST (not found)', async () => {
      const error = new StripeInvalidRequestError('No such subscription');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await getSubscription(config, 'sub_nonexistent');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should propagate non-STRIPE_INVALID_REQUEST errors', async () => {
      const error = { code: 'STRIPE_AUTH_ERROR', message: 'Invalid API key' } as DomainError;
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await getSubscription(config, 'sub_123');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('STRIPE_AUTH_ERROR');
    });

    it('should return connection error on exception', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Timeout'));

      const result = await getSubscription(config, 'sub_123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(StripeConnectionError);
    });

    it('should handle non-Error thrown objects', async () => {
      mockMakeRequest.mockRejectedValue(42);

      const result = await getSubscription(config, 'sub_123');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });
  });

  describe('listSubscriptions', () => {
    it('should list subscriptions for a customer', async () => {
      const apiResponse = {
        data: [
          createSubscriptionApiResponse({ id: 'sub_1' }),
          createSubscriptionApiResponse({ id: 'sub_2' }),
        ],
      };
      mockMakeRequest.mockResolvedValue(Result.ok(apiResponse));

      const result = await listSubscriptions(config, 'cus_456');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(2);
      expect(mockMakeRequest).toHaveBeenCalledWith(
        config,
        'GET',
        expect.stringContaining('/subscriptions?customer=cus_456')
      );
    });

    it('should return empty array when no subscriptions', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ data: [] }));

      const result = await listSubscriptions(config, 'cus_456');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('should handle missing data field', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({}));

      const result = await listSubscriptions(config, 'cus_456');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('should call mapToSubscription for each subscription', async () => {
      const sub1 = createSubscriptionApiResponse({ id: 'sub_1' });
      const sub2 = createSubscriptionApiResponse({ id: 'sub_2' });
      mockMakeRequest.mockResolvedValue(Result.ok({ data: [sub1, sub2] }));

      await listSubscriptions(config, 'cus_456');

      expect(mockMapToSubscription).toHaveBeenCalledTimes(2);
      expect(mockMapToSubscription).toHaveBeenNthCalledWith(1, sub1);
      expect(mockMapToSubscription).toHaveBeenNthCalledWith(2, sub2);
    });

    it('should return error on API failure', async () => {
      const error = new StripeInvalidRequestError('Invalid customer');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      const result = await listSubscriptions(config, 'bad_customer');

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Network error'));

      const result = await listSubscriptions(config, 'cus_456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(StripeConnectionError);
    });

    it('should handle non-Error thrown objects', async () => {
      mockMakeRequest.mockRejectedValue({ custom: 'error' });

      const result = await listSubscriptions(config, 'cus_456');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });
  });
});
