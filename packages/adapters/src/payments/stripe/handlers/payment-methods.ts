/**
 * Stripe Payment Method Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripePaymentMethod } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToPaymentMethod } from '../mappers';

export async function attachPaymentMethod(
  config: StripeConfig,
  paymentMethodId: string,
  customerId: string
): Promise<Result<StripePaymentMethod, DomainError>> {
  try {
    const body = new URLSearchParams();
    body.append('customer', customerId);

    const response = await makeRequest(
      config,
      'POST',
      `/payment_methods/${paymentMethodId}/attach`,
      body
    );
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToPaymentMethod(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function detachPaymentMethod(
  config: StripeConfig,
  paymentMethodId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(
      config,
      'POST',
      `/payment_methods/${paymentMethodId}/detach`
    );
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(undefined);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function listPaymentMethods(
  config: StripeConfig,
  customerId: string
): Promise<Result<StripePaymentMethod[], DomainError>> {
  try {
    const params = new URLSearchParams({
      customer: customerId,
      type: 'card',
    });

    const response = await makeRequest(config, 'GET', `/payment_methods?${params}`);
    if (response.isFailure) return Result.fail(response.error);

    const responseData = response.value as { data?: Record<string, unknown>[] };
    const methods = (responseData.data ?? []).map((pm: Record<string, unknown>) =>
      mapToPaymentMethod(pm)
    );
    return Result.ok(methods);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
