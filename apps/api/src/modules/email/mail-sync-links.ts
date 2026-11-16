/**
 * MVP-001: what a synced mail is linked to besides its contact (split out of the sync engine,
 * outlook-inbox-sync.ts, to keep it within its size limit).
 * - Threads: a mail joins the CRM thread of a logged mail in the same provider conversation (Zoho's
 *   thread id, Outlook's conversation id); a CRM-sent mail found in Sent learns that conversation.
 * - Leads: synced mail with a lead adds an EMAIL activity to the lead's timeline.
 */
import type { SyncedMessage } from './mail-sync-reader';

/** The database calls these helpers make (the sync's encrypted Prisma client). */
export interface SyncDb {
  prisma: any;
}

export interface SyncLinkMailbox {
  id: string;
  tenantId: string;
  userId: string | null;
}

/** A logged email record, as the duplicate check reads it. */
export interface LoggedRecord {
  id: string;
  metadata: unknown;
}

export function metaOf(record: { metadata: unknown }): Record<string, unknown> {
  return (record.metadata as Record<string, unknown> | null) ?? {};
}

/**
 * A mail the CRM sent, found again in the provider's Sent folder: it learns its provider thread id,
 * so the replies the sync reads later join its conversation (Zoho keeps no Message-ID of ours).
 */
export async function learnThread(
  deps: SyncDb,
  mailbox: SyncLinkMailbox,
  record: LoggedRecord,
  message: SyncedMessage
) {
  const meta = metaOf(record);
  if (!message.conversationId || meta.conversationId) return;
  await deps.prisma.emailRecord.update({
    where: { id: record.id, tenantId: mailbox.tenantId },
    data: { metadata: { ...meta, conversationId: message.conversationId } },
  });
}

/** The CRM thread a mail belongs to: the thread of a logged mail in the same provider conversation. */
export async function threadOf(
  deps: SyncDb,
  mailbox: SyncLinkMailbox,
  message: SyncedMessage
): Promise<string | null> {
  if (!message.conversationId) return null;
  const root: LoggedRecord | null = await deps.prisma.emailRecord.findFirst({
    where: {
      tenantId: mailbox.tenantId,
      mailboxId: mailbox.id,
      metadata: { path: ['conversationId'], equals: message.conversationId },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, metadata: true },
  });
  if (!root) return null;
  const meta = metaOf(root);
  if (typeof meta.threadId === 'string') return meta.threadId;
  // The first mail of the conversation starts the thread: it carries the thread id too, so the
  // thread view (which reads mail by metadata.threadId) shows it with its replies.
  await deps.prisma.emailRecord.update({
    where: { id: root.id, tenantId: mailbox.tenantId },
    data: { metadata: { ...meta, threadId: root.id } },
  });
  return root.id;
}

/** A lead's timeline is its activities: synced mail with a lead gets an EMAIL entry (subject only). */
export async function logOnLead(
  deps: SyncDb,
  mailbox: SyncLinkMailbox,
  message: SyncedMessage,
  leadId: string,
  emailRecordId: string
): Promise<void> {
  await deps.prisma.leadActivity.create({
    data: {
      type: 'EMAIL',
      title: message.subject.slice(0, 200),
      timestamp: message.receivedAt,
      userId: mailbox.userId,
      userName: 'Synced from email',
      leadId,
      tenantId: mailbox.tenantId,
      metadata: { emailRecordId, source: 'mailbox-sync' },
    },
  });
}
