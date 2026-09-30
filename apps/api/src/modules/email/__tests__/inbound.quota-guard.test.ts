/**
 * Per-tenant metering: email.sendEmail must respect and record `emailsPerMonth`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext, mockServices, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { QuotaExceededError } from '@intelliflow/domain';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@intelliflow/adapters', () => ({
  InboundEmailParser: class MockParser {
    parse() {
      return {};
    }
  },
  createOutboundEmailService: () => ({ sendEmail: sendEmailMock }),
}));

import { inboundEmailRouter } from '../inbound.router';

const input = {
  to: ['a@example.com', 'b@example.com'],
  cc: ['c@example.com'],
  bcc: ['d@example.com'],
  subject: 'Hello',
  htmlBody: '<p>Hi</p>',
};
const RECIPIENTS = 4;

describe('email.sendEmail quota guard', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'email-1' });
    (prismaMock.emailRecord.update as any).mockResolvedValue({ id: 'email-1' });
  });

  it('rejects before persisting or sending when the monthly email quota is exhausted', async () => {
    const ctx = createTestContext({
      services: { ...mockServices, quota: overQuota('emailsPerMonth', 0, 0) as never },
    });

    await expect(inboundEmailRouter.createCaller(ctx).sendEmail(input)).rejects.toMatchObject(
      quotaRejection('emailsPerMonth', 0, 0)
    );
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('atomically reserves one unit per recipient before sending and keeps it after success', async () => {
    sendEmailMock.mockResolvedValue({ status: 'sent', messageId: 'm1' });
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await inboundEmailRouter.createCaller(ctx).sendEmail(input);

    expect(result.status).toBe('SENT');
    expect(quota.reserve).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'emailsPerMonth', RECIPIENTS);
    expect(quota.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      sendEmailMock.mock.invocationCallOrder[0]
    );
    expect(quota.release).not.toHaveBeenCalled();
    // The check and the increment are the single reserve call: no separate assert/increment.
    expect(quota.assertWithinQuota).not.toHaveBeenCalled();
    expect(quota.increment).not.toHaveBeenCalled();
  });

  it('releases the reservation when the provider reports a failure', async () => {
    sendEmailMock.mockResolvedValue({ status: 'failed', error: 'bounced', messageId: 'm1' });
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await inboundEmailRouter.createCaller(ctx).sendEmail(input);

    expect(result.status).toBe('FAILED');
    expect(quota.release).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'emailsPerMonth', RECIPIENTS);
  });

  it('releases the reservation and rethrows when persisting the record fails', async () => {
    (prismaMock.emailRecord.create as any).mockRejectedValue(new Error('db down'));
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    await expect(inboundEmailRouter.createCaller(ctx).sendEmail(input)).rejects.toThrow('db down');
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('does not mask the send outcome when the release itself fails', async () => {
    sendEmailMock.mockResolvedValue({ status: 'failed', error: 'bounced', messageId: 'm1' });
    const quota = underQuota();
    quota.release.mockRejectedValue(new Error('counter table unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await inboundEmailRouter.createCaller(ctx).sendEmail(input);

    expect(result.status).toBe('FAILED');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('cannot send limit+1 emails when two requests race for the last unit', async () => {
    sendEmailMock.mockResolvedValue({ status: 'sent', messageId: 'm1' });
    // One unit left: the atomic reserve admits exactly one of the two concurrent requests.
    let remaining = RECIPIENTS;
    const quota = {
      ...underQuota(),
      reserve: vi.fn(async (_t: string, key: string, by = 1) => {
        if (by > remaining) throw new QuotaExceededError(key as never, 1, 1, by);
        remaining -= by;
      }),
    };
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });
    const caller = inboundEmailRouter.createCaller(ctx);

    const results = await Promise.allSettled([caller.sendEmail(input), caller.sendEmail(input)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
