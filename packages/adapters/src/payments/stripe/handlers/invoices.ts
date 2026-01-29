/**
 * Stripe Invoice Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripeInvoice } from '../types';
import { StripeConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToInvoice } from '../mappers';

export async function getInvoice(
  config: StripeConfig,
  invoiceId: string
): Promise<Result<StripeInvoice | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', `/invoices/${invoiceId}`);

    if (response.isFailure) {
      if (response.error.code === 'STRIPE_INVALID_REQUEST') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToInvoice(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function listInvoices(
  config: StripeConfig,
  customerId: string
): Promise<Result<StripeInvoice[], DomainError>> {
  try {
    const params = new URLSearchParams({ customer: customerId });
    const response = await makeRequest(config, 'GET', `/invoices?${params}`);
    if (response.isFailure) return Result.fail(response.error);

    const responseData = response.value as { data?: Record<string, unknown>[] };
    const invoices = (responseData.data ?? []).map((inv: Record<string, unknown>) =>
      mapToInvoice(inv)
    );
    return Result.ok(invoices);
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function payInvoice(
  config: StripeConfig,
  invoiceId: string
): Promise<Result<StripeInvoice, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', `/invoices/${invoiceId}/pay`);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToInvoice(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
