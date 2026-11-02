import type { MailboxErrorCode } from '@intelliflow/domain';

/**
 * A mailbox transport failure reduced to a code (PG-207, SEC-03/SEC-05).
 *
 * The provider's own message (server banners, usernames, response lines,
 * token fragments) is never carried: callers log and store only `code`.
 */
export class MailboxTransportError extends Error {
  readonly code: MailboxErrorCode;
  /**
   * When the server refused every recipient: which ones, and which of those
   * refusals were temporary (4xx). Only addresses from our own envelope.
   */
  readonly refused?: MailboxRefusals;

  constructor(code: MailboxErrorCode, refused?: MailboxRefusals) {
    super(`Mailbox transport failed: ${code}`);
    this.name = 'MailboxTransportError';
    this.code = code;
    if (refused) this.refused = refused;
  }
}

/** Refused recipients, lower-cased; `temporary` is the 4xx subset of `rejected`. */
export interface MailboxRefusals {
  rejected: string[];
  temporary: string[];
}
