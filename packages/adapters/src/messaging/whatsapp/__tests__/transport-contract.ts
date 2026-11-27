import { describe, expect, it } from 'vitest';
import type {
  WhatsAppConnectionRef,
  WhatsAppTransportPort,
  WhatsAppWebhookHeaders,
} from '@intelliflow/application';
import {
  WHATSAPP_MAX_TEXT_LENGTH,
  WHATSAPP_TRANSPORT_KINDS,
  type WhatsAppProviderStatus,
} from '@intelliflow/domain';

/**
 * Contract suite every WhatsApp transport must pass (IFC-320; the
 * `provider-test-exists` gate). Meta (IFC-325) and WAHA (IFC-326) call
 * `runTransportContract` from their own test file with a harness that builds
 * payloads in that provider's wire format. The suite only talks to the port.
 *
 * Not a *.test.ts file on purpose: it is imported, never collected by itself.
 */

/** Provider-neutral description of a delivery; the harness turns it into real bytes. */
export interface ContractDelivery {
  messages?: Array<{ id: string; from: string; text: string; at: number }>;
  statuses?: Array<{
    id: string;
    to: string;
    status: WhatsAppProviderStatus;
    at: number;
    error?: string;
  }>;
  /** A 1:1 message that is not text (image, location): UNSUPPORTED, text null. */
  mediaMessage?: { id: string; from: string; at: number };
  /** A message from a group chat (must be ignored: 1:1 only). */
  groupMessage?: { id: string; text: string; at: number };
  /** A message we sent from our own phone, echoed back: must never become an inbound event. */
  ownEcho?: { id: string; text: string; at: number };
  /** A 1:1 sender with no phone number behind it (WAHA @lid): surfaced as `unresolved`. */
  unresolvedSender?: { id: string; chatId: string; at: number };
}

export type SignatureMode = 'valid' | 'none' | 'wrong' | 'wrong-length' | 'malformed';

export interface TransportContractHarness {
  name: string;
  /** A fresh transport for each test. */
  create(): WhatsAppTransportPort;
  /** A connection secret the harness signs with. */
  secret: string;
  connection: WhatsAppConnectionRef;
  /** Body bytes for a delivery. */
  body(delivery: ContractDelivery): string;
  /** Headers for `rawBody` in the given signature mode. `wrong` must differ in value only, not length. */
  headers(rawBody: string, secret: string, mode: SignatureMode): WhatsAppWebhookHeaders;
  /** True for transports with a GET subscription handshake (Meta). The suite then requires it. */
  expectsHandshake: boolean;
  /**
   * Delivery kinds the provider cannot express (Meta has no own-message echo, for one). Opt out
   * by name; the harness must otherwise map `ownEcho` and `unresolvedSender` to real bytes.
   */
  optOut?: ReadonlyArray<'ownEcho' | 'unresolvedSender'>;
  /** Makes the next send fail at the provider with this class of failure. */
  failNextSend(
    transport: WhatsAppTransportPort,
    kind: 'AUTH_FAILED' | 'RATE_LIMITED' | 'PROVIDER_ERROR'
  ): void;
}

// Ofcom drama range, built from parts so no real number ever sits in the repo.
const CUSTOMER = '+44' + '7700900123';
const CUSTOMER_DIGITS = CUSTOMER.slice(1);
const AT = 1_700_000_000;

export function runTransportContract(h: TransportContractHarness): void {
  describe(`WhatsApp transport contract: ${h.name}`, () => {
    describe('identity', () => {
      it('declares a known kind and sane capabilities', () => {
        const t = h.create();
        expect(WHATSAPP_TRANSPORT_KINDS).toContain(t.kind);
        expect(t.capabilities.templates).toEqual(expect.any(Boolean));
        const window = t.capabilities.freeTextWindowHours;
        expect(window === null || (Number.isFinite(window) && window > 0)).toBe(true);
      });
    });

    describe('verifyWebhook is fail-closed', () => {
      const body = () => h.body({ messages: [{ id: 'm1', from: CUSTOMER, text: 'hi', at: AT }] });

      const verify = (
        t: WhatsAppTransportPort,
        mode: SignatureMode,
        secret = h.secret,
        raw = body()
      ) => t.verifyWebhook({ rawBody: raw, headers: h.headers(raw, h.secret, mode), secret });

      it('accepts a correctly signed body', () => {
        expect(verify(h.create(), 'valid')).toEqual({ ok: true });
      });

      it('rejects a missing signature', () => {
        expect(verify(h.create(), 'none').ok).toBe(false);
      });

      it('rejects a wrong signature of the right length', () => {
        expect(verify(h.create(), 'wrong').ok).toBe(false);
      });

      it('rejects a signature of the wrong length without throwing', () => {
        expect(() => verify(h.create(), 'wrong-length')).not.toThrow();
        expect(verify(h.create(), 'wrong-length').ok).toBe(false);
      });

      it('rejects a malformed signature', () => {
        expect(verify(h.create(), 'malformed').ok).toBe(false);
      });

      it('rejects a body changed after signing', () => {
        const raw = body();
        const headers = h.headers(raw, h.secret, 'valid');
        const result = h.create().verifyWebhook({
          rawBody: `${raw} `,
          headers,
          secret: h.secret,
        });
        expect(result.ok).toBe(false);
      });

      it('rejects a signature made with another connection secret', () => {
        const raw = body();
        const headers = h.headers(raw, `${h.secret}-other`, 'valid');
        expect(h.create().verifyWebhook({ rawBody: raw, headers, secret: h.secret }).ok).toBe(
          false
        );
      });

      it('rejects when the connection has no secret, even if the signature matches an empty one', () => {
        const raw = body();
        const headers = h.headers(raw, '', 'valid');
        expect(h.create().verifyWebhook({ rawBody: raw, headers, secret: '' }).ok).toBe(false);
      });

      it('never reports the body or the secret in a rejection', () => {
        const marker = 'leak-marker-7f3a';
        const raw = h.body({ messages: [{ id: 'm9', from: CUSTOMER, text: marker, at: AT }] });
        const reasons = [
          'MISSING_SECRET',
          'MISSING_SIGNATURE',
          'MALFORMED_SIGNATURE',
          'SIGNATURE_MISMATCH',
        ];
        for (const mode of ['none', 'wrong', 'wrong-length', 'malformed'] as const) {
          const result = h.create().verifyWebhook({
            rawBody: raw,
            headers: h.headers(raw, h.secret, mode),
            secret: h.secret,
          });
          expect(result.ok).toBe(false);
          expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
          if (!result.ok) expect(reasons).toContain(result.reason);
          const text = JSON.stringify(result);
          expect(text).not.toContain(h.secret);
          expect(text).not.toContain(marker);
        }
      });

      it('verifies the same bytes given as a Uint8Array, including non-ASCII text', () => {
        const raw = h.body({
          messages: [{ id: 'm8', from: CUSTOMER, text: 'caf\u00e9 \u{1F600}', at: AT }],
        });
        const t = h.create();
        const headers = h.headers(raw, h.secret, 'valid');
        expect(
          t.verifyWebhook({ rawBody: Buffer.from(raw, 'utf8'), headers, secret: h.secret }).ok
        ).toBe(true);
        expect(t.parseWebhook(Buffer.from(raw, 'utf8'))[0]).toMatchObject({
          text: 'caf\u00e9 \u{1F600}',
        });
      });

      it('never throws on a non-string body or secret', () => {
        const t = h.create();
        const headers = h.headers('x', h.secret, 'valid');
        const bad = [undefined, null, 42, {}] as unknown[];
        for (const value of bad) {
          expect(() =>
            t.verifyWebhook({ rawBody: value as string, headers, secret: h.secret })
          ).not.toThrow();
          expect(t.verifyWebhook({ rawBody: value as string, headers, secret: h.secret }).ok).toBe(
            false
          );
          expect(t.verifyWebhook({ rawBody: 'x', headers, secret: value as string }).ok).toBe(
            false
          );
        }
      });

      it('does not throw when the header reader throws or the body is empty', () => {
        const hostile: WhatsAppWebhookHeaders = {
          get() {
            throw new Error('boom');
          },
        };
        const t = h.create();
        expect(t.verifyWebhook({ rawBody: '', headers: hostile, secret: h.secret }).ok).toBe(false);
        expect(
          t.verifyWebhook({
            rawBody: '',
            headers: h.headers('', h.secret, 'none'),
            secret: h.secret,
          }).ok
        ).toBe(false);
      });
    });

    describe('parseWebhook', () => {
      it('turns a customer message into a normalised event', () => {
        const events = h
          .create()
          .parseWebhook(
            h.body({ messages: [{ id: 'm1', from: CUSTOMER, text: 'hello', at: AT }] })
          );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'message',
          providerMessageId: 'm1',
          from: CUSTOMER,
          text: 'hello',
          kind: 'TEXT',
        });
        expect((events[0] as { occurredAt: Date }).occurredAt.getTime()).toBe(AT * 1000);
      });

      it('turns delivery updates into status events', () => {
        const events = h.create().parseWebhook(
          h.body({
            statuses: [
              { id: 'o1', to: CUSTOMER, status: 'DELIVERED', at: AT },
              { id: 'o1', to: CUSTOMER, status: 'READ', at: AT + 5 },
            ],
          })
        );
        expect(events.map((e) => e.type === 'status' && e.status)).toEqual(['DELIVERED', 'READ']);
        expect(events[0]).toMatchObject({ providerMessageId: 'o1', recipient: CUSTOMER });
      });

      it('reads a non-text 1:1 message as UNSUPPORTED with no text', () => {
        const [event] = h
          .create()
          .parseWebhook(h.body({ mediaMessage: { id: 'img1', from: CUSTOMER, at: AT } }));
        expect(event).toMatchObject({
          type: 'message',
          kind: 'UNSUPPORTED',
          text: null,
          from: CUSTOMER,
        });
      });

      it('carries the error code of a failed status', () => {
        const [event] = h.create().parseWebhook(
          h.body({
            statuses: [{ id: 'o2', to: CUSTOMER, status: 'FAILED', at: AT, error: 'E-131026' }],
          })
        );
        expect(event).toMatchObject({ type: 'status', status: 'FAILED', errorCode: 'E-131026' });
      });

      it('keeps payload order across many events in one delivery', () => {
        const events = h.create().parseWebhook(
          h.body({
            messages: [
              { id: 'a', from: CUSTOMER, text: '1', at: AT },
              { id: 'b', from: CUSTOMER, text: '2', at: AT + 1 },
            ],
            statuses: [{ id: 'o3', to: CUSTOMER, status: 'SENT', at: AT + 2 }],
          })
        );
        expect(
          events.map((e) => (e.type === 'unresolved' ? e.providerChatId : e.providerMessageId))
        ).toEqual(['a', 'b', 'o3']);
      });

      it('ignores messages we sent ourselves', () => {
        if (h.optOut?.includes('ownEcho')) return;
        const events = h
          .create()
          .parseWebhook(h.body({ ownEcho: { id: 'e1', text: 'from my phone', at: AT } }));
        expect(events).toEqual([]);
      });

      it('surfaces a 1:1 sender without a number as unresolved', () => {
        if (h.optOut?.includes('unresolvedSender')) return;
        const events = h
          .create()
          .parseWebhook(
            h.body({ unresolvedSender: { id: 'u1', chatId: '1234567890@lid', at: AT } })
          );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'unresolved',
          providerMessageId: 'u1',
          providerChatId: '1234567890@lid',
        });
      });

      it('ignores group chats: 1:1 only', () => {
        const events = h
          .create()
          .parseWebhook(h.body({ groupMessage: { id: 'g1', text: 'hi all', at: AT } }));
        expect(events).toEqual([]);
      });

      it('keeps the 1:1 message when a group message rides in the same delivery', () => {
        const events = h.create().parseWebhook(
          h.body({
            messages: [{ id: 'm2', from: CUSTOMER, text: 'direct', at: AT }],
            groupMessage: { id: 'g2', text: 'group', at: AT },
          })
        );
        expect(events.map((e) => e.providerMessageId)).toEqual(['m2']);
      });

      it.each([['{"unexpected":true}'], ['[]'], ['null'], ['"text"'], ['not json'], ['']])(
        'gives [] for an unknown shape: %j',
        (raw) => {
          expect(() => h.create().parseWebhook(raw)).not.toThrow();
          expect(h.create().parseWebhook(raw)).toEqual([]);
        }
      );

      it('yields the same provider ids for a replayed delivery, so ingest can dedupe', () => {
        const raw = h.body({ messages: [{ id: 'm3', from: CUSTOMER, text: 'again', at: AT }] });
        const t = h.create();
        const first = t.parseWebhook(raw).map((e) => e.providerMessageId);
        const second = t.parseWebhook(raw).map((e) => e.providerMessageId);
        expect(first).toEqual(['m3']);
        expect(second).toEqual(first);
      });

      it('verifies a replay the same way: the transport is stateless', () => {
        const raw = h.body({ messages: [{ id: 'm4', from: CUSTOMER, text: 'x', at: AT }] });
        const t = h.create();
        const input = {
          rawBody: raw,
          headers: h.headers(raw, h.secret, 'valid'),
          secret: h.secret,
        };
        expect(t.verifyWebhook(input).ok).toBe(true);
        expect(t.verifyWebhook(input).ok).toBe(true);
      });

      it('always writes the sender as E.164', () => {
        const [event] = h
          .create()
          .parseWebhook(h.body({ messages: [{ id: 'm5', from: CUSTOMER, text: 'x', at: AT }] }));
        expect((event as { from: string }).from).toMatch(/^\+[1-9]\d{6,14}$/);
        expect((event as { from: string }).from).toBe(`+${CUSTOMER_DIGITS}`);
      });
    });

    describe('send', () => {
      it('sends text and returns the provider message id', async () => {
        const result = await h.create().send(h.connection, { to: CUSTOMER, body: 'on my way' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.providerMessageId.length).toBeGreaterThan(0);
      });

      it.each([['07700 900123'], ['447700900123'], [''], ['+0123']])(
        'rejects recipient %j before any provider call',
        async (to) => {
          const result = await h.create().send(h.connection, { to, body: 'hi' });
          expect(result).toEqual({ ok: false, code: 'INVALID_RECIPIENT', retryable: false });
        }
      );

      it('rejects an empty or oversized body', async () => {
        const t = h.create();
        const empty = await t.send(h.connection, { to: CUSTOMER, body: '  ' });
        const long = await t.send(h.connection, {
          to: CUSTOMER,
          body: 'x'.repeat(WHATSAPP_MAX_TEXT_LENGTH + 1),
        });
        expect(empty).toEqual({ ok: false, code: 'INVALID_MESSAGE', retryable: false });
        expect(long).toEqual({ ok: false, code: 'INVALID_MESSAGE', retryable: false });
      });

      it('fails closed without a credential or account id', async () => {
        const t = h.create();
        const noToken = await t.send(
          { ...h.connection, credential: '' },
          { to: CUSTOMER, body: 'hi' }
        );
        const noAccount = await t.send(
          { ...h.connection, accountId: '' },
          { to: CUSTOMER, body: 'hi' }
        );
        expect(noToken).toEqual({ ok: false, code: 'AUTH_FAILED', retryable: false });
        expect(noAccount).toEqual({ ok: false, code: 'AUTH_FAILED', retryable: false });
      });

      it('never puts the credential in a result, including a failed one', async () => {
        const t = h.create();
        h.failNextSend(t, 'PROVIDER_ERROR');
        const failed = await t.send(h.connection, { to: CUSTOMER, body: 'hi' });
        const ok = await t.send(h.connection, { to: CUSTOMER, body: 'hi' });
        const status = await t.status(h.connection);
        for (const result of [failed, ok, status]) {
          expect(JSON.stringify(result)).not.toContain(h.connection.credential);
        }
      });

      it('returns a coded result instead of throwing on missing arguments', async () => {
        const t = h.create();
        const noMessage = await t.send(h.connection, undefined as never);
        const noConnection = await t.send(undefined as never, { to: CUSTOMER, body: 'hi' });
        expect(noMessage.ok).toBe(false);
        expect(noConnection.ok).toBe(false);
      });

      it.each([
        ['AUTH_FAILED', false],
        ['RATE_LIMITED', true],
        ['PROVIDER_ERROR', true],
      ] as const)('returns a coded %s result instead of throwing', async (code, retryable) => {
        const t = h.create();
        h.failNextSend(t, code);
        const result = await t.send(h.connection, { to: CUSTOMER, body: 'hi' });
        expect(result).toEqual({ ok: false, code, retryable });
      });
    });

    describe('status', () => {
      it('reports a known connection state without throwing', async () => {
        const status = await h.create().status(h.connection);
        expect(['CONNECTED', 'NEEDS_ATTENTION', 'DISCONNECTED']).toContain(status.state);
      });
    });

    describe('handshake', () => {
      it('exists exactly when the harness says the transport has one', () => {
        expect(typeof h.create().verifyHandshake === 'function').toBe(h.expectsHandshake);
      });

      it('echoes the challenge only for the right verify token', () => {
        const t = h.create();
        if (!h.expectsHandshake || !t.verifyHandshake) return;
        const query = {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'verify-token-value',
          'hub.challenge': 'challenge-123',
        };
        expect(t.verifyHandshake(query, 'verify-token-value')).toEqual({
          ok: true,
          challenge: 'challenge-123',
        });
        // Query parsers can hand over arrays or objects: refuse, never throw.
        expect(
          t.verifyHandshake(
            { ...query, 'hub.verify_token': ['verify-token-value'] as never },
            'verify-token-value'
          )
        ).toEqual({ ok: false });
        expect(
          t.verifyHandshake({ ...query, 'hub.challenge': { a: 1 } as never }, 'verify-token-value')
        ).toEqual({ ok: false });
        // Same length as the real token, and a prefix of it: neither may pass.
        expect(t.verifyHandshake(query, 'verify-token-valuf')).toEqual({ ok: false });
        expect(
          t.verifyHandshake({ ...query, 'hub.verify_token': 'verify-token' }, 'verify-token-value')
            .ok
        ).toBe(false);
        expect(
          t.verifyHandshake(
            { ...query, 'hub.challenge': '<script>x</script>' },
            'verify-token-value'
          ).ok
        ).toBe(false);
        expect(t.verifyHandshake(query, '')).toEqual({ ok: false });
        expect(t.verifyHandshake({ ...query, 'hub.mode': 'other' }, 'verify-token-value').ok).toBe(
          false
        );
        expect(t.verifyHandshake({}, 'verify-token-value').ok).toBe(false);
      });
    });
  });
}
