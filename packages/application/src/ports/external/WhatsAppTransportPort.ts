import type {
  WhatsAppEvent,
  WhatsAppSendErrorCode,
  WhatsAppTransportKind,
} from '@intelliflow/domain';

/**
 * WhatsApp Transport Port (IFC-320)
 *
 * One seam for both transports the owner wants: Meta Cloud API (IFC-325) and
 * WAHA (IFC-326). Adapters are dumb: verify, parse, send, status. Rules (24-hour
 * window, reply-only, restrictions, STOP) live in use cases so both obey them.
 * 1:1 chats only: group and broadcast traffic never leaves `parseWebhook`.
 *
 * @see docs/architecture/whatsapp-channel-design.md section 3
 * Every transport must pass the shared suite in
 * packages/adapters/src/messaging/whatsapp/__tests__/transport-contract.ts
 */

/** Anything with a case-insensitive `get`, which the Fetch `Headers` class satisfies. */
export interface WhatsAppWebhookHeaders {
  get(name: string): string | null | undefined;
}

export type WhatsAppRawBody = string | Uint8Array;

export interface WhatsAppWebhookVerificationInput {
  /**
   * The exact bytes received, before any JSON parsing. Pass the bytes where you have them:
   * HMAC is over bytes, and decoding to a string can change invalid UTF-8.
   */
  readonly rawBody: WhatsAppRawBody;
  readonly headers: WhatsAppWebhookHeaders;
  /** THIS connection's secret (Meta app secret or WAHA webhook HMAC key). Empty fails closed. */
  readonly secret: string;
}

export type WhatsAppWebhookVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: WhatsAppWebhookRejection };

/** Reason codes only: a rejection never carries the body or the secret. */
export type WhatsAppWebhookRejection =
  | 'MISSING_SECRET'
  | 'MISSING_SIGNATURE'
  | 'MALFORMED_SIGNATURE'
  | 'SIGNATURE_MISMATCH';

/**
 * What the transport needs to address one tenant's account. Never log or serialise `credential`
 * (callers pass it from the encrypted store; transports must not echo it in results or errors).
 */
export interface WhatsAppConnectionRef {
  readonly tenantId: string;
  readonly connectionId: string;
  /** Meta phone_number_id, or the WAHA session name. */
  readonly accountId: string;
  /** Meta access token, or the WAHA API key of this tenant's session. */
  readonly credential: string;
}

export interface OutboundWhatsAppText {
  /**
   * Recipient as E.164. Free text only: Meta outside its 24-hour window needs a template, which
   * is a later row (`capabilities.templates` says whether a transport supports them).
   */
  readonly to: string;
  readonly body: string;
}

export type WhatsAppSendResult =
  | { readonly ok: true; readonly providerMessageId: string }
  | {
      readonly ok: false;
      readonly code: WhatsAppSendErrorCode;
      readonly retryable: boolean;
    };

export type WhatsAppConnectionState = 'CONNECTED' | 'NEEDS_ATTENTION' | 'DISCONNECTED';

export interface WhatsAppConnectionStatus {
  readonly state: WhatsAppConnectionState;
  /** WAHA only: a QR code to pair the number while `state` is not CONNECTED. A pairing credential: never log it. */
  readonly qrCode?: string;
}

export type WhatsAppHandshakeResult =
  /** `challenge` is echoed from the query: the route must reply as text/plain. */
  { readonly ok: true; readonly challenge: string } | { readonly ok: false };

export interface WhatsAppTransportPort {
  readonly kind: WhatsAppTransportKind;
  readonly capabilities: {
    /** Hours a free-text reply is allowed after the customer's last message; null = no window. */
    readonly freeTextWindowHours: number | null;
    readonly templates: boolean;
  };

  /**
   * Fail-closed: no secret, no signature, a malformed one or a wrong one is rejected.
   * Never throws, whatever the input. Callers cap the body size before calling.
   * The signature algorithm is the transport's own (Meta: SHA-256 `X-Hub-Signature-256`;
   * WAHA's HMAC algorithm is configurable and defaults to SHA-512): do not copy the fake's.
   * Always call this and get `ok` before `parseWebhook`.
   */
  verifyWebhook(input: WhatsAppWebhookVerificationInput): WhatsAppWebhookVerification;

  /**
   * An authentic body becomes normalised events, in payload order. Unknown shapes, bad JSON,
   * groups, broadcasts and messages we sent ourselves are skipped. A 1:1 sender without a phone
   * number (WAHA `@lid`) becomes an `unresolved` event, not a silent drop.
   */
  parseWebhook(rawBody: WhatsAppRawBody): WhatsAppEvent[];

  /**
   * Never throws: failures come back as a coded, retryable-or-not result. An empty credential or
   * account id is AUTH_FAILED. A TIMEOUT may still have been delivered (not retryable).
   */
  send(
    connection: WhatsAppConnectionRef,
    message: OutboundWhatsAppText
  ): Promise<WhatsAppSendResult>;

  /** Meta: token check. WAHA: session state and QR. Never throws. */
  status(connection: WhatsAppConnectionRef): Promise<WhatsAppConnectionStatus>;

  /** Meta's GET subscription handshake. Absent on transports that have none (WAHA). */
  verifyHandshake?(
    query: Readonly<Record<string, string | undefined>>,
    verifyToken: string
  ): WhatsAppHandshakeResult;
}
