/**
 * MVP-011: a first email from someone who is not yet a lead or contact is a new enquiry (split out
 * of the sync engine, outlook-inbox-sync.ts, to keep it within its size limit).
 * - Only received mail (the Inbox) from a real person: never mail the owner sent, mail from the
 *   tenant's own domains, no-reply and mailer-daemon senders, or bulk mail (a List-Unsubscribe or
 *   Precedence: bulk header, where the reader sees headers). Spam and Junk folders are never read.
 * - The lead is created through the lead use case (LeadService.createLead: tenant scoped, domain
 *   events, one lead per email per tenant) with source EMAIL, assigned to the mailbox's owner, and
 *   the subject kept as its first note. A sender already a lead is matched before this runs, so
 *   the same sender twice gives one lead and the second mail lands on it.
 * - At most MAX_ENQUIRIES_PER_RUN leads per sync run: a backlog cannot flood the list.
 */
import { isPersonalMailDomain } from './mailbox-provider-hint';
import type { SyncFolder, SyncedMessage } from './mail-sync-reader';

export const MAX_ENQUIRIES_PER_RUN = 50;

/** The lead use case's createLead, as the sync needs it. */
export type CreateLead = (
  props: {
    email: string;
    firstName?: string;
    lastName?: string;
    source: 'EMAIL';
    ownerId: string;
    tenantId: string;
  },
  opts?: { note?: { content: string; author: string } }
) => Promise<{ isFailure: boolean; value?: { id: { value: string } } }>;

export interface EnquiryDeps {
  prisma: any;
  createLead?: CreateLead;
}

export interface EnquiryMailbox {
  id: string;
  tenantId: string;
  userId: string | null;
  accountAddress: string | null;
  fromAddress: string;
}

const AUTOMATED_LOCAL_PART =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|newsletters?|mailer|daemon|auto[-_.]?(reply|response|mailer))([-_.+=].*)?$/i;
/** One @, no spaces, and a dot in the domain after at least one character. */
function isAddress(value: string): boolean {
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@') || value.includes(' ')) return false;
  const dot = value.indexOf('.', at + 2);
  return dot !== -1 && dot < value.length - 1;
}

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase();
}

/** True for an address no person writes from: no-reply, mailer-daemon and the like. */
export function isAutomatedAddress(address: string): boolean {
  return AUTOMATED_LOCAL_PART.test(address.slice(0, address.lastIndexOf('@')));
}

/** The mail looks like a person's own message to this mailbox (no database needed). */
export function looksLikeEnquiry(
  mailbox: EnquiryMailbox,
  message: SyncedMessage,
  folder: SyncFolder
): boolean {
  const from = message.fromAddress?.trim().toLowerCase();
  if (folder !== 'inbox' || !from || !isAddress(from)) return false;
  if (message.bulk) return false;
  if (isAutomatedAddress(from)) return false;
  const own = (mailbox.accountAddress ?? mailbox.fromAddress).toLowerCase();
  return from !== own;
}

/** True when the sender's domain is one of the tenant's own mailbox domains (a free provider's never is). */
async function fromOwnDomain(deps: EnquiryDeps, mailbox: EnquiryMailbox, from: string) {
  const domain = domainOf(from);
  if (isPersonalMailDomain(domain)) return false;
  const rows: Array<{ accountAddress: string | null; fromAddress: string | null }> =
    await deps.prisma.emailMailbox.findMany({
      where: { tenantId: mailbox.tenantId },
      select: { accountAddress: true, fromAddress: true },
    });
  const own = [mailbox.accountAddress, mailbox.fromAddress].concat(
    rows.flatMap((row) => [row.accountAddress, row.fromAddress])
  );
  return own.some((address) => !!address && domainOf(address) === domain);
}

/** True when the sender is eligible and the tenant can take another enquiry this run. */
export async function isEnquirySender(
  deps: EnquiryDeps,
  mailbox: EnquiryMailbox,
  message: SyncedMessage,
  folder: SyncFolder
): Promise<boolean> {
  if (!deps.createLead || !mailbox.userId) return false;
  if (!looksLikeEnquiry(mailbox, message, folder)) return false;
  return !(await fromOwnDomain(deps, mailbox, message.fromAddress!.trim().toLowerCase()));
}

function nameParts(fromName: string | null): { firstName?: string; lastName?: string } {
  const words = (fromName ?? '')
    .replace(/["<>@]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const [first, ...rest] = words;
  if (!first || first.includes('.')) return {}; // an address, not a name
  const last = rest.join(' ');
  return { firstName: first.slice(0, 100), ...(last ? { lastName: last.slice(0, 100) } : {}) };
}

/** Creates the enquiry's lead; its id, or null when the lead use case refuses (the mail is skipped). */
export async function createEnquiryLead(
  deps: EnquiryDeps,
  mailbox: EnquiryMailbox,
  message: SyncedMessage
): Promise<string | null> {
  const email = message.fromAddress!.trim().toLowerCase();
  const subject = message.subject.replaceAll('\u0000', '').trim().slice(0, 200);
  const result = await deps.createLead!(
    {
      email,
      ...nameParts(message.fromName),
      source: 'EMAIL',
      ownerId: mailbox.userId!,
      tenantId: mailbox.tenantId,
    },
    { note: { content: `Email enquiry: ${subject || '(No subject)'}`, author: 'System' } }
  );
  if (!result.isFailure && result.value) return result.value.id.value;
  // A refusal may be a race: another round created this lead meanwhile. Use that one.
  const existing = await deps.prisma.lead.findFirst({
    where: { tenantId: mailbox.tenantId, email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  return existing?.id ?? null;
}
