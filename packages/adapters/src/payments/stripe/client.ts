/**
 * Stripe Payment Adapter
 *
 * DEPRECATED: This file re-exports from the refactored module.
 * Import from './index' instead for new code.
 *
 * @see ./index.ts for the refactored module
 */

// Re-export everything for backward compatibility
export {
  StripeAdapter,
  StripeAdapter as default,
} from './adapter';

export type { PaymentServicePort } from './adapter';

export type {
  StripeConfig,
  StripeCustomer,
  StripePaymentMethod,
  StripePaymentIntent,
  StripeRefund,
  StripeSubscription,
  StripeInvoice,
  StripeWebhookEvent,
  CreatePaymentIntentParams,
  StripeCreateSubscriptionParams,
} from './types';

export {
  StripeAuthenticationError,
  StripeCardError,
  StripeRateLimitError,
  StripeInvalidRequestError,
  StripeConnectionError,
} from './errors';
