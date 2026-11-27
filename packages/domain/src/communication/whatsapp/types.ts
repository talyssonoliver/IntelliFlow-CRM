/**
 * WhatsApp channel vocabulary shared by every transport (IFC-320).
 * Adapters translate provider payloads into these shapes; use cases only see these.
 */

export const WHATSAPP_TRANSPORT_KINDS = ['META_CLOUD', 'WAHA'] as const;
export type WhatsAppTransportKind = (typeof WHATSAPP_TRANSPORT_KINDS)[number];

/** Delivery lifecycle of an outbound message, lowest to highest (FAILED is a terminal branch). */
export const WHATSAPP_MESSAGE_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const;
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number];

/** WhatsApp text bodies are limited to 4096 characters. */
export const WHATSAPP_MAX_TEXT_LENGTH = 4096;

export const WHATSAPP_SEND_ERROR_CODES = [
  'INVALID_RECIPIENT',
  'INVALID_MESSAGE',
  'AUTH_FAILED',
  'RATE_LIMITED',
  'WINDOW_CLOSED',
  /** WAHA session stopped or waiting for a QR scan: the number is not paired. Not retryable. */
  'SESSION_DISCONNECTED',
  /** The number is not on WhatsApp, or has blocked or opted out. */
  'RECIPIENT_UNREACHABLE',
  /** The request may or may not have been delivered: retrying can duplicate the message. */
  'TIMEOUT',
  'PROVIDER_ERROR',
] as const;
export type WhatsAppSendErrorCode = (typeof WHATSAPP_SEND_ERROR_CODES)[number];

interface WhatsAppInboundBase {
  readonly type: 'message';
  /** Provider's id for the message; unique per connection, the idempotency key for ingest. */
  readonly providerMessageId: string;
  /** Meta phone_number_id or WAHA session name the event belongs to, when the payload says. */
  readonly accountId: string | null;
  /** Sender as E.164. */
  readonly from: string;
  readonly profileName: string | null;
  readonly occurredAt: Date;
}

/**
 * An authentic 1:1 message from a customer's customer. Messages sent from our own
 * phone (WAHA echoes them back) are not inbound: adapters drop them.
 */
export type WhatsAppInboundMessage =
  | (WhatsAppInboundBase & { readonly kind: 'TEXT'; readonly text: string })
  /** Media, location, reactions: not stored yet. */
  | (WhatsAppInboundBase & { readonly kind: 'UNSUPPORTED'; readonly text: null });

/**
 * A 1:1 message whose sender has no phone number in the payload (WAHA `@lid` ids).
 * Surfaced instead of dropped so ingest can flag it rather than lose a customer.
 */
export interface WhatsAppUnresolvedSender {
  readonly type: 'unresolved';
  readonly providerMessageId: string;
  readonly accountId: string | null;
  readonly providerChatId: string;
  readonly occurredAt: Date;
}

/** Providers never send QUEUED; Meta `deleted` is ignored and WAHA `PLAYED` maps to READ. */
export type WhatsAppProviderStatus = Exclude<WhatsAppMessageStatus, 'QUEUED'>;

/** A delivery status change for a message we sent. */
export interface WhatsAppStatusUpdate {
  readonly type: 'status';
  readonly providerMessageId: string;
  readonly accountId: string | null;
  /** Recipient as E.164, when the payload carries it. */
  readonly recipient: string | null;
  readonly status: WhatsAppProviderStatus;
  readonly occurredAt: Date;
  readonly errorCode: string | null;
}

export type WhatsAppEvent =
  | WhatsAppInboundMessage
  | WhatsAppUnresolvedSender
  | WhatsAppStatusUpdate;
