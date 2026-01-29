/**
 * Stripe Payment Adapter Integration Tests
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StripeAdapter, StripeConfig } from '../../../packages/adapters/src/payments/stripe/client';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('StripeAdapter', () => {
  let adapter: StripeAdapter;
  let config: StripeConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      secretKey: 'sk_test_123456789',
      webhookSecret: 'whsec_test_secret',
      apiVersion: '2023-10-16',
    };

    adapter = new StripeAdapter(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCustomer', () => {
    it('should create customer successfully', async () => {
      const mockCustomer = {
        id: 'cus_123',
        email: 'test@example.com',
        name: 'Test Customer',
        balance: 0,
        currency: 'usd',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCustomer,
      });

      const result = await adapter.createCustomer({
        email: 'test@example.com',
        name: 'Test Customer',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('cus_123');
      expect(result.value?.email).toBe('test@example.com');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid email address',
          },
        }),
      });

      const result = await adapter.createCustomer({
        email: 'invalid',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('STRIPE_INVALID_REQUEST');
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        amount: 1000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_123_secret_456',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPaymentIntent,
      });

      const result = await adapter.createPaymentIntent({
        amount: 1000,
        currency: 'usd',
        description: 'Test payment',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('pi_123');
      expect(result.value?.amount).toBe(1000);
      expect(result.value?.clientSecret).toBe('pi_123_secret_456');
    });

    it('should handle card errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: async () => ({
          error: {
            message: 'Card was declined',
            decline_code: 'insufficient_funds',
          },
        }),
      });

      const result = await adapter.createPaymentIntent({
        amount: 1000,
        currency: 'usd',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('STRIPE_CARD_ERROR');
    });
  });

  describe('confirmPaymentIntent', () => {
    it('should confirm payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
        client_secret: 'pi_123_secret_456',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPaymentIntent,
      });

      const result = await adapter.confirmPaymentIntent('pi_123', 'pm_card_visa');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('succeeded');
    });
  });

  describe('createRefund', () => {
    it('should create refund successfully', async () => {
      const mockRefund = {
        id: 're_123',
        payment_intent: 'pi_123',
        amount: 500,
        currency: 'usd',
        status: 'succeeded',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefund,
      });

      const result = await adapter.createRefund('pi_123', 500);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('re_123');
      expect(result.value?.amount).toBe(500);
    });
  });

  describe('createSubscription', () => {
    it('should create subscription successfully', async () => {
      const mockSubscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: {
          data: [
            {
              price: { id: 'price_123' },
              quantity: 1,
            },
          ],
        },
        currency: 'usd',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubscription,
      });

      const result = await adapter.createSubscription({
        customerId: 'cus_123',
        priceId: 'price_123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('sub_123');
      expect(result.value?.status).toBe('active');
    });
  });

  describe('constructWebhookEvent', () => {
    it('should verify and parse valid webhook', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_123' },
        },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      });

      // Create valid signature
      const crypto = require('crypto');
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'whsec_test_secret')
        .update(signedPayload)
        .digest('hex');

      const result = adapter.constructWebhookEvent(payload, `t=${timestamp},v1=${signature}`);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.type).toBe('payment_intent.succeeded');
    });

    it('should reject invalid signature', () => {
      const result = adapter.constructWebhookEvent(
        '{}',
        't=1234567890,v1=invalid_signature'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: [{ amount: 10000, currency: 'usd' }],
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('healthy');
    });

    it('should return unhealthy on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid API Key' },
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('unhealthy');
    });
  });

  describe('rate limiting', () => {
    it('should handle rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '30' : null),
        },
        json: async () => ({
          error: { message: 'Rate limit exceeded' },
        }),
      });

      const result = await adapter.getCustomer('cus_123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('STRIPE_RATE_LIMIT');
    });
  });
});
