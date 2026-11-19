/**
 * MVP-012 PR C: the thread a reply draft answers, read when the job runs, and the "one waiting
 * draft per conversation" rule (codex).
 *
 * A job queued for a synced mail names its mailbox and conversation. The worker reads the
 * conversation's latest stored mails then, not the snapshot taken at queue time, so a mail that
 * arrived while the job waited is answered too, and everyone on the thread (From, To and Cc) is
 * checked for a data request.
 *
 * A draft is stamped with the time of the newest mail it answers (its createdAt). A conversation's
 * waiting draft stamped at or after the newest mail already answers it: the job writes nothing
 * and calls no model. An older waiting draft is superseded (set aside) when the new one is written,
 * under the subject's row lock, so the conversation never has two drafts waiting.
 */
import type { EmailThreadEntry } from '../contact-reply-draft.chain.js';

/** Mails of the conversation sent to the model: the latest ones, oldest first. */
export const THREAD_LIMIT = 10;
/** Each mail's body is cut to this many characters. */
const BODY_LIMIT = 4000;

export type DraftSubject = { contactId: string } | { leadId: string };

interface StoredMail {
  fromEmail: string;
  toEmail: string;
  ccEmails: string | null;
  subject: string;
  body: string;
  createdAt: Date;
}

/** The calls these helpers make: the worker's Prisma client, or a transaction of it. */
export interface ThreadDb {
  emailRecord: { findMany(args: unknown): Promise<StoredMail[]> };
  contactReplyDraft: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface ThreadRef {
  tenantId: string;
  mailboxId?: string;
  conversationId?: string;
}

/**
 * The conversation's latest stored mails when the job names its mailbox and conversation, with the
 * time of the newest; else the thread as it was queued (no stamp: drafts asked for by hand).
 */
export async function latestThread(
  db: ThreadDb,
  ref: ThreadRef,
  queued: EmailThreadEntry[]
): Promise<{ thread: EmailThreadEntry[]; newestAt: Date | null }> {
  if (!ref.mailboxId || !ref.conversationId) return { thread: queued, newestAt: null };
  const latest = await db.emailRecord.findMany({
    where: {
      tenantId: ref.tenantId,
      mailboxId: ref.mailboxId,
      metadata: { path: ['conversationId'], equals: ref.conversationId },
    },
    orderBy: { createdAt: 'desc' },
    take: THREAD_LIMIT,
    select: {
      fromEmail: true,
      toEmail: true,
      ccEmails: true,
      subject: true,
      body: true,
      createdAt: true,
    },
  });
  if (latest.length === 0) return { thread: queued, newestAt: null };
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
    newestAt: oldestFirst.at(-1)?.createdAt ?? null,
  };
}

/** True when a waiting draft of this conversation already answers its newest mail. */
export async function alreadyAnswered(
  db: ThreadDb,
  tenantId: string,
  subject: DraftSubject,
  conversationId: string,
  newestAt: Date
): Promise<boolean> {
  const answering = await db.contactReplyDraft.findFirst({
    where: {
      tenantId,
      ...subject,
      status: 'DRAFT',
      emailThreadId: conversationId,
      createdAt: { gte: newestAt },
    },
    select: { id: true },
  });
  return answering !== null;
}

/** Sets aside the conversation's waiting drafts that answer an older mail. */
export async function supersedeOlder(
  db: ThreadDb,
  tenantId: string,
  subject: DraftSubject,
  conversationId: string,
  newestAt: Date
): Promise<void> {
  await db.contactReplyDraft.updateMany({
    where: {
      tenantId,
      ...subject,
      status: 'DRAFT',
      emailThreadId: conversationId,
      createdAt: { lt: newestAt },
    },
    data: { status: 'DISMISSED' },
  });
}
