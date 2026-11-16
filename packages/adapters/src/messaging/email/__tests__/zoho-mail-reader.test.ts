import { describe, it, expect, vi } from 'vitest';
import {
  readZohoFolder,
  readZohoFolderIds,
  zohoAddresses,
  zohoBodyText,
} from '../zoho-mail-reader';
import { MailboxTransportError } from '../mailbox-errors';

const NOW = new Date('2026-11-16T12:00:00.000Z');
// Not a real credential: built at runtime so nothing token-shaped sits in the source.
const ACCESS = ['access', 'for', 'tests'].join('-');
const REF = { mailHost: 'mail.zoho.com', accountId: '2560636000000008002' };
const BASE = `https://mail.zoho.com/api/accounts/${REF.accountId}`;

const json = (text: string) => new Response(text, { status: 200 });
const item = (id: string, time: number, extra = '') =>
  `{"messageId":${id},"threadId":7700000000000000001,"fromAddress":"Ada &lt;ada@example.invalid&gt;","toAddress":"me@example.invalid","subject":"Re: Proposal","receivedTime":"${time}","status":"1"${extra}}`;
const page = (...items: string[]) => json(`{"data":[${items.join(',')}]}`);
const options = (overrides = {}) => ({
  folderId: '1100000000000000001',
  initialDays: 30,
  pageSize: 2,
  maxPages: 5,
  maxBodyChars: 1_000,
  now: NOW,
  ...overrides,
});
const T = NOW.getTime();

describe('readZohoFolderIds', () => {
  it('finds Inbox and Sent by folder type, ids kept exact', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        '{"data":[{"folderId":1100000000000000001,"folderName":"Posteingang","folderType":"Inbox"},' +
          '{"folderId":1100000000000000009,"folderName":"Enviados","folderType":"Sent"}]}'
      )
    );
    await expect(readZohoFolderIds(ACCESS, REF, fetchImpl as never)).resolves.toEqual({
      inbox: '1100000000000000001',
      sent: '1100000000000000009',
    });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`${BASE}/folders`);
  });
});

describe('readZohoFolder', () => {
  it('reads newest first back to the cursor and returns the new mail oldest first', async () => {
    const cursor = JSON.stringify({ t: T - 10_000, ids: ['9000000000000000001'] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(item('9000000000000000003', T - 1_000), item('9000000000000000002', T - 5_000))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000001', T - 10_000), item('9000000000000000000', T - 20_000))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000002',
      '9000000000000000003',
    ]);
    expect(JSON.parse(round.cursor!)).toEqual({ t: T - 1_000, ids: ['9000000000000000003'] });
    expect(round).toMatchObject({ complete: true, expired: false });
    const first = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(first.pathname).toBe(`/api/accounts/${REF.accountId}/messages/view`);
    expect(first.searchParams.get('sortorder')).toBe('false');
    expect(first.searchParams.get('folderId')).toBe('1100000000000000001');
    const [msg] = round.messages;
    expect(msg).toMatchObject({
      conversationId: '7700000000000000001',
      fromAddress: 'ada@example.invalid',
      fromName: 'Ada',
      to: ['me@example.invalid'],
      isRead: true,
      bodyText: '',
    });
  });

  it('reads only the last 30 days on the first round, and keeps the cursor when nothing is new', async () => {
    const old = T - 31 * 24 * 60 * 60 * 1000;
    const fetchImpl = vi.fn(async () =>
      page(item('9000000000000000005', T - 1_000), item('9000000000000000004', old))
    );

    const first = await readZohoFolder(ACCESS, REF, null, options({ fetchImpl }));
    expect(first.messages.map((m) => m.providerMessageId)).toEqual(['9000000000000000005']);

    const again = vi.fn(async () => page(item('9000000000000000005', T - 1_000)));
    const second = await readZohoFolder(ACCESS, REF, first.cursor, options({ fetchImpl: again }));
    expect(second.messages).toEqual([]);
    expect(second.cursor).toBe(first.cursor);
  });

  it("keeps new mail sharing the cursor's millisecond, whatever order Zoho lists it in", async () => {
    const at = T - 10_000;
    const cursor = JSON.stringify({ t: at, ids: ['9000000000000000001'] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(item('9000000000000000003', T - 1_000), item('9000000000000000001', at))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000002', at), item('9000000000000000000', T - 20_000))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000002',
      '9000000000000000003',
    ]);
  });

  it('starts each later page one item early, and returns the overlapping mail once', async () => {
    const cursor = JSON.stringify({ t: T - 10_000, ids: [] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(item('9000000000000000008', T - 1_000), item('9000000000000000007', T - 2_000))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000007', T - 2_000), item('9000000000000000000', T - 20_000))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000007',
      '9000000000000000008',
    ]);
    const starts = (fetchImpl.mock.calls as unknown as Array<[string]>).map(([url]) =>
      new URL(url).searchParams.get('start')
    );
    expect(starts).toEqual(['1', '2']);
  });

  it("takes the sender's name from `sender` when the address field is bare", async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        '{"data":[{"messageId":9000000000000000009,"fromAddress":"rebecca@example.invalid",' +
          `"sender":"Rebecca","receivedTime":"${T - 1_000}"}]}`
      )
    );

    const round = await readZohoFolder(ACCESS, REF, null, options({ fetchImpl }));

    expect(round.messages[0]).toMatchObject({
      fromAddress: 'rebecca@example.invalid',
      fromName: 'Rebecca',
    });
  });

  it('loads the body only when asked, as text', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(item('9000000000000000006', T - 1_000)))
      .mockResolvedValueOnce(json('{"data":{"content":"<p>Thanks &amp; yes</p><br>Ada"}}'));

    const round = await readZohoFolder(ACCESS, REF, null, options({ fetchImpl }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await expect(round.messages[0]!.loadBody()).resolves.toBe('Thanks & yes\n\nAda');
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe(
      `${BASE}/folders/1100000000000000001/messages/9000000000000000006/content`
    );
  });

  it('never calls a host that is not Zoho, and reads a dead token from the body', async () => {
    const offHost = vi.fn();
    await expect(
      readZohoFolder(
        ACCESS,
        { ...REF, mailHost: 'mail.example.invalid' },
        null,
        options({ fetchImpl: offHost })
      )
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    expect(offHost).not.toHaveBeenCalled();

    const dead = vi.fn(
      async () => new Response('{"data":{"errorCode":"INVALID_OAUTHTOKEN"}}', { status: 404 })
    );
    const error = await readZohoFolder(ACCESS, REF, null, options({ fetchImpl: dead })).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(MailboxTransportError);
    expect(error).toMatchObject({ code: 'AUTH_FAILED' });
  });
});

describe('zohoAddresses / zohoBodyText', () => {
  it('reads every address, whatever the format', () => {
    expect(zohoAddresses('"Ada" &lt;Ada@Example.invalid&gt;, bob@example.invalid; nobody')).toEqual(
      ['ada@example.invalid', 'bob@example.invalid']
    );
    expect(zohoAddresses(undefined)).toEqual([]);
  });

  it('keeps an apostrophe inside an address, and drops quotes around one', () => {
    expect(zohoAddresses("O'Neil &lt;o'neil@example.invalid&gt;")).toEqual([
      "o'neil@example.invalid",
    ]);
    expect(zohoAddresses("'ada@example.invalid'")).toEqual(['ada@example.invalid']);
  });

  it('turns HTML into text and cuts it', () => {
    expect(zohoBodyText('<style>x{}</style><div>Hello</div><div>world</div>', 100)).toBe(
      'Hello\nworld'
    );
    expect(zohoBodyText('<p>abcdef</p>', 3)).toBe('abc');
  });
});
