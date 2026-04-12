/**
 * Stripe Payment Adapter Module
 *
 * Refactored from monolithic client.ts into modular components.
 */

// Main adapter
export { StripeAdapter } from './adapter';
export type { PaymentServicePort } from './adapter';

// Types
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
  CreateCustomerParams,
  UpdateCustomerParams,
} from './types';

// Errors
export {
  StripeAuthenticationError,
  StripeCardError,
  StripeRateLimitError,
  StripeInvalidRequestError,
  StripeConnectionError,
} from './errors';

// Mappers (for testing/extension)
export {
  mapToCustomer,
  mapToPaymentMethod,
  mapToPaymentIntent,
  mapToRefund,
  mapToSubscription,
  mapToInvoice,
} from './mappers';

// Default export for backward compatibility
export { StripeAdapter as default } from './adapter';
