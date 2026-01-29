/**
 * Stripe Error Types
 */

import { DomainError } from '@intelliflow/domain';

export class StripeAuthenticationError extends DomainError {
  readonly code = 'STRIPE_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class StripeCardError extends DomainError {
  readonly code = 'STRIPE_CARD_ERROR';
  readonly declineCode?: string;

  constructor(message: string, declineCode?: string) {
    super(message);
    this.declineCode = declineCode;
  }
}

export class StripeRateLimitError extends DomainError {
  readonly code = 'STRIPE_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class StripeInvalidRequestError extends DomainError {
  readonly code = 'STRIPE_INVALID_REQUEST';

  constructor(message: string) {
    super(message);
  }
}

export class StripeConnectionError extends DomainError {
  readonly code = 'STRIPE_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}
