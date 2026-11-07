/**
 * Stripe Promotion Code Operations (#1220)
 *
 * Checkout takes the code a customer types. Stripe applies a discount by the promotion
 * code's id, so the typed code is looked up first, among active codes only. Stripe keeps
 * active codes unique, so the exact code matches at most one record. The record says who
 * may use it and which products its coupon covers, so the caller can refuse a code that
 * wouldn't discount this purchase instead of charging full price.
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

/** The active promotion code with this exact code, or null when there is none. */
export async function findActivePromotionCode(
  config: StripeConfig,
  code: string
): Promise<Result<ActivePromotionCode | null, DomainError>> {
  try {
    const params = new URLSearchParams({ code, active: 'true', limit: '1' });
    params.append('expand[]', 'data.coupon.applies_to');
    const response = await makeRequest(config, 'GET', `/promotion_codes?${params}`);
    if (response.isFailure) return Result.fail(response.error);

    const data = (response.value as { data?: PromotionCodeRecord[] }).data ?? [];
    return Result.ok(toActivePromotionCode(data[0]));
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
