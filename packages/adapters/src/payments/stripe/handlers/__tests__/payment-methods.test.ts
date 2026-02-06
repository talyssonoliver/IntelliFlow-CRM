import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import { attachPaymentMethod, detachPaymentMethod, listPaymentMethods } from '../payment-methods';
import type { StripeConfig, StripePaymentMethod } from '../../types';

vi.mock('../../http-client', () => ({ makeRequest: vi.fn() }));
vi.mock('../../mappers', () => ({ mapToPaymentMethod: vi.fn() }));

import { makeRequest } from '../../http-client';
import { mapToPaymentMethod } from '../../mappers';

const mockMakeRequest = vi.mocked(makeRequest);
const mockMapToPM = vi.mocked(mapToPaymentMethod);

const config: StripeConfig = { secretKey: 'sk_test_pm' };
const mockPM: StripePaymentMethod = { id: 'pm_123', type: 'card', customerId: 'cus_123', card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2026, funding: 'credit' }, billingDetails: { name: 'John Doe' }, created: new Date('2025-01-01') };

describe('payment-methods handler', () => {
  beforeEach(() => { vi.clearAllMocks(); mockMapToPM.mockReturnValue(mockPM); });

  describe('attachPaymentMethod', () => {
    it('should attach to customer', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pm_123' }));
      const r = await attachPaymentMethod(config, 'pm_123', 'cus_123');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toEqual(mockPM);
      expect((mockMakeRequest.mock.calls[0][3] as URLSearchParams).get('customer')).toBe('cus_123');
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await attachPaymentMethod(config, 'pm_bad', 'cus_123')).isFailure).toBe(true);
    });

    it('should handle thrown Error', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Network error'));
      expect(((await attachPaymentMethod(config, 'pm_123', 'cus_123')).error as any).message).toBe('Network error');
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(42);
      expect(((await attachPaymentMethod(config, 'pm_123', 'cus_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('detachPaymentMethod', () => {
    it('should detach', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'pm_123' }));
      const r = await detachPaymentMethod(config, 'pm_123');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toBeUndefined();
      expect(mockMakeRequest).toHaveBeenCalledWith(config, 'POST', '/payment_methods/pm_123/detach');
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await detachPaymentMethod(config, 'pm_123')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(undefined);
      expect(((await detachPaymentMethod(config, 'pm_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('listPaymentMethods', () => {
    it('should list for customer', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ data: [{ id: 'pm_1' }, { id: 'pm_2' }] }));
      const pm1 = { ...mockPM, id: 'pm_1' };
      const pm2 = { ...mockPM, id: 'pm_2' };
      mockMapToPM.mockReturnValueOnce(pm1).mockReturnValueOnce(pm2);
      const r = await listPaymentMethods(config, 'cus_123');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toHaveLength(2);
      const url = mockMakeRequest.mock.calls[0][2] as string;
      expect(url).toContain('customer=cus_123');
      expect(url).toContain('type=card');
    });

    it('should handle empty data', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ data: [] }));
      expect((await listPaymentMethods(config, 'cus_123')).value).toEqual([]);
    });

    it('should handle missing data field', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({}));
      expect((await listPaymentMethods(config, 'cus_123')).value).toEqual([]);
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await listPaymentMethods(config, 'cus_123')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(false);
      expect(((await listPaymentMethods(config, 'cus_123')).error as any).message).toBe('Unknown error');
    });
  });
});
