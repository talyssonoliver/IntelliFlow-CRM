/**
 * Stripe Adapter Tests
 *
 * Tests for the Stripe payment adapter using mocked HTTP responses.
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StripeAdapter, StripeConfig } from '../stripe/client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('StripeAdapter', () => {
  let adapter: StripeAdapter;
  const config: StripeConfig = {
    secretKey: 'sk_test_1234567890',
    webhookSecret: 'whsec_test_secret',
    apiVersion: '2024-11-20.acacia',
  };

  beforeEach(() => {
    adapter = new StripeAdapter(config);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a customer successfully', async () => {
      const mockResponse = {
        id: 'cus_test123',
        object: 'customer',
        email: 'test@example.com',
        name: 'Test Customer',
        balance: 0,
        currency: 'usd',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.createCustomer({
        email: 'test@example.com',
        name: 'Test Customer',
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('cus_test123');
        expect(result.value.email).toBe('test@example.com');
        expect(result.value.name).toBe('Test Customer');
      }
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' },
        }),
      });

      const result = await adapter.createCustomer({
        email: 'test@example.com',
      });

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('STRIPE_AUTH_ERROR');
      }
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '30']]) as unknown as Headers,
        json: () => Promise.resolve({
          error: { message: 'Rate limited' },
        }),
      });

      const result = await adapter.createCustomer({
        email: 'test@example.com',
      });

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('STRIPE_RATE_LIMIT');
      }
    });
  });

  describe('getCustomer', () => {
    it('should retrieve a customer by ID', async () => {
      const mockResponse = {
        id: 'cus_test123',
        object: 'customer',
        email: 'test@example.com',
        balance: 5000,
        currency: 'usd',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.getCustomer('cus_test123');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value?.id).toBe('cus_test123');
        expect(result.value?.balance).toBe(5000);
      }
    });

    it('should return null for non-existent customer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { message: 'No such customer' },
        }),
      });

      const result = await adapter.getCustomer('cus_nonexistent');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent', async () => {
      const mockResponse = {
        id: 'pi_test123',
        object: 'payment_intent',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_test123_secret_abc',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        description: 'Test payment',
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('pi_test123');
        expect(result.value.amount).toBe(5000);
        expect(result.value.currency).toBe('usd');
        expect(result.value.status).toBe('requires_payment_method');
        expect(result.value.clientSecret).toBe('pi_test123_secret_abc');
      }
    });

    it('should handle card errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: () => Promise.resolve({
          error: {
            message: 'Your card was declined',
            decline_code: 'insufficient_funds',
          },
        }),
      });

      const result = await adapter.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('STRIPE_CARD_ERROR');
      }
    });
  });

  describe('createRefund', () => {
    it('should create a refund', async () => {
      const mockResponse = {
        id: 're_test123',
        object: 'refund',
        amount: 2500,
        currency: 'usd',
        payment_intent: 'pi_test123',
        status: 'succeeded',
        reason: 'requested_by_customer',
        created: Math.floor(Date.now() / 1000),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.createRefund('pi_test123', 2500, 'requested_by_customer');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('re_test123');
        expect(result.value.amount).toBe(2500);
        expect(result.value.status).toBe('succeeded');
        expect(result.value.reason).toBe('requested_by_customer');
      }
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription', async () => {
      const mockResponse = {
        id: 'sub_test123',
        object: 'subscription',
        customer: 'cus_test123',
        status: 'active',
        currency: 'usd',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
        items: {
          data: [{
            id: 'si_test123',
            price: { id: 'price_test123' },
            quantity: 1,
          }],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.createSubscription({
        customerId: 'cus_test123',
        priceId: 'price_test123',
        quantity: 1,
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('sub_test123');
        expect(result.value.customerId).toBe('cus_test123');
        expect(result.value.status).toBe('active');
        expect(result.value.priceId).toBe('price_test123');
      }
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status when API responds quickly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          object: 'balance',
          available: [{ amount: 10000, currency: 'usd' }],
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('healthy');
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return unhealthy status when API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: { message: 'Internal server error' },
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('unhealthy');
      }
    });
  });

  describe('constructWebhookEvent', () => {
    it('should reject invalid signature format', () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const invalidSignature = 'invalid_signature';

      const result = adapter.constructWebhookEvent(payload, invalidSignature);

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('STRIPE_INVALID_REQUEST');
      }
    });

    it('should reject expired timestamps', () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = `t=${oldTimestamp},v1=fakesignature`;

      const result = adapter.constructWebhookEvent(payload, signature);

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.message).toContain('too old');
      }
    });
  });
});
