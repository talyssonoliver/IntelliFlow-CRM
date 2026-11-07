/**
 * Stripe Promotion Code Operations (#1220)
 *
 * Checkout takes the code a customer types. Stripe applies a discount by the promotion
 * code's id, so the typed code is looked up first, among active codes only.
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';

/** The id of the active promotion code with this exact code, or null when there is none. */
export async function findActivePromotionCode(
  config: StripeConfig,
  code: string
): Promise<Result<string | null, DomainError>> {
  try {
    const params = new URLSearchParams({ code, active: 'true', limit: '1' });
    const response = await makeRequest(config, 'GET', `/promotion_codes?${params}`);
    if (response.isFailure) return Result.fail(response.error);

    const data = (response.value as { data?: Array<{ id?: unknown }> }).data ?? [];
    const id = data[0]?.id;
    return Result.ok(typeof id === 'string' ? id : null);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
