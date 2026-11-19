/**
 * MVP-012 PR C: the thread a reply draft answers, read when the job runs, and the "one waiting
 * draft per conversation" rule (codex).
 *
 * A job queued for a synced mail names its mailbox and conversation. The worker reads the
 * conversation's latest stored mails then, not the snapshot taken at queue time, so a mail that
 * arrived while the job waited is answered too, and everyone on the thread (From, To and Cc) is
 * checked for a data request.
 *
 * Which mails a draft answers is recorded on the mails themselves: writing a draft marks each one
 * it read with `metadata.replyDraftId`. A conversation is answered when every mail of its latest
 * thread is marked with its waiting draft; then the job calls no model and writes nothing. Mails
 * sharing a received time, or synced late, are told apart by identity, never by time (codex).
 * Otherwise the new draft replaces the waiting one (set aside), so one draft waits per conversation.
 */
import type { EmailThreadEntry } from '../contact-reply-draft.chain.js';

/** Mails of the conversation sent to the model: the latest ones, oldest first. */
export const THREAD_LIMIT = 10;
/** Each mail's body is cut to this many characters. */
const BODY_LIMIT = 4000;

export type DraftSubject = { contactId: string } | { leadId: string };

interface StoredMail {
  id: string;
  fromEmail: string;
  toEmail: string;
  ccEmails: string | null;
  subject: string;
  body: string;
  createdAt: Date;
}

/** The calls these helpers make: the worker's Prisma client, or a transaction of it. */
export interface ThreadDb {
  emailRecord: {
    findMany(args: unknown): Promise<StoredMail[]>;
    count(args: unknown): Promise<number>;
  };
  contactReplyDraft: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export interface ThreadRef {
  tenantId: string;
  mailboxId?: string;
  conversationId?: string;
}

export interface LoadedThread {
  thread: EmailThreadEntry[];
  /** The stored mails read, when read from the database (empty: the queued thread was used). */
  recordIds: string[];
}

/**
 * The conversation's latest stored mails when the job names its mailbox and conversation; else the
 * thread as it was queued (drafts asked for by hand).
 */
export async function latestThread(
  db: ThreadDb,
  ref: ThreadRef,
  queued: EmailThreadEntry[]
): Promise<LoadedThread> {
  if (!ref.mailboxId || !ref.conversationId) return { thread: queued, recordIds: [] };
  const latest = await db.emailRecord.findMany({
    where: {
      tenantId: ref.tenantId,
      mailboxId: ref.mailboxId,
      metadata: { path: ['conversationId'], equals: ref.conversationId },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: THREAD_LIMIT,
    select: {
      id: true,
      fromEmail: true,
      toEmail: true,
      ccEmails: true,
      subject: true,
      body: true,
      createdAt: true,
    },
  });
  if (latest.length === 0) return { thread: queued, recordIds: [] };
  const oldestFirst = latest.reverse();
  return {
    thread: oldestFirst.map((mail) => ({
      from: mail.fromEmail,
      to: mail.toEmail,
      ...(mail.ccEmails ? { cc: mail.ccEmails } : {}),
      subject: mail.subject,
      body: mail.body.slice(0, BODY_LIMIT),
      at: mail.createdAt.toISOString(),
    })),
    recordIds: oldestFirst.map((mail) => mail.id),
  };
}

/** True when the conversation's waiting draft already answers every mail of its latest thread. */
export async function alreadyAnswered(
  db: ThreadDb,
  tenantId: string,
  subject: DraftSubject,
  conversationId: string,
  recordIds: string[]
): Promise<boolean> {
  if (recordIds.length === 0) return false;
  const waiting = await db.contactReplyDraft.findFirst({
    where: { tenantId, ...subject, status: 'DRAFT', emailThreadId: conversationId },
    select: { id: true },
  });
  if (!waiting) return false;
  const answered = await db.emailRecord.count({
    where: {
      tenantId,
      id: { in: recordIds },
      metadata: { path: ['replyDraftId'], equals: waiting.id },
    },
  });
  return answered === recordIds.length;
}

/** Sets aside the conversation's waiting drafts: the one being written replaces them. */
export async function supersedeWaiting(
  db: ThreadDb,
  tenantId: string,
  subject: DraftSubject,
  conversationId: string
): Promise<void> {
  await db.contactReplyDraft.updateMany({
    where: { tenantId, ...subject, status: 'DRAFT', emailThreadId: conversationId },
    data: { status: 'DISMISSED' },
  });
}

/**
 * Marks the mails a draft answers. Set in the database itself (`metadata || {...}`), never written
 * back from a copy, so another job's metadata keys on the same mails are kept.
 */
export async function markAnswered(
  db: ThreadDb,
  tenantId: string,
  recordIds: string[],
  draftId: string
): Promise<void> {
  if (recordIds.length === 0) return;
  await db.$executeRaw`
    UPDATE email_records
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('replyDraftId', ${draftId}::text)
    WHERE "tenantId" = ${tenantId} AND id = ANY(${recordIds}::text[])`;
}
