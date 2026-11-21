import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  OutboundWhatsAppText,
  WhatsAppConnectionRef,
  WhatsAppConnectionStatus,
  WhatsAppHandshakeResult,
  WhatsAppRawBody,
  WhatsAppSendResult,
  WhatsAppTransportPort,
  WhatsAppWebhookHeaders,
  WhatsAppWebhookVerification,
  WhatsAppWebhookVerificationInput,
} from '@intelliflow/application';
import {
  e164FromChatId,
  e164FromWaId,
  isRetryableSendError,
  validateOutboundText,
  WHATSAPP_MESSAGE_STATUSES,
  type WhatsAppEvent,
  type WhatsAppProviderStatus,
  type WhatsAppSendErrorCode,
  type WhatsAppTransportKind,
} from '@intelliflow/domain';

/**
 * In-memory WhatsApp transport (IFC-320): the reference implementation the
 * shared contract suite runs against, and the stand-in for use-case tests of
 * IFC-324 and IFC-327. It speaks its own tiny wire format so tests never need a
 * network, but it verifies like the real ones must: HMAC over the raw bytes,
 * fail-closed, constant-time compare. (Real transports use their provider's
 * algorithm and header; do not copy the fake's.) Not wired into the container:
 * it is a test double, and the real adapters arrive in IFC-325 and IFC-326. Later rows import it by
 * relative path from their tests; it is deliberately not exported from the package index.
 */

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;
const CHALLENGE_PATTERN = /^[\w.-]{1,128}$/;
const MAX_EVENTS_PER_DELIVERY = 1000;
// Derived from the domain list so a new status cannot drift; QUEUED is ours, never a provider's.
const PROVIDER_STATUSES: readonly string[] = WHATSAPP_MESSAGE_STATUSES.filter(
  (s) => s !== 'QUEUED'
);

export type FakeWireEvent =
  | {
      kind: 'message';
      id: string;
      from: string;
      text?: string;
      ts: number;
      name?: string;
      /** Sent from our own phone and echoed back: not inbound. */
      fromMe?: boolean;
    }
  | { kind: 'status'; id: string; status: string; to?: string; ts: number; error?: string };

export function signFakeBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** A body plus the headers a genuine provider would send for it. */
export function buildFakeDelivery(
  secret: string,
  events: readonly FakeWireEvent[]
): { rawBody: string; headers: Headers } {
  const rawBody = JSON.stringify({ events });
  return {
    rawBody,
    headers: new Headers({ [FAKE_SIGNATURE_HEADER]: signFakeBody(rawBody, secret) }),
  };
}

/** Test double: keeps the credential and the body so tests can assert on them. */
export interface FakeSentMessage {
  readonly connection: WhatsAppConnectionRef;
  readonly message: OutboundWhatsAppText;
  readonly providerMessageId: string;
}

export class InMemoryWhatsAppTransport implements WhatsAppTransportPort {
  /** Meta's shape by default (24-hour window, handshake); override to test kind-specific code. */
  readonly kind: WhatsAppTransportKind;
  readonly capabilities = { freeTextWindowHours: 24, templates: false } as const;

  readonly sent: FakeSentMessage[] = [];
  private nextFailure: WhatsAppSendErrorCode | null = null;
  private state: WhatsAppConnectionStatus = { state: 'CONNECTED' };
  private counter = 0;

  constructor(kind: WhatsAppTransportKind = 'META_CLOUD') {
    this.kind = kind;
  }

  /** The next `send` fails once with this code, after validation. */
  failNextSend(code: WhatsAppSendErrorCode): void {
    this.nextFailure = code;
  }

  setStatus(status: WhatsAppConnectionStatus): void {
    this.state = status;
  }

  verifyWebhook(input: WhatsAppWebhookVerificationInput): WhatsAppWebhookVerification {
    try {
      if (typeof input.secret !== 'string' || input.secret.trim() === '') {
        return { ok: false, reason: 'MISSING_SECRET' };
      }
      const header = readHeader(input.headers, FAKE_SIGNATURE_HEADER);
      if (!header) return { ok: false, reason: 'MISSING_SIGNATURE' };
      const match = SIGNATURE_PATTERN.exec(header);
      if (!match) return { ok: false, reason: 'MALFORMED_SIGNATURE' };

      // Both digests are 32 bytes by construction (the pattern fixes the header at 64 hex chars).
      const expected = createHmac('sha256', input.secret).update(input.rawBody).digest();
      const received = Buffer.from(match[1] as string, 'hex');
      return timingSafeEqual(received, expected)
        ? { ok: true }
        : { ok: false, reason: 'SIGNATURE_MISMATCH' };
    } catch {
      // Fail closed on anything unexpected (non-string body, hostile objects).
      return { ok: false, reason: 'MALFORMED_SIGNATURE' };
    }
  }

  parseWebhook(rawBody: WhatsAppRawBody): WhatsAppEvent[] {
    let parsed: unknown;
    try {
      const text = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8');
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    const events = (parsed as { events?: unknown } | null)?.events;
    if (!Array.isArray(events)) return [];

    const out: WhatsAppEvent[] = [];
    for (const raw of events.slice(0, MAX_EVENTS_PER_DELIVERY) as Array<Record<string, unknown>>) {
      const event = toEvent(raw);
      if (event) out.push(event);
    }
    return out;
  }

  async send(
    connection: WhatsAppConnectionRef,
    message: OutboundWhatsAppText
  ): Promise<WhatsAppSendResult> {
    const invalid = validateOutboundText(message?.to, message?.body);
    if (invalid) return { ok: false, code: invalid, retryable: false };
    if (!connection?.credential || !connection.accountId) {
      return { ok: false, code: 'AUTH_FAILED', retryable: false };
    }

    if (this.nextFailure) {
      const code = this.nextFailure;
      this.nextFailure = null;
      return { ok: false, code, retryable: isRetryableSendError(code) };
    }

    const providerMessageId = `fake-out-${(this.counter += 1)}`;
    this.sent.push({ connection, message, providerMessageId });
    return { ok: true, providerMessageId };
  }

  async status(): Promise<WhatsAppConnectionStatus> {
    return this.state;
  }

  verifyHandshake(
    query: Readonly<Record<string, string | undefined>>,
    verifyToken: string
  ): WhatsAppHandshakeResult {
    const token = query?.['hub.verify_token'];
    const challenge = query?.['hub.challenge'];
    // Query parsers can yield arrays or objects at runtime: anything but a string fails closed.
    if (
      typeof verifyToken !== 'string' ||
      typeof token !== 'string' ||
      typeof challenge !== 'string' ||
      !verifyToken ||
      !token ||
      !challenge ||
      query['hub.mode'] !== 'subscribe'
    ) {
      return { ok: false };
    }
    // The challenge is echoed to the caller: accept only plain tokens, never markup.
    if (!CHALLENGE_PATTERN.test(challenge)) return { ok: false };
    // Hash first so the comparison is constant-time and does not leak the token length.
    const a = createHash('sha256').update(token).digest();
    const b = createHash('sha256').update(verifyToken).digest();
    return timingSafeEqual(a, b) ? { ok: true, challenge } : { ok: false };
  }
}

function readHeader(headers: WhatsAppWebhookHeaders, name: string): string | null {
  try {
    return headers.get(name) ?? null;
  } catch {
    return null;
  }
}

type Wire = Record<string, unknown>;

function toEvent(raw: Wire): WhatsAppEvent | null {
  if (!raw || typeof raw !== 'object' || typeof raw['id'] !== 'string' || !raw['id']) return null;
  const occurredAt = toDate(raw['ts']);
  if (!occurredAt) return null;
  if (raw['kind'] === 'message') return toMessage(raw, raw['id'], occurredAt);
  if (raw['kind'] === 'status') return toStatus(raw, raw['id'], occurredAt);
  return null;
}

function toMessage(raw: Wire, providerMessageId: string, occurredAt: Date): WhatsAppEvent | null {
  const sender = raw['from'];
  if (raw['fromMe'] === true || typeof sender !== 'string') return null;
  const from = resolveNumber(sender);
  if (!from) {
    // A 1:1 chat without a number (linked id) is surfaced; groups and broadcasts are not.
    return sender.trim().toLowerCase().endsWith('@lid')
      ? {
          type: 'unresolved',
          providerMessageId,
          accountId: null,
          providerChatId: sender.trim(),
          occurredAt,
        }
      : null;
  }
  const base = {
    type: 'message',
    providerMessageId,
    accountId: null,
    from,
    profileName: typeof raw['name'] === 'string' ? raw['name'] : null,
    occurredAt,
  } as const;
  return typeof raw['text'] === 'string'
    ? { ...base, kind: 'TEXT', text: raw['text'] }
    : { ...base, kind: 'UNSUPPORTED', text: null };
}

function toStatus(raw: Wire, providerMessageId: string, occurredAt: Date): WhatsAppEvent | null {
  if (typeof raw['status'] !== 'string') return null;
  const status = raw['status'].toUpperCase();
  if (!PROVIDER_STATUSES.includes(status)) return null;
  return {
    type: 'status',
    providerMessageId,
    accountId: null,
    recipient: resolveNumber(raw['to']),
    status: status as WhatsAppProviderStatus,
    occurredAt,
    errorCode: typeof raw['error'] === 'string' ? raw['error'] : null,
  };
}

/** Unix seconds as a number or digit string; anything else (null, '', arrays, NaN) is rejected. */
function toDate(ts: unknown): Date | null {
  let seconds = Number.NaN;
  if (typeof ts === 'number') seconds = ts;
  else if (typeof ts === 'string' && /^\d+$/.test(ts)) seconds = Number(ts);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Accepts a chat id (`...@c.us`) or a bare international number; anything else is not 1:1. */
function resolveNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.includes('@') ? e164FromChatId(value) : e164FromWaId(value);
}
