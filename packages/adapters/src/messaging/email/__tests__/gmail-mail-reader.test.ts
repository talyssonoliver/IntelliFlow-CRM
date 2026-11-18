/**
 * MVP-011: the Gmail reader for mailbox sync — the first round's window, history after it, labels
 * (INBOX received, SENT sent), page caps, expired history, bodies read only on demand, and Gmail's
 * own host only.
 */
import { describe, it, expect, vi } from 'vitest';
import { gmailBodyText, readGmailLabel, type GmailReadOptions } from '../gmail-mail-reader';
import { MailboxTransportError } from '../mailbox-errors';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const NOW = new Date('2026-11-18T12:00:00Z');
const TOKEN = 'x'.repeat(24);
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

interface FakeMessage {
  id: string;
  at: string;
  labels?: string[];
  from?: string;
  to?: string;
  subject?: string;
  messageId?: string;
  plain?: string;
  html?: string;
}

function metadata(m: FakeMessage) {
  const headers = [
    { name: 'From', value: m.from ?? 'Ana Lima <ana@lead.example.invalid>' },
    { name: 'To', value: m.to ?? 'owner@shop.example.invalid' },
    { name: 'Subject', value: m.subject ?? 'Booking enquiry' },
    ...(m.messageId ? [{ name: 'Message-ID', value: m.messageId }] : []),
  ];
  return {
    id: m.id,
    threadId: `t-${m.id}`,
    labelIds: m.labels ?? ['INBOX', 'UNREAD'],
    internalDate: String(new Date(m.at).getTime()),
    payload: {
      headers,
      mimeType: 'multipart/alternative',
      parts: [
        ...(m.plain ? [{ mimeType: 'text/plain', body: { data: b64(m.plain) } }] : []),
        ...(m.html ? [{ mimeType: 'text/html', body: { data: b64(m.html) } }] : []),
      ],
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fake Gmail API. `routes` answer by path prefix; messages answer /messages/{id}. */
function gmail(options: {
  historyId?: string;
  list?: Array<{ ids: string[]; next?: string }>;
  history?: Array<{ records: unknown[]; next?: string; historyId?: string } | 'gone'>;
  messages?: FakeMessage[];
}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(url.startsWith(`${API}/`)).toBe(true);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const path = url.slice(API.length);
    const query = new URL(url).searchParams;
    if (path === '/profile') return json({ historyId: options.historyId ?? '1000' });
    if (path.startsWith('/messages?')) {
      const page = options.list?.[Number(query.get('pageToken') ?? 0)] ?? { ids: [] };
      return json({ messages: page.ids.map((id) => ({ id })), nextPageToken: page.next });
    }
    if (path.startsWith('/history?')) {
      const page = options.history?.[Number(query.get('pageToken') ?? 0)];
      if (!page || page === 'gone') return json({ error: { code: 404 } }, 404);
      return json({ history: page.records, nextPageToken: page.next, historyId: page.historyId });
    }
    const id = decodeURIComponent(path.split('/')[2]!.split('?')[0]!);
    const message = options.messages?.find((m) => m.id === id);
    return message ? json(metadata(message)) : json({ error: { code: 404 } }, 404);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function opts(over: Partial<GmailReadOptions> = {}): GmailReadOptions {
  return {
    label: 'INBOX',
    initialDays: 30,
    pageSize: 50,
    maxPages: 10,
    maxBodyChars: 10_000,
    now: NOW,
    ...over,
  };
}

const added = (id: string, labels = ['INBOX']) => ({
  messagesAdded: [{ message: { id, labelIds: labels } }],
});

describe('readGmailLabel — the first round', () => {
  it('takes the history point, then lists the last 30 days of the label, oldest first', async () => {
    const api = gmail({
      historyId: '5000',
      list: [{ ids: ['m2', 'm1'] }],
      messages: [
        { id: 'm1', at: '2026-11-10T09:00:00Z', messageId: '<a1@lead.example.invalid>' },
        { id: 'm2', at: '2026-11-12T09:00:00Z', labels: ['INBOX'] },
      ],
    });
    const round = await readGmailLabel(TOKEN, null, opts({ fetchImpl: api.fetchImpl }));
    expect(api.calls[0]).toBe(`${API}/profile`);
    const listed = new URL(api.calls[1]!).searchParams;
    expect(listed.get('labelIds')).toBe('INBOX');
    const after = Math.floor((NOW.getTime() - 30 * 24 * 3600_000) / 1000);
    expect(listed.get('q')).toBe(`after:${after}`);
    expect(round.messages.map((m) => m.providerMessageId)).toEqual(['m1', 'm2']);
    expect(round.messages[0]).toMatchObject({
      internetMessageId: '<a1@lead.example.invalid>',
      conversationId: 't-m1',
      subject: 'Booking enquiry',
      fromAddress: 'ana@lead.example.invalid',
      fromName: 'Ana Lima',
      to: ['owner@shop.example.invalid'],
      isRead: false,
      bodyText: '',
    });
    expect(round.messages[1]?.isRead).toBe(true);
    expect(round).toMatchObject({ complete: true, expired: false });
    expect(JSON.parse(round.cursor!)).toEqual({ h: '5000' });
  });

  it('reads the SENT label for mail sent from Gmail itself', async () => {
    const api = gmail({
      list: [{ ids: ['s1'] }],
      messages: [
        {
          id: 's1',
          at: '2026-11-11T09:00:00Z',
          labels: ['SENT'],
          from: 'owner@shop.example.invalid',
          to: 'Ana <ana@lead.example.invalid>, bo@lead.example.invalid',
        },
      ],
    });
    const round = await readGmailLabel(
      TOKEN,
      null,
      opts({ label: 'SENT', fetchImpl: api.fetchImpl })
    );
    expect(new URL(api.calls[1]!).searchParams.get('labelIds')).toBe('SENT');
    expect(round.messages[0]?.to).toEqual(['ana@lead.example.invalid', 'bo@lead.example.invalid']);
  });

  it('keeps its place when the page cap stops the window, and reads on from there', async () => {
    const api = gmail({
      list: [{ ids: ['m1'], next: '1' }, { ids: ['m2'] }],
      messages: [
        { id: 'm1', at: '2026-11-12T09:00:00Z' },
        { id: 'm2', at: '2026-11-11T09:00:00Z' },
      ],
    });
    const first = await readGmailLabel(
      TOKEN,
      null,
      opts({ maxPages: 1, fetchImpl: api.fetchImpl })
    );
    expect(first.complete).toBe(false);
    expect(first.messages.map((m) => m.providerMessageId)).toEqual(['m1']);
    const second = await readGmailLabel(
      TOKEN,
      first.cursor,
      opts({ maxPages: 1, fetchImpl: api.fetchImpl })
    );
    expect(second.messages.map((m) => m.providerMessageId)).toEqual(['m2']);
    expect(second.complete).toBe(true);
    expect(JSON.parse(second.cursor!)).toEqual({ h: '1000' });
  });

  it('stops at the time budget between pages', async () => {
    let t = 0;
    const api = gmail({
      list: [{ ids: ['m1'], next: '1' }, { ids: ['m2'] }],
      messages: [{ id: 'm1', at: '2026-11-12T09:00:00Z' }],
    });
    const clock = () => (t += 1000);
    const round = await readGmailLabel(
      TOKEN,
      null,
      opts({ budgetMs: 500, clock, fetchImpl: api.fetchImpl })
    );
    expect(round.complete).toBe(false);
    expect(round.messages).toHaveLength(1);
  });
});

describe('readGmailLabel — history after the first round', () => {
  it('reads what was added to the label since the cursor and moves the cursor on', async () => {
    const api = gmail({
      history: [
        {
          records: [
            added('m3'),
            added('d1', ['DRAFT']),
            { labelsAdded: [{ message: { id: 'm4' }, labelIds: ['INBOX'] }] },
            { labelsAdded: [{ message: { id: 'x9' }, labelIds: ['STARRED'] }] },
          ],
          historyId: '6100',
        },
      ],
      messages: [
        { id: 'm3', at: '2026-11-18T10:00:00Z' },
        { id: 'm4', at: '2026-11-18T09:00:00Z' },
      ],
    });
    const round = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '6000' }),
      opts({ fetchImpl: api.fetchImpl })
    );
    const query = new URL(api.calls[0]!).searchParams;
    expect(query.get('startHistoryId')).toBe('6000');
    expect(query.get('labelId')).toBe('INBOX');
    expect(query.getAll('historyTypes')).toEqual(['messageAdded', 'labelAdded']);
    expect(round.messages.map((m) => m.providerMessageId)).toEqual(['m4', 'm3']);
    expect(JSON.parse(round.cursor!)).toEqual({ h: '6100' });
    expect(round.complete).toBe(true);
  });

  it('reads each message once, skips drafts and spam, and mail deleted since it was listed', async () => {
    const api = gmail({
      history: [
        { records: [added('m5'), added('m5'), added('sp'), added('gone')], historyId: '7' },
      ],
      messages: [
        { id: 'm5', at: '2026-11-18T10:00:00Z' },
        { id: 'sp', at: '2026-11-18T10:00:00Z', labels: ['INBOX', 'SPAM'] },
      ],
    });
    const round = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '6' }),
      opts({ fetchImpl: api.fetchImpl })
    );
    expect(round.messages.map((m) => m.providerMessageId)).toEqual(['m5']);
    expect(api.calls.filter((c) => c.includes('/messages/m5'))).toHaveLength(1);
  });

  it('keeps the history start and the page when it stops early', async () => {
    const api = gmail({
      history: [
        { records: [added('m3')], next: '1' },
        { records: [], historyId: '9' },
      ],
      messages: [{ id: 'm3', at: '2026-11-18T10:00:00Z' }],
    });
    const first = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '8' }),
      opts({ maxPages: 1, fetchImpl: api.fetchImpl })
    );
    expect(first.complete).toBe(false);
    expect(JSON.parse(first.cursor!)).toEqual({ h: '8', page: '1' });
    const second = await readGmailLabel(TOKEN, first.cursor, opts({ fetchImpl: api.fetchImpl }));
    expect(new URL(api.calls.at(-1)!).searchParams.get('startHistoryId')).toBe('8');
    expect(JSON.parse(second.cursor!)).toEqual({ h: '9' });
  });

  it('says the cursor expired when Gmail no longer holds that history', async () => {
    const api = gmail({ history: ['gone'] });
    const round = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '1' }),
      opts({ fetchImpl: api.fetchImpl })
    );
    expect(round).toEqual({ messages: [], cursor: null, complete: false, expired: true });
  });

  it('starts again from the window when the stored cursor is not one', async () => {
    const api = gmail({ list: [{ ids: [] }] });
    await readGmailLabel(TOKEN, '{"h":"not-a-number"}', opts({ fetchImpl: api.fetchImpl }));
    expect(api.calls[0]).toBe(`${API}/profile`);
  });
});

describe('readGmailLabel — failures', () => {
  const failing = (status: number, body = '{}') =>
    vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

  it.each([
    [401, '{}', 'AUTH_FAILED'],
    [403, '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}', 'AUTH_FAILED'],
    [403, '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}', 'RATE_LIMITED'],
    [429, '{}', 'RATE_LIMITED'],
    [503, '{}', 'CONNECT_FAILED'],
    [400, '{}', 'REJECTED'],
  ])('reduces HTTP %i to a code', async (status, body, code) => {
    const error = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '1' }),
      opts({ fetchImpl: failing(status, body) })
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailboxTransportError);
    expect((error as MailboxTransportError).code).toBe(code);
  });

  it('reduces a network failure to CONNECT_FAILED', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await expect(readGmailLabel(TOKEN, null, opts({ fetchImpl }))).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
  });
});

describe('bodies', () => {
  it('are read only through loadBody, as text', async () => {
    const api = gmail({
      history: [{ records: [added('m1')], historyId: '2' }],
      messages: [{ id: 'm1', at: '2026-11-18T10:00:00Z', plain: 'Hi,\r\nCan I book Friday?' }],
    });
    const round = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '1' }),
      opts({ fetchImpl: api.fetchImpl })
    );
    expect(api.calls.some((c) => c.includes('format=full'))).toBe(false);
    await expect(round.messages[0]!.loadBody()).resolves.toBe('Hi,\nCan I book Friday?');
    expect(api.calls.at(-1)).toContain('/messages/m1?format=full');
  });

  it('a body of mail deleted meanwhile is REJECTED (that mail is skipped)', async () => {
    const api = gmail({
      history: [{ records: [added('m1')], historyId: '2' }],
      messages: [{ id: 'm1', at: '2026-11-18T10:00:00Z' }],
    });
    const round = await readGmailLabel(
      TOKEN,
      JSON.stringify({ h: '1' }),
      opts({ fetchImpl: api.fetchImpl })
    );
    const message = round.messages[0]!;
    (api.fetchImpl as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(json({}, 404));
    await expect(message.loadBody()).rejects.toMatchObject({ code: 'REJECTED' });
  });

  it('falls back to the HTML part as text, and caps the length', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/html',
              body: { data: b64('<p>Hello</p><script>x()</script><div>there</div>') },
            },
          ],
        },
      ],
    };
    expect(gmailBodyText(payload, 1000)).toBe('Hello\nthere');
    expect(gmailBodyText({ mimeType: 'text/plain', body: { data: b64('abcdef') } }, 3)).toBe('abc');
    expect(gmailBodyText(undefined, 10)).toBe('');
  });
});
