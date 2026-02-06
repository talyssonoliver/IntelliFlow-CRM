import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import { createPaymentIntent, confirmPaymentIntent, capturePaymentIntent, cancelPaymentIntent, getPaymentIntent } from '../payment-intents';
import type { StripeConfig, StripePaymentIntent } from '../../types';

vi.mock('../../http-client', () => ({ makeRequest: vi.fn() }));
vi.mock('../../mappers', () => ({ mapToPaymentIntent: vi.fn() }));

import { makeRequest } from '../../http-client';
import { mapToPaymentIntent } from '../../mappers';

const mockMakeRequest = vi.mocked(makeRequest);
const mockMap = vi.mocked(mapToPaymentIntent);

const config: StripeConfig = { secretKey: 'sk_test_123' };
const mockPI: StripePaymentIntent = { id: 'pi_123', amount: 5000, currency: 'usd', status: 'requires_payment_method', clientSecret: 'pi_secret', created: new Date('2025-01-01') };

describe('payment-intents handler', () => {
  beforeEach(() => { vi.clearAllMocks(); mockMap.mockReturnValue(mockPI); });

  describe('createPaymentIntent', () => {
    it('should create with required params', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      const r = await createPaymentIntent(config, { amount: 5000, currency: 'usd' });
      expect(r.isSuccess).toBe(true);
      expect(r.value).toEqual(mockPI);
      expect(mockMakeRequest).toHaveBeenCalledWith(config, 'POST', '/payment_intents', expect.any(URLSearchParams));
    });

    it('should include optional params', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      await createPaymentIntent(config, { amount: 5000, currency: 'usd', customerId: 'cus_1', paymentMethodId: 'pm_1', description: 'Desc', receiptEmail: 'a@b.com', captureMethod: 'manual', confirmationMethod: 'manual', metadata: { k: 'v' } });
      const b = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(b.get('customer')).toBe('cus_1');
      expect(b.get('payment_method')).toBe('pm_1');
      expect(b.get('metadata[k]')).toBe('v');
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'STRIPE_INVALID_REQUEST' } as any));
      expect((await createPaymentIntent(config, { amount: 5000, currency: 'usd' })).isFailure).toBe(true);
    });

    it('should handle thrown Error', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Network failure'));
      const r = await createPaymentIntent(config, { amount: 5000, currency: 'usd' });
      expect(r.isFailure).toBe(true);
      expect((r.error as any).message).toBe('Network failure');
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue('str');
      expect(((await createPaymentIntent(config, { amount: 5000, currency: 'usd' })).error as any).message).toBe('Unknown error');
    });
  });

  describe('confirmPaymentIntent', () => {
    it('should confirm without payment method', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      expect((await confirmPaymentIntent(config, 'pi_123')).isSuccess).toBe(true);
    });

    it('should confirm with payment method', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      await confirmPaymentIntent(config, 'pi_123', 'pm_456');
      expect((mockMakeRequest.mock.calls[0][3] as URLSearchParams).get('payment_method')).toBe('pm_456');
    });

    it('should handle non-Error thrown', async () => {
      mockMakeRequest.mockRejectedValue(42);
      expect(((await confirmPaymentIntent(config, 'pi_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('capturePaymentIntent', () => {
    it('should capture without amount', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      expect((await capturePaymentIntent(config, 'pi_123')).isSuccess).toBe(true);
    });

    it('should capture with amount', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      await capturePaymentIntent(config, 'pi_123', 3000);
      expect((mockMakeRequest.mock.calls[0][3] as URLSearchParams).get('amount_to_capture')).toBe('3000');
    });

    it('should handle zero amount', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      await capturePaymentIntent(config, 'pi_123', 0);
      expect((mockMakeRequest.mock.calls[0][3] as URLSearchParams).get('amount_to_capture')).toBe('0');
    });
  });

  describe('cancelPaymentIntent', () => {
    it('should cancel', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      expect((await cancelPaymentIntent(config, 'pi_123')).isSuccess).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(undefined);
      expect(((await cancelPaymentIntent(config, 'pi_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('getPaymentIntent', () => {
    it('should retrieve', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pi_123' }));
      expect((await getPaymentIntent(config, 'pi_123')).value).toEqual(mockPI);
    });

    it('should return null for STRIPE_INVALID_REQUEST', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'x', code: 'STRIPE_INVALID_REQUEST' } as any));
      const r = await getPaymentIntent(config, 'pi_x');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toBeNull();
    });

    it('should propagate other errors', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'x', code: 'STRIPE_AUTH_ERROR' } as any));
      expect((await getPaymentIntent(config, 'pi_123')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(null);
      expect(((await getPaymentIntent(config, 'pi_123')).error as any).message).toBe('Unknown error');
    });
  });
});
