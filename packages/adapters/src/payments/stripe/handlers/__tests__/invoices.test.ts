import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import {
  getInvoice,
  listInvoices,
  payInvoice,
  createInvoiceItem,
  createInvoice,
  finalizeInvoice,
} from '../invoices';
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

  describe('createInvoiceItem', () => {
    it('should create an item with customer/amount/currency (no description)', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'ii_1' }));
      const r = await createInvoiceItem(config, {
        customerId: 'cus_1',
        amountCents: 16700,
        currency: 'GBP',
      });
      expect(r.isSuccess).toBe(true);
      expect(r.value).toEqual({ id: 'ii_1' });
      const [, method, endpoint, body] = mockMakeRequest.mock.calls[0] as any;
      expect(method).toBe('POST');
      expect(endpoint).toBe('/invoice_items');
      expect(body.get('customer')).toBe('cus_1');
      expect(body.get('amount')).toBe('16700');
      expect(body.get('currency')).toBe('gbp');
      expect(body.get('description')).toBeNull();
    });

    it('should include description when provided', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'ii_2' }));
      await createInvoiceItem(config, {
        customerId: 'cus_1',
        amountCents: 16700,
        currency: 'gbp',
        description: 'Setup 1/3',
      });
      const body = (mockMakeRequest.mock.calls[0] as any)[3];
      expect(body.get('description')).toBe('Setup 1/3');
    });

    it('should default id to empty string when missing', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({}));
      expect(
        (await createInvoiceItem(config, { customerId: 'c', amountCents: 1, currency: 'GBP' }))
          .value
      ).toEqual({ id: '' });
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect(
        (await createInvoiceItem(config, { customerId: 'c', amountCents: 1, currency: 'GBP' }))
          .isFailure
      ).toBe(true);
    });

    it('should handle thrown Error', async () => {
      mockMakeRequest.mockRejectedValue(new Error('Boom'));
      expect(
        (
          (await createInvoiceItem(config, { customerId: 'c', amountCents: 1, currency: 'GBP' }))
            .error as any
        ).message
      ).toBe('Boom');
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(42);
      expect(
        (
          (await createInvoiceItem(config, { customerId: 'c', amountCents: 1, currency: 'GBP' }))
            .error as any
        ).message
      ).toBe('Unknown error');
    });
  });

  describe('createInvoice', () => {
    it('should create a draft invoice (minimal, auto_advance=false)', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'inv_n' }));
      const r = await createInvoice(config, { customerId: 'cus_1' });
      expect(r.isSuccess).toBe(true);
      expect(r.value).toEqual(mockInv);
      const [, method, endpoint, body] = mockMakeRequest.mock.calls[0] as any;
      expect(method).toBe('POST');
      expect(endpoint).toBe('/invoices');
      expect(body.get('customer')).toBe('cus_1');
      expect(body.get('auto_advance')).toBe('false');
      expect(body.get('collection_method')).toBeNull();
      expect(body.get('days_until_due')).toBeNull();
    });

    it('should pass all optional params', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'inv_n' }));
      await createInvoice(config, {
        customerId: 'cus_1',
        autoAdvance: true,
        description: 'Setup fee',
        collectionMethod: 'send_invoice',
        daysUntilDue: 7,
      });
      const body = (mockMakeRequest.mock.calls[0] as any)[3];
      expect(body.get('auto_advance')).toBe('true');
      expect(body.get('description')).toBe('Setup fee');
      expect(body.get('collection_method')).toBe('send_invoice');
      expect(body.get('days_until_due')).toBe('7');
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await createInvoice(config, { customerId: 'c' })).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(null);
      expect(((await createInvoice(config, { customerId: 'c' })).error as any).message).toBe(
        'Unknown error'
      );
    });
  });

  describe('finalizeInvoice', () => {
    it('should finalize a draft invoice', async () => {
      mockMakeRequest.mockResolvedValue(Result.ok({ id: 'inv_1' }));
      mockMapToInvoice.mockReturnValue({ ...mockInv, status: 'open' });
      const r = await finalizeInvoice(config, 'inv_1');
      expect(r.isSuccess).toBe(true);
      expect(r.value.status).toBe('open');
      expect((mockMakeRequest.mock.calls[0] as any)[2]).toBe('/invoices/inv_1/finalize');
    });

    it('should propagate failure', async () => {
      mockMakeRequest.mockResolvedValue(Result.fail({ message: 'err', code: 'X' } as any));
      expect((await finalizeInvoice(config, 'inv_1')).isFailure).toBe(true);
    });

    it('should handle thrown non-Error', async () => {
      mockMakeRequest.mockRejectedValue(undefined);
      expect(((await finalizeInvoice(config, 'inv_1')).error as any).message).toBe('Unknown error');
    });
  });
});
