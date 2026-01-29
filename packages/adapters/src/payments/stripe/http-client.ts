/**
 * Stripe HTTP Client
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig } from './types';
import {
  StripeAuthenticationError,
  StripeCardError,
  StripeRateLimitError,
  StripeInvalidRequestError,
} from './errors';

const API_BASE_URL = 'https://api.stripe.com/v1';

export async function makeRequest(
  config: StripeConfig,
  method: string,
  endpoint: string,
  body?: URLSearchParams
): Promise<Result<Record<string, unknown>, DomainError>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (config.apiVersion) {
    headers['Stripe-Version'] = config.apiVersion;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body?.toString(),
  });

  if (!response.ok) {
    return handleErrorResponse(response);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return Result.ok(data);
}

async function handleErrorResponse(
  response: Response
): Promise<Result<Record<string, unknown>, DomainError>> {
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; decline_code?: string; code?: string; param?: string };
  };
  const error = data.error ?? {};

  switch (response.status) {
    case 401:
      return Result.fail(new StripeAuthenticationError(error.message ?? 'Invalid API key'));
    case 429: {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
      return Result.fail(new StripeRateLimitError(retryAfter));
    }
    case 402:
      return Result.fail(new StripeCardError(error.message ?? 'Card declined', error.decline_code));
    default:
      return Result.fail(new StripeInvalidRequestError(error.message ?? 'Request failed'));
  }
}
