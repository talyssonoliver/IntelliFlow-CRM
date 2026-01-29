/**
 * PayPal Payment Adapter Module
 *
 * Refactored from monolithic client.ts
 */

// Main adapter
export { PayPalAdapter } from './adapter';
export type { PayPalServicePort } from './adapter';

// Types
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

// Errors
export {
  PayPalAuthenticationError,
  PayPalInvalidRequestError,
  PayPalRateLimitError,
  PayPalConnectionError,
  PayPalResourceNotFoundError,
} from './errors';

// Mappers (for testing/extension)
export {
  mapToOrder,
  mapToPurchaseUnit,
  mapToItem,
  mapToPayer,
  mapToAddress,
  mapToCapture,
  mapToAuthorization,
  mapToRefund,
  mapToSubscription,
} from './mappers';

// Default export for backward compatibility
export { PayPalAdapter as default } from './adapter';
