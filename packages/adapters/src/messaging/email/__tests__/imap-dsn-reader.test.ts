import { describe, expect, it, vi } from 'vitest';

const imapMock = vi.hoisted(() => ({ ImapFlow: vi.fn() }));
vi.mock('imapflow', () => ({ ImapFlow: imapMock.ImapFlow }));

import type { LookupFn } from '../public-host';
import {
  ImapBounceReader,
  type ImapClientLike,
  type ImapConnectionConfig,
} from '../imap-dsn-reader';

const secret = 'x'.repeat(18);
const config: ImapConnectionConfig = {
  host: 'imap.mail.example.com',
  port: 993,
  username: 'me@mail.example.com',
  password: secret,
};
const lookup: LookupFn = vi.fn(async () => [{ address: '8.8.4.4', family: 4 }]);
const SINCE = new Date(Date.UTC(2026, 9, 19));

interface FakeMessage {
  uid: number;
  size: number;
  source: string;
  internalDate: Date;
}

function fakeClient(opts: {
  uidValidity?: bigint;
  uidNext?: number;
  searchResult?: number[] | false;
  messages?: FakeMessage[];
  connectError?: unknown;
}) {
  const release = vi.fn();
  const client = {
    connect: vi.fn(async () => {
      if (opts.connectError) throw opts.connectError;
    }),
    getMailboxLock: vi.fn(async () => ({ release })),
    mailbox: { uidValidity: opts.uidValidity ?? 7n, uidNext: opts.uidNext ?? 100 },
    search: vi.fn(async () => opts.searchResult ?? []),
    // Like IMAP: only the requested items come back (no source unless asked for).
    fetch: vi.fn(async function* (range: string, query: { source?: boolean }) {
      const wanted = new Set(range.split(',').map(Number));
      for (const m of opts.messages ?? []) {
        if (wanted.has(m.uid))
          yield {
            uid: m.uid,
            size: m.size,
            ...(query.source
              ? { source: Buffer.from(m.source), internalDate: m.internalDate }
              : {}),
          };
      }
    }),
    logout: vi.fn(async () => undefined),
  };
  return { client: client as unknown as ImapClientLike & typeof client, release };
}

const msg = (uid: number, size = 100): FakeMessage => ({
  uid,
  size,
  source: `RAW-${uid}`,
  internalDate: new Date(Date.UTC(2026, 9, 19, uid % 24)),
});

describe('ImapBounceReader', () => {
  it('connects to the pinned address over implicit TLS with SNI, read-only, and logs out', async () => {
    const { client, release } = fakeClient({ searchResult: [], uidNext: 50 });
    const createClient = vi.fn(() => client);
    const reader = new ImapBounceReader({ createClient, lookup });
    await reader.read(
      config,
      { uidValidity: null, lastUid: null, since: SINCE },
      { limit: 50, maxBytes: 1024 }
    );

    expect(createClient).toHaveBeenCalledWith({
      host: '8.8.4.4',
      port: 993,
      secure: true,
      auth: { user: 'me@mail.example.com', pass: secret },
      tls: { servername: 'imap.mail.example.com', minVersion: 'TLSv1.2' },
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    expect(client.getMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: true });
    expect(release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it('first scan: searches report-type mail since the date and stores the cursor at uidNext-1 when none match', async () => {
    const { client } = fakeClient({ searchResult: [], uidNext: 50, uidValidity: 9n });
    const result = await new ImapBounceReader({ createClient: () => client, lookup }).read(
      config,
      { uidValidity: null, lastUid: null, since: SINCE },
      { limit: 50, maxBytes: 1024 }
    );
    expect(client.search).toHaveBeenCalledWith(
      { since: SINCE, header: { 'content-type': 'multipart/report' } },
      { uid: true }
    );
    expect(result).toEqual({ messages: [], cursor: { uidValidity: 9n, lastUid: 49 } });
  });

  it('resumes from a stored BigInt UID (the column type) without mixing BigInt and number', async () => {
    const { client } = fakeClient({ searchResult: [10], messages: [msg(10)], uidValidity: 7n });
    const result = await new ImapBounceReader({ createClient: () => client, lookup }).read(
      config,
      { uidValidity: 7n, lastUid: 9n as unknown as number, since: SINCE },
      { limit: 50, maxBytes: 1024 }
    );
    expect(client.search).toHaveBeenCalledWith(
      { uid: '10:*', header: { 'content-type': 'multipart/report' } },
      { uid: true }
    );
    expect(result.cursor).toEqual({ uidValidity: 7n, lastUid: 10 });
  });

  it('next scan: resumes after the last UID, fetches matches oldest first and skips oversize ones', async () => {
    const { client } = fakeClient({
      searchResult: [12, 11, 10, 9],
      messages: [msg(11), msg(12, 5000), msg(10)],
      uidValidity: 7n,
    });
    const result = await new ImapBounceReader({ createClient: () => client, lookup }).read(
      config,
      { uidValidity: 7n, lastUid: 9, since: SINCE },
      { limit: 50, maxBytes: 1024 }
    );
    expect(client.search).toHaveBeenCalledWith(
      { uid: '10:*', header: { 'content-type': 'multipart/report' } },
      { uid: true }
    );
    expect(result.messages.map((m) => m.key)).toEqual(['7:10', '7:11']);
    expect(result.messages[0]?.raw).toBe('RAW-10');
    expect(result.cursor).toEqual({ uidValidity: 7n, lastUid: 12 });
    // Sizes first; the oversize message's body is never downloaded.
    expect(client.fetch).toHaveBeenNthCalledWith(
      1,
      '10,11,12',
      { uid: true, size: true },
      { uid: true }
    );
    expect(client.fetch).toHaveBeenNthCalledWith(
      2,
      '10,11',
      { uid: true, size: true, source: true, internalDate: true },
      { uid: true }
    );
  });

  it('caps a scan at the limit and resumes from the last taken UID', async () => {
    const { client } = fakeClient({
      searchResult: [21, 22, 23],
      messages: [msg(21), msg(22), msg(23)],
    });
    const result = await new ImapBounceReader({ createClient: () => client, lookup }).read(
      config,
      { uidValidity: 7n, lastUid: 20, since: SINCE },
      { limit: 2, maxBytes: 1024 }
    );
    expect(result.messages.map((m) => m.key)).toEqual(['7:21', '7:22']);
    expect(result.cursor.lastUid).toBe(22);
  });

  it('restarts from the date when UIDVALIDITY changed', async () => {
    const { client } = fakeClient({ searchResult: [3], messages: [msg(3)], uidValidity: 8n });
    const result = await new ImapBounceReader({ createClient: () => client, lookup }).read(
      config,
      { uidValidity: 7n, lastUid: 500, since: SINCE },
      { limit: 50, maxBytes: 1024 }
    );
    expect(client.search).toHaveBeenCalledWith(
      { since: SINCE, header: { 'content-type': 'multipart/report' } },
      { uid: true }
    );
    expect(result.cursor).toEqual({ uidValidity: 8n, lastUid: 3 });
  });

  it('maps an authentication failure to AUTH_FAILED without the password', async () => {
    const { client } = fakeClient({
      connectError: Object.assign(new Error(`Invalid credentials ${secret}`), {
        authenticationFailed: true,
      }),
    });
    const error = await new ImapBounceReader({ createClient: () => client, lookup })
      .read(
        config,
        { uidValidity: null, lastUid: null, since: SINCE },
        { limit: 5, maxBytes: 1024 }
      )
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'AUTH_FAILED' });
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error as object))).not.toContain(
      secret
    );
  });

  it('maps other failures to CONNECT_FAILED and TIMEOUT', async () => {
    const timeout = fakeClient({
      connectError: Object.assign(new Error('x'), { code: 'ETIMEOUT' }),
    });
    await expect(
      new ImapBounceReader({ createClient: () => timeout.client, lookup }).read(
        config,
        { uidValidity: null, lastUid: null, since: SINCE },
        { limit: 5, maxBytes: 1024 }
      )
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    const other = fakeClient({ connectError: new Error('boom') });
    await expect(
      new ImapBounceReader({ createClient: () => other.client, lookup }).read(
        config,
        { uidValidity: null, lastUid: null, since: SINCE },
        { limit: 5, maxBytes: 1024 }
      )
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
  });

  it('refuses a private host and a non-993 port before connecting', async () => {
    const createClient = vi.fn();
    const privateLookup: LookupFn = vi.fn(async () => [{ address: '192.168.1.5', family: 4 }]);
    await expect(
      new ImapBounceReader({ createClient, lookup: privateLookup }).read(
        config,
        { uidValidity: null, lastUid: null, since: SINCE },
        { limit: 5, maxBytes: 1024 }
      )
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    await expect(
      new ImapBounceReader({ createClient, lookup }).read(
        { ...config, port: 143 },
        { uidValidity: null, lastUid: null, since: SINCE },
        { limit: 5, maxBytes: 1024 }
      )
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('builds an ImapFlow client by default (factory wiring, no network)', async () => {
    const { client } = fakeClient({ searchResult: false });
    imapMock.ImapFlow.mockImplementation(function () {
      return client;
    });
    const result = await new ImapBounceReader({ lookup }).read(
      config,
      { uidValidity: null, lastUid: null, since: SINCE },
      { limit: 5, maxBytes: 1024 }
    );
    expect(imapMock.ImapFlow).toHaveBeenCalledTimes(1);
    expect(result.messages).toEqual([]);
  });

  it('verifies a connection without reading mail (test connection)', async () => {
    const { client, release } = fakeClient({});
    await new ImapBounceReader({ createClient: () => client, lookup }).verify(config);
    expect(client.connect).toHaveBeenCalled();
    expect(client.search).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });
});
