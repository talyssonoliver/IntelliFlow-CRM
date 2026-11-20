/**
 * The open rate on a lead's profile card, from the CRM's email records for the lead's address.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';
import { emailLogRouter } from '../email-log.router';
import { leadEmailEngagement, type EngagementRecord } from '../lead-email-engagement';

const LEAD_ID = 'clh0000000000000000000l01';
const ADDRESS = 'ada@example.invalid';

const record = (over: Partial<EngagementRecord> = {}): EngagementRecord => ({
  status: 'SENT',
  userId: TEST_UUIDS.user1,
  metadata: null,
  openCount: 0,
  openedAt: null,
  toEmail: ADDRESS,
  ccEmails: null,
  bccEmails: null,
  ...over,
});

describe('leadEmailEngagement', () => {
  it('counts a CRM send to the lead as tracked, and it is opened by openCount or openedAt', () => {
    const records = [
      record(),
      record({ openCount: 2 }),
      record({ openedAt: new Date('2026-11-15T10:00:00.000Z') }),
    ];
    expect(leadEmailEngagement(records, ADDRESS)).toEqual({ sent: 3, opened: 2 });
  });

  it('matches the address in To, Cc or Bcc, ignoring case and display names', () => {
    const records = [
      record({ toEmail: 'Ada <ADA@example.invalid>, x@example.invalid' }),
      record({ toEmail: 'x@example.invalid', ccEmails: ADDRESS, openCount: 1 }),
      record({ toEmail: 'x@example.invalid', bccEmails: 'Ada@Example.invalid' }),
      record({ toEmail: 'someone-ada@example.invalid.other' }),
    ];
    expect(leadEmailEngagement(records, ADDRESS)).toEqual({ sent: 3, opened: 1 });
  });

  it('leaves out mail that did not leave, was received, or bounced for the lead', () => {
    const records = [
      record({ status: 'FAILED' }),
      record({ status: 'PENDING' }),
      record({ status: 'BOUNCED' }),
      record({ metadata: { direction: 'inbound' } }),
      record({ metadata: { bouncedRecipients: ['ADA@example.invalid'] } }),
    ];
    expect(leadEmailEngagement(records, ADDRESS)).toEqual({ sent: 0, opened: 0 });
  });

  it('does not count untracked mail (synced or logged, no sending user, never opened) as a send', () => {
    const records = [record({ userId: null })];
    expect(leadEmailEngagement(records, ADDRESS)).toEqual({ sent: 0, opened: 0 });
    // ...but once it is opened it is both a tracked send and an open.
    expect(leadEmailEngagement([record({ userId: null, openCount: 1 })], ADDRESS)).toEqual({
      sent: 1,
      opened: 1,
    });
  });

  it('counts a record the provider reports OPENED or CLICKED as opened', () => {
    const records = [record({ status: 'OPENED' }), record({ status: 'CLICKED' })];
    expect(leadEmailEngagement(records, ADDRESS)).toEqual({ sent: 2, opened: 2 });
  });
});

describe('emailLog.engagementForLead', () => {
  const caller = () => emailLogRouter.createCaller(createTestContext() as never);

  beforeEach(() => {
    (prismaMock.lead.findFirst as any).mockResolvedValue({ email: ADDRESS });
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      record({ openCount: 1 }),
      record(),
    ]);
  });

  it('reads the lead and its mail tenant-scoped, and returns the counts from the records', async () => {
    await expect(caller().engagementForLead({ leadId: LEAD_ID })).resolves.toEqual({
      sent: 2,
      opened: 1,
    });
    expect((prismaMock.lead.findFirst as any).mock.calls[0][0].where).toMatchObject({
      id: LEAD_ID,
      tenantId: TEST_UUIDS.tenant,
    });
    const query = (prismaMock.emailRecord.findMany as any).mock.calls[0][0];
    expect(query.where.tenantId).toBe(TEST_UUIDS.tenant);
    expect(query.where.OR).toHaveLength(3);
  });

  it('returns zero, reading no mail, for a lead the caller cannot see', async () => {
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    await expect(caller().engagementForLead({ leadId: LEAD_ID })).resolves.toEqual({
      sent: 0,
      opened: 0,
    });
    expect(prismaMock.emailRecord.findMany).not.toHaveBeenCalled();
  });
});
