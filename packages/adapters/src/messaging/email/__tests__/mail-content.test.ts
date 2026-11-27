/**
 * Rich mail content from each provider: the HTML body, attachment METADATA (never files), the
 * provider's own date as the mail's time, and the on-demand file fetch (which stores nothing).
 */
import { describe, it, expect, vi } from 'vitest';
import { readGmailLabel, type GmailReadOptions } from '../gmail-mail-reader';
import { gmailAttachmentMeta, fetchGmailAttachment } from '../gmail-mail-content';
import { readGraphMailDelta, toSyncedMessage } from '../graph-mail-delta';
import {
  fetchGraphAttachment,
  graphAttachmentMeta,
  readGraphContent,
  readGraphMessage,
} from '../graph-mail-content';
import { readZohoFolder } from '../zoho-mail-reader';
import { fetchZohoAttachment, readZohoMessageContent } from '../zoho-mail-content';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_HTML_CHARS,
  asTransportError,
  bareContentId,
  capHtml,
  readCapped,
  readJsonBody,
  safeSegment,
} from '../mail-content';
import { MailboxTransportError } from '../mailbox-errors';

const TOKEN = ['access', 'for', 'tests'].join('-');
const NOW = new Date('2026-11-18T12:00:00Z');
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('mail-content helpers', () => {
  it('strips angle brackets from a Content-ID', () => {
    expect(bareContentId(' <logo@mail.example.invalid> ')).toBe('logo@mail.example.invalid');
    expect(bareContentId('')).toBeNull();
    expect(bareContentId(null)).toBeNull();
  });

  it('does not keep an HTML body too large to keep whole (cutting it would break the markup)', () => {
    expect(capHtml('<p>ok</p>')).toBe('<p>ok</p>');
    expect(capHtml('x'.repeat(MAX_HTML_CHARS + 1))).toBeNull();
    expect(capHtml('   ')).toBeNull();
  });
});

describe('provider URL ids and capped reads', () => {
  it('refuses ids that would change the path, before any request', async () => {
    expect(safeSegment('abc')).toBe('abc');
    for (const bad of ['', '.', '..']) {
      expect(() => safeSegment(bad)).toThrow(MailboxTransportError);
    }
    const never = vi.fn();
    await expect(
      fetchGraphAttachment(TOKEN, { messageId: '..', attachmentId: 'a' }, never as never)
    ).rejects.toMatchObject({ code: 'REJECTED' });
    expect(never).not.toHaveBeenCalled();
  });

  it('stops reading a body as soon as it passes the cap, even with no Content-Length', async () => {
    const chunk = new Uint8Array(1024);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
        if (pulled > 1000) controller.close();
      },
    });
    await expect(readCapped(new Response(body), 4096)).rejects.toMatchObject({ code: 'REJECTED' });
    expect(pulled).toBeLessThan(50);
  });

  it('turns a body that fails partway, or is not JSON, into transport errors (no raw error escapes)', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new DOMException('timed out', 'TimeoutError'));
      },
    });
    await expect(readCapped(new Response(broken), 4096)).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
    await expect(readJsonBody(new Response('{not json'))).rejects.toMatchObject({
      code: 'REJECTED',
    });
    await expect(readJsonBody(new Response('{"a":1}'))).resolves.toEqual({ a: 1 });
    expect(asTransportError(new TypeError('socket hang up'))).toMatchObject({
      code: 'CONNECT_FAILED',
    });
    const known = new MailboxTransportError('RATE_LIMITED');
    expect(asTransportError(known)).toBe(known);
  });

  it('cancels the body of a response whose declared size is over the cap', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body, { headers: { 'content-length': '999999' } });
    await expect(readCapped(response, 10)).rejects.toMatchObject({ code: 'REJECTED' });
    expect(cancelled).toBe(true);
  });

  it('refuses a declared size over the cap without reading, and returns a body within it', async () => {
    const declared = new Response('x', { headers: { 'content-length': '999999' } });
    await expect(readCapped(declared, 10)).rejects.toMatchObject({ code: 'REJECTED' });
    await expect(readCapped(new Response('hello'), 10)).resolves.toEqual(Buffer.from('hello'));
  });
});

describe('Gmail', () => {
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const opts = (fetchImpl: unknown): GmailReadOptions =>
    ({
      label: 'INBOX',
      initialDays: 30,
      pageSize: 10,
      maxPages: 2,
      maxBodyChars: 1_000,
      now: NOW,
      fetchImpl,
    }) as never;

  const full = {
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX'],
    internalDate: String(new Date('2026-11-18T10:15:00Z').getTime()),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'From', value: 'Robert <robert@lead.example.invalid>' },
        { name: 'To', value: 'owner@shop.example.invalid' },
        { name: 'Subject', value: 'Quote' },
      ],
      parts: [
        {
          partId: '0',
          mimeType: 'multipart/related',
          parts: [
            { partId: '0.0', mimeType: 'text/plain', body: { data: b64('Hello text') } },
            {
              partId: '0.1',
              mimeType: 'text/html',
              body: { data: b64('<p>Hello <b>html</b></p><img src="cid:shot1">') },
            },
            {
              partId: '0.2',
              mimeType: 'image/png',
              filename: 'shot.png',
              headers: [{ name: 'Content-ID', value: '<shot1>' }],
              body: { attachmentId: 'ATT-A', size: 321 },
            },
          ],
        },
        {
          partId: '1',
          mimeType: 'application/pdf',
          filename: 'quote.pdf',
          body: { attachmentId: 'ATT-B', size: 9000 },
        },
      ],
    },
  };

  /** A Gmail API holding one message: its headers on the list read, all of it on format=full. */
  function api() {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${API}/history`)) {
        return json({ history: [{ messagesAdded: [{ message: { id: 'm1' } }] }], historyId: '2' });
      }
      if (url.includes('/attachments/ATT-B')) return json({ data: b64('%PDF-file') });
      if (url.includes('/messages/m1?format=full')) return json(full);
      if (url.includes('/messages/m1')) return json(full);
      return json({}, 404);
    });
  }

  it("takes the mail's time from internalDate (received mail too)", async () => {
    const round = await readGmailLabel(TOKEN, JSON.stringify({ h: '1' }), opts(api()));
    expect(round.messages[0]!.receivedAt).toEqual(new Date('2026-11-18T10:15:00Z'));
  });

  it('reads the HTML and the attachments metadata in one read, and no file', async () => {
    const fetchImpl = api();
    const round = await readGmailLabel(TOKEN, JSON.stringify({ h: '1' }), opts(fetchImpl));
    const content = await round.messages[0]!.loadContent();
    expect(content.text).toBe('Hello text');
    expect(content.html).toBe('<p>Hello <b>html</b></p><img src="cid:shot1">');
    expect(content.attachments).toEqual([
      {
        providerAttachmentId: '0.2',
        fileName: 'shot.png',
        fileType: 'image/png',
        fileSize: 321,
        contentId: 'shot1',
        isInline: true,
      },
      {
        providerAttachmentId: '1',
        fileName: 'quote.pdf',
        fileType: 'application/pdf',
        fileSize: 9000,
        contentId: null,
        isInline: false,
      },
    ]);
    // Metadata only: no attachment content was requested.
    const calls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('/attachments/'))).toBe(false);
    // loadBody and loadContent share one read of the message.
    await round.messages[0]!.loadBody();
    expect(calls.filter((c) => c.includes('format=full'))).toHaveLength(1);
  });

  it('records and fetches an attachment whose bytes are inline in the part', async () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          partId: '1',
          mimeType: 'text/plain',
          filename: 'note.txt',
          body: { data: b64('inline bytes'), size: 12 },
        },
      ],
    };
    expect(gmailAttachmentMeta(payload)).toMatchObject([
      { providerAttachmentId: '1', fileName: 'note.txt', fileSize: 12 },
    ]);
    const fetchImpl = vi.fn(async () => json({ id: 'm9', payload }));
    const file = await fetchGmailAttachment(
      TOKEN,
      { messageId: 'm9', partId: '1' },
      fetchImpl as never
    );
    expect(file.bytes.toString()).toBe('inline bytes');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('lists a binary part that has no filename, disposition or Content-ID', () => {
    expect(
      gmailAttachmentMeta({
        mimeType: 'multipart/mixed',
        parts: [
          { partId: '0', mimeType: 'text/plain', body: { data: b64('hi'), size: 2 } },
          { partId: '1', mimeType: 'application/pdf', body: { attachmentId: 'ATT-X', size: 900 } },
        ],
      })
    ).toMatchObject([
      { providerAttachmentId: '1', fileName: 'attachment-1', fileType: 'application/pdf' },
    ]);
  });

  it('does not list the mail body part as a file because it has a Content-ID', () => {
    expect(
      gmailAttachmentMeta({
        mimeType: 'multipart/related',
        parts: [
          {
            partId: '0',
            mimeType: 'text/html',
            headers: [{ name: 'Content-ID', value: '<root>' }],
            body: { data: b64('<p>x</p>'), size: 8 },
          },
        ],
      })
    ).toEqual([]);
  });

  it('lists nothing for a mail with no attachment parts', () => {
    expect(gmailAttachmentMeta({ mimeType: 'text/plain', body: { data: b64('x') } })).toEqual([]);
  });

  it('fetches a file on demand by part id, re-reading the current attachment id', async () => {
    const fetchImpl = api();
    const file = await fetchGmailAttachment(
      TOKEN,
      { messageId: 'm1', partId: '1' },
      fetchImpl as never
    );
    expect(file.bytes.toString()).toBe('%PDF-file');
    expect(file.contentType).toBe('application/pdf');
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      `${API}/messages/m1?format=full`,
      `${API}/messages/m1/attachments/ATT-B`,
    ]);
    await expect(
      fetchGmailAttachment(TOKEN, { messageId: 'm1', partId: '9.9' }, fetchImpl as never)
    ).rejects.toMatchObject({ code: 'REJECTED' });
  });
});

describe('Gmail attachment errors', () => {
  it('reads a daily quota 403 as throttling too, never as a dead token', async () => {
    for (const reason of ['dailyLimitExceeded', 'userRateLimitExceeded']) {
      const quota = vi.fn(
        async () => new Response(`{"error":{"errors":[{"reason":"${reason}"}]}}`, { status: 403 })
      );
      await expect(
        fetchGmailAttachment(TOKEN, { messageId: 'm1', partId: '1' }, quota as never)
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    }
  });

  it('reads a 403 with a rate reason as throttling, any other 403 as a dead token', async () => {
    const rate = vi.fn(
      async () =>
        new Response('{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}', { status: 403 })
    );
    await expect(
      fetchGmailAttachment(TOKEN, { messageId: 'm1', partId: '1' }, rate as never)
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const denied = vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 }));
    await expect(
      fetchGmailAttachment(TOKEN, { messageId: 'm1', partId: '1' }, denied as never)
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});

describe('Microsoft Graph', () => {
  const ME = 'https://graph.microsoft.com/v1.0/me';

  it("takes the mail's time from receivedDateTime", () => {
    const message = toSyncedMessage(
      {
        id: 'g1',
        receivedDateTime: '2026-11-17T08:45:00Z',
        subject: 'Hi',
        from: { emailAddress: { address: 'ada@example.invalid' } },
        body: { content: 'text' },
      },
      1000
    );
    expect(message?.receivedAt).toEqual(new Date('2026-11-17T08:45:00Z'));
  });

  it('gives every delta message a content loader, called only for mail the sync keeps', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        value: [{ id: 'g1', receivedDateTime: '2026-11-17T08:45:00Z', body: { content: 't' } }],
        '@odata.deltaLink': `${ME}/mailFolders/inbox/messages/delta?$deltatoken=d1`,
      })
    );
    const round = await readGraphMailDelta(TOKEN, null, {
      folder: 'inbox',
      maxPages: 1,
      pageSize: 10,
      initialDays: 30,
      maxBodyChars: 100,
      now: NOW,
      fetchImpl: fetchImpl as never,
    });
    expect(typeof round.messages[0]!.loadContent).toBe('function');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reads the HTML and the attachments list without file content', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/attachments?')) {
        return json({
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'a1',
              name: 'quote.pdf',
              contentType: 'application/pdf',
              size: 4096,
              isInline: false,
            },
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'a2',
              name: 'logo.png',
              contentType: 'image/png',
              size: 100,
              isInline: true,
              contentId: '<logo1>',
            },
            { '@odata.type': '#microsoft.graph.itemAttachment', id: 'a3', name: 'mail' },
          ],
        });
      }
      return json({ body: { contentType: 'html', content: '<p>Hi</p>' }, hasAttachments: true });
    });
    const content = await readGraphContent(TOKEN, 'g1', 'Hi', fetchImpl as never);
    expect(content.html).toBe('<p>Hi</p>');
    expect(
      content.attachments.map((a) => [a.providerAttachmentId, a.contentId, a.isInline])
    ).toEqual([
      ['a1', null, false],
      ['a2', 'logo1', true],
      ['a3', null, false],
    ]);
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls[1]).toContain(
      '$select=id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId'
    );
    expect(urls.some((u) => u.includes('/$value'))).toBe(false);
  });

  it('reads the attachments list for a mail whose body names a cid: even when hasAttachments is false', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/attachments?')) {
        return json({
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'i1',
              name: 'logo.png',
              contentType: 'image/png',
              size: 5,
              isInline: true,
              contentId: 'logo1',
            },
          ],
        });
      }
      return json({
        body: { contentType: 'html', content: '<img src="cid:logo1">' },
        hasAttachments: false,
      });
    });
    const content = await readGraphContent(TOKEN, 'g1', '', fetchImpl as never);
    expect(content.attachments.map((a) => a.contentId)).toEqual(['logo1']);
    // Without a cid: and without attachments, the list is not read.
    const plain = vi.fn(async () =>
      json({ body: { contentType: 'html', content: '<p>x</p>' }, hasAttachments: false })
    );
    await readGraphContent(TOKEN, 'g1', '', plain as never);
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it('lists the files without cid mapping when Graph refuses the cast select', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('fileAttachment/contentId')) return json({}, 400);
      if (url.includes('/attachments?')) {
        return json({
          value: [
            { '@odata.type': '#microsoft.graph.fileAttachment', id: 'a1', name: 'q.pdf', size: 3 },
          ],
        });
      }
      return json({ body: { contentType: 'html', content: '<p>x</p>' }, hasAttachments: true });
    });
    const content = await readGraphContent(TOKEN, 'g1', '', fetchImpl as never);
    expect(content.attachments.map((a) => [a.fileName, a.contentId])).toEqual([['q.pdf', null]]);
  });

  it('keeps the text when Graph refuses the HTML read for one mail, but not on a dead token', async () => {
    const refused = vi.fn(async () => json({}, 404));
    await expect(readGraphContent(TOKEN, 'g1', 'text', refused as never)).resolves.toEqual({
      text: 'text',
      html: null,
      attachments: [],
    });
    const dead = vi.fn(async () => json({}, 401));
    await expect(readGraphContent(TOKEN, 'g1', 'text', dead as never)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('fetches a file on demand, checking its size first', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/$value')) return new Response(Buffer.from('file-bytes'));
      return json({ size: 10, contentType: 'application/pdf' });
    });
    const file = await fetchGraphAttachment(
      TOKEN,
      { messageId: 'g1', attachmentId: 'a1' },
      fetchImpl as never
    );
    expect(file.bytes.toString()).toBe('file-bytes');
    expect(file.contentType).toBe('application/pdf');

    const big = vi.fn(async () => json({ size: MAX_ATTACHMENT_BYTES + 1 }));
    await expect(
      fetchGraphAttachment(TOKEN, { messageId: 'g1', attachmentId: 'a1' }, big as never)
    ).rejects.toMatchObject({ code: 'REJECTED' });
    expect(big).toHaveBeenCalledTimes(1);
  });

  it('the backfill read says gone only for a 404; any other refusal is an error', async () => {
    const gone = vi.fn(async () => json({}, 404));
    await expect(readGraphMessage(TOKEN, 'g1', gone as never)).resolves.toBeNull();
    for (const status of [400, 410, 413]) {
      const refused = vi.fn(async () => json({}, status));
      await expect(readGraphMessage(TOKEN, 'g1', refused as never)).rejects.toMatchObject({
        code: 'REJECTED',
      });
    }
    const badBody = vi.fn(async () => new Response('{not json', { status: 200 }));
    await expect(readGraphMessage(TOKEN, 'g1', badBody as never)).rejects.toMatchObject({
      code: 'REJECTED',
    });
    const found = vi.fn(async () =>
      json({
        receivedDateTime: '2026-11-09T08:30:00Z',
        body: { contentType: 'html', content: '<p>x</p>' },
      })
    );
    await expect(readGraphMessage(TOKEN, 'g1', found as never)).resolves.toMatchObject({
      receivedAt: new Date('2026-11-09T08:30:00Z'),
      content: { html: '<p>x</p>' },
    });
  });

  it('lists attached messages (downloaded as raw content) but not reference links', () => {
    expect(
      graphAttachmentMeta([
        { id: 'a', name: 'Quote', size: 9, '@odata.type': '#microsoft.graph.itemAttachment' },
        { id: 'b', name: 'link', '@odata.type': '#microsoft.graph.referenceAttachment' },
      ])
    ).toMatchObject([
      { providerAttachmentId: 'a', fileName: 'Quote', fileType: 'application/octet-stream' },
    ]);
  });

  it('the backfill read fails, rather than record no attachments, when the list is refused', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/attachments?')
        ? json({}, 400)
        : json({
            receivedDateTime: '2026-11-09T08:30:00Z',
            body: { contentType: 'html', content: '<p>x</p>' },
            hasAttachments: true,
          })
    );
    await expect(readGraphMessage(TOKEN, 'g1', fetchImpl as never)).rejects.toMatchObject({
      code: 'REJECTED',
    });
    // The sync still keeps the mail.
    await expect(readGraphContent(TOKEN, 'g1', 't', fetchImpl as never)).resolves.toMatchObject({
      attachments: [],
    });
  });

  it('follows the next links of a paged attachments list, and only Graph ones', async () => {
    const item = (id: string) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      id,
      name: `${id}.pdf`,
      size: 1,
    });
    const next = 'https://graph.microsoft.com/v1.0/me/messages/g1/attachments?$skiptoken=2';
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/attachments?') && !url.includes('skiptoken')) {
        return json({ value: [item('a1')], '@odata.nextLink': next });
      }
      if (url.includes('skiptoken')) return json({ value: [item('a2')] });
      return json({ body: { contentType: 'html', content: '<p>x</p>' }, hasAttachments: true });
    });
    const content = await readGraphContent(TOKEN, 'g1', '', fetchImpl as never);
    expect(content.attachments.map((a) => a.providerAttachmentId)).toEqual(['a1', 'a2']);
    expect(calls.at(-1)).toBe(next);

    // A next link on another host is never followed with the token.
    const elsewhere = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/attachments?')
        ? json({ value: [item('b1')], '@odata.nextLink': 'https://evil.example.invalid/next' })
        : json({ body: { contentType: 'html', content: '<p>x</p>' }, hasAttachments: true })
    );
    const only = await readGraphContent(TOKEN, 'g1', '', elsewhere as never);
    expect(only.attachments).toHaveLength(1);
    expect(elsewhere.mock.calls.map((c) => String(c[0])).some((u) => u.includes('evil'))).toBe(
      false
    );
  });

  it('names an attached item by what its raw content is (message, contact or event)', async () => {
    const answer = (content: string) =>
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/$value') ? new Response(content) : json({ size: content.length })
      );
    for (const [content, type] of [
      ['BEGIN:VCARD\r\nFN:Alex', 'text/vcard'],
      ['BEGIN:VCALENDAR\r\nVERSION:2.0', 'text/calendar'],
      ['From: a@example.invalid\r\nSubject: x\r\n\r\nbody', 'message/rfc822'],
    ] as const) {
      const file = await fetchGraphAttachment(
        TOKEN,
        { messageId: 'g1', attachmentId: 'a1' },
        answer(content) as never
      );
      expect(file.contentType).toBe(type);
    }
  });

  it('finds a cid: in a body too large to store, so inline images are still listed', async () => {
    const big = `<img src="cid:logo1">${'x'.repeat(MAX_HTML_CHARS)}`;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/attachments?')) {
        return json({
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'i1',
              name: 'logo.png',
              isInline: true,
              contentId: 'logo1',
            },
          ],
        });
      }
      return json({ body: { contentType: 'html', content: big }, hasAttachments: false });
    });
    const content = await readGraphContent(TOKEN, 'g1', '', fetchImpl as never);
    expect(content.html).toBeNull();
    expect(content.attachments).toHaveLength(1);
  });
});

describe('Zoho', () => {
  const REF = { mailHost: 'mail.zoho.com', accountId: '2560636000000008002' };
  const BASE = `https://mail.zoho.com/api/accounts/${REF.accountId}`;
  const T = NOW.getTime();
  const listing = (extra = '') =>
    new Response(
      `{"data":[{"messageId":9000000000000000006,"fromAddress":"Ada <ada@example.invalid>",` +
        `"subject":"Quote","receivedTime":"${T - 1000}","status":"1"${extra}}]}`
    );
  const readOptions = (fetchImpl: unknown) => ({
    folderId: '1100000000000000001',
    initialDays: 30,
    pageSize: 5,
    maxPages: 2,
    maxBodyChars: 1000,
    now: NOW,
    fetchImpl: fetchImpl as never,
  });

  it("takes the mail's time from receivedTime", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(listing());
    const round = await readZohoFolder(TOKEN, REF, null, readOptions(fetchImpl));
    expect(round.messages[0]!.receivedAt).toEqual(new Date(T - 1000));
  });

  it('reads the HTML and the attachment info (files and inline), with no file content', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(listing(',"hasAttachment":"1"'))
      .mockResolvedValueOnce(new Response('{"data":{"content":"<p>Hi</p><img src=\\"cid:c1\\">"}}'))
      .mockResolvedValueOnce(
        new Response(
          '{"data":{"attachments":[{"attachmentId":5001,"attachmentName":"quote.pdf","attachmentSize":2048}],' +
            '"inline":[{"attachmentId":5002,"attachmentName":"i.png","attachmentSize":10,"cid":"c1"}]}}'
        )
      );
    const round = await readZohoFolder(TOKEN, REF, null, readOptions(fetchImpl));
    const content = await round.messages[0]!.loadContent();
    expect(content.text).toBe('Hi');
    expect(content.html).toBe('<p>Hi</p><img src="cid:c1">');
    expect(content.attachments).toMatchObject([
      {
        providerAttachmentId: '1100000000000000001:5001',
        fileName: 'quote.pdf',
        fileSize: 2048,
        isInline: false,
      },
      { providerAttachmentId: '1100000000000000001:5002', contentId: 'c1', isInline: true },
    ]);
    expect(String((fetchImpl.mock.calls[2] as unknown as [string])[0])).toBe(
      `${BASE}/folders/1100000000000000001/messages/9000000000000000006/attachmentinfo?includeInline=true`
    );
  });

  it('skips the attachment read for a mail Zoho says has none, and loadBody stays one read', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(listing(',"hasAttachment":"0"'))
      .mockResolvedValueOnce(new Response('{"data":{"content":"<p>Plain</p>"}}'));
    const round = await readZohoFolder(TOKEN, REF, null, readOptions(fetchImpl));
    const content = await round.messages[0]!.loadContent();
    expect(content.attachments).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('the backfill read fails when the attachment info is refused; the sync keeps the HTML', async () => {
    const refused = () =>
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{"data":{"content":"<p>x</p>"}}'))
        .mockResolvedValueOnce(new Response('{"data":{}}', { status: 400 }));
    await expect(
      readZohoMessageContent(
        TOKEN,
        REF,
        '1100000000000000001',
        '9000000000000000006',
        refused() as never
      )
    ).rejects.toMatchObject({ code: 'REJECTED' });

    // The sync path: the mail is kept with its HTML and no attachment rows.
    const sync = vi
      .fn()
      .mockResolvedValueOnce(listing(',"hasAttachment":"1"'))
      .mockResolvedValueOnce(new Response('{"data":{"content":"<p>x</p>"}}'))
      .mockResolvedValueOnce(new Response('{"data":{}}', { status: 400 }));
    const round = await readZohoFolder(TOKEN, REF, null, readOptions(sync));
    await expect(round.messages[0]!.loadContent()).resolves.toMatchObject({
      html: '<p>x</p>',
      attachments: [],
    });

    // A dead token still fails on both paths.
    const dead = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"data":{"content":"<p>x</p>"}}'))
      .mockResolvedValueOnce(
        new Response('{"data":{"errorCode":"INVALID_OAUTHTOKEN"}}', { status: 401 })
      );
    await expect(
      readZohoMessageContent(
        TOKEN,
        REF,
        '1100000000000000001',
        '9000000000000000006',
        dead as never
      )
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('keeps a 19-digit attachment id exact, never rounded', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(listing(',"hasAttachment":"1"'))
      .mockResolvedValueOnce(new Response('{"data":{"content":"<p>x</p>"}}'))
      .mockResolvedValueOnce(
        new Response(
          '{"data":{"attachments":[{"attachmentId":138907275303090133,"attachmentName":"a.pdf","attachmentSize":5}]}}'
        )
      );
    const round = await readZohoFolder(TOKEN, REF, null, readOptions(fetchImpl));
    const content = await round.messages[0]!.loadContent();
    expect(content.attachments[0]?.providerAttachmentId).toBe(
      '1100000000000000001:138907275303090133'
    );
  });

  it('fetches a file on demand through its folder and id', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(Buffer.from('zoho-bytes'), { headers: { 'content-type': 'application/pdf' } })
    );
    const file = await fetchZohoAttachment(
      TOKEN,
      REF,
      { messageId: '9000000000000000006', providerAttachmentId: '1100000000000000001:5001' },
      fetchImpl as never
    );
    expect(file.bytes.toString()).toBe('zoho-bytes');
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toBe(
      `${BASE}/folders/1100000000000000001/messages/9000000000000000006/attachments/5001`
    );
    await expect(
      fetchZohoAttachment(
        TOKEN,
        REF,
        { messageId: 'm', providerAttachmentId: 'noFolder' },
        fetchImpl as never
      )
    ).rejects.toMatchObject({ code: 'REJECTED' });
  });
});
