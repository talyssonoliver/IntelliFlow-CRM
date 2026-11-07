/**
 * Promotion codes at checkout (#1220): look a typed code up among active ones, and
 * apply it to the subscription as a discount by its id.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Result } from '@intelliflow/domain';
import type { StripeConfig } from '../../types';
import { StripeConnectionError } from '../../errors';

vi.mock('../../http-client', () => ({ makeRequest: vi.fn() }));
vi.mock('../../mappers', () => ({ mapToSubscription: vi.fn(() => ({ id: 'sub_1' })) }));

import { makeRequest } from '../../http-client';
import { findActivePromotionCode, getPriceProductId } from '../promotion-codes';
import { createSubscription } from '../subscriptions';

const mockMakeRequest = makeRequest as ReturnType<typeof vi.fn>;
// Never used to reach Stripe: makeRequest is mocked.
const config = { secretKey: 'x'.repeat(12), webhookSecret: 'y'.repeat(12) } as StripeConfig;

describe('findActivePromotionCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for the exact code among active codes only, with its coupon limits', async () => {
    mockMakeRequest.mockResolvedValue(Result.ok({ data: [{ id: 'promo_1' }] }));

    const result = await findActivePromotionCode(config, 'FOUNDING100');

    expect(result.value).toEqual({ id: 'promo_1', customerId: null, productIds: null });
    const [, method, path] = mockMakeRequest.mock.calls[0];
    expect(method).toBe('GET');
    const query = new URLSearchParams(String(path).split('?')[1]);
    expect(String(path).startsWith('/promotion_codes?')).toBe(true);
    expect(Object.fromEntries(query)).toEqual({
      code: 'FOUNDING100',
      active: 'true',
      limit: '100',
      'expand[]': 'data.coupon.applies_to',
    });
  });

  it('reports who may use the code and which products its coupon covers', async () => {
    mockMakeRequest.mockResolvedValue(
      Result.ok({
        data: [
          {
            id: 'promo_2',
            customer: 'cus_9',
            coupon: { applies_to: { products: ['prod_pro', 42] } },
          },
        ],
      })
    );

    expect((await findActivePromotionCode(config, 'VIP', 'cus_9')).value).toEqual({
      id: 'promo_2',
      customerId: 'cus_9',
      productIds: ['prod_pro'],
    });
  });
  describe('when the code exists once per customer', () => {
    // A fake Stripe that answers like the real filter: by customer, or a paged listing.
    function stripeWith(records: Array<{ id: string; customer: string | null }>, pageSize = 100) {
      mockMakeRequest.mockImplementation(
        async (_config: unknown, _method: string, path: string) => {
          const q = new URLSearchParams(path.split('?')[1]);
          const customer = q.get('customer');
          if (customer) return Result.ok({ data: records.filter((r) => r.customer === customer) });
          const after = q.get('starting_after');
          const start = after ? records.findIndex((r) => r.id === after) + 1 : 0;
          const data = records.slice(start, start + pageSize);
          return Result.ok({ data, has_more: start + pageSize < records.length });
        }
      );
    }

    const records = [
      { id: 'promo_other', customer: 'cus_other' },
      { id: 'promo_open', customer: null },
      { id: 'promo_mine', customer: 'cus_1' },
    ];

    it("asks for the buyer's own record first, with Stripe's customer filter", async () => {
      stripeWith(records);

      expect((await findActivePromotionCode(config, 'VIP', 'cus_1')).value?.id).toBe('promo_mine');
      expect(
        new URLSearchParams(mockMakeRequest.mock.calls[0][2].split('?')[1]).get('customer')
      ).toBe('cus_1');
    });

    it('falls back to the record open to anyone', async () => {
      stripeWith(records);

      expect((await findActivePromotionCode(config, 'VIP', 'cus_2')).value?.id).toBe('promo_open');
    });

    it('follows pages until the open record turns up', async () => {
      const many = [
        ...Array.from({ length: 5 }, (_, i) => ({ id: `promo_c${i}`, customer: `cus_${i}` })),
        { id: 'promo_open', customer: null },
      ];
      stripeWith(many, 2);

      expect((await findActivePromotionCode(config, 'VIP', 'cus_none')).value?.id).toBe(
        'promo_open'
      );
    });

    it("finds nothing when only other customers' records exist", async () => {
      stripeWith([{ id: 'promo_other', customer: 'cus_other' }]);

      expect((await findActivePromotionCode(config, 'VIP', 'cus_1')).value).toBeNull();
    });

    it('without a customer, only an unrestricted record qualifies', async () => {
      stripeWith([records[0], records[2]]);

      expect((await findActivePromotionCode(config, 'VIP')).value).toBeNull();
    });

    it("passes a failure of the buyer's own lookup through", async () => {
      const error = new StripeConnectionError('down');
      mockMakeRequest.mockResolvedValue(Result.fail(error));

      expect((await findActivePromotionCode(config, 'VIP', 'cus_1')).error).toBe(error);
    });
  });
  it('returns null when no active code matches', async () => {
    mockMakeRequest.mockResolvedValue(Result.ok({ data: [] }));

    expect((await findActivePromotionCode(config, 'NOPE')).value).toBeNull();
  });

  it('passes a Stripe failure through', async () => {
    const error = new StripeConnectionError('down');
    mockMakeRequest.mockResolvedValue(Result.fail(error));

    const result = await findActivePromotionCode(config, 'FOUNDING100');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe(error);
  });

  it('turns a thrown error into a connection error', async () => {
    mockMakeRequest.mockRejectedValue(new Error('socket hang up'));

    const result = await findActivePromotionCode(config, 'FOUNDING100');

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(StripeConnectionError);
  });
});

describe('createSubscription with a promotion code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMakeRequest.mockResolvedValue(Result.ok({ id: 'sub_1' }));
  });

  it('applies the promotion code as the subscription discount', async () => {
    await createSubscription(config, {
      customerId: 'cus_1',
      priceId: 'price_1',
      promotionCodeId: 'promo_1',
    });

    const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
    expect(body.get('discounts[0][promotion_code]')).toBe('promo_1');
  });

  it('sends no discount without a code', async () => {
    await createSubscription(config, { customerId: 'cus_1', priceId: 'price_1' });

    const body = mockMakeRequest.mock.calls[0][3] as URLSearchParams;
    expect(body.has('discounts[0][promotion_code]')).toBe(false);
  });
});

describe('getPriceProductId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the product of the price', async () => {
    mockMakeRequest.mockResolvedValue(Result.ok({ id: 'price_1', product: 'prod_pro' }));

    const result = await getPriceProductId(config, 'price_1');

    expect(result.value).toBe('prod_pro');
    expect(mockMakeRequest.mock.calls[0].slice(1, 3)).toEqual(['GET', '/prices/price_1']);
  });

  it('returns null when the price has no product id', async () => {
    mockMakeRequest.mockResolvedValue(Result.ok({ id: 'price_1', product: { id: 'expanded' } }));

    expect((await getPriceProductId(config, 'price_1')).value).toBeNull();
  });

  it('passes failures through and wraps thrown errors', async () => {
    const error = new StripeConnectionError('down');
    mockMakeRequest.mockResolvedValueOnce(Result.fail(error));
    expect((await getPriceProductId(config, 'price_1')).error).toBe(error);

    mockMakeRequest.mockRejectedValueOnce(new Error('boom'));
    expect((await getPriceProductId(config, 'price_1')).error).toBeInstanceOf(
      StripeConnectionError
    );
  });
});
