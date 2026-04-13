import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import { getInvoice, listInvoices, payInvoice } from '../invoices';
import type { StripeConfig, StripeInvoice } from '../../types';

vi.mock('../../http-client', () => ({ makeRequest: vi.fn() }));
vi.mock('../../mappers', () => ({
  mapToCustomer: vi.fn(),
  mapToPaymentMethod: vi.fn(),
  mapToPaymentIntent: vi.fn(),
  mapToRefund: vi.fn(),
  mapToSubscription: vi.fn(),
  mapToInvoice: vi.fn(),
}));

import { makeRequest } from '../../http-client';
import { mapToInvoice } from '../../mappers';

const mockMakeRequest = vi.mocked(makeRequest);
const mockMapToInvoice = vi.mocked(mapToInvoice);

const config: StripeConfig = { secretKey: 'sk_test_inv' };
const mockInv: StripeInvoice = {
  id: 'inv_123',
  customerId: 'cus_123',
  status: 'open',
  amountDue: 5000,
  amountPaid: 0,
  amountRemaining: 5000,
  currency: 'GBP',
  created: new Date('2025-01-01'),
};

describe('invoices handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMapToInvoice.mockReturnValue(mockInv);
  });

  describe('getInvoice', () => {
    it('should retrieve by id', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'inv_123' }));
      expect((await getInvoice(config, 'inv_123')).value).toEqual(mockInv);
    });

    it('should return null for STRIPE_INVALID_REQUEST', async () => {
      mockMakeRequest.mockResolvedValue(
        Result.fail({ message: 'x', code: 'STRIPE_INVALID_REQUEST' } as any)
      );
      const r = await getInvoice(config, 'inv_x');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toBeNull();
    });

    it('should propagate other errors', async () => {
      mockMakeRequest.mockResolvedValue(
        Result.fail({ message: 'x', code: 'STRIPE_AUTH_ERROR' } as any)
      );
      expect((await getInvoice(config, 'inv_123')).isFailure).toBe(true);
    });

    it('should handle thrown Error', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Timeout'));
      expect(((await getInvoice(config, 'inv_123')).error as any).message).toBe('Timeout');
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue('str');
      expect(((await getInvoice(config, 'inv_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('listInvoices', () => {
    it('should list invoices for customer', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ data: [{ id: 'inv_1' }, { id: 'inv_2' }] }));
      const inv1 = { ...mockInv, id: 'inv_1' };
      const inv2 = { ...mockInv, id: 'inv_2' };
      mockMapToInvoice.mockReturnValueOnce(inv1).mockReturnValueOnce(inv2);
      const r = await listInvoices(config, 'cus_123');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toHaveLength(2);
    });

    it('should handle empty data', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ data: [] }));
      expect((await listInvoices(config, 'cus_123')).value).toEqual([]);
    });

    it('should handle missing data field', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({}));
      expect((await listInvoices(config, 'cus_123')).value).toEqual([]);
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await listInvoices(config, 'cus_123')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(undefined);
      expect(((await listInvoices(config, 'cus_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('payInvoice', () => {
    it('should pay an invoice', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'inv_123' }));
      mockMapToInvoice.mockReturnValue({ ...mockInv, status: 'paid' });
      const r = await payInvoice(config, 'inv_123');
      expect(r.isSuccess).toBe(true);
      expect(r.value.status).toBe('paid');
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await payInvoice(config, 'inv_123')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(null);
      expect(((await payInvoice(config, 'inv_123')).error as any).message).toBe('Unknown error');
    });
  });
});
