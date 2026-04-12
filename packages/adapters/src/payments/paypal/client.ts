/**
 * PayPal Payment Adapter
 *
 * DEPRECATED: This file re-exports from the refactored module.
 * Import from './index' instead for new code.
 *
 * @see ./index.ts for the refactored module
 */

// Re-export everything for backward compatibility
export { PayPalAdapter, PayPalAdapter as default } from './adapter';

export type { PayPalServicePort } from './adapter';

export type {
  PayPalConfig,
  PayPalAccessToken,
  PayPalOrder,
  PayPalPurchaseUnit,
  PayPalItem,
  PayPalPayer,
  PayPalAddress,
  PayPalCapture,
  PayPalAuthorization,
  PayPalRefund,
  PayPalLink,
  PayPalSubscription,
  PayPalWebhookEvent,
  CreateOrderParams,
  CreateSubscriptionParams,
} from './types';

export {
  PayPalAuthenticationError,
  PayPalInvalidRequestError,
  PayPalRateLimitError,
  PayPalConnectionError,
  PayPalResourceNotFoundError,
} from './errors';
