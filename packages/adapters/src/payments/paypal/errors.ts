/**
 * PayPal Error Types
 */

import { DomainError } from '@intelliflow/domain';

export class PayPalAuthenticationError extends DomainError {
  readonly code = 'PAYPAL_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class PayPalInvalidRequestError extends DomainError {
  readonly code = 'PAYPAL_INVALID_REQUEST';
  readonly details?: Array<{ field?: string; description?: string }>;

  constructor(message: string, details?: Array<{ field?: string; description?: string }>) {
    super(message);
    this.details = details;
  }
}

export class PayPalRateLimitError extends DomainError {
  readonly code = 'PAYPAL_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PayPalConnectionError extends DomainError {
  readonly code = 'PAYPAL_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class PayPalResourceNotFoundError extends DomainError {
  readonly code = 'PAYPAL_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}
