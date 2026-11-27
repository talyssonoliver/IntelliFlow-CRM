/**
 * MVP-011 (register #57): mail from a machine is never an enquiry. A Microsoft DMARC aggregate report
 * (dmarcreport@microsoft.com) became a lead through the unknown-sender rule and sat in "Who is waiting"
 * for 16 days. This is the guard that runs BEFORE a lead is created (mail-sync-enquiry.ts), for every
 * reader (Gmail, Microsoft, Zoho); the clean-automated-leads script applies the same address rule to
 * leads that already exist.
 *
 * The rules, in one place:
 *   Always skipped (a machine wrote it, even when it answers our mail):
 *     1. Sender local part: dmarc*, bounce*, noreply / no-reply / donotreply, postmaster,
 *        mailer-daemon, abuse, notifications, newsletters, mailer, daemon, auto-reply
 *        (see AUTOMATED_LOCAL_PART; a short list on purpose).
 *     2. Auto-Submitted header with any keyword but "no" (RFC 3834: auto-replied, auto-generated).
 *     3. Content-Type multipart/report (delivery and disposition reports), or a bare application/zip
 *        or gzip whose subject says report or dmarc (a report sent as the whole message).
 *     4. Subject in the DMARC aggregate report format ("Report Domain: x Submitter: y Report-ID: z").
 *   Skipped unless the mail is a reply to a mail we sent (a real person can carry these headers):
 *     5. List-Id or List-Unsubscribe header.
 *     6. Precedence: bulk, junk or list (and the readers' older `bulk` flag).
 *   A reply to us is a mail whose In-Reply-To or References names the Message-ID of a mail the
 *   tenant sent (replyToOurMail). It lifts rules 5 and 6 only: a bounce or an auto-reply also
 *   answers our mail, and is still a machine.
 * Readers that cannot see headers (Zoho's list API) get rules 1 and 4 only. Microsoft mailboxes that
 * already hold a delta cursor read headers once their cursor restarts (the cursor keeps its $select).
 * Mail we sent through Zoho stores no Message-ID, so a bulk-header reply to it read by another
 * provider is not recognised as a reply.
 */
import type { MailAutomationSignals } from '@intelliflow/adapters';
import type { SyncedMessage } from './mail-sync-reader';

/** Local parts that start like these once - _ . are removed (no-reply, noreply-dmarc-support, mailer-daemon). */
const FLAT_PREFIXES = [
  'noreply',
  'donotreply',
  'mailerdaemon',
  'autoreply',
  'autoresponse',
  'automailer',
];
/** The first word of the local part (before - _ . + =): postmaster, abuse@x, notifications-4821@x. */
const AUTOMATED_WORDS = new Set([
  'postmaster',
  'abuse',
  'notification',
  'notifications',
  'newsletter',
  'newsletters',
  'mailer',
  'daemon',
  'dmarc',
  'bounce',
  'bounces',
]);
/** dmarcreport, dmarcreports, dmarcrua, dmarcruf and bounce1234 as one word; dmarcus and bouncer are people. */
const AUTOMATED_WORD_PATTERN = /^(?:dmarc(?:reports?|rua|ruf)|bounces?\d+)$/;

const ARCHIVE_TYPES = new Set(['application/zip', 'application/gzip', 'application/x-gzip']);
/** A subject that names a report (the DMARC aggregate subject has its own rule). */
const REPORT_WORDS = /\b(?:dmarc|report)\b/i;

/** The DMARC aggregate report subject (RFC 7489 appendix B.2). */
const DMARC_REPORT_SUBJECT = /\breport domain:.*\bsubmitter:/i;

/** True for a DMARC aggregate report subject (also used on an old lead's first note). */
export function isDmarcReportSubject(subject: string): boolean {
  return DMARC_REPORT_SUBJECT.test(subject);
}

/** True for an address no person writes from. */
export function isAutomatedAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  const local = (at === -1 ? address : address.slice(0, at)).toLowerCase();
  const tagless = local.split(/[+=]/, 1)[0] ?? '';
  const flat = tagless.replaceAll(/[-_.]/g, '');
  if (FLAT_PREFIXES.some((prefix) => flat.startsWith(prefix))) return true;
  const word = local.split(/[-_.+=]/, 1)[0] ?? '';
  return AUTOMATED_WORDS.has(word) || AUTOMATED_WORD_PATTERN.test(word);
}

/** Why a message is always automated (rules 1 to 4), or null. */
export function machineReason(message: {
  fromAddress: string | null;
  subject: string;
  signals?: MailAutomationSignals | undefined;
}): string | null {
  if (message.fromAddress && isAutomatedAddress(message.fromAddress)) return 'automated-sender';
  const signals = message.signals;
  // The keyword, without RFC 3834 parameters or comments: `no; x-origin=human` is still `no`.
  const autoSubmitted = signals?.autoSubmitted
    ?.replaceAll(/\([^()]*\)/g, ' ') // RFC 5322 comments, leading or trailing
    .trim()
    .split(/[\s;]/, 1)[0]
    ?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return 'auto-submitted';
  const type = signals?.contentType;
  if (type === 'multipart/report') return 'report-content-type';
  // A bare archive is a person's too (plans, photos): it counts only when the subject says report.
  if (ARCHIVE_TYPES.has(type ?? '') && REPORT_WORDS.test(message.subject))
    return 'report-attachment';
  if (isDmarcReportSubject(message.subject)) return 'dmarc-report';
  return null;
}

/** Why a message is bulk (rules 5 and 6), or null. A reply to our mail lifts these. */
export function bulkReason(message: Pick<SyncedMessage, 'bulk' | 'signals'>): string | null {
  const signals = message.signals;
  if (signals?.listId) return 'list-id';
  if (signals?.listUnsubscribe) return 'list-unsubscribe';
  if (/^(bulk|junk|list)$/i.test(signals?.precedence?.trim() ?? '')) return 'precedence-bulk';
  return message.bulk ? 'bulk' : null;
}

const MAX_REFERENCED = 20;

/** The Message-IDs a reply names: In-Reply-To first, then References, as written (angle brackets kept). */
export function referencedMessageIds(signals: MailAutomationSignals | undefined): string[] {
  const idsOf = (text: string | undefined): string[] => text?.match(/<[^<>\s]+>/g) ?? [];
  const parents = idsOf(signals?.inReplyTo);
  // The direct parent always counts; the rest of the allowance is the newest of the thread (last).
  const thread = idsOf(signals?.references).filter((id) => !parents.includes(id));
  const room = Math.max(0, MAX_REFERENCED - parents.length);
  return [...new Set([...parents, ...thread.slice(-room)])].slice(0, MAX_REFERENCED);
}

/** Outbound statuses that mean our mail really left (the same set the waiting list uses). */
const SENT_STATUSES = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'];

/** True when the message answers a mail this tenant sent (its Message-ID is on a sent email record). */
export async function replyToOurMail(
  prisma: any,
  tenantId: string,
  message: Pick<SyncedMessage, 'signals'>
): Promise<boolean> {
  const ids = referencedMessageIds(message.signals);
  if (ids.length === 0) return false;
  const stored = ids.flatMap((id) => [id, id.slice(1, -1)]); // with and without the angle brackets
  const sent = await prisma.emailRecord.findFirst({
    where: {
      tenantId,
      messageIdHeader: { in: stored },
      userId: { not: null }, // a record we sent carries its sender; received mail carries none
      status: { in: SENT_STATUSES },
    },
    select: { id: true },
  });
  return !!sent;
}
