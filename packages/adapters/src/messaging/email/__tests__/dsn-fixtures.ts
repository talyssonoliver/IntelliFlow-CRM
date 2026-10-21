/**
 * Runtime-built delivery-status notifications for PG-207 tests. No real bounce
 * mail is committed: every address and host is *.example.invalid.
 */
export interface MakeDsnOptions {
  recipients?: Array<{ address: string; action: string; status: string; diagnostic?: string }>;
  recordId?: string | null;
  messageId?: string | null;
  /** 'rfc822' embeds the whole original message; 'headers' only its headers. */
  originalAs?: 'rfc822' | 'headers' | 'none';
  reportType?: string;
  topContentType?: string;
  extraParts?: number;
  crlf?: boolean;
}

export function makeDsn(options: MakeDsnOptions = {}): string {
  const {
    recipients = [{ address: 'gone@example.invalid', action: 'failed', status: '5.1.1' }],
    recordId = 'crec123',
    messageId = '<crec123.1@mail.example.invalid>',
    originalAs = 'headers',
    reportType = 'delivery-status',
    topContentType,
    extraParts = 0,
    crlf = false,
  } = options;
  const b = 'BOUNDARY_PG207';
  const originalHeaders = [
    'From: me@mail.example.invalid',
    'To: gone@example.invalid',
    'Subject: Hello',
    ...(messageId ? [`Message-ID: ${messageId}`] : []),
    ...(recordId ? [`X-IntelliFlow-Record: ${recordId}`] : []),
  ].join('\n');
  const perRecipient = recipients
    .map((r) =>
      [
        `Final-Recipient: rfc822; ${r.address}`,
        `Action: ${r.action}`,
        `Status: ${r.status}`,
        ...(r.diagnostic ? [`Diagnostic-Code: smtp; ${r.diagnostic}`] : []),
      ].join('\n')
    )
    .join('\n\n');
  const parts = [
    `--${b}\nContent-Type: text/plain; charset=utf-8\n\nThis message could not be delivered.\n`,
    `--${b}\nContent-Type: message/delivery-status\n\nReporting-MTA: dns; mta.example.invalid\nArrival-Date: Mon, 19 Oct 2026 10:00:00 +0000\n\n${perRecipient}\n`,
  ];
  if (originalAs === 'rfc822') {
    parts.push(`--${b}\nContent-Type: message/rfc822\n\n${originalHeaders}\n\nOriginal body\n`);
  } else if (originalAs === 'headers') {
    parts.push(`--${b}\nContent-Type: text/rfc822-headers\n\n${originalHeaders}\n`);
  }
  for (let i = 0; i < extraParts; i++) {
    parts.push(`--${b}\nContent-Type: text/plain\n\nfiller ${i}\n`);
  }
  const top = topContentType ?? `multipart/report; report-type=${reportType}; boundary="${b}"`;
  const raw = [
    'From: Mail Delivery Subsystem <mailer-daemon@mta.example.invalid>',
    'To: me@mail.example.invalid',
    'Subject: Delivery Status Notification (Failure)',
    `Content-Type: ${top}`,
    '',
    ...parts,
    `--${b}--`,
    '',
  ].join('\n');
  return crlf ? raw.replace(/\n/g, '\r\n') : raw;
}
