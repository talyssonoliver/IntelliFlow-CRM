import { describe, it, expect, vi } from 'vitest';
import {
  initialDeltaUrl,
  isGraphUrl,
  readGraphMailDelta,
  toSyncedMessage,
  type GraphDeltaOptions,
} from '../graph-mail-delta';
import { MailboxTransportError } from '../mailbox-errors';

const NOW = new Date('2026-11-15T10:00:00.000Z');
// Not a real credential: built at runtime so nothing token-shaped sits in the source.
const ACCESS = ['access', 'for', 'tests'].join('-');
const GRAPH = 'https://graph.microsoft.com/v1.0/me';

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function options(fetchImpl: typeof fetch, overrides: Partial<GraphDeltaOptions> = {}) {
  return {
    folder: 'inbox' as const,
    maxPages: 5,
    pageSize: 50,
    initialDays: 30,
    maxBodyChars: 1_000,
    now: NOW,
    fetchImpl,
    ...overrides,
  };
}

const message = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  internetMessageId: `<${id}@mail.example.invalid>`,
  conversationId: 'conv-1',
  subject: 'Pricing question',
  from: { emailAddress: { address: 'Ada@Example.invalid', name: 'Ada' } },
  toRecipients: [{ emailAddress: { address: 'me@example.invalid' } }],
  ccRecipients: [],
  receivedDateTime: '2026-11-14T09:00:00Z',
  isRead: false,
  body: { content: 'Hello there' },
  ...extra,
});

describe('graph mail delta reader (#1177)', () => {
  it('starts from a 30-day inbox delta and returns the delta link as the cursor', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, { value: [message('m1')], '@odata.deltaLink': `${GRAPH}/delta-done` })
    );

    const round = await readGraphMailDelta(ACCESS, null, options(fetchImpl as never));

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(initialDeltaUrl('inbox', 30, NOW));
    expect(new URL(url).searchParams.get('$filter')).toBe(
      'receivedDateTime ge 2026-10-16T10:00:00.000Z'
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS}`);
    expect((init.headers as Record<string, string>).Prefer).toContain('body-content-type="text"');
    expect((init.headers as Record<string, string>).Prefer).toContain('IdType="ImmutableId"');
    expect(round).toMatchObject({ cursor: `${GRAPH}/delta-done`, complete: true, expired: false });
    expect(round.messages[0]).toMatchObject({
      providerMessageId: 'm1',
      fromAddress: 'ada@example.invalid',
      fromName: 'Ada',
      to: ['me@example.invalid'],
      bodyText: 'Hello there',
    });
  });

  it('follows next links up to the page cap and resumes from the last one', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        respond(200, { value: [message('m1')], '@odata.nextLink': `${GRAPH}/p2` })
      )
      .mockResolvedValueOnce(
        respond(200, { value: [message('m2')], '@odata.nextLink': `${GRAPH}/p3` })
      );

    const round = await readGraphMailDelta(ACCESS, null, options(fetchImpl, { maxPages: 2 }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual(['m1', 'm2']);
    expect(round).toMatchObject({ cursor: `${GRAPH}/p3`, complete: false });
  });

  it('stops when its time budget is spent and resumes at the next page', async () => {
    let clockMs = 0;
    const fetchImpl = vi.fn(async () => {
      clockMs += 1_000; // each page takes a second
      return respond(200, {
        value: [message(`m${clockMs}`)],
        '@odata.nextLink': `${GRAPH}/p${clockMs}`,
      });
    });

    const round = await readGraphMailDelta(
      ACCESS,
      null,
      options(fetchImpl as never, { maxPages: 10, budgetMs: 2_000, clock: () => clockMs })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(round).toMatchObject({ cursor: `${GRAPH}/p2000`, complete: false, expired: false });
  });

  it('always reads one page, even with no budget left', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, { value: [message('m1')], '@odata.nextLink': `${GRAPH}/p2` })
    );

    const round = await readGraphMailDelta(
      ACCESS,
      null,
      options(fetchImpl as never, { budgetMs: 0, clock: () => 0 })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(round.cursor).toBe(`${GRAPH}/p2`);
  });

  it('resumes from a stored cursor', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, { value: [], '@odata.deltaLink': `${GRAPH}/d2` })
    );

    await readGraphMailDelta(ACCESS, `${GRAPH}/d1`, options(fetchImpl as never));

    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`${GRAPH}/d1`);
  });

  it('never sends the token to a cursor off Graph and asks for a restart instead', async () => {
    const fetchImpl = vi.fn();

    const round = await readGraphMailDelta(
      ACCESS,
      'https://attacker.example.invalid/delta',
      options(fetchImpl)
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(round).toMatchObject({ expired: true, cursor: null });
  });

  it('stops at a next link off Graph, keeping the cursor at the page it read', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, { value: [message('m1')], '@odata.nextLink': 'https://evil.example.invalid/p2' })
    );

    const round = await readGraphMailDelta(ACCESS, `${GRAPH}/d1`, options(fetchImpl as never));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(round).toMatchObject({ cursor: `${GRAPH}/d1`, complete: false });
  });

  it('reports an expired delta token (410) so the caller restarts', async () => {
    const round = await readGraphMailDelta(
      ACCESS,
      `${GRAPH}/old`,
      options(vi.fn(async () => respond(410)) as never)
    );

    expect(round).toEqual({
      messages: [],
      removedIds: [],
      cursor: null,
      complete: false,
      expired: true,
    });
  });

  it('collects removed ids separately', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, {
        value: [{ id: 'gone', '@removed': { reason: 'deleted' } }, message('m1')],
        '@odata.deltaLink': `${GRAPH}/d`,
      })
    );

    const round = await readGraphMailDelta(ACCESS, null, options(fetchImpl as never));

    expect(round.removedIds).toEqual(['gone']);
    expect(round.messages.map((m) => m.providerMessageId)).toEqual(['m1']);
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [429, 'RATE_LIMITED'],
    [503, 'CONNECT_FAILED'],
    [400, 'REJECTED'],
  ])('maps HTTP %i to %s without provider text', async (status, code) => {
    const fetchImpl = vi.fn(async () => respond(status, { error: { message: 'provider detail' } }));

    const error = await readGraphMailDelta(ACCESS, null, options(fetchImpl as never)).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(MailboxTransportError);
    expect((error as MailboxTransportError).code).toBe(code);
    expect(String((error as Error).message)).not.toContain('provider detail');
  });

  it('maps a network failure to CONNECT_FAILED', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket hang up');
    });

    await expect(
      readGraphMailDelta(ACCESS, null, options(fetchImpl as never))
    ).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
  });

  it('gives up on a request that never answers, so a hung read never holds the sync', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    await expect(
      readGraphMailDelta(ACCESS, null, options(fetchImpl as never, { requestTimeoutMs: 20 }))
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('toSyncedMessage', () => {
  it('cuts the body to the limit and defaults a missing subject', () => {
    const synced = toSyncedMessage(
      message('m1', { subject: '  ', body: { content: 'x'.repeat(50) } }),
      10
    );

    expect(synced?.subject).toBe('(No subject)');
    expect(synced?.bodyText).toHaveLength(10);
  });

  it('removes NUL characters Postgres would refuse, so one message never stops a sync', () => {
    const nul = String.fromCodePoint(0);
    const synced = toSyncedMessage(
      message('m1', {
        subject: `Pri${nul}cing`,
        body: { content: `Hel${nul}lo` },
        internetMessageId: `<m1${nul}@mail.example.invalid>`,
        from: { emailAddress: { address: `Ada${nul}@Example.invalid`, name: `A${nul}da` } },
      }),
      100
    );

    expect(synced).toMatchObject({
      subject: 'Pricing',
      bodyText: 'Hello',
      internetMessageId: '<m1@mail.example.invalid>',
      fromAddress: 'ada@example.invalid',
      fromName: 'Ada',
    });
    expect(JSON.stringify(synced)).not.toContain('\\u0000');
  });

  it('drops an entry without an id or a valid receive time', () => {
    expect(toSyncedMessage(message('', {}), 10)).toBeNull();
    expect(toSyncedMessage(message('m1', { receivedDateTime: 'not a date' }), 10)).toBeNull();
  });

  it('keeps only real addresses', () => {
    const synced = toSyncedMessage(
      message('m1', {
        from: { emailAddress: { address: 'no-at-sign' } },
        ccRecipients: [{ emailAddress: { address: 'Cc@Example.invalid' } }, { emailAddress: null }],
      }),
      10
    );

    expect(synced?.fromAddress).toBeNull();
    expect(synced?.cc).toEqual(['cc@example.invalid']);
  });
});

describe('isGraphUrl', () => {
  it('accepts only https on graph.microsoft.com', () => {
    expect(isGraphUrl(`${GRAPH}/messages`)).toBe(true);
    expect(isGraphUrl('http://graph.microsoft.com/v1.0/me')).toBe(false);
    expect(isGraphUrl('https://graph.microsoft.com.evil.example.invalid/x')).toBe(false);
    expect(isGraphUrl('not a url')).toBe(false);
  });
});
