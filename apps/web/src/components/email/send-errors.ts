/**
 * Coded send refusals → what compose shows (PG-207, AC-EM-018).
 *
 * The API puts `data.emailSendError = { code, mailboxErrorCode, skipped }` on
 * a refused send (see apps/api/src/modules/email/email-send-error.ts). Both
 * EmailCompose and InlineCompose read it through here, so "connect your
 * mailbox" reads the same everywhere. The server's message is never shown:
 * a transport failure may carry provider text.
 */
import {
  EMAIL_SEND_ERROR_CODES,
  MAILBOX_ERROR_CODES,
  type EmailSendErrorCode,
  type MailboxErrorCode,
} from '@intelliflow/domain';

export const EMAIL_SETTINGS_HREF = '/email/email-settings';

export interface EmailSendErrorView {
  code: EmailSendErrorCode | null;
  title: string;
  message: string;
  action: { label: string; href: string } | null;
}

const SETTINGS_ACTION = { label: 'Open Email Settings', href: EMAIL_SETTINGS_HREF };

const FAILURE_REASONS: Record<MailboxErrorCode, string> = {
  AUTH_FAILED:
    'Your mailbox refused the sign-in. Check the password or reconnect in Email Settings.',
  CONNECT_FAILED: 'Your mail server could not be reached. Please try again shortly.',
  TLS_FAILED: 'A secure connection to your mail server could not be made.',
  TIMEOUT: 'Your mail server did not respond in time. Please try again.',
  REJECTED: 'Your mail server refused this message.',
  RATE_LIMITED:
    'You have reached the hourly sending limit for your mailbox. Please try again later.',
  TOKEN_REVOKED: 'Access to your mailbox was revoked. Reconnect it in Email Settings.',
  ATTACHMENT_UNAVAILABLE: 'An attachment could not be read. Remove it, attach it again and resend.',
};

const GENERIC: EmailSendErrorView = {
  code: null,
  title: 'Email not sent',
  message: 'Something went wrong while sending. Please try again.',
  action: null,
};

interface SendErrorData {
  code: EmailSendErrorCode;
  mailboxErrorCode: MailboxErrorCode | null;
  skipped: string[];
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function readSendError(error: unknown): SendErrorData | null {
  const raw = (error as { data?: { emailSendError?: unknown } } | null | undefined)?.data
    ?.emailSendError as Partial<SendErrorData> | null | undefined;
  if (!raw || typeof raw !== 'object' || !isOneOf(EMAIL_SEND_ERROR_CODES, raw.code)) return null;
  return {
    code: raw.code,
    mailboxErrorCode: isOneOf(MAILBOX_ERROR_CODES, raw.mailboxErrorCode)
      ? raw.mailboxErrorCode
      : null,
    skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((s) => typeof s === 'string') : [],
  };
}

/** The message, title and follow-up link for a failed send. */
export function getEmailSendError(error: unknown): EmailSendErrorView {
  const data = readSendError(error);
  if (!data) return GENERIC;
  switch (data.code) {
    case 'NO_MAILBOX':
      return {
        code: data.code,
        title: 'Connect your mailbox to send',
        message:
          'Email is sent from your own mailbox. Connect it in Email Settings, then send again.',
        action: SETTINGS_ACTION,
      };
    case 'MAILBOX_ERROR':
      return {
        code: data.code,
        title: 'Reconnect your mailbox',
        message: 'Your mailbox stopped working. Reconnect it in Email Settings, then send again.',
        action: SETTINGS_ACTION,
      };
    case 'ALL_SUPPRESSED':
      return {
        code: data.code,
        title: 'Email not sent',
        message: `Every recipient is on the suppression list, so nothing was sent: ${data.skipped.join(', ')}.`,
        action: null,
      };
    case 'SEND_FAILED': {
      const reason = data.mailboxErrorCode ? FAILURE_REASONS[data.mailboxErrorCode] : null;
      const needsSettings =
        data.mailboxErrorCode === 'AUTH_FAILED' || data.mailboxErrorCode === 'TOKEN_REVOKED';
      return {
        code: data.code,
        title: 'Email not sent',
        message: reason ?? GENERIC.message,
        action: needsSettings ? SETTINGS_ACTION : null,
      };
    }
  }
}

/** What a coded mailbox failure means, for send errors and connection tests alike. */
export function mailboxErrorMessage(code: MailboxErrorCode): string {
  return FAILURE_REASONS[code];
}

/** The notice after a send that skipped suppressed recipients, or null. */
export function skippedRecipientsNotice(skipped: readonly string[] | undefined): string | null {
  if (!skipped || skipped.length === 0) return null;
  const count = skipped.length;
  const who = count === 1 ? '1 recipient was' : `${count} recipients were`;
  return `Sent. ${who} skipped because they are on the suppression list: ${skipped.join(', ')}.`;
}
