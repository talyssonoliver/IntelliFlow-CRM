/**
 * PG-207 Step 19: email.sendEmail runs through dispatchUserMail end to end
 * (only the mailbox transport is stubbed), sends exactly the caller's HTML
 * (AC-EM-036: the server appends nothing), and Sent keeps BOUNCED/FAILED mail
 * visible with a bounced-recipient count.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, mockAdapters, prismaMock, TEST_UUIDS } from '../../../test/setup';

const transport = vi.hoisted(() => ({ send: vi.fn(), claim: vi.fn() }));
vi.mock('../mailbox-transport', () => ({
  sendThroughMailbox: transport.send,
  claimSendSlot: transport.claim,
}));

import { inboundEmailRouter } from '../inbound.router';

const ownMailbox = {
  id: 'mb-own',
  tenantId: TEST_UUIDS.tenant,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  kind: 'SMTP',
  status: 'ACTIVE',
  fromAddress: 'me@mail.example.invalid',
  fromName: null,
  tokenVersion: 0,
};

function caller(adapters: Record<string, unknown> = { ...mockAdapters, mailboxTransports: {} }) {
  return inboundEmailRouter.createCaller(createTestContext({ adapters: adapters as never }));
}

/** The decoded text/html part of a raw MIME message. */
function htmlPart(raw: Buffer): string {
  const text = raw.toString('utf8');
  const match =
    /Content-Type: text\/html[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n(?:--|$)/i.exec(
      text
    );
  if (!match) throw new Error('no text/html part');
  const encoding = /Content-Type: text\/html[^]*?Content-Transfer-Encoding: ([\w-]+)/i
    .exec(text)?.[1]
    ?.toLowerCase();
  const body = match[1];
  if (encoding === 'base64')
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    return body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      );
  }
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  transport.claim.mockResolvedValue(undefined);
  transport.send.mockResolvedValue({ provider: 'SMTP', providerMessageId: 'srv-1' });
  (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.findMany as any).mockResolvedValue([ownMailbox]);
  (prismaMock.emailSuppression.findMany as any).mockResolvedValue([]);
  (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'rec-1' });
  (prismaMock.emailRecord.update as any).mockResolvedValue({ id: 'rec-1' });
});

describe('email.sendEmail → dispatchUserMail', () => {
  it('sends exactly the caller’s HTML from the sender’s own mailbox (nothing appended)', async () => {
    const htmlBody = '<p>Exact body</p><div class="sig">Kind regards</div>';

    const result = await caller().sendEmail({ to: ['a@example.invalid'], subject: 'Hi', htmlBody });

    expect(result).toEqual({ id: 'rec-1', status: 'SENT', skipped: [] });
    expect(transport.send).toHaveBeenCalledTimes(1);
    const [, mailbox, , envelope, raw] = transport.send.mock.calls[0];
    expect(mailbox.id).toBe('mb-own');
    expect(envelope.from).toBe('me@mail.example.invalid');
    expect(htmlPart(raw as Buffer)).toBe(htmlBody);
    expect((prismaMock.emailRecord.create as any).mock.calls[0][0].data.body).toBe(htmlBody);
  });

  it('fails visibly with NO_MAILBOX and records nothing when the sender has no mailbox', async () => {
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([]);

    const error = await caller()
      .sendEmail({ to: ['a@example.invalid'], subject: 'Hi', htmlBody: '<p>x</p>' })
      .then(
        () => {
          throw new Error('expected a rejection');
        },
        (e: unknown) => e as { code: string; cause: unknown }
      );

    expect(error.code).toBe('PRECONDITION_FAILED');
    expect(error.cause).toMatchObject({ emailSendError: 'NO_MAILBOX' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('fails closed (never a silent mock send) when the mailbox transports are not wired', async () => {
    await expect(
      caller({ ...mockAdapters, mailboxTransports: undefined }).sendEmail({
        to: ['a@example.invalid'],
        subject: 'Hi',
        htmlBody: '<p>x</p>',
      })
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('refuses an unverified sender before anything else', async () => {
    const ctx = createTestContext({
      adapters: { ...mockAdapters, mailboxTransports: {} } as never,
    });
    const unverified = inboundEmailRouter.createCaller({
      ...ctx,
      user: { ...(ctx as any).user, emailVerified: false },
    } as never);

    await expect(
      unverified.sendEmail({ to: ['a@example.invalid'], subject: 'Hi', htmlBody: '<p>x</p>' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.emailMailbox.findMany).not.toHaveBeenCalled();
  });
});

describe('Sent folder', () => {
  it('keeps BOUNCED and FAILED mail visible and reports how many recipients bounced', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      {
        id: 'rec-1',
        tenantId: TEST_UUIDS.tenant,
        messageId: null,
        fromEmail: 'me@mail.example.invalid',
        toEmail: 'a@example.invalid, b@example.invalid',
        ccEmails: null,
        bccEmails: null,
        subject: 'Hi',
        body: '<p>x</p>',
        status: 'SENT',
        sentAt: new Date(Date.UTC(2026, 9, 20)),
        createdAt: new Date(Date.UTC(2026, 9, 20)),
        metadata: { isHtml: true, bouncedRecipients: ['b@example.invalid'] },
        attachments: [],
      },
    ]);
    (prismaMock.emailRecord.count as any).mockResolvedValue(1);

    const result = await caller().listEmails({ folder: 'sent', limit: 20, offset: 0 });

    const where = (prismaMock.emailRecord.findMany as any).mock.calls[0][0].where;
    expect(where.status.in).toEqual(expect.arrayContaining(['SENT', 'BOUNCED', 'FAILED']));
    expect(where.userId).toBe(TEST_UUIDS.user1);
    expect(result.emails[0]).toMatchObject({ status: 'SENT', bouncedRecipientCount: 1 });
    // A count only: the bounced addresses themselves are not in the list DTO.
    expect(JSON.stringify(result.emails[0])).not.toContain('bouncedRecipients');
  });

  it('counts unread BOUNCED and FAILED mail in the Sent badge', async () => {
    (prismaMock.emailRecord.count as any).mockResolvedValue(0);

    await caller().getUnreadCounts({ folders: ['sent'] });

    const where = (prismaMock.emailRecord.count as any).mock.calls[0][0].where;
    expect(where.status.in).toEqual(expect.arrayContaining(['BOUNCED', 'FAILED']));
  });
});
