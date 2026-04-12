/**
 * Stripe Refund Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripeRefund } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToRefund } from '../mappers';

export async function createRefund(
  config: StripeConfig,
  paymentIntentId: string,
  amount?: number,
  reason?: StripeRefund['reason']
): Promise<Result<StripeRefund, DomainError>> {
  try {
    const body = new URLSearchParams();
    body.append('payment_intent', paymentIntentId);
    if (amount !== undefined) body.append('amount', amount.toString());
    if (reason) body.append('reason', reason);

    const response = await makeRequest(config, 'POST', '/refunds', body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToRefund(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getRefund(
  config: StripeConfig,
  refundId: string
): Promise<Result<StripeRefund | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', `/refunds/${refundId}`);

    if (response.isFailure) {
      if (response.error.code === 'STRIPE_INVALID_REQUEST') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToRefund(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
