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

describe('emailLog.leadEmails', () => {
  it('is scoped to the tenant and to mail logged on the lead', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([]);
    await member().leadEmails({ leadId: LEAD });
    const args = (prismaMock.emailRecord.findMany as any).mock.calls[0][0];
    expect(args.where).toEqual({
      tenantId,
      metadata: { path: ['leadId'], equals: LEAD },
      OR: [{ userId: null }, { userId: TEST_UUIDS.user1 }],
    });
    expect(args.include).toEqual({ attachments: true });
    // The newest 200 when a lead has more; the thread is then ordered oldest first.
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.take).toBe(200);
  });

  it('answers not found for a lead of another tenant, and reads no mail', async () => {
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    await expect(member().leadEmails({ leadId: LEAD })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.findMany).not.toHaveBeenCalled();
  });

  it("orders the thread by the provider's date (sentAt, else createdAt), received mail included", async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
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

  it("leaves out drafts and other users' own mail, except for an email admin", async () => {
    const rows = [
      row('draft', { metadata: { leadId: LEAD, isDraft: true } }),
      row('mine', { userId: TEST_UUIDS.user1 }),
      row('theirs', { userId: 'someone-else' }),
      row('inbound'),
    ];
    (prismaMock.emailRecord.findMany as any).mockResolvedValue(rows);
    const asMember = await member().leadEmails({ leadId: LEAD });
    expect(asMember.emails.map((e) => e.id).sort()).toEqual(['inbound', 'mine']);
    const asAdmin = await admin().leadEmails({ leadId: LEAD });
    // An email admin's query has no per-user condition.
    expect((prismaMock.emailRecord.findMany as any).mock.calls.at(-1)[0].where).toEqual({
      tenantId,
      metadata: { path: ['leadId'], equals: LEAD },
    });
    expect(asAdmin.emails.map((e) => e.id).sort()).toEqual(['inbound', 'mine', 'theirs']);
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

describe('mapEmailRecord: HTML is sanitised again on the way out', () => {
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

  it('keeps plain text as text', () => {
    const mapped = mapEmailRecord(row('r', { body: 'just words' }));
    expect(mapped.htmlBody).toBeUndefined();
    expect(mapped.textBody).toBe('just words');
  });
});
