import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import { createCustomer, getCustomer, updateCustomer, deleteCustomer } from '../customers';
import type { StripeConfig, StripeCustomer } from '../../types';

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
import { mapToCustomer } from '../../mappers';

const mockMakeRequest = vi.mocked(makeRequest);
const mockMapToCustomer = vi.mocked(mapToCustomer);

const config: StripeConfig = { secretKey: 'sk_test_abc' };
const mockCust: StripeCustomer = {
  id: 'cus_123',
  email: 'john@example.com',
  name: 'John Doe',
  balance: 0,
  currency: 'GBP',
  created: new Date('2025-01-01'),
};

describe('customers handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMapToCustomer.mockReturnValue(mockCust);
  });

  describe('createCustomer', () => {
    it('should create with email and name', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_123' }));
      const r = await createCustomer(config, { email: 'john@example.com', name: 'John Doe' });
      expect(r.isSuccess).toBe(true);
      expect(r.value).toEqual(mockCust);
      const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(body.get('email')).toBe('john@example.com');
      expect(body.get('name')).toBe('John Doe');
    });

    it('should create with empty params', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_456' }));
      expect((await createCustomer(config, {})).isSuccess).toBe(true);
    });

    it('should include metadata', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_123' }));
      await createCustomer(config, { metadata: { plan: 'premium' } });
      expect((mockMakeRequest.mock.calls[0][3] as URLSearchParams).get('metadata[plan]')).toBe(
        'premium'
      );
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await createCustomer(config, { email: 'bad' })).isFailure).toBe(true);
    });

    it('should handle thrown Error', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Fetch failed'));
      expect(((await createCustomer(config, { email: 't@t.com' })).error as any).message).toBe(
        'Fetch failed'
      );
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(123);
      expect(((await createCustomer(config, { email: 't@t.com' })).error as any).message).toBe(
        'Unknown error'
      );
    });
  });

  describe('getCustomer', () => {
    it('should retrieve by id', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_123' }));
      expect((await getCustomer(config, 'cus_123')).value).toEqual(mockCust);
    });

    it('should return null for STRIPE_INVALID_REQUEST', async () => {
      mockMakeRequest.mockResolvedValue(
        Result.fail({ message: 'x', code: 'STRIPE_INVALID_REQUEST' } as any)
      );
      const r = await getCustomer(config, 'cus_x');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toBeNull();
    });

    it('should propagate non-STRIPE_INVALID_REQUEST', async () => {
      mockMakeRequest.mockResolvedValue(
        Result.fail({ message: 'x', code: 'STRIPE_RATE_LIMIT' } as any)
      );
      expect((await getCustomer(config, 'cus_123')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(false);
      expect(((await getCustomer(config, 'cus_123')).error as any).message).toBe('Unknown error');
    });
  });

  describe('updateCustomer', () => {
    it('should update with email', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_123' }));
      const r = await updateCustomer(config, 'cus_123', { email: 'new@ex.com' });
      expect(r.isSuccess).toBe(true);
      expect((mockMakeRequest.mock.calls[0][3] as URLSearchParams).get('email')).toBe('new@ex.com');
    });

    it('should update with name and metadata', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_123' }));
      await updateCustomer(config, 'cus_123', { name: 'Jane', metadata: { tier: 'gold' } });
      const b = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
      expect(b.get('name')).toBe('Jane');
      expect(b.get('metadata[tier]')).toBe('gold');
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue({});
      expect(((await updateCustomer(config, 'cus_123', { name: 'X' })).error as any).message).toBe(
        'Unknown error'
      );
    });
  });

  describe('deleteCustomer', () => {
    it('should delete', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'cus_123', deleted: true }));
      const r = await deleteCustomer(config, 'cus_123');
      expect(r.isSuccess).toBe(true);
      expect(r.value).toBeUndefined();
      expect(mockMakeRequest).toHaveBeenCalledWith(config, 'DELETE', '/customers/cus_123');
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(null);
      expect(((await deleteCustomer(config, 'cus_123')).error as any).message).toBe(
        'Unknown error'
      );
    });
  });
});
