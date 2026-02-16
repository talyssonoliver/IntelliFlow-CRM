/**
 * Adapters Layer
 * Infrastructure implementations of ports
 */

export * from './repositories';
export * from './external';

// Common adapter utilities (shared across all adapters)
export * from './common';

// Storage Adapters
export * from './storage/SupabaseStorageAdapter';

// Antivirus Adapters
export * from './antivirus/ClamAVScanner';

// ICS Generation Service (IFC-158)
export * from './ics/IcsGenerationService';

// Calendar Adapters (IFC-138)
export * from './calendar/microsoft/client';
export * from './calendar/shared';

// ERP Adapters (IFC-099)
export * from './erp/sap/client';

// Payment Adapters (IFC-099) — barrel includes client + types + errors + mappers
export * from './payments/stripe';

// PayPal adapter (renamed mapToRefund/mapToSubscription to avoid Stripe conflict)
export { PayPalAdapter } from './payments/paypal';
export type { PayPalServicePort } from './payments/paypal';
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
} from './payments/paypal';
export {
  PayPalAuthenticationError,
  PayPalInvalidRequestError,
  PayPalRateLimitError,
  PayPalConnectionError,
  PayPalResourceNotFoundError,
} from './payments/paypal';
export {
  mapToOrder,
  mapToPurchaseUnit,
  mapToItem,
  mapToPayer,
  mapToAddress,
  mapToCapture,
  mapToAuthorization,
  mapToRefund as mapToPayPalRefund,
  mapToSubscription as mapToPayPalSubscription,
} from './payments/paypal';

// Email Adapters (IFC-099)
export * from './email/gmail/client';
export * from './email/outlook/client';

// Messaging Adapters (IFC-099) — barrel includes client + types + errors + mappers
export * from './messaging/slack';
export * from './messaging/teams/client';

// Email Service Adapter (IFC-144)
export * from './messaging/email/EmailServiceAdapter';

// Inbound Email Parser (IFC-173) - renamed exports to avoid conflicts with gmail/client
export {
  InboundEmailParser,
  SpamAnalyzer,
  createInboundEmailParser,
  inboundEmailParser,
  parseEmailAddress,
  parseEmailAddresses,
  parseMimeBoundary,
  parseMimeParts,
  parseHeaders,
  decodeQuotedPrintable,
  decodeBase64,
  extractThreadInfo,
  isForwardedMessage,
  isReplyMessage,
  ParsedEmailSchema,
  ParsedAttachmentSchema,
  ParsedEmailAddressSchema,
  EmailHeadersSchema,
  type ParsedEmail as InboundParsedEmail,
  type ParsedAttachment as InboundParsedAttachment,
  type ParsedEmailAddress,
  type EmailHeaders,
  type ThreadInfo,
  type SpamAnalysis,
} from './messaging/email/inbound';

// Webhook Service Adapter (IFC-144)
export * from './messaging/WebhookServiceAdapter';

// Memory Adapters (Zep)
export * from './memory/zep';

// Feature Flag Adapter
export * from './feature-flags';

// Audit Adapters (IFC-125)
export * from './audit';

// Shared utilities (IFC-125)
export { detectScoreBias } from './shared/bias-detector';
export type { BiasMetric, BiasViolation, BiasReport } from './shared/bias-detector';
