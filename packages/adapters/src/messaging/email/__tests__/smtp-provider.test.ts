import { describe, expect, it, vi } from 'vitest';

const nodemailerMock = vi.hoisted(() => ({
  createTransport: vi.fn(() => ({
    sendMail: async () => ({ messageId: '<m@x>' }),
    verify: async () => true,
    close: () => undefined,
  })),
}));
vi.mock('nodemailer', () => ({ default: nodemailerMock, ...nodemailerMock }));

import type { LookupFn } from '../public-host';
import { SmtpMailboxTransport, mapSmtpError, type SmtpConnectionConfig } from '../smtp-provider';

const secret = 'x'.repeat(20);
const config = (patch: Partial<SmtpConnectionConfig> = {}): SmtpConnectionConfig => ({
  host: 'smtp.mail.example.com',
  port: 587,
  security: 'STARTTLS',
  username: 'me@mail.example.com',
  password: secret,
  ...patch,
});
const publicLookup: LookupFn = vi.fn(async () => [{ address: '8.8.4.4', family: 4 }]);

function fakeTransport(overrides: Record<string, unknown> = {}) {
  return {
    sendMail: vi.fn(async () => ({ messageId: '<server-id@mail.example.com>' })),
    verify: vi.fn(async () => true),
    close: vi.fn(),
    ...overrides,
  };
}

describe('SmtpMailboxTransport', () => {
  it('connects to the pinned public address with SNI and STARTTLS required', async () => {
    const transport = fakeTransport();
    const createTransport = vi.fn(() => transport);
    const smtp = new SmtpMailboxTransport({ createTransport, lookup: publicLookup });
    await smtp.send(
      config(),
      { from: 'me@mail.example.com', to: ['a@example.invalid'] },
      Buffer.from('raw')
    );

    expect(createTransport).toHaveBeenCalledTimes(1);
    const options = createTransport.mock.calls[0]?.[0] as Record<string, any>;
    expect(options).toMatchObject({
      host: '8.8.4.4',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'me@mail.example.com', pass: secret },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(options.tls).toMatchObject({
      servername: 'smtp.mail.example.com',
      minVersion: 'TLSv1.2',
    });
    expect(options.tls.rejectUnauthorized).not.toBe(false);
    expect(transport.sendMail).toHaveBeenCalledWith({
      envelope: { from: 'me@mail.example.com', to: ['a@example.invalid'] },
      raw: Buffer.from('raw'),
    });
    expect(transport.close).toHaveBeenCalled();
  });

  it('tells a temporary (4xx) refusal apart from a permanent one', async () => {
    const transport = fakeTransport({
      sendMail: vi.fn(async () => ({
        messageId: '<m@x>',
        rejected: ['b@example.invalid', 'c@example.invalid'],
        rejectedErrors: [
          Object.assign(new Error('busy'), { recipient: 'B@example.invalid', responseCode: 451 }),
          Object.assign(new Error('unknown'), {
            recipient: 'c@example.invalid',
            responseCode: 550,
          }),
        ],
      })),
    });
    const smtp = new SmtpMailboxTransport({
      createTransport: vi.fn(() => transport),
      lookup: publicLookup,
    });
    const result = await smtp.send(
      config(),
      { from: 'me@mail.example.com', to: ['b@example.invalid', 'c@example.invalid'] },
      Buffer.from('raw')
    );
    expect(result).toEqual({
      providerMessageId: '<m@x>',
      rejected: ['b@example.invalid', 'c@example.invalid'],
      rejectedTemporarily: ['b@example.invalid'],
    });
  });

  it('reports recipients the server refused while accepting the rest', async () => {
    const transport = fakeTransport({
      sendMail: vi.fn(async () => ({
        messageId: '<m@x>',
        rejected: ['B@example.invalid', { name: 'C', address: 'C@example.invalid' }],
      })),
    });
    const smtp = new SmtpMailboxTransport({
      createTransport: vi.fn(() => transport),
      lookup: publicLookup,
    });
    const result = await smtp.send(
      config(),
      {
        from: 'me@mail.example.com',
        to: ['a@example.invalid', 'b@example.invalid', 'c@example.invalid'],
      },
      Buffer.from('raw')
    );
    expect(result).toEqual({
      providerMessageId: '<m@x>',
      rejected: ['b@example.invalid', 'c@example.invalid'],
    });
  });

  it.each([
    [465, 'SSL', { secure: true }],
    [587, 'STARTTLS', { secure: false, requireTLS: true }],
    [2525, 'SSL', { secure: true }],
    [2525, 'STARTTLS', { secure: false, requireTLS: true }],
  ] as const)('keys TLS on the security mode (port %i, %s)', async (port, security, expected) => {
    const createTransport = vi.fn(() => fakeTransport());
    await new SmtpMailboxTransport({ createTransport, lookup: publicLookup }).verify(
      config({ port, security })
    );
    expect(createTransport.mock.calls[0]?.[0]).toMatchObject(expected);
  });

  it('refuses port 25 and a host resolving to a private address before connecting', async () => {
    const createTransport = vi.fn(() => fakeTransport());
    const smtp = new SmtpMailboxTransport({ createTransport, lookup: publicLookup });
    await expect(smtp.verify(config({ port: 25 }))).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
    const privateLookup: LookupFn = vi.fn(async () => [{ address: '10.1.2.3', family: 4 }]);
    await expect(
      new SmtpMailboxTransport({ createTransport, lookup: privateLookup }).verify(config())
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('returns the provider message id from a send', async () => {
    const smtp = new SmtpMailboxTransport({
      createTransport: () => fakeTransport(),
      lookup: publicLookup,
    });
    await expect(
      smtp.send(
        config(),
        { from: 'me@mail.example.com', to: ['a@example.invalid'] },
        Buffer.from('x')
      )
    ).resolves.toEqual({ providerMessageId: '<server-id@mail.example.com>', rejected: [] });
  });

  it('maps a failure to a code and never carries the password, user or server text', async () => {
    const leaky = Object.assign(
      new Error(`535 5.7.8 Invalid login for me@mail.example.com with ${secret}`),
      { code: 'EAUTH', response: `535 5.7.8 ${secret}`, responseCode: 535 }
    );
    const transport = fakeTransport({ sendMail: vi.fn(async () => Promise.reject(leaky)) });
    const smtp = new SmtpMailboxTransport({
      createTransport: () => transport,
      lookup: publicLookup,
    });
    const error = await smtp
      .send(config(), { from: 'me@mail.example.com', to: ['a@example.invalid'] }, Buffer.from('x'))
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'AUTH_FAILED' });
    const serialised = JSON.stringify(error, Object.getOwnPropertyNames(error as object));
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain('me@mail.example.com');
    expect(transport.close).toHaveBeenCalled();
  });

  it('uses nodemailer.createTransport by default (factory wiring, no network)', async () => {
    const smtp = new SmtpMailboxTransport({ lookup: publicLookup });
    await smtp.verify(config());
    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerMock.createTransport.mock.calls[0]?.[0]).toMatchObject({ host: '8.8.4.4' });
  });
});

describe('mapSmtpError', () => {
  it.each([
    [{ code: 'EAUTH' }, 'AUTH_FAILED'],
    [{ code: 'ECONNECTION' }, 'CONNECT_FAILED'],
    [{ code: 'ESOCKET' }, 'CONNECT_FAILED'],
    [{ code: 'EDNS' }, 'CONNECT_FAILED'],
    [{ code: 'ETIMEDOUT' }, 'TIMEOUT'],
    [{ code: 'ETLS' }, 'TLS_FAILED'],
    [{ code: 'ESOCKET', message: 'unable to verify the first certificate' }, 'TLS_FAILED'],
    [{ responseCode: 421 }, 'RATE_LIMITED'],
    [{ responseCode: 452 }, 'RATE_LIMITED'],
    [{ code: 'EENVELOPE', responseCode: 550 }, 'REJECTED'],
    [{ code: 'EMESSAGE' }, 'REJECTED'],
    [new Error('anything else'), 'REJECTED'],
    [undefined, 'REJECTED'],
  ])('maps %j to %s', (input, code) => {
    expect(mapSmtpError(input).code).toBe(code);
  });
});
