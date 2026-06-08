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
    const params = new URLSearchParams({ customer: customerId, 'expand[]': 'data.charge' });
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

export async function retrieveUpcomingInvoice(
  config: StripeConfig,
  customerId: string
): Promise<Result<StripeInvoice | null, DomainError>> {
  try {
    const params = new URLSearchParams({ customer: customerId });
    const response = await makeRequest(config, 'GET', `/invoices/upcoming?${params}`);

    if (response.isFailure) {
      // Stripe returns 404 / invalid_request when no upcoming invoice exists
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

// IFC-314: invoice CREATION (the Setup-fee instalment flow — 3x at day 0/7/14).
// Flow per instalment: createInvoiceItem -> createInvoice -> finalizeInvoice.

export interface CreateInvoiceItemParams {
  customerId: string;
  /** Amount in minor units (e.g. pence). */
  amountCents: number;
  currency: string;
  description?: string;
}

/** POST /invoice_items — a pending line item billed on the customer's next invoice. */
export async function createInvoiceItem(
  config: StripeConfig,
  params: CreateInvoiceItemParams
): Promise<Result<{ id: string }, DomainError>> {
  try {
    const body = new URLSearchParams({
      customer: params.customerId,
      amount: String(params.amountCents),
      currency: params.currency.toLowerCase(),
    });
    if (params.description) body.set('description', params.description);

    const response = await makeRequest(config, 'POST', '/invoice_items', body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok({ id: (response.value.id as string | null | undefined) ?? '' });
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export interface CreateInvoiceParams {
  customerId: string;
  /** Let Stripe auto-finalize. Default false — we finalize explicitly. */
  autoAdvance?: boolean;
  description?: string;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  /** Required by Stripe when collectionMethod is 'send_invoice'. */
  daysUntilDue?: number;
}

/** POST /invoices — create a draft invoice that pulls the customer's pending items. */
export async function createInvoice(
  config: StripeConfig,
  params: CreateInvoiceParams
): Promise<Result<StripeInvoice, DomainError>> {
  try {
    const body = new URLSearchParams({
      customer: params.customerId,
      auto_advance: String(params.autoAdvance ?? false),
    });
    if (params.description) body.set('description', params.description);
    if (params.collectionMethod) body.set('collection_method', params.collectionMethod);
    if (params.daysUntilDue !== undefined) body.set('days_until_due', String(params.daysUntilDue));

    const response = await makeRequest(config, 'POST', '/invoices', body);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToInvoice(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

/** POST /invoices/{id}/finalize — move a draft invoice to `open` (payable/sendable). */
export async function finalizeInvoice(
  config: StripeConfig,
  invoiceId: string
): Promise<Result<StripeInvoice, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', `/invoices/${invoiceId}/finalize`);
    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToInvoice(response.value));
  } catch (error) {
    return Result.fail(
      new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
