/**
 * Stripe Promotion Code Operations (#1220)
 *
 * Checkout takes the code a customer types. Stripe applies a discount by the promotion
 * code's id, so the typed code is looked up first, among active codes only. Stripe keeps a
 * code unique per customer, so one code can exist once for anyone and once for each customer it
 * is reserved to: the buyer's own record wins, then the unrestricted one. The record says which
 * products its coupon covers, so the caller can refuse a code that wouldn't discount this
 * purchase instead of charging full price.
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';

export interface ActivePromotionCode {
  id: string;
  /** The only customer allowed to use it, or null for anyone. */
  customerId: string | null;
  /** Products the coupon applies to, or null when it applies to every product. */
  productIds: string[] | null;
}

interface PromotionCodeRecord {
  id?: unknown;
  customer?: unknown;
  coupon?: { applies_to?: { products?: unknown } | null } | null;
}

function toActivePromotionCode(
  record: PromotionCodeRecord | undefined
): ActivePromotionCode | null {
  if (!record || typeof record.id !== 'string') return null;
  const products = record.coupon?.applies_to?.products;
  return {
    id: record.id,
    customerId: typeof record.customer === 'string' ? record.customer : null,
    productIds: Array.isArray(products)
      ? products.filter((p): p is string => typeof p === 'string')
      : null,
  };
}

/** At most this many pages of a code's records are read when looking for the open one. */
const MAX_PAGES = 10;

type ListPage = { data?: PromotionCodeRecord[]; has_more?: boolean };

async function listPage(
  config: StripeConfig,
  params: URLSearchParams
): Promise<Result<ListPage, DomainError>> {
  params.append('expand[]', 'data.coupon.applies_to');
  const response = await makeRequest(config, 'GET', `/promotion_codes?${params}`);
  if (response.isFailure) return Result.fail(response.error);
  return Result.ok(response.value as ListPage);
}

/** The copy of the code reserved to this customer, found with Stripe's customer filter. */
async function reservedCode(
  config: StripeConfig,
  code: string,
  customerId: string
): Promise<Result<ActivePromotionCode | null, DomainError>> {
  const page = await listPage(
    config,
    new URLSearchParams({ code, active: 'true', customer: customerId, limit: '1' })
  );
  if (page.isFailure) return Result.fail(page.error);
  return Result.ok(toActivePromotionCode(page.value.data?.[0]));
}

/** The copy of the code open to anyone, following pages past customers' reserved copies. */
async function openCode(
  config: StripeConfig,
  code: string
): Promise<Result<ActivePromotionCode | null, DomainError>> {
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ code, active: 'true', limit: '100' });
    if (startingAfter) params.set('starting_after', startingAfter);
    const listed = await listPage(config, params);
    if (listed.isFailure) return Result.fail(listed.error);

    const records = (listed.value.data ?? [])
      .map(toActivePromotionCode)
      .filter((p): p is ActivePromotionCode => p !== null);
    const open = records.find((p) => p.customerId === null);
    if (open) return Result.ok(open);
    if (!listed.value.has_more || records.length === 0) break;
    startingAfter = records[records.length - 1].id;
  }
  return Result.ok(null);
}

/**
 * The active promotion code with this exact code that this customer may use: the one reserved
 * to them, else the one open to anyone. Null when there is none.
 */
export async function findActivePromotionCode(
  config: StripeConfig,
  code: string,
  customerId?: string
): Promise<Result<ActivePromotionCode | null, DomainError>> {
  try {
    if (customerId) {
      const mine = await reservedCode(config, code, customerId);
      if (mine.isFailure || mine.value) return mine;
    }
    return await openCode(config, code);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

/** The product a price belongs to, or null when Stripe returns none. */
export async function getPriceProductId(
  config: StripeConfig,
  priceId: string
): Promise<Result<string | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', `/prices/${encodeURIComponent(priceId)}`);
    if (response.isFailure) return Result.fail(response.error);
    const product = (response.value as { product?: unknown }).product;
    return Result.ok(typeof product === 'string' ? product : null);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
