/**
 * Stripe Customer Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripeCustomer, CreateCustomerParams, UpdateCustomerParams } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToCustomer } from '../mappers';

export async function createCustomer(
  config: StripeConfig,
  params: CreateCustomerParams
): Promise<Result<StripeCustomer, DomainError>> {
  try {
    const body = new URLSearchParams();
    if (params.email) body.append('email', params.email);
    if (params.name) body.append('name', params.name);
    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        body.append(`metadata[${key}]`, value);
      });
    }

    const response = await makeRequest(config, 'POST', '/customers', body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToCustomer(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getCustomer(
  config: StripeConfig,
  customerId: string
): Promise<Result<StripeCustomer | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', `/customers/${customerId}`);

    if (response.isFailure) {
      if (response.error.code === 'STRIPE_INVALID_REQUEST') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToCustomer(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function updateCustomer(
  config: StripeConfig,
  customerId: string,
  params: UpdateCustomerParams
): Promise<Result<StripeCustomer, DomainError>> {
  try {
    const body = new URLSearchParams();
    if (params.email) body.append('email', params.email);
    if (params.name) body.append('name', params.name);
    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        body.append(`metadata[${key}]`, value);
      });
    }

    const response = await makeRequest(config, 'POST', `/customers/${customerId}`, body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToCustomer(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function deleteCustomer(
  config: StripeConfig,
  customerId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'DELETE', `/customers/${customerId}`);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(undefined);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
