/**
 * emailLog.leadEmails: the mail logged on a lead, with its sanitised HTML and attachment metadata,
 * oldest first by the provider's date (sentAt), tenant- and permission-scoped.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock, createTestContext, createAdminContext, TEST_UUIDS } from '../../../test/setup';
import { emailLogRouter } from '../email-log.router';
import { mapEmailRecord } from '../inbound.router';

const tenantId = TEST_UUIDS.tenant;
const LEAD = 'clh0000000000000000000l01';

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    userId: null,
    subject: 'Re: Quote',
    body: 'text body',
    bodyHtml: null,
    status: 'DELIVERED',
    fromEmail: 'robert@lead.example.invalid',
    toEmail: 'me@example.invalid',
    ccEmails: null,
    isRead: true,
    readAt: null,
    sentAt: null,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    metadata: { leadId: LEAD },
    attachments: [],
    ...over,
  };
}

const member = () => emailLogRouter.createCaller(createTestContext() as never);
const admin = () => emailLogRouter.createCaller(createAdminContext() as never);

beforeEach(() => {
  (prismaMock.lead.findFirst as any).mockResolvedValue({ id: LEAD });
});

/**
 * A database for the thread reads: it serves the two streams the router asks for (mail with a
 * sentAt, mail without one), each newest first by its own date, paged by skip and take.
 */
function serve(rows: any[]) {
  (prismaMock.emailRecord.findMany as any).mockImplementation(async (args: any) => {
    const undated = args.where.sentAt === null;
    const at = (r: any) => (r.sentAt ?? r.createdAt).getTime();
    return rows
      .filter((r) => (r.sentAt === null) === undated)
      .sort((x, y) => at(y) - at(x))
      .slice(args.skip ?? 0, (args.skip ?? 0) + args.take);
  });
}

const streamWhere = (call: number) =>
  (prismaMock.emailRecord.findMany as any).mock.calls[call][0].where;

describe('emailLog.leadEmails', () => {
  it('is scoped to the tenant and to mail logged on the lead, as two streams', async () => {
    serve([]);
    await member().leadEmails({ leadId: LEAD });
    const calls = (prismaMock.emailRecord.findMany as any).mock.calls;
    expect(calls).toHaveLength(2);
    const base = {
      tenantId,
      metadata: { path: ['leadId'], equals: LEAD },
      OR: [{ userId: null }, { userId: TEST_UUIDS.user1 }],
    };
    expect(calls[0][0].where).toEqual({ ...base, sentAt: { not: null } });
    expect(calls[1][0].where).toEqual({ ...base, sentAt: null });
    expect(calls[0][0].orderBy).toEqual([
      { sentAt: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(calls[1][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(calls[0][0].include).toEqual({ attachments: true });
    expect(calls[0][0].take).toBe(200);
  });

  it('answers not found for a lead of another tenant, and reads no mail', async () => {
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    await expect(member().leadEmails({ leadId: LEAD })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.findMany).not.toHaveBeenCalled();
  });

  it("orders the thread by the provider's date (sentAt, else createdAt), received mail included", async () => {
    serve([
      row('late', { sentAt: new Date('2026-11-12T10:00:00Z') }),
      // Received mail synced before sentAt was kept: ordered by createdAt, the same provider date.
      row('early', { createdAt: new Date('2026-11-11T10:00:00Z') }),
      row('first', { sentAt: new Date('2026-11-09T10:00:00Z') }),
    ]);
    const { emails } = await member().leadEmails({ leadId: LEAD });
    expect(emails.map((e) => e.id)).toEqual(['first', 'early', 'late']);
    expect(emails.map((e) => e.receivedAt)).toEqual([
      '2026-11-09T10:00:00.000Z',
      '2026-11-11T10:00:00.000Z',
      '2026-11-12T10:00:00.000Z',
    ]);
  });

  it('cuts the 200 newest by the same date the thread is shown by, across both streams', async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
    // 150 old mails with a sentAt, and 150 newer ones with none (createdAt is their date).
    const dated = Array.from({ length: 150 }, (_, n) => row(`d-${n}`, { sentAt: day(n) }));
    const undated = Array.from({ length: 150 }, (_, n) =>
      row(`u-${n}`, { createdAt: day(1000 + n) })
    );
    serve([...dated, ...undated]);
    const { emails } = await member().leadEmails({ leadId: LEAD });
    expect(emails).toHaveLength(200);
    const ids = new Set(emails.map((e) => e.id));
    // Every newer undated mail is kept (they used to be dropped behind the dated ones) ...
    for (const r of undated) expect(ids.has(r.id)).toBe(true);
    // ... with the 50 newest of the dated ones; the 100 oldest are cut.
    for (let n = 100; n < 150; n++) expect(ids.has(`d-${n}`)).toBe(true);
    for (let n = 0; n < 100; n++) expect(ids.has(`d-${n}`)).toBe(false);
    // Shown oldest first.
    expect(emails[0]!.id).toBe('d-100');
    expect(emails.at(-1)!.id).toBe('u-149');
  });

  it("leaves other users' own mail out in the query, except for an email admin", async () => {
    serve([]);
    await member().leadEmails({ leadId: LEAD });
    expect(streamWhere(0).OR).toEqual([{ userId: null }, { userId: TEST_UUIDS.user1 }]);
    (prismaMock.emailRecord.findMany as any).mockClear();
    serve([]);
    await admin().leadEmails({ leadId: LEAD });
    // An email admin's query has no per-user condition.
    expect(streamWhere(0)).toEqual({
      tenantId,
      metadata: { path: ['leadId'], equals: LEAD },
      sentAt: { not: null },
    });
  });

  it('leaves drafts out, and reads on past them so they never use up the limit', async () => {
    const drafts = Array.from({ length: 200 }, (_, n) =>
      row(`draft-${n}`, {
        sentAt: new Date(Date.UTC(2026, 5, 1) + n * 1000),
        metadata: { leadId: LEAD, isDraft: true },
      })
    );
    const old = [
      row('old-1', { sentAt: new Date('2026-01-01T00:00:00Z') }),
      row('old-2', { sentAt: new Date('2026-01-02T00:00:00Z') }),
    ];
    serve([...drafts, ...old]);
    const { emails } = await member().leadEmails({ leadId: LEAD });
    expect(emails.map((e) => e.id)).toEqual(['old-1', 'old-2']);
    const datedSkips = (prismaMock.emailRecord.findMany as any).mock.calls
      .filter((c: any[]) => c[0].where.sentAt !== null)
      .map((c: any[]) => c[0].skip);
    expect(datedSkips).toEqual([0, 200]);
  });

  it('returns the sanitised HTML with the text as the fallback, and attachment metadata', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      row('rich', {
        bodyHtml: '<p>Hi</p><img src="cid:s1" />',
        attachments: [
          {
            id: 'a1',
            fileName: 'quote.pdf',
            fileType: 'application/pdf',
            fileSize: 10,
            providerAttachmentId: 'loc',
            contentId: null,
            isInline: false,
          },
          {
            id: 'a2',
            fileName: 's.png',
            fileType: 'image/png',
            fileSize: 2,
            providerAttachmentId: 'loc2',
            contentId: 's1',
            isInline: true,
          },
        ],
      }),
    ]);
    const { emails } = await member().leadEmails({ leadId: LEAD });
    expect(emails[0]).toMatchObject({
      htmlBody: '<p>Hi</p><img src="cid:s1" />',
      textBody: 'text body',
    });
    expect(emails[0]!.attachments).toEqual([
      {
        id: 'a1',
        filename: 'quote.pdf',
        contentType: 'application/pdf',
        size: 10,
        isInline: false,
        contentId: null,
        onDemand: true,
      },
      {
        id: 'a2',
        filename: 's.png',
        contentType: 'image/png',
        size: 2,
        isInline: true,
        contentId: 's1',
        onDemand: true,
      },
    ]);
  });
});

describe('emailLog.leadEmail', () => {
  const ID = 'clh0000000000000000000e77';

  it('reads one mail of the lead by id, inside the tenant and the lead', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(row(ID, { bodyHtml: '<p>Hi</p>' }));
    const email = await member().leadEmail({ leadId: LEAD, emailRecordId: ID });
    expect(email).toMatchObject({ id: ID, htmlBody: '<p>Hi</p>' });
    expect((prismaMock.emailRecord.findFirst as any).mock.calls[0][0].where).toEqual({
      id: ID,
      tenantId,
      metadata: { path: ['leadId'], equals: LEAD },
      OR: [{ userId: null }, { userId: TEST_UUIDS.user1 }],
    });
  });

  it('is not found for another tenant lead, a missing mail or a draft', async () => {
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    await expect(member().leadEmail({ leadId: LEAD, emailRecordId: ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.findFirst).not.toHaveBeenCalled();
    (prismaMock.lead.findFirst as any).mockResolvedValue({ id: LEAD });
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(null);
    await expect(member().leadEmail({ leadId: LEAD, emailRecordId: ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      row(ID, { metadata: { leadId: LEAD, isDraft: true } })
    );
    await expect(member().leadEmail({ leadId: LEAD, emailRecordId: ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('mapEmailRecord: HTML is sanitised again on the way out', () => {
  it('never shows HTML kept in body as text, even when it sanitises to nothing', () => {
    const mapped = mapEmailRecord(
      row('r', {
        body: '<div><img src="https://t.example.invalid/p.gif" width="1" height="1"></div>',
      })
    );
    expect(mapped.htmlBody).toBeUndefined();
    expect(mapped.textBody).toBeUndefined();
  });

  it('cleans stored bodyHtml', () => {
    const mapped = mapEmailRecord(
      row('r', {
        bodyHtml:
          '<p>ok</p><script>alert(1)</script><img src="https://t.example.invalid/p.gif" width="1" height="1">',
      })
    );
    expect(mapped.htmlBody).toBe('<p>ok</p>');
    expect(mapped.textBody).toBe('text body');
  });

  it('cleans HTML kept in body by older mail, with no separate text', () => {
    const mapped = mapEmailRecord(row('r', { body: '<div onclick="x()">old <b>mail</b></div>' }));
    expect(mapped.htmlBody).toBe('<div>old <b>mail</b></div>');
    expect(mapped.textBody).toBeUndefined();
  });

  it('does not read an address in synced text as markup', () => {
    const mapped = mapEmailRecord(
      row('r', {
        body: 'On Mon, John <john@example.invalid> wrote:\nsee <https://example.invalid/x>',
        metadata: { source: 'outlook-sync' },
      })
    );
    expect(mapped.htmlBody).toBeUndefined();
    expect(mapped.textBody).toContain('<john@example.invalid>');
  });

  it('keeps plain text as text', () => {
    const mapped = mapEmailRecord(row('r', { body: 'just words' }));
    expect(mapped.htmlBody).toBeUndefined();
    expect(mapped.textBody).toBe('just words');
  });
});
