/**
 * DSAR emails (PG-203, spec Addendum A; compliance R3/R4 wording).
 *
 * Fixed templates only. Nothing a visitor typed (details, names) is ever interpolated: the
 * address is unverified until the link is used, so anyone could aim a request at any inbox.
 * The firm name and any reason an admin typed are HTML-escaped and stripped of line breaks
 * in subjects. Tokens appear only in the URL fragment of a link the service built. Every
 * completion and rejection names the right to complain to the ICO. A failed send is logged
 * with the notice kind and the error class only, never an address, and never throws.
 */
import type { DsarNotice, DsarNotificationPort } from '@intelliflow/application';
import type { DsarRequestType, DsarWithheldCategory } from '@intelliflow/domain';
import { escapeHtml, stripLineBreaks } from '../../security/html-escape';

export interface EmailMessage {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface EmailSender {
  sendEmail(options: EmailMessage): Promise<{ isFailure: boolean; error?: unknown }>;
}

const TYPE_LABELS: Record<DsarRequestType, string> = {
  ACCESS: 'a copy of your personal data',
  PORTABILITY: 'your personal data in a portable format',
  RECTIFICATION: 'a correction to your personal data',
  ERASURE: 'erasure of your personal data',
  RESTRICTION: 'a restriction of the processing of your personal data',
  OBJECTION: 'an objection to the processing of your personal data',
};

const WITHHELD_LABELS: Record<DsarWithheldCategory, string> = {
  NOTES: 'Notes',
  ACTIVITY_TEXT: 'Activity descriptions',
  TICKET_SUBJECTS: 'Support ticket subjects',
  MESSAGE_BODIES: 'Message contents',
  DOCUMENTS: 'Documents',
  DESCRIPTIONS: 'Deal and task descriptions',
  AI_TEXT: 'Text written by AI, such as insights and recommendations',
  STAFF_TEXT: 'Tags, qualification notes and booking answers',
  OTHER_RECORDS: 'Calendar events, notifications and experiment records',
  EXCESS_ROWS: 'Records beyond the export limit',
};

const ICO =
  'If you are not satisfied, you can complain to the Information Commissioner’s Office (ico.org.uk) and you can seek a judicial remedy.';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * One paragraph per line. Lines are plain text; `link` is rendered as an anchor whose href
 * and text are both escaped.
 */
function message(
  to: string[],
  subject: string,
  lines: string[],
  link?: { label: string; url: string }
): EmailMessage {
  const text = [...lines];
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`);
  if (link) {
    text.push('', `${link.label}: ${link.url}`);
    html.push(`<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`);
  }
  return {
    to,
    subject: stripLineBreaks(subject),
    textBody: text.join('\n'),
    htmlBody: html.join('\n'),
  };
}

/** The message for a notice to the person (every kind except the admin alert). */
export function buildDsarEmail(
  notice: Exclude<DsarNotice, { kind: 'ADMIN_NEW_REQUEST' }>
): EmailMessage {
  const firm = stripLineBreaks(notice.firmName);
  const to = [notice.to];
  switch (notice.kind) {
    case 'VERIFY_LINK':
      return message(
        to,
        `Confirm your data request to ${firm}`,
        [
          `Someone asked ${firm} for ${TYPE_LABELS[notice.type]}, giving this email address.`,
          `If it was you, confirm the request with the link below before ${formatDateTime(notice.expiresAt)} (UTC). The firm has one month from your confirmation to respond.`,
          'If it was not you, ignore this email and nothing will happen.',
        ],
        { label: 'Confirm my request', url: notice.link }
      );
    case 'VERIFIED':
      return message(to, `${firm} received your data request`, [
        `Your request for ${TYPE_LABELS[notice.type]} is confirmed.`,
        `${firm} must respond by ${formatDate(notice.dueDate)}.`,
      ]);
    case 'EXPORT_LINK':
      return message(
        to,
        `Your personal data from ${firm}`,
        [
          `Your data from ${firm} is ready. The link below works until ${formatDateTime(notice.expiresAt)} (UTC) and can be used a limited number of times.`,
          ...(notice.withheld
            ? [
                'Some information, such as staff notes, messages and documents, is not in this file yet while the firm reviews it. You will receive it, or an explanation of what is withheld and why, by the due date.',
              ]
            : []),
          'Keep this email private: anyone with the link can download the file.',
          ICO,
        ],
        { label: 'Download my data', url: notice.link }
      );
    case 'EXTENDED':
      return message(to, `${firm} needs more time for your data request`, [
        `${firm} has extended the time to respond to your request for ${TYPE_LABELS[notice.type]}, as the law allows for complex or numerous requests.`,
        `The new due date is ${formatDate(notice.newDueDate)}.`,
        `The firm’s reason: ${stripLineBreaks(notice.reason)}`,
        ICO,
      ]);
    case 'COMPLETED':
      return message(to, `${firm} has completed your data request`, [
        `${firm} has completed your request for ${TYPE_LABELS[notice.type]}.`,
        ...(notice.marketingStopped
          ? [
              'Your objection is recorded and the firm has confirmed that marketing to you has stopped.',
            ]
          : []),
        // Art 12(4), 15(4): what was withheld from the copy, and the firm's reason for each.
        ...(notice.withheld.length > 0
          ? [
              'The firm withheld some information from your copy. What it withheld, and why:',
              ...notice.withheld.map(
                (w) => `${WITHHELD_LABELS[w.category]} (${w.count}): ${stripLineBreaks(w.reason)}`
              ),
            ]
          : []),
        ICO,
      ]);
    case 'REJECTED':
      return message(to, `${firm} has refused your data request`, [
        `${firm} has refused your request for ${TYPE_LABELS[notice.type]}.`,
        `The firm’s reason: ${stripLineBreaks(notice.reason)}`,
        ...(notice.late
          ? ['This answer was given after the one-month deadline for responding.']
          : []),
        ICO,
      ]);
    case 'RESTRICTION_LIFTING':
      return message(to, `${firm} is lifting a restriction on your data`, [
        `${firm} is about to lift the restriction on the processing of your personal data. After this, the firm may process your data again as before.`,
        ICO,
      ]);
    case 'ERASURE_LOGGED':
      return message(to, `${firm} has recorded an erasure request`, [
        `${firm} has recorded a request, made in person, by phone or by post, to erase your personal data.`,
        'If you did not make this request, contact the firm straight away so it can stop it.',
      ]);
    case 'ERASURE_CANCELLED':
      return message(to, `${firm} has cancelled an erasure request`, [
        `${firm} has cancelled the request to erase your personal data. Nothing was erased.`,
        `The firm’s reason: ${stripLineBreaks(notice.reason)}`,
        ICO,
      ]);
  }
}

/** The firm's admins hear a request arrived: type and due date only, no personal data. */
export function buildAdminNewRequestEmail(
  notice: Extract<DsarNotice, { kind: 'ADMIN_NEW_REQUEST' }>,
  to: string[]
): EmailMessage {
  return message(to, 'New data subject request', [
    `A new data subject request (${notice.type.toLowerCase()}) is confirmed and waiting in Settings, Privacy requests.`,
    `It must be answered by ${formatDate(notice.dueDate)}.`,
  ]);
}

/**
 * A VERIFIED request is inside 7 days of its effective deadline, or past it (plan D8). The
 * firm's admins get the type, the deadline, the request reference and the page: never the
 * person's address or anything they typed.
 */
export function buildAdminSlaEmail(
  alert: {
    requestId: string;
    type: DsarRequestType;
    deadline: Date;
    overdue: boolean;
    pageUrl: string;
  },
  to: string[]
): EmailMessage {
  const kind = alert.type.toLowerCase();
  const due = formatDate(alert.deadline);
  const lines = alert.overdue
    ? [
        `A data subject request (${kind}) passed its deadline on ${due} and is still open.`,
        'The time limit in UK GDPR Article 12(3) has passed: answer it now and record why it was late.',
      ]
    : [`A data subject request (${kind}) must be answered by ${due}.`];
  return message(
    to,
    alert.overdue ? 'Data subject request overdue' : 'Data subject request due soon',
    [...lines, `Request reference: ${alert.requestId}.`],
    { label: 'Open privacy requests', url: alert.pageUrl }
  );
}

/** True when the provider accepted the message. Logs the kind and error class only. */
export async function deliverDsarEmail(
  sender: EmailSender,
  email: EmailMessage,
  kind: string,
  log: Pick<Console, 'warn'> = console
): Promise<boolean> {
  try {
    const result = await sender.sendEmail(email);
    if (!result.isFailure) return true;
    log.warn('[dsar] Email was not sent', { kind });
  } catch (error) {
    log.warn('[dsar] Email failed', {
      kind,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
  return false;
}

export function createDsarEmailNotifier(deps: {
  sender: EmailSender | undefined;
  /** The firm's active ADMIN addresses (PrismaDsarRepository.adminEmails). */
  adminEmails: (tenantId: string) => Promise<string[]>;
}): DsarNotificationPort {
  return {
    async send(notice: DsarNotice): Promise<boolean> {
      const { sender } = deps;
      if (!sender) {
        console.warn('[dsar] No email sender configured', { kind: notice.kind });
        return false;
      }
      if (notice.kind !== 'ADMIN_NEW_REQUEST') {
        return deliverDsarEmail(sender, buildDsarEmail(notice), notice.kind);
      }
      try {
        const admins = await deps.adminEmails(notice.tenantId);
        if (admins.length === 0) {
          console.error('[dsar] No admin to alert about a new request', {
            tenantId: notice.tenantId,
          });
          return false;
        }
        return await deliverDsarEmail(
          sender,
          buildAdminNewRequestEmail(notice, admins),
          notice.kind
        );
      } catch (error) {
        console.warn('[dsar] Admin alert failed', {
          kind: notice.kind,
          error: error instanceof Error ? error.name : 'unknown',
        });
        return false;
      }
    },
  };
}
