/**
 * Machine-readable refusals of user-mail sends (PG-207, AC-EM-018).
 *
 * Kept free of adapter imports: trpc.ts's errorFormatter reads the cause to
 * give the web `data.emailSendError`, so compose can show "Connect your
 * mailbox" instead of a generic failure.
 */
import { TRPCError } from '@trpc/server';
import {
  EMAIL_SEND_ERROR_CODES,
  type EmailSendErrorCode,
  type MailboxErrorCode,
} from '@intelliflow/domain';

interface SendErrorCause {
  emailSendError: EmailSendErrorCode;
  mailboxErrorCode: MailboxErrorCode | null;
  skipped: string[];
}

export interface EmailSendErrorData {
  code: EmailSendErrorCode;
  mailboxErrorCode: MailboxErrorCode | null;
  skipped: string[];
}

const SEND_ERROR_CODES: ReadonlySet<string> = new Set(EMAIL_SEND_ERROR_CODES);

const MESSAGES: Record<EmailSendErrorCode, string> = {
  NO_MAILBOX: 'Connect your mailbox in Email Settings to send email.',
  MAILBOX_ERROR: 'Your mailbox needs to be reconnected in Email Settings before you can send.',
  ALL_SUPPRESSED: 'Every recipient is on the suppression list, so nothing was sent.',
  SEND_FAILED: 'Your mailbox could not send this email.',
};

export function emailSendError(
  code: EmailSendErrorCode,
  extra: { mailboxErrorCode?: MailboxErrorCode | null; skipped?: string[] } = {}
): TRPCError {
  const cause: SendErrorCause & Error = Object.assign(new Error(code), {
    emailSendError: code,
    mailboxErrorCode: extra.mailboxErrorCode ?? null,
    skipped: extra.skipped ?? [],
  });
  return new TRPCError({
    code: code === 'SEND_FAILED' ? 'BAD_GATEWAY' : 'PRECONDITION_FAILED',
    message: `${code}: ${MESSAGES[code]}`,
    cause,
  });
}

/** The send refusal carried in a TRPCError cause, or null. */
export function emailSendErrorFromCause(cause: unknown): EmailSendErrorData | null {
  const c = cause as Partial<SendErrorCause> | null | undefined;
  if (!c || typeof c.emailSendError !== 'string' || !SEND_ERROR_CODES.has(c.emailSendError)) {
    return null;
  }
  return {
    code: c.emailSendError,
    mailboxErrorCode: c.mailboxErrorCode ?? null,
    skipped: Array.isArray(c.skipped) ? c.skipped : [],
  };
}
