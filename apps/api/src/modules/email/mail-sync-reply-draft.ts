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
 * - One waiting draft per conversation: a draft is stamped with the newest mail it answers, and a
 *   mail no newer than a waiting draft's stamp queues nothing. The worker reads the conversation's
 *   latest mails (with Cc) when it runs and sets an older waiting draft aside when it writes the
 *   new one, so mail that arrives while a job waits is answered too (codex).
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
  ccEmails: string | null;
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
  const select = {
    fromEmail: true,
    toEmail: true,
    ccEmails: true,
    subject: true,
    body: true,
    createdAt: true,
  };
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

/** A waiting draft of this conversation already answers this mail (stamped at or after it). */
async function alreadyAnswered(
  deps: ReplyDraftDeps,
  tenantId: string,
  subject: { contactId: string } | { leadId: string },
  conversationId: string,
  receivedAt: Date
): Promise<boolean> {
  const answering = await deps.prisma.contactReplyDraft.findFirst({
    where: {
      tenantId,
      ...subject,
      status: 'DRAFT',
      emailThreadId: conversationId,
      createdAt: { gte: receivedAt },
    },
    select: { id: true },
  });
  return answering !== null;
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
    if (
      conversationId &&
      (await alreadyAnswered(deps, mailbox.tenantId, subject, conversationId, message.receivedAt))
    ) {
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
        // The worker reads the conversation's latest mails from this mailbox when it runs.
        mailboxId: mailbox.id,
        emailThread: thread.map((mail) => ({
          from: mail.fromEmail,
          to: mail.toEmail,
          ...(mail.ccEmails ? { cc: mail.ccEmails } : {}),
          subject: mail.subject,
          body: mail.body.slice(0, BODY_LIMIT),
          at: mail.createdAt.toISOString(),
        })),
        ...(mailbox.userId ? { createdBy: mailbox.userId } : {}),
      },
      {
        // One job per stored mail: a retried sync round never queues it twice.
        jobId: `reply-draft-${recordId}`,
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
