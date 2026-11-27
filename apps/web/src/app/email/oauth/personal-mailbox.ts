/**
 * Personal (consumer-domain) mailboxes: the server refuses to connect one until the user confirms
 * (apps/api/src/modules/email/mailbox-connect-policy.ts). It answers PERSONAL_MAILBOX:<SCOPE>: ...;
 * the sign-in page and the SMTP form turn that into this question.
 */
export const PERSONAL_MAILBOX_NOTICE =
  'This looks like a personal mailbox. Aurora will import mail with your leads and contacts. Continue?';

export type PersonalRefusal = { scope: 'USER' | 'TENANT' };

/** The scope of a personal-mailbox refusal, or null for any other error message. */
export function parsePersonalRefusal(message: unknown): PersonalRefusal | null {
  if (typeof message !== 'string') return null;
  const match = /^PERSONAL_MAILBOX:(USER|TENANT):/.exec(message);
  return match ? { scope: match[1] as 'USER' | 'TENANT' } : null;
}
