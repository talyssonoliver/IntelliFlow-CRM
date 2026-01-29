/**
 * PayPal Adapter Tests
 *
 * Tests for the PayPal payment adapter using mocked HTTP responses.
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PayPalAdapter, PayPalConfig } from '../paypal/client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('PayPalAdapter', () => {
  let adapter: PayPalAdapter;
  const config: PayPalConfig = {
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
    environment: 'sandbox',
    webhookId: 'webhook_test_id',
  };

  beforeEach(() => {
    adapter = new PayPalAdapter(config);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('should obtain access token successfully', async () => {
      const mockResponse = {
        access_token: 'A21AAFePT...',
        token_type: 'Bearer',
        expires_in: 32400,
        scope: 'https://uri.paypal.com/services/invoicing',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.getAccessToken();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.accessToken).toBe('A21AAFePT...');
        expect(result.value.tokenType).toBe('Bearer');
        expect(result.value.expiresAt).toBeInstanceOf(Date);
      }
    });

    it('should handle authentication failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error_description: 'Invalid client credentials',
        }),
      });

      const result = await adapter.getAccessToken();

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('PAYPAL_AUTH_ERROR');
      }
    });
  });

  describe('createOrder', () => {
    it('should create an order successfully', async () => {
      // First mock for auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: 'https://uri.paypal.com/...',
        }),
      });

      // Second mock for order creation
      const mockOrderResponse = {
        id: 'ORDER123',
        status: 'CREATED',
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'unit-0',
          amount: { currency_code: 'USD', value: '100.00' },
        }],
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
        links: [
          { href: 'https://api.sandbox.paypal.com/v2/checkout/orders/ORDER123', rel: 'self' },
          { href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123', rel: 'approve' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrderResponse),
      });

      const result = await adapter.createOrder({
        intent: 'CAPTURE',
        purchaseUnits: [{
          currencyCode: 'USD',
          amount: '100.00',
          description: 'Test order',
        }],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('ORDER123');
        expect(result.value.status).toBe('CREATED');
        expect(result.value.intent).toBe('CAPTURE');
        expect(result.value.links).toHaveLength(2);
      }
    });

    it('should handle invalid request errors', async () => {
      // Auth mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      // Order creation failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          message: 'Invalid request',
          details: [{ field: 'amount', description: 'Invalid amount format' }],
        }),
      });

      const result = await adapter.createOrder({
        intent: 'CAPTURE',
        purchaseUnits: [{
          currencyCode: 'USD',
          amount: 'invalid',
        }],
      });

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('PAYPAL_INVALID_REQUEST');
      }
    });
  });

  describe('captureOrder', () => {
    it('should capture an order successfully', async () => {
      // Auth mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      // Capture response
      const mockCaptureResponse = {
        id: 'ORDER123',
        status: 'COMPLETED',
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'unit-0',
          amount: { currency_code: 'USD', value: '100.00' },
          payments: {
            captures: [{
              id: 'CAP123',
              status: 'COMPLETED',
              amount: { currency_code: 'USD', value: '100.00' },
              final_capture: true,
              create_time: new Date().toISOString(),
              update_time: new Date().toISOString(),
            }],
          },
        }],
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
        links: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCaptureResponse),
      });

      const result = await adapter.captureOrder('ORDER123');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('ORDER123');
        expect(result.value.status).toBe('COMPLETED');
        expect(result.value.purchaseUnits[0].payments?.captures).toHaveLength(1);
      }
    });
  });

  describe('refundCapture', () => {
    it('should create a refund successfully', async () => {
      // Auth mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      // Refund response
      const mockRefundResponse = {
        id: 'REF123',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '50.00' },
        note_to_payer: 'Partial refund',
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRefundResponse),
      });

      const result = await adapter.refundCapture(
        'CAP123',
        { currencyCode: 'USD', value: '50.00' },
        'Partial refund'
      );

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('REF123');
        expect(result.value.status).toBe('COMPLETED');
        expect(result.value.amount.value).toBe('50.00');
      }
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription successfully', async () => {
      // Auth mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      // Subscription response
      const mockSubResponse = {
        id: 'SUB123',
        status: 'APPROVAL_PENDING',
        plan_id: 'PLAN123',
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
        links: [
          { href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=SUB123', rel: 'approve' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSubResponse),
      });

      const result = await adapter.createSubscription({
        planId: 'PLAN123',
        subscriber: {
          emailAddress: 'subscriber@example.com',
        },
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('SUB123');
        expect(result.value.status).toBe('APPROVAL_PENDING');
        expect(result.value.planId).toBe('PLAN123');
      }
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel a subscription successfully', async () => {
      // Auth mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      // Cancel returns 204 No Content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.cancelSubscription('SUB123', 'Customer requested cancellation');

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status when API responds quickly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('healthy');
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return unhealthy status when authentication fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error_description: 'Invalid credentials',
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('unhealthy');
      }
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse a valid webhook event', () => {
      const eventPayload = JSON.stringify({
        id: 'WH-123',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        event_version: '1.0',
        resource_type: 'capture',
        resource: {
          id: 'CAP123',
          status: 'COMPLETED',
        },
        create_time: new Date().toISOString(),
        links: [],
      });

      const result = adapter.parseWebhookEvent(eventPayload);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('WH-123');
        expect(result.value.eventType).toBe('PAYMENT.CAPTURE.COMPLETED');
        expect(result.value.resourceType).toBe('capture');
      }
    });

    it('should reject invalid JSON', () => {
      const result = adapter.parseWebhookEvent('invalid json');

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('PAYPAL_INVALID_REQUEST');
      }
    });
  });

  describe('rate limiting', () => {
    it('should handle rate limit responses', async () => {
      // Auth mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: '',
        }),
      });

      // Rate limited response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '60']]) as unknown as Headers,
        json: () => Promise.resolve({
          message: 'Rate limit exceeded',
        }),
      });

      const result = await adapter.createOrder({
        intent: 'CAPTURE',
        purchaseUnits: [{
          currencyCode: 'USD',
          amount: '100.00',
        }],
      });

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('PAYPAL_RATE_LIMIT');
      }
    });
  });
});
