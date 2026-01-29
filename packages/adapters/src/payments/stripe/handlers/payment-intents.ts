/**
 * Stripe Payment Intent Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripePaymentIntent, CreatePaymentIntentParams } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToPaymentIntent } from '../mappers';

export async function createPaymentIntent(
  config: StripeConfig,
  params: CreatePaymentIntentParams
): Promise<Result<StripePaymentIntent, DomainError>> {
  try {
    const body = new URLSearchParams();
    body.append('amount', params.amount.toString());
    body.append('currency', params.currency);

    if (params.customerId) body.append('customer', params.customerId);
    if (params.paymentMethodId) body.append('payment_method', params.paymentMethodId);
    if (params.description) body.append('description', params.description);
    if (params.receiptEmail) body.append('receipt_email', params.receiptEmail);
    if (params.captureMethod) body.append('capture_method', params.captureMethod);
    if (params.confirmationMethod) body.append('confirmation_method', params.confirmationMethod);

    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        body.append(`metadata[${key}]`, value);
      });
    }

    const response = await makeRequest(config, 'POST', '/payment_intents', body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToPaymentIntent(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function confirmPaymentIntent(
  config: StripeConfig,
  paymentIntentId: string,
  paymentMethodId?: string
): Promise<Result<StripePaymentIntent, DomainError>> {
  try {
    const body = new URLSearchParams();
    if (paymentMethodId) body.append('payment_method', paymentMethodId);

    const response = await makeRequest(
      config,
      'POST',
      `/payment_intents/${paymentIntentId}/confirm`,
      body
    );
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToPaymentIntent(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function capturePaymentIntent(
  config: StripeConfig,
  paymentIntentId: string,
  amount?: number
): Promise<Result<StripePaymentIntent, DomainError>> {
  try {
    const body = new URLSearchParams();
    if (amount !== undefined) body.append('amount_to_capture', amount.toString());

    const response = await makeRequest(
      config,
      'POST',
      `/payment_intents/${paymentIntentId}/capture`,
      body
    );
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToPaymentIntent(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function cancelPaymentIntent(
  config: StripeConfig,
  paymentIntentId: string
): Promise<Result<StripePaymentIntent, DomainError>> {
  try {
    const response = await makeRequest(
      config,
      'POST',
      `/payment_intents/${paymentIntentId}/cancel`
    );
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToPaymentIntent(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getPaymentIntent(
  config: StripeConfig,
  paymentIntentId: string
): Promise<Result<StripePaymentIntent | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', `/payment_intents/${paymentIntentId}`);

    if (response.isFailure) {
      if (response.error.code === 'STRIPE_INVALID_REQUEST') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToPaymentIntent(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
