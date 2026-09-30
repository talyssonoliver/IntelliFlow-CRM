/**
 * Per-tenant metering: email.sendEmail must respect and record `emailsPerMonth`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext, mockServices, prismaMock, TEST_UUIDS } from '../../../test/setup';
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

  it('asserts one unit per recipient, sends, and records the same usage after success', async () => {
    sendEmailMock.mockResolvedValue({ status: 'sent', messageId: 'm1' });
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await inboundEmailRouter.createCaller(ctx).sendEmail(input);

    expect(result.status).toBe('SENT');
    expect(quota.assertWithinQuota).toHaveBeenCalledWith(
      TEST_UUIDS.tenant,
      'emailsPerMonth',
      RECIPIENTS
    );
    expect(quota.increment).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'emailsPerMonth', RECIPIENTS);
  });

  it('does not record usage when the provider reports a failure', async () => {
    sendEmailMock.mockResolvedValue({ status: 'failed', error: 'bounced', messageId: 'm1' });
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await inboundEmailRouter.createCaller(ctx).sendEmail(input);

    expect(result.status).toBe('FAILED');
    expect(quota.increment).not.toHaveBeenCalled();
  });

  it('does not fail an already-sent email when recording usage fails', async () => {
    sendEmailMock.mockResolvedValue({ status: 'sent', messageId: 'm1' });
    const quota = underQuota();
    quota.increment.mockRejectedValue(new Error('counter table unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await inboundEmailRouter.createCaller(ctx).sendEmail(input);

    expect(result.status).toBe('SENT');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
