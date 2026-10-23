/**
 * Per-tenant metering: email.sendEmail must respect and record `emailsPerMonth`.
 *
 * PG-207: sendEmail now goes through dispatchUserMail and the sender's own
 * mailbox; only the mailbox transport is stubbed here, so the real quota guard
 * and the real dispatch path run end to end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTestContext,
  mockAdapters,
  mockServices,
  prismaMock,
  TEST_UUIDS,
} from '../../../test/setup';
import { QuotaExceededError } from '@intelliflow/domain';
import { MailboxTransportError } from '@intelliflow/adapters';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const transport = vi.hoisted(() => ({ send: vi.fn(), claim: vi.fn() }));
vi.mock('../mailbox-transport', () => ({
  sendThroughMailbox: transport.send,
  claimSendSlot: transport.claim,
}));

import { inboundEmailRouter } from '../inbound.router';

const input = {
  to: ['a@example.invalid', 'b@example.invalid'],
  cc: ['c@example.invalid'],
  bcc: ['d@example.invalid'],
  subject: 'Hello',
  htmlBody: '<p>Hi</p>',
};
const RECIPIENTS = 4;

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

function ctxWith(quota: unknown) {
  return createTestContext({
    services: { ...mockServices, quota: quota as never },
    adapters: { ...mockAdapters, mailboxTransports: {} } as never,
  });
}

describe('email.sendEmail quota guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.claim.mockResolvedValue(undefined);
    transport.send.mockReset();
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([ownMailbox]);
    (prismaMock.emailSuppression.findMany as any).mockResolvedValue([]);
    (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'email-1' });
    (prismaMock.emailRecord.update as any).mockResolvedValue({ id: 'email-1' });
  });

  it('rejects before persisting or sending when the monthly email quota is exhausted', async () => {
    const ctx = ctxWith(overQuota('emailsPerMonth', 0, 0));

    await expect(inboundEmailRouter.createCaller(ctx).sendEmail(input)).rejects.toMatchObject(
      quotaRejection('emailsPerMonth', 0, 0)
    );
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('atomically reserves one unit per recipient before sending and keeps it after success', async () => {
    transport.send.mockResolvedValue({ provider: 'SMTP', providerMessageId: 'm1', rejected: [] });
    const quota = underQuota();

    const result = await inboundEmailRouter.createCaller(ctxWith(quota)).sendEmail(input);

    expect(result.status).toBe('SENT');
    expect(quota.reserve).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'emailsPerMonth', RECIPIENTS);
    expect(quota.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      transport.send.mock.invocationCallOrder[0]
    );
    expect(quota.release).not.toHaveBeenCalled();
    // The check and the increment are the single reserve call: no separate assert/increment.
    expect(quota.assertWithinQuota).not.toHaveBeenCalled();
    expect(quota.increment).not.toHaveBeenCalled();
  });

  it('releases the reservation and records FAILED when the mailbox rejects the send', async () => {
    transport.send.mockRejectedValue(new MailboxTransportError('REJECTED'));
    const quota = underQuota();

    await expect(
      inboundEmailRouter.createCaller(ctxWith(quota)).sendEmail(input)
    ).rejects.toMatchObject({
      code: 'BAD_GATEWAY',
    });
    expect(quota.release).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'emailsPerMonth', RECIPIENTS);
    expect((prismaMock.emailRecord.update as any).mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('releases the reservation and rethrows when persisting the record fails', async () => {
    (prismaMock.emailRecord.create as any).mockRejectedValue(new Error('db down'));
    const quota = underQuota();

    await expect(inboundEmailRouter.createCaller(ctxWith(quota)).sendEmail(input)).rejects.toThrow(
      'db down'
    );
    expect(transport.send).not.toHaveBeenCalled();
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('keeps the reservation and rethrows when the send succeeded but the record update fails', async () => {
    transport.send.mockResolvedValue({ provider: 'SMTP', providerMessageId: 'm1', rejected: [] });
    (prismaMock.emailRecord.update as any).mockRejectedValue(new Error('db blip'));
    const quota = underQuota();

    await expect(inboundEmailRouter.createCaller(ctxWith(quota)).sendEmail(input)).rejects.toThrow(
      'db blip'
    );
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(quota.release).not.toHaveBeenCalled();
  });

  it('releases the reservation and rethrows when the send failed and the record update fails', async () => {
    transport.send.mockRejectedValue(new MailboxTransportError('REJECTED'));
    (prismaMock.emailRecord.update as any).mockRejectedValue(new Error('db blip'));
    const quota = underQuota();

    await expect(inboundEmailRouter.createCaller(ctxWith(quota)).sendEmail(input)).rejects.toThrow(
      'db blip'
    );
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('does not mask the send outcome when the release itself fails', async () => {
    transport.send.mockRejectedValue(new MailboxTransportError('REJECTED'));
    const quota = underQuota();
    quota.release.mockRejectedValue(new Error('counter table unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      inboundEmailRouter.createCaller(ctxWith(quota)).sendEmail(input)
    ).rejects.toMatchObject({
      code: 'BAD_GATEWAY',
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('cannot send limit+1 emails when two requests race for the last unit', async () => {
    transport.send.mockResolvedValue({ provider: 'SMTP', providerMessageId: 'm1', rejected: [] });
    // One unit left: the atomic reserve admits exactly one of the two concurrent requests.
    let remaining = RECIPIENTS;
    const quota = {
      ...underQuota(),
      reserve: vi.fn(async (_t: string, key: string, by = 1) => {
        if (by > remaining) throw new QuotaExceededError(key as never, 1, 1, by);
        remaining -= by;
      }),
    };
    const caller = inboundEmailRouter.createCaller(ctxWith(quota));

    const results = await Promise.allSettled([caller.sendEmail(input), caller.sendEmail(input)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});
