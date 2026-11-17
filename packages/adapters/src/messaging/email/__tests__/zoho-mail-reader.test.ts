import { describe, it, expect, vi } from 'vitest';
import { readZohoFolder, readZohoFolderIds } from '../zoho-mail-reader';
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
// Older than the cursor by more than the hour each round looks back.
const OLD = T - 3 * 60 * 60 * 1000;

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
        page(item('9000000000000000002', T - 5_000), item('9000000000000000000', OLD))
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
      .mockResolvedValueOnce(page(item('9000000000000000001', at), item('9000000000000000002', at)))
      .mockResolvedValueOnce(
        page(item('9000000000000000002', at), item('9000000000000000000', OLD))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000002',
      '9000000000000000003',
    ]);
  });

  it('steps on, not back to the top, when new mail pushed the saved place below the page', async () => {
    const cursor = JSON.stringify({
      t: T - 100_000,
      ids: [],
      resume: {
        start: 2,
        top: { t: T - 10_000, ids: ['9000000000000000050'] },
        anchor: { ids: ['9000000000000000049'], t: T - 50_000 },
      },
    });
    const fetchImpl = vi
      .fn()
      // Newer than the saved place: mail that arrived since pushed it down.
      .mockResolvedValueOnce(
        page(item('9000000000000000052', T - 1_000), item('9000000000000000051', T - 2_000))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000049', T - 50_000), item('9000000000000000048', OLD))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    const starts = (fetchImpl.mock.calls as unknown as Array<[string]>).map(([url]) =>
      new URL(url).searchParams.get('start')
    );
    expect(starts).toEqual(['2', '3']);
    expect(round.complete).toBe(true);
    // Caught up: the cursor moves to the newest mail of the catch-up, and the next round sweeps.
    expect(JSON.parse(round.cursor!)).toEqual({
      t: T - 10_000,
      ids: ['9000000000000000050'],
      sweep: T - 100_000,
    });
  });

  it('reads on when one mail above was removed: the overlap still holds the last mail read', async () => {
    const cursor = JSON.stringify({ t: T - 100_000, ids: [] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          item('9000000000000000063', T - 1_000),
          item('9000000000000000062', T - 2_000),
          item('9000000000000000061', T - 3_000)
        )
      )
      // 063 was removed: the page at 2 (which repeats 062 and 061) now starts on 061.
      .mockResolvedValueOnce(
        page(
          item('9000000000000000061', T - 3_000),
          item('9000000000000000060', T - 4_000),
          item('9000000000000000059', OLD)
        )
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl, pageSize: 3 }));

    const starts = (fetchImpl.mock.calls as unknown as Array<[string]>).map(([url]) =>
      new URL(url).searchParams.get('start')
    );
    expect(starts).toEqual(['1', '2']);
    expect(round.complete).toBe(true);
    expect(round.messages.map((m) => m.providerMessageId)).toContain('9000000000000000060');
  });

  it('sweeps once after a catch-up, down to where it started, for mail listed late', async () => {
    const cursor = JSON.stringify({
      t: T - 10_000,
      ids: ['9000000000000000080'],
      sweep: T - 2 * 60 * 60 * 1000,
    });
    // 081 was listed during the catch-up with a time well below the new cursor.
    const fetchImpl = vi.fn(async () =>
      page(
        item('9000000000000000082', T - 1_000),
        item('9000000000000000080', T - 10_000),
        item('9000000000000000081', T - 90 * 60 * 1000),
        item('9000000000000000079', T - 4 * 60 * 60 * 1000)
      )
    );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl, pageSize: 4 }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000081',
      '9000000000000000082',
    ]);
    // The sweep is done: it asks for no other.
    expect(JSON.parse(round.cursor!)).toEqual({ t: T - 1_000, ids: ['9000000000000000082'] });
  });

  it('reads again from the top when mail above was removed between two pages', async () => {
    const cursor = JSON.stringify({ t: T - 100_000, ids: [] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(item('9000000000000000043', T - 1_000), item('9000000000000000042', T - 2_000))
      )
      // Two mails above were removed: the page no longer starts on 042, and 041 slipped above it.
      .mockResolvedValueOnce(
        page(item('9000000000000000040', T - 4_000), item('9000000000000000039', T - 5_000))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(round.complete).toBe(false);
    expect(JSON.parse(round.cursor!)).toEqual({
      t: T - 100_000,
      ids: [],
      resume: { start: 1, top: { t: T - 1_000, ids: ['9000000000000000043'] } },
    });
  });

  it('starts each later page one item early, and returns the overlapping mail once', async () => {
    const cursor = JSON.stringify({ t: T - 10_000, ids: [] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(item('9000000000000000008', T - 1_000), item('9000000000000000007', T - 2_000))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000007', T - 2_000), item('9000000000000000006', T - 3_000))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000006', T - 3_000), item('9000000000000000000', OLD))
      );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000006',
      '9000000000000000007',
      '9000000000000000008',
    ]);
    const starts = (fetchImpl.mock.calls as unknown as Array<[string]>).map(([url]) =>
      new URL(url).searchParams.get('start')
    );
    expect(starts).toEqual(['1', '2', '3']);
  });

  it('looks an hour below the cursor for mail listed late, and never moves the cursor back', async () => {
    const cursor = JSON.stringify({ t: T - 10_000, ids: ['9000000000000000070'] });
    // 071 arrived late with an older time than the cursor; 072 is new.
    const fetchImpl = vi.fn(async () =>
      page(
        item('9000000000000000072', T - 1_000),
        item('9000000000000000070', T - 10_000),
        item('9000000000000000071', T - 20_000),
        item('9000000000000000069', OLD)
      )
    );

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl, pageSize: 4 }));

    expect(round.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000071',
      '9000000000000000072',
    ]);
    expect(JSON.parse(round.cursor!)).toEqual({ t: T - 1_000, ids: ['9000000000000000072'] });

    // Only late mail found: it is returned (the sync dedupes it) and the cursor stays.
    const lateOnly = vi.fn(async () =>
      page(item('9000000000000000071', T - 20_000), item('9000000000000000069', OLD))
    );
    const again = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl: lateOnly }));
    expect(again.messages.map((m) => m.providerMessageId)).toEqual(['9000000000000000071']);
    expect(again.cursor).toBe(cursor);
  });

  it('carries on next round when it stops before the cursor, so no mail is skipped', async () => {
    const cursor = JSON.stringify({ t: T - 100_000, ids: [] });
    const firstRound = vi.fn(async () =>
      page(item('9000000000000000013', T - 1_000), item('9000000000000000012', T - 2_000))
    );

    // The page cap stops the round after one full page, before the cursor.
    const first = await readZohoFolder(
      ACCESS,
      REF,
      cursor,
      options({ fetchImpl: firstRound, maxPages: 1 })
    );

    expect(first.complete).toBe(false);
    expect(first.messages.map((m) => m.providerMessageId)).toEqual([
      '9000000000000000012',
      '9000000000000000013',
    ]);
    // The cursor stays; it says where to read on, and what it becomes once caught up.
    expect(JSON.parse(first.cursor!)).toEqual({
      t: T - 100_000,
      ids: [],
      resume: {
        start: 2,
        top: { t: T - 1_000, ids: ['9000000000000000013'] },
        anchor: { ids: ['9000000000000000012'], t: T - 2_000 },
      },
    });

    const secondRound = vi
      .fn()
      .mockResolvedValueOnce(
        page(item('9000000000000000012', T - 2_000), item('9000000000000000011', T - 90_000))
      )
      .mockResolvedValueOnce(
        page(item('9000000000000000011', T - 90_000), item('9000000000000000010', OLD))
      );
    const second = await readZohoFolder(
      ACCESS,
      REF,
      first.cursor,
      options({ fetchImpl: secondRound })
    );

    const starts = (secondRound.mock.calls as unknown as Array<[string]>).map(([url]) =>
      new URL(url).searchParams.get('start')
    );
    expect(starts).toEqual(['2', '3']);
    // The older mail the first round could not reach is read now (a repeat is deduped by the sync).
    expect(second.messages.map((m) => m.providerMessageId)).toContain('9000000000000000011');
    expect(second.complete).toBe(true);
    expect(JSON.parse(second.cursor!)).toEqual({
      t: T - 1_000,
      ids: ['9000000000000000013'],
      sweep: T - 100_000,
    });
  });

  it('stops on the time budget the same way, keeping the cursor', async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => {
      now += 5_000;
      return page(item('9000000000000000021', T - 1_000), item('9000000000000000020', T - 2_000));
    });
    const round = await readZohoFolder(
      ACCESS,
      REF,
      null,
      options({ fetchImpl, budgetMs: 3_000, clock: () => now })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(round.complete).toBe(false);
    expect(JSON.parse(round.cursor!).t).toBe(T - 30 * 24 * 60 * 60 * 1000);
  });

  it('starts over from the cursor when the saved position is not valid', async () => {
    const cursor = JSON.stringify({ t: T - 10_000, ids: [], resume: { start: 0, top: {} } });
    const fetchImpl = vi.fn(async () => page(item('9000000000000000030', T - 1_000)));

    const round = await readZohoFolder(ACCESS, REF, cursor, options({ fetchImpl }));

    expect(
      new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]).searchParams.get('start')
    ).toBe('1');
    expect(JSON.parse(round.cursor!)).toEqual({ t: T - 1_000, ids: ['9000000000000000030'] });
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
      // No thread yet: its own id, which a later reply's thread id names.
      conversationId: '9000000000000000009',
    });
  });

  it('decodes the entities in a sender name, from `sender` or the address field', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        // Newest first, as Zoho lists them; the reader returns oldest first.
        '{"data":[' +
          '{"messageId":9000000000000000092,' +
          '"fromAddress":"O&#39;Neil &lt;o@example.invalid&gt;",' +
          `"receivedTime":"${T - 1_000}"},` +
          '{"messageId":9000000000000000091,"fromAddress":"sales@example.invalid",' +
          `"sender":"Smith &amp; Co","receivedTime":"${T - 2_000}"}]}`
      )
    );

    const round = await readZohoFolder(ACCESS, REF, null, options({ fetchImpl }));

    expect(round.messages.map((m) => m.fromName)).toEqual(['Smith & Co', "O'Neil"]);
    expect(round.messages.map((m) => m.fromAddress)).toEqual([
      'sales@example.invalid',
      'o@example.invalid',
    ]);
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
