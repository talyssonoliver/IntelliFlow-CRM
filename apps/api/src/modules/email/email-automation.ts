/**
 * Email automation helpers (PG-207, playbook §8–§9).
 *
 * `notifySenderOnBounce` is consumed here: when a sent email bounces, the
 * sender gets an in-app `email_bounced` notification. The remote server's
 * diagnostic text is never put in the notification (CA-19).
 */
export interface EmailBounceNotification {
  tenantId: string;
  userId: string;
  emailRecordId: string;
  recipient: string;
}

export interface EmailBounceNotificationParams {
  tenantId: string;
  userId: string;
  type: 'email_bounced';
  title: string;
  body: string;
  entityType: 'email';
  entityId: string;
  actionUrl: string;
  priority: 'normal';
}

export type EmailNotificationCreator = (params: EmailBounceNotificationParams) => Promise<unknown>;

export async function notifyEmailBounced(
  args: EmailBounceNotification,
  flags: { notifySenderOnBounce: boolean },
  createNotification: EmailNotificationCreator
): Promise<void> {
  if (!flags.notifySenderOnBounce) return;
  await createNotification({
    tenantId: args.tenantId,
    userId: args.userId,
    type: 'email_bounced',
    title: `Email to ${args.recipient} bounced`,
    body: 'Your email could not be delivered to this address. Check the address or contact them another way.',
    entityType: 'email',
    entityId: args.emailRecordId,
    actionUrl: `/email/${args.emailRecordId}`,
    priority: 'normal',
  });
}
