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
 *
 * The key is set in the database itself (`metadata || {...}`), never written back from a copy read
 * earlier: another job may have changed the same record's metadata meanwhile (the bounce reader
 * adds the recipients that bounced), and a whole-object write would undo that. The write only
 * happens while the record has no conversation yet, so two syncs cannot replace each other's.
 */
export async function learnThread(
  deps: SyncDb,
  mailbox: SyncLinkMailbox,
  record: LoggedRecord,
  message: SyncedMessage
) {
  const conversationId = message.conversationId;
  if (!conversationId || metaOf(record).conversationId) return;
  await deps.prisma.$executeRaw`
    UPDATE email_records
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('conversationId', ${conversationId}::text)
    WHERE id = ${record.id} AND "tenantId" = ${mailbox.tenantId}
      AND (metadata IS NULL
        OR (jsonb_typeof(metadata) = 'object' AND metadata->>'conversationId' IS NULL))`;
}

/**
 * Gives the thread id to the first mail of a conversation and to every other mail of it that has
 * none (mail logged before threads were stamped, or matched by conversation later), in one
 * statement that only adds the key: nothing else in anyone's metadata is rewritten, and a thread id
 * already there is never replaced. The thread view shows the mail that carries the id.
 */
async function stampThread(
  deps: SyncDb,
  mailbox: SyncLinkMailbox,
  rootId: string,
  conversationId: string
): Promise<void> {
  await deps.prisma.$executeRaw`
    UPDATE email_records
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('threadId', ${rootId}::text)
    WHERE "tenantId" = ${mailbox.tenantId} AND "mailboxId" = ${mailbox.id}
      AND (id = ${rootId} OR metadata->>'conversationId' = ${conversationId})
      AND (metadata IS NULL
        OR (jsonb_typeof(metadata) = 'object' AND metadata->>'threadId' IS NULL))`;
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
      OR: [
        { metadata: { path: ['conversationId'], equals: message.conversationId } },
        // Zoho names a thread after its first mail: a logged mail with that very id starts it,
        // whatever conversation it was stored with before anyone replied.
        { providerMessageId: message.conversationId.slice(0, 255) },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, metadata: true },
  });
  if (!root) return null;
  const known = metaOf(root).threadId;
  if (typeof known === 'string') return known;
  // The first mail of the conversation starts the thread: it carries the thread id too (and so
  // does every mail of the conversation without one), so the thread view, which reads mail by
  // metadata.threadId, shows them with the replies.
  await stampThread(deps, mailbox, root.id, message.conversationId);
  // A sync running at the same time may have stamped the root first: use what the root holds.
  const stamped = await deps.prisma.emailRecord.findFirst({
    where: { id: root.id, tenantId: mailbox.tenantId },
    select: { metadata: true },
  });
  const threadId = stamped ? metaOf(stamped).threadId : undefined;
  return typeof threadId === 'string' ? threadId : root.id;
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
