/**
 * Rich mail in the mailbox sync: the provider's HTML is stored sanitised next to the text, the
 * attachments are stored as METADATA only (no file, no URL), and every mail carries the provider's
 * own date as sentAt, received mail too, so a thread can be ordered and dated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: (kind: string) => [`EMAIL_OAUTH_${kind}_CLIENT_ID`],
}));

import { runInboxSync } from '../outlook-inbox-sync';
import { mail, round, setup } from './inbox-sync-harness';

const record = (prisma: ReturnType<typeof setup>['prisma'], call = 0) =>
  (prisma.emailRecord.create.mock.calls[call] as unknown as [{ data: any }])[0].data;

function withAttachments(prisma: ReturnType<typeof setup>['prisma']) {
  const createMany = vi.fn(async (..._args: unknown[]) => ({ count: 1 }));
  (prisma as any).emailAttachment = { createMany };
  return createMany;
}

const RICH = {
  text: 'Hello from the thread',
  html:
    '<table width="600"><tr><td style="padding:8px">Hello <b>Robert</b></td></tr></table>' +
    '<script>alert(1)</script><img src="cid:shot1" alt="screen">' +
    '<img src="https://track.example.invalid/p.gif" width="1" height="1">',
  attachments: [
    {
      providerAttachmentId: 'att-1',
      fileName: 'quote.pdf',
      fileType: 'application/pdf',
      fileSize: 12345,
      contentId: null,
      isInline: false,
    },
    {
      providerAttachmentId: 'att-2',
      fileName: 'shot.png',
      fileType: 'image/png',
      fileSize: 999,
      contentId: 'shot1',
      isInline: true,
    },
  ],
};

describe('mailbox sync: rich bodies, attachment metadata and dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('stores the sanitised HTML next to the text body', async () => {
    const message = mail({ loadContent: async () => RICH });
    const { prisma, deps } = setup({ rounds: [round({ messages: [message] })] });
    withAttachments(prisma);
    await runInboxSync(deps);
    const data = record(prisma);
    expect(data.body).toBe('Hello from the thread');
    expect(data.bodyHtml).toContain('<table');
    expect(data.bodyHtml).toContain('cid:shot1');
    expect(data.bodyHtml).not.toMatch(/script|alert|track\.example/);
  });

  it('stores attachments as metadata only: nothing is copied, fileUrl stays empty', async () => {
    const message = mail({ loadContent: async () => RICH });
    const { prisma, deps } = setup({ rounds: [round({ messages: [message] })] });
    const createMany = withAttachments(prisma);
    await runInboxSync(deps);
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = (createMany.mock.calls[0] as unknown as [{ data: any[] }])[0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      emailId: 'rec-1',
      tenantId: expect.any(String),
      fileName: 'quote.pdf',
      fileSize: 12345,
      fileType: 'application/pdf',
      fileUrl: '',
      providerAttachmentId: 'att-1',
      contentId: null,
      isInline: false,
    });
    expect(rows[1]).toMatchObject({ contentId: 'shot1', isInline: true, fileUrl: '' });
    // No row carries file content of any kind.
    for (const row of rows) expect(Object.keys(row)).not.toContain('content');
  });

  it('writes the record and its attachments in one transaction', async () => {
    const message = mail({ loadContent: async () => RICH });
    const { prisma, deps } = setup({ rounds: [round({ messages: [message] })] });
    withAttachments(prisma);
    prisma.lead.findFirst.mockResolvedValue(null as never); // a contact's mail: no lead timeline
    await runInboxSync(deps);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('keeps a reader without rich content working: text only, no HTML, no attachment rows', async () => {
    const { prisma, deps } = setup({ rounds: [round({ messages: [mail()] })] });
    const createMany = withAttachments(prisma);
    await runInboxSync(deps);
    expect(record(prisma).body).toBe('Hello');
    expect(record(prisma)).not.toHaveProperty('bodyHtml');
    expect(createMany).not.toHaveBeenCalled();
  });

  it('keeps no HTML for a mail whose HTML sanitises to nothing (the text is used)', async () => {
    const message = mail({
      loadContent: async () => ({ text: 'Plain', html: '<script>x()</script>', attachments: [] }),
    });
    const { prisma, deps } = setup({ rounds: [round({ messages: [message] })] });
    await runInboxSync(deps);
    expect(record(prisma).body).toBe('Plain');
    expect(record(prisma)).not.toHaveProperty('bodyHtml');
  });

  describe('sentAt is the provider date for received and sent mail', () => {
    const DATE = new Date('2026-11-14T09:30:00.000Z');

    it('inbound mail: sentAt is the provider date (it was null before)', async () => {
      const { prisma, deps } = setup({
        rounds: [round({ messages: [mail({ receivedAt: DATE })] })],
      });
      await runInboxSync(deps);
      expect(record(prisma)).toMatchObject({ status: 'DELIVERED', sentAt: DATE, createdAt: DATE });
      // Received mail has no owner, so it never lands in anybody's Sent folder.
      expect(record(prisma)).not.toHaveProperty('userId');
    });

    it('outbound mail keeps the provider date as sentAt', async () => {
      const sent = mail({
        receivedAt: DATE,
        fromAddress: 'me@example.invalid',
        to: ['ada@example.invalid'],
      });
      const { prisma, deps } = setup({ rounds: [], sent: [round({ messages: [sent] })] });
      await runInboxSync(deps);
      expect(record(prisma)).toMatchObject({ status: 'SENT', sentAt: DATE, userId: 'user-1' });
    });
  });
});
