/**
 * MVP-012 PR C: when a received mail is logged on a lead or contact, Aurora drafts a reply for the
 * user to check. This queues AI_REPLY_DRAFT with the real thread, the stored mails of the same
 * conversation in that mailbox. The job writes a DRAFT, which waits on the lead's Emails tab or
 * the contact page; nothing is sent without the user's click (ADR-037).
 *
 * Kept out of the sync engine (outlook-inbox-sync.ts), which calls it once after storing a mail.
 * It never fails the sync: a draft is a convenience, so any error here is logged and dropped.
 * - Only received mail (Inbox), only with a lead or contact, and only when the tenant's reply
 *   drafting is on (a tenant that never saved the setting gets the default, see reply-drafting).
 * - One draft per conversation at a time: a new mail in a thread with a draft waiting, or one still
 *   being written (a BullMQ deduplication id held until that job ends), queues no other, so a long
 *   thread is not drafted (and paid for) over and over. Mail with no conversation id is judged on
 *   its own (codex): an unrelated draft for the same person never holds it back.
 * - The job id is the stored mail's record id, so a retried sync never queues the same mail twice.
 */
import { replyDraftingEnabled } from '@intelliflow/domain';
import { enqueueOneShot } from '../../lib/queue-producer';
import type { SyncFolder, SyncedMessage } from './mail-sync-reader';

/** Mails of the conversation sent to the model: the latest ones, oldest first. */
export const THREAD_LIMIT = 10;
/** Each mail's body is cut to this many characters before it is queued. */
const BODY_LIMIT = 4000;

export interface ReplyDraftDeps {
  prisma: any;
}

export interface ReplyDraftMailbox {
  id: string;
  tenantId: string;
  userId: string | null;
}

interface StoredMail {
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: Date;
}

/** The conversation's stored mails in this mailbox, oldest first (the just-stored one included). */
async function threadOf(
  deps: ReplyDraftDeps,
  mailbox: ReplyDraftMailbox,
  message: SyncedMessage,
  recordId: string
): Promise<StoredMail[]> {
  const select = { fromEmail: true, toEmail: true, subject: true, body: true, createdAt: true };
  const where = message.conversationId
    ? {
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.id,
        metadata: { path: ['conversationId'], equals: message.conversationId },
      }
    : { tenantId: mailbox.tenantId, id: recordId };
  const latest: StoredMail[] = await deps.prisma.emailRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: THREAD_LIMIT,
    select,
  });
  return latest.reverse();
}

/** A draft already waiting for this conversation (and person): no second one is queued. */
async function draftWaiting(
  deps: ReplyDraftDeps,
  tenantId: string,
  subject: { contactId: string } | { leadId: string },
  conversationId: string
): Promise<boolean> {
  const waiting = await deps.prisma.contactReplyDraft.findFirst({
    where: { tenantId, ...subject, status: 'DRAFT', emailThreadId: conversationId },
    select: { id: true },
  });
  return waiting !== null;
}

/** The deduplication id of a conversation's draft: tenant, person and conversation. */
function conversationKey(
  tenantId: string,
  subject: { contactId: string } | { leadId: string },
  conversationId: string
): string {
  const person = 'contactId' in subject ? `contact:${subject.contactId}` : `lead:${subject.leadId}`;
  return `reply-draft:${tenantId}:${person}:${conversationId}`;
}

/** Who the draft answers. A contact wins when the sender is both: it waits where the mail was logged. */
function draftSubject(party: {
  contactId: string | null;
  leadId: string | null;
}): { contactId: string } | { leadId: string } | null {
  if (party.contactId) return { contactId: party.contactId };
  if (party.leadId) return { leadId: party.leadId };
  return null;
}

/**
 * Queues a reply draft for a received mail just stored on a lead or contact, when the tenant drafts
 * replies. Never throws.
 */
export async function queueReplyDraftForSyncedMail(
  deps: ReplyDraftDeps,
  mailbox: ReplyDraftMailbox,
  message: SyncedMessage,
  folder: SyncFolder,
  party: { contactId: string | null; leadId: string | null },
  recordId: string
): Promise<boolean> {
  if (folder !== 'inbox') return false;
  const subject = draftSubject(party);
  if (!subject) return false;
  try {
    const setting = await deps.prisma.contactAutomationSetting.findUnique({
      where: { tenantId: mailbox.tenantId },
      select: { aiAutoReplyDrafting: true },
    });
    if (!replyDraftingEnabled(setting?.aiAutoReplyDrafting)) return false;
    const conversationId = message.conversationId;
    if (conversationId && (await draftWaiting(deps, mailbox.tenantId, subject, conversationId))) {
      return false;
    }
    const thread = await threadOf(deps, mailbox, message, recordId);
    if (thread.length === 0) return false;
    const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
    await enqueueOneShot(
      QUEUE_NAMES.AI_REPLY_DRAFT,
      'draft',
      {
        ...subject,
        tenantId: mailbox.tenantId,
        ...(message.conversationId ? { emailThreadId: message.conversationId } : {}),
        emailThread: thread.map((mail) => ({
          from: mail.fromEmail,
          to: mail.toEmail,
          subject: mail.subject,
          body: mail.body.slice(0, BODY_LIMIT),
          at: mail.createdAt.toISOString(),
        })),
        ...(mailbox.userId ? { createdBy: mailbox.userId } : {}),
      },
      {
        // One job per stored mail: a retried sync round never queues it twice.
        jobId: `reply-draft-${recordId}`,
        // One job per conversation while it is queued or running (codex): two mails of a thread
        // synced before the first draft is written queue one draft, not two.
        ...(conversationId
          ? { deduplication: { id: conversationKey(mailbox.tenantId, subject, conversationId) } }
          : {}),
      }
    );
    return true;
  } catch (error) {
    console.warn('[mail-sync] reply draft not queued', {
      mailboxId: mailbox.id,
      recordId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}
