/**
 * Runtime-built delivery-status notification for the bounce-reader tests.
 * The API package cannot import the adapters' test fixtures (outside its
 * rootDir), so it builds the minimal RFC 3464 report it needs here. Every
 * address and host is *.example.invalid; no real bounce mail is committed.
 */
export interface DsnRecipient {
  address: string;
  action: string;
  status: string;
}

/** What a receiving provider stamps on a genuine bounce from mta.example.invalid. */
export const PASSING_AUTH =
  'mx.example.invalid; dkim=pass header.d=mta.example.invalid; spf=pass smtp.helo=mta.example.invalid';

export function makeDsn(
  options: {
    recipients?: DsnRecipient[];
    recordId?: string | null;
    messageId?: string | null;
    /** The report's From (default: the reporting MTA's mailer-daemon). */
    from?: string;
    /** Authentication-Results headers, topmost first (default: passing). null: none. */
    authenticationResults?: string[] | null;
  } = {}
): string {
  const recipients = options.recipients ?? [
    { address: 'gone@example.invalid', action: 'failed', status: '5.1.1' },
  ];
  const recordId = options.recordId === undefined ? 'crec123' : options.recordId;
  const messageId =
    options.messageId === undefined ? '<crec123.1@mail.example.invalid>' : options.messageId;
  const boundary = 'PG207_API_DSN';
  const original = [
    'From: me@mail.example.invalid',
    'To: gone@example.invalid',
    'Subject: Hello',
    messageId ? `Message-ID: ${messageId}` : null,
    recordId ? `X-IntelliFlow-Record: ${recordId}` : null,
  ].filter((line): line is string => line !== null);
  const status = recipients.flatMap((r) => [
    '',
    `Final-Recipient: rfc822; ${r.address}`,
    `Action: ${r.action}`,
    `Status: ${r.status}`,
  ]);
  const authenticationResults =
    options.authenticationResults === undefined ? [PASSING_AUTH] : options.authenticationResults;
  return [
    ...(authenticationResults ?? []).map((value) => `Authentication-Results: ${value}`),
    `From: ${options.from ?? 'Mail Delivery Subsystem <mailer-daemon@mta.example.invalid>'}`,
    'To: me@mail.example.invalid',
    'Subject: Undelivered Mail Returned to Sender',
    'MIME-Version: 1.0',
    `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'This message could not be delivered.',
    `--${boundary}`,
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; mta.example.invalid',
    ...status,
    `--${boundary}`,
    'Content-Type: text/rfc822-headers',
    '',
    ...original,
    `--${boundary}--`,
    '',
  ].join('\n');
}
