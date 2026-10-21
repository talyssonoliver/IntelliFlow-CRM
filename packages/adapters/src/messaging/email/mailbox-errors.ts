import type { MailboxErrorCode } from '@intelliflow/domain';

/**
 * A mailbox transport failure reduced to a code (PG-207, SEC-03/SEC-05).
 *
 * The provider's own message (server banners, usernames, response lines,
 * token fragments) is never carried: callers log and store only `code`.
 */
export class MailboxTransportError extends Error {
  readonly code: MailboxErrorCode;

  constructor(code: MailboxErrorCode) {
    super(`Mailbox transport failed: ${code}`);
    this.name = 'MailboxTransportError';
    this.code = code;
  }
}
