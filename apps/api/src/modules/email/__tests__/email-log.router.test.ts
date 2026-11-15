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
import { emailLogRouter, emailAddresses } from '../email-log.router';

const tenantId = TEST_UUIDS.tenant;
const EMAIL_ID = 'clh0000000000000000000e01';

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: EMAIL_ID,
    userId: TEST_UUIDS.user1,
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
    expect(prismaMock.emailRecord.update).toHaveBeenCalledWith({
      where: { id: EMAIL_ID, tenantId },
      data: { contactId: 'contact-ada', metadata: { threadId: 't1' } },
    });
  });

  it("skips the user's own address and links a lead through metadata", async () => {
    (prismaMock.contact.findFirst as any).mockResolvedValue(null);
    (prismaMock.lead.findFirst as any).mockResolvedValue({ id: 'lead-ada' });

    await expect(member().logToContact({ emailId: EMAIL_ID })).resolves.toMatchObject({
      leadId: 'lead-ada',
    });
    const looked = (prismaMock.contact.findFirst as any).mock.calls.map(
      (c: any[]) => c[0].where.email.equals
    );
    expect(looked).not.toContain('me@mail.example.invalid');
    expect(prismaMock.emailRecord.update).toHaveBeenCalledWith({
      where: { id: EMAIL_ID, tenantId },
      data: { contactId: null, metadata: { threadId: 't1', leadId: 'lead-ada' } },
    });
  });

  it('refuses, writing nothing, when nobody on the email is a lead or contact', async () => {
    (prismaMock.contact.findFirst as any).mockResolvedValue(null);

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

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
  });

  it('changes nothing for an email that is already linked', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(stored({ contactId: 'contact-x' }));

    await expect(member().logToContact({ emailId: EMAIL_ID })).resolves.toEqual({
      logged: true,
      contactId: 'contact-x',
      leadId: null,
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it("does not let a member link someone else's email (it reads as not found)", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ userId: TEST_UUIDS.user2 })
    );

    await expect(member().logToContact({ emailId: EMAIL_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it("lets an email admin link a member's email", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      stored({ userId: TEST_UUIDS.user2 })
    );

    await expect(admin().logToContact({ emailId: EMAIL_ID })).resolves.toMatchObject({
      logged: true,
    });
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
