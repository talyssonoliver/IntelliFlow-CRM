import { describe, expect, it, vi } from 'vitest';
import { notifyEmailBounced } from '../email-automation';

const n = {
  tenantId: 't1',
  userId: 'u1',
  emailRecordId: 'rec1',
  recipient: 'gone@example.invalid',
};

describe('notifyEmailBounced', () => {
  it('does nothing when notifySenderOnBounce is off', async () => {
    const create = vi.fn();
    await notifyEmailBounced(n, { notifySenderOnBounce: false }, create);
    expect(create).not.toHaveBeenCalled();
  });

  it('tells the sender which address bounced, linking to the email, without any diagnostic text', async () => {
    const create = vi.fn(async () => undefined);
    await notifyEmailBounced(n, { notifySenderOnBounce: true }, create);
    expect(create).toHaveBeenCalledWith({
      tenantId: 't1',
      userId: 'u1',
      type: 'email_bounced',
      title: 'Email to gone@example.invalid bounced',
      body: 'Your email could not be delivered to this address. Check the address or contact them another way.',
      entityType: 'email',
      entityId: 'rec1',
      actionUrl: '/email/rec1',
      priority: 'normal',
    });
  });
});
