import { describe, expect, it } from 'vitest';
import {
  buildFakeDelivery,
  InMemoryWhatsAppTransport,
  type FakeWireEvent,
} from '../fake-transport';

const SECRET = 'fake-test-secret-'.padEnd(32, 'y');
const NUMBER = '44' + '7700900123';
const CONNECTION = {
  tenantId: 'tenant-a',
  connectionId: 'conn-a',
  accountId: 'account-a',
  credential: 'credential-placeholder',
};

function parse(events: unknown[]) {
  return new InMemoryWhatsAppTransport().parseWebhook(JSON.stringify({ events }));
}

describe('InMemoryWhatsAppTransport', () => {
  it('records what it sends and numbers the provider ids', async () => {
    const t = new InMemoryWhatsAppTransport();
    const a = await t.send(CONNECTION, { to: `+${NUMBER}`, body: 'one' });
    const b = await t.send(CONNECTION, { to: `+${NUMBER}`, body: 'two' });
    expect(a).toEqual({ ok: true, providerMessageId: 'fake-out-1' });
    expect(b).toEqual({ ok: true, providerMessageId: 'fake-out-2' });
    expect(t.sent.map((s) => s.message.body)).toEqual(['one', 'two']);
    expect(t.sent[0]?.connection).toBe(CONNECTION);
  });

  it('does not record a send that failed validation or was forced to fail', async () => {
    const t = new InMemoryWhatsAppTransport();
    await t.send(CONNECTION, { to: 'bad', body: 'x' });
    t.failNextSend('TIMEOUT');
    expect(await t.send(CONNECTION, { to: `+${NUMBER}`, body: 'x' })).toEqual({
      ok: false,
      code: 'TIMEOUT',
      retryable: false,
    });
    // The forced failure is one-shot.
    expect((await t.send(CONNECTION, { to: `+${NUMBER}`, body: 'y' })).ok).toBe(true);
    expect(t.sent).toHaveLength(1);
  });

  it('reports the status a test sets', async () => {
    const t = new InMemoryWhatsAppTransport();
    expect(await t.status()).toEqual({ state: 'CONNECTED' });
    t.setStatus({ state: 'NEEDS_ATTENTION', qrCode: 'qr-data' });
    expect(await t.status()).toEqual({ state: 'NEEDS_ATTENTION', qrCode: 'qr-data' });
  });

  it('verifies a delivery built by buildFakeDelivery and names the failure reason', () => {
    const t = new InMemoryWhatsAppTransport();
    const events: FakeWireEvent[] = [
      { kind: 'message', id: 'm1', from: NUMBER, text: 'hi', ts: 1 },
    ];
    const { rawBody, headers } = buildFakeDelivery(SECRET, events);
    expect(t.verifyWebhook({ rawBody, headers, secret: SECRET })).toEqual({ ok: true });
    expect(t.verifyWebhook({ rawBody, headers, secret: '' })).toEqual({
      ok: false,
      reason: 'MISSING_SECRET',
    });
    expect(t.verifyWebhook({ rawBody, headers: new Headers(), secret: SECRET })).toEqual({
      ok: false,
      reason: 'MISSING_SIGNATURE',
    });
    expect(
      t.verifyWebhook({
        rawBody,
        headers: new Headers({ 'x-fake-signature': 'zz' }),
        secret: SECRET,
      })
    ).toEqual({ ok: false, reason: 'MALFORMED_SIGNATURE' });
    expect(t.verifyWebhook({ rawBody: `${rawBody}x`, headers, secret: SECRET })).toEqual({
      ok: false,
      reason: 'SIGNATURE_MISMATCH',
    });
  });

  describe('parseWebhook edge cases', () => {
    it('reads media-like messages as UNSUPPORTED with no text', () => {
      const [event] = parse([{ kind: 'message', id: 'm', from: NUMBER, ts: 5, name: 'Sam' }]);
      expect(event).toMatchObject({ kind: 'UNSUPPORTED', text: null, profileName: 'Sam' });
    });

    it('accepts chat-id senders and status error codes', () => {
      const events = parse([
        { kind: 'message', id: 'a', from: `${NUMBER}@c.us`, text: 't', ts: 5 },
        { kind: 'status', id: 'b', status: 'failed', ts: 6, error: 'E1' },
      ]);
      expect(events[0]).toMatchObject({ from: `+${NUMBER}` });
      expect(events[1]).toMatchObject({ status: 'FAILED', errorCode: 'E1', recipient: null });
    });

    it('surfaces a linked-id sender as unresolved and drops our own echoes', () => {
      const events = parse([
        { kind: 'message', id: 'l1', from: '123456789012345@lid', text: 't', ts: 5 },
        { kind: 'message', id: 'e1', from: NUMBER, text: 'mine', ts: 5, fromMe: true },
      ]);
      expect(events).toEqual([
        {
          type: 'unresolved',
          providerMessageId: 'l1',
          accountId: null,
          providerChatId: '123456789012345@lid',
          occurredAt: new Date(5000),
        },
      ]);
    });

    it('takes a digit-string timestamp but not null, empty or negative ones', () => {
      expect(parse([{ kind: 'message', id: 'a', from: NUMBER, text: 't', ts: '7' }])).toHaveLength(
        1
      );
      for (const ts of [null, '', [], -1, true, 'x']) {
        expect(parse([{ kind: 'message', id: 'a', from: NUMBER, text: 't', ts }])).toEqual([]);
      }
    });

    it('stops at 1000 events per delivery', () => {
      const many = Array.from({ length: 1005 }, (_, i) => ({
        kind: 'message',
        id: `m${i}`,
        from: NUMBER,
        text: 't',
        ts: 5,
      }));
      expect(parse(many)).toHaveLength(1000);
    });

    it('lets the test pick the kind', () => {
      expect(new InMemoryWhatsAppTransport('WAHA').kind).toBe('WAHA');
    });

    it.each([
      [{ kind: 'message', id: '', from: NUMBER, text: 't', ts: 5 }],
      [{ kind: 'message', from: NUMBER, text: 't', ts: 5 }],
      [{ kind: 'message', id: 'a', from: 12345, text: 't', ts: 5 }],
      [{ kind: 'message', id: 'a', from: 'status@broadcast', text: 't', ts: 5 }],
      [{ kind: 'message', id: 'a', from: NUMBER, text: 't', ts: 'soon' }],
      [{ kind: 'status', id: 'a', status: 'teleported', ts: 5 }],
      [{ kind: 'status', id: 'a', status: 'queued', ts: 5 }],
      [{ kind: 'reaction', id: 'a', ts: 5 }],
      [null],
    ])('drops a malformed event %j', (event) => {
      expect(parse([event])).toEqual([]);
    });
  });

  describe('verifyHandshake', () => {
    const ok = { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok-1', 'hub.challenge': 'c-9' };
    it('requires mode, challenge and a matching token', () => {
      const t = new InMemoryWhatsAppTransport();
      expect(t.verifyHandshake(ok, 'tok-1')).toEqual({ ok: true, challenge: 'c-9' });
      expect(t.verifyHandshake({ ...ok, 'hub.challenge': undefined }, 'tok-1').ok).toBe(false);
      expect(t.verifyHandshake({ ...ok, 'hub.verify_token': undefined }, 'tok-1').ok).toBe(false);
      expect(t.verifyHandshake(ok, 'tok-2').ok).toBe(false);
      expect(t.verifyHandshake({ ...ok, 'hub.mode': 'other' }, 'tok-1').ok).toBe(false);
    });
  });
});
