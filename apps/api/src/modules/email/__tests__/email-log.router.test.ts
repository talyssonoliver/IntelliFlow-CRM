/**
 * #1177 one-click "Log to contact": who an email is linked to, and who may link it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  mockAdapters,
  TEST_UUIDS,
} from '../../../test/setup';
import { emailLogRouter, emailAddresses, isOutbound } from '../email-log.router';

const tenantId = TEST_UUIDS.tenant;
const EMAIL_ID = 'clh0000000000000000000e01';

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: EMAIL_ID,
    userId: TEST_UUIDS.user1,
    subject: 'Proposal',
    status: 'SENT',
    sentAt: new Date('2026-11-15T09:00:00.000Z'),
    createdAt: new Date('2026-11-15T08:59:00.000Z'),
    fromEmail: 'me@mail.example.invalid',
    toEmail: 'ada@example.invalid, bob@example.invalid',
    ccEmails: null,
    contactId: null,
    metadata: { threadId: 't1' },
    mailbox: { fromAddress: 'me@mail.example.invalid', accountAddress: null },
    ...overrides,
  };
}

const member = () => emailLogRouter.createCaller(createTestContext() as never);
const admin = () => emailLogRouter.createCaller(createAdminContext() as never);

beforeEach(() => {
  (prismaMock.emailRecord.findFirst as any).mockResolvedValue(stored());
  (prismaMock.contact.findFirst as any).mockResolvedValue({ id: 'contact-ada' });
  (prismaMock.lead.findFirst as any).mockResolvedValue(null);
  (prismaMock.emailRecord.update as any).mockResolvedValue({});
  (prismaMock.$queryRaw as any).mockResolvedValue([]);
  (prismaMock.leadActivity.create as any).mockResolvedValue({ id: 'act-1' });
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('emailLog.logToContact (#1177)', () => {
  it('links a sent email to the first recipient who is a contact', async () => {
    await expect(member().logToContact({ emailId: EMAIL_ID })).resolves.toEqual({
      logged: true,
      contactId: 'contact-ada',
      leadId: null,
    });
    expect(prismaMock.emailRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EMAIL_ID, tenantId } })
    );
    expect(prismaMock.contact.findFirst).toHaveBeenCalledWith({
      where: { tenantId, email: { equals: 'ada@example.invalid', mode: 'insensitive' } },
      select: { id: true },
    });
    // Written under the email row's lock, after re-reading it.
    expect((prismaMock.$queryRaw as any).mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(prismaMock.emailRecord.update).toHaveBeenCalledWith({
      where: { id: EMAIL_ID, tenantId },
      data: { contactId: 'contact-ada' },
    });
  });

  it('returns the stored link, writing nothing, when a concurrent log linked the email first', async () => {
    (prismaMock.emailRecord.findFirst as any)
      .mockResolvedValueOnce(stored())
      .mockResolvedValueOnce(stored({ contactId: 'contact-other' }));

    await expect(member().logToContact({ emailId: EMAIL_ID })).resolves.toEqual({
      logged: true,
      contactId: 'contact-other',
      leadId: null,
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it("skips the user's own address and puts the email on the lead's timeline", async () => {
    (prismaMock.contact.findFirst as any).mockResolvedValue(null);
    (prismaMock.lead.findFirst as any).mockResolvedValue({ id: 'lead-ada' });

    await expect(member().logToContact({ emailId: EMAIL_ID })).resolves.toMatchObject({
      leadId: 'lead-ada',
    });
    const looked = (prismaMock.contact.findFirst as any).mock.calls.map(
      (c: any[]) => c[0].where.email.equals
    );
    expect(looked).not.toContain('me@mail.example.invalid');
    // A lead's timeline is its activities: an EMAIL activity, subject only.
    expect(prismaMock.leadActivity.create).toHaveBeenCalledWith({
      data: {
        type: 'EMAIL',
        title: 'Proposal',
        timestamp: new Date('2026-11-15T09:00:00.000Z'),
        userId: TEST_UUIDS.user1,
        userName: 'Logged from email',
        leadId: 'lead-ada',
        tenantId,
        metadata: { emailRecordId: EMAIL_ID, source: 'log-to-contact', loggedBy: TEST_UUIDS.user1 },
      },
      select: { id: true },
    });
    expect(prismaMock.emailRecord.update).toHaveBeenCalledWith({
      where: { id: EMAIL_ID, tenantId },
      data: { metadata: { threadId: 't1', leadId: 'lead-ada', leadActivityId: 'act-1' } },
    });
  });

  it("never takes the user's own sent mail sender as the counterparty, even without a mailbox", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(stored({ mailbox: null }));

    await member().logToContact({ emailId: EMAIL_ID });

    const looked = (prismaMock.contact.findFirst as any).mock.calls.map(
      (c: any[]) => c[0].where.email.equals
    );
    expect(looked[0]).toBe('ada@example.invalid');
  });

  it('refuses, writing nothing, when nobody on the email is a lead or contact', async () => {
    (prismaMock.contact.findFirst as any).mockResolvedValue(null);

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it('never logs a draft, which was never sent, and writes nothing', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ status: 'PENDING', sentAt: null, metadata: { isDraft: true } })
    );

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'Send the email before logging it.',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed send', { status: 'FAILED', sentAt: null }],
    ['a send not gone out yet', { status: 'PENDING', sentAt: null }],
    ['an email every address bounced', { status: 'BOUNCED' }],
  ])('never logs %s, which reached nobody', async (_label, fields) => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(stored(fields));

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it.each(['hardBouncedRecipients', 'bouncedRecipients', 'rejectedRecipients'])(
    'skips a recipient listed in %s, and links the next one the mail reached',
    async (key) => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
        stored({ metadata: { threadId: 't1', [key]: ['Ada@example.invalid'] } })
      );

      await member().logToContact({ emailId: EMAIL_ID });

      const looked = (prismaMock.contact.findFirst as any).mock.calls.map(
        (c: any[]) => c[0].where.email.equals
      );
      expect(looked).toEqual(['bob@example.invalid']);
    }
  );

  it('never links a person with an active processing restriction', async () => {
    mockAdapters.processingRestrictionRepository.status.mockResolvedValue({
      restricted: true,
      blocksMarketing: false,
      since: new Date(),
    });

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mockAdapters.processingRestrictionRepository.status).toHaveBeenCalledWith(
      tenantId,
      'ada@example.invalid'
    );
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it('changes nothing for an email that is already linked', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(stored({ contactId: 'contact-x' }));

    await expect(member().logToContact({ emailId: EMAIL_ID })).resolves.toEqual({
      logged: true,
      contactId: 'contact-x',
      leadId: null,
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it("does not let a member link someone else's email (it reads as not found)", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ userId: TEST_UUIDS.user2 })
    );

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it("lets an email admin link a member's email", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ userId: TEST_UUIDS.user2 })
    );

    await expect(admin().logToContact({ emailId: EMAIL_ID })).resolves.toMatchObject({
      logged: true,
    });
  });

  it("credits a lead activity to the email's own user when an admin logs it, and notes who did", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ userId: TEST_UUIDS.user2 })
    );
    (prismaMock.contact.findFirst as any).mockResolvedValue(null);
    (prismaMock.lead.findFirst as any).mockResolvedValue({ id: 'lead-ada' });

    await admin().logToContact({ emailId: EMAIL_ID });

    const data = (prismaMock.leadActivity.create as any).mock.calls[0][0].data;
    expect(data.userId).toBe(TEST_UUIDS.user2);
    expect(data.metadata.loggedBy).toEqual(expect.any(String));
    expect(data.metadata.loggedBy).not.toBe(TEST_UUIDS.user2);
  });

  it("finds nothing for another tenant's email", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(null);

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('emailLog.status', () => {
  it('reports an unlinked email', async () => {
    await expect(member().status({ emailId: EMAIL_ID })).resolves.toEqual({
      logged: false,
      contactId: null,
      leadId: null,
    });
  });

  it('reports a lead link kept in metadata', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ metadata: { leadId: 'lead-1' } })
    );

    await expect(member().status({ emailId: EMAIL_ID })).resolves.toEqual({
      logged: true,
      contactId: null,
      leadId: 'lead-1',
    });
  });
});

describe('isOutbound', () => {
  it('reads sent-only statuses as the user’s own mail', () => {
    expect(isOutbound({ status: 'SENT', userId: null, metadata: null })).toBe(true);
    expect(isOutbound({ status: 'BOUNCED', userId: 'u1', metadata: null })).toBe(true);
  });

  it("reads delivered mail as the user's own only when it has a user and was not synced from an inbox", () => {
    expect(
      isOutbound({ status: 'DELIVERED', userId: 'u1', metadata: { purpose: 'SERVICE' } })
    ).toBe(true);
    // Received mail: inbound (no user) and the Outlook inbox sync keep DELIVERED too.
    expect(isOutbound({ status: 'DELIVERED', userId: null, metadata: null })).toBe(false);
    expect(isOutbound({ status: 'DELIVERED', userId: 'u1', metadata: { folder: 'inbox' } })).toBe(
      false
    );
  });
});

it('links received mail to its sender, the counterparty, even though it is DELIVERED', async () => {
  (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
    stored({
      status: 'DELIVERED',
      fromEmail: 'ada@example.invalid',
      toEmail: 'me@mail.example.invalid',
      metadata: { folder: 'inbox' },
    })
  );

  await member().logToContact({ emailId: EMAIL_ID });

  expect((prismaMock.contact.findFirst as any).mock.calls[0][0].where.email.equals).toBe(
    'ada@example.invalid'
  );
});

describe('emailAddresses', () => {
  it('lists sender, To and Cc, trimmed and lower-cased', () => {
    expect(
      emailAddresses({
        fromEmail: 'Me@Example.invalid',
        toEmail: ' a@example.invalid ,b@example.invalid',
        ccEmails: 'C@example.invalid, not-an-address',
      })
    ).toEqual([
      'me@example.invalid',
      'a@example.invalid',
      'b@example.invalid',
      'c@example.invalid',
    ]);
  });
});
