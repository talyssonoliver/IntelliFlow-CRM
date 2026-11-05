/**
 * What a failed connection test most likely means, in plain words, with the way
 * forward. The server only reports a coded reason (its own text is never kept), so
 * this names the likely cause rather than claiming a certain one.
 */
import type { MailboxErrorCode } from '@intelliflow/domain';
import { mailboxErrorMessage } from '@/components/email/send-errors';
import type { MailboxProvider } from './mailbox-providers';

const PORT_ADVICE = 'Port 465 goes with SSL/TLS, and port 587 with STARTTLS.';

export function connectionFailureHelp(
  code: MailboxErrorCode,
  provider: MailboxProvider | undefined
): string {
  switch (code) {
    case 'AUTH_FAILED':
      return [
        'The mail server refused the sign-in.',
        provider?.refusalHelp ?? 'Check your email address and password.',
      ].join(' ');
    case 'CONNECT_FAILED':
      return [
        'The mail server could not be reached.',
        provider?.id === 'zoho'
          ? 'Check the server matches your Zoho region, under Advanced.'
          : 'Check the server name for typing mistakes, under Advanced.',
      ].join(' ');
    case 'TLS_FAILED':
      return `A secure connection could not be made. The port and security setting probably do not match, under Advanced. ${PORT_ADVICE}`;
    case 'TIMEOUT':
      return 'The mail server did not answer in time. It may not accept connections on this port: try the other one under Advanced, or try again shortly.';
    default:
      return mailboxErrorMessage(code);
  }
}
