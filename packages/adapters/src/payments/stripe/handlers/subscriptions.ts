/**
 * Stripe Subscription Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripeSubscription, StripeCreateSubscriptionParams } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToSubscription } from '../mappers';

export async function createSubscription(
  config: StripeConfig,
  params: StripeCreateSubscriptionParams
): Promise<Result<StripeSubscription, DomainError>> {
  try {
    const body = new URLSearchParams();
    body.append('customer', params.customerId);
    body.append('items[0][price]', params.priceId);

    if (params.quantity) body.append('items[0][quantity]', params.quantity.toString());
    if (params.trialPeriodDays) body.append('trial_period_days', params.trialPeriodDays.toString());
    if (params.cancelAtPeriodEnd) body.append('cancel_at_period_end', 'true');

    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        body.append(`metadata[${key}]`, value);
      });
    }

    const response = await makeRequest(config, 'POST', '/subscriptions', body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToSubscription(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function updateSubscription(
  config: StripeConfig,
  subscriptionId: string,
  params: Partial<StripeCreateSubscriptionParams>
): Promise<Result<StripeSubscription, DomainError>> {
  try {
    const body = new URLSearchParams();

    if (params.priceId) body.append('items[0][price]', params.priceId);
    if (params.quantity) body.append('items[0][quantity]', params.quantity.toString());
    if (params.cancelAtPeriodEnd !== undefined) {
      body.append('cancel_at_period_end', params.cancelAtPeriodEnd.toString());
    }

    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        body.append(`metadata[${key}]`, value);
      });
    }

    const response = await makeRequest(config, 'POST', `/subscriptions/${subscriptionId}`, body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToSubscription(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function cancelSubscription(
  config: StripeConfig,
  subscriptionId: string,
  atPeriodEnd: boolean = false
): Promise<Result<StripeSubscription, DomainError>> {
  try {
    if (atPeriodEnd) {
      const body = new URLSearchParams();
      body.append('cancel_at_period_end', 'true');

      const response = await makeRequest(config, 'POST', `/subscriptions/${subscriptionId}`, body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(mapToSubscription(response.value));
    } else {
      const response = await makeRequest(config, 'DELETE', `/subscriptions/${subscriptionId}`);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(mapToSubscription(response.value));
    }
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getSubscription(
  config: StripeConfig,
  subscriptionId: string
): Promise<Result<StripeSubscription | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', `/subscriptions/${subscriptionId}`);

    if (response.isFailure) {
      if (response.error.code === 'STRIPE_INVALID_REQUEST') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToSubscription(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function listSubscriptions(
  config: StripeConfig,
  customerId: string
): Promise<Result<StripeSubscription[], DomainError>> {
  try {
    const params = new URLSearchParams({ customer: customerId });
    const response = await makeRequest(config, 'GET', `/subscriptions?${params}`);
    if (response.isFailure) return Result.fail(response.error);

    const responseData = response.value as { data?: Record<string, unknown>[] };
    const subscriptions = (responseData.data ?? []).map((sub: Record<string, unknown>) =>
      mapToSubscription(sub)
    );
    return Result.ok(subscriptions);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
