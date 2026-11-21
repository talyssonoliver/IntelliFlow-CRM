import {
  buildFakeDelivery,
  FAKE_SIGNATURE_HEADER,
  InMemoryWhatsAppTransport,
  signFakeBody,
  type FakeWireEvent,
} from '../fake-transport';
import {
  runTransportContract,
  type ContractDelivery,
  type SignatureMode,
} from './transport-contract';

const SECRET = 'contract-secret-'.padEnd(32, 'x');

function wireEvents(d: ContractDelivery): FakeWireEvent[] {
  return [
    ...(d.messages ?? []).map(
      (m): FakeWireEvent => ({
        kind: 'message',
        id: m.id,
        from: m.from.slice(1),
        text: m.text,
        ts: m.at,
      })
    ),
    ...(d.statuses ?? []).map(
      (s): FakeWireEvent => ({
        kind: 'status',
        id: s.id,
        to: s.to.slice(1),
        status: s.status,
        ts: s.at,
        error: s.error,
      })
    ),
    ...(d.mediaMessage
      ? [
          {
            kind: 'message',
            id: d.mediaMessage.id,
            from: d.mediaMessage.from.slice(1),
            ts: d.mediaMessage.at,
          } as FakeWireEvent,
        ]
      : []),
    ...(d.groupMessage
      ? [
          {
            kind: 'message',
            id: d.groupMessage.id,
            from: '120363000000000000@g.us',
            text: d.groupMessage.text,
            ts: d.groupMessage.at,
          } as FakeWireEvent,
        ]
      : []),
  ];
}

function headersFor(rawBody: string, secret: string, mode: SignatureMode): Headers {
  const valid = signFakeBody(rawBody, secret);
  switch (mode) {
    case 'valid':
      return new Headers({ [FAKE_SIGNATURE_HEADER]: valid });
    case 'none':
      return new Headers();
    case 'wrong':
      // Same length, last hex digit flipped.
      return new Headers({
        [FAKE_SIGNATURE_HEADER]: valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0'),
      });
    case 'wrong-length':
      return new Headers({ [FAKE_SIGNATURE_HEADER]: `sha256=${'ab'.repeat(31)}` });
    case 'malformed':
      return new Headers({ [FAKE_SIGNATURE_HEADER]: 'not-a-signature' });
  }
}

runTransportContract({
  name: 'in-memory fake',
  create: () => new InMemoryWhatsAppTransport(),
  secret: SECRET,
  connection: {
    tenantId: 'tenant-a',
    connectionId: 'conn-a',
    accountId: 'account-a',
    credential: 'credential-placeholder',
  },
  body: (d) => buildFakeDelivery(SECRET, wireEvents(d)).rawBody,
  headers: headersFor,
  expectsHandshake: true,
  failNextSend: (t, kind) => (t as InMemoryWhatsAppTransport).failNextSend(kind),
});
