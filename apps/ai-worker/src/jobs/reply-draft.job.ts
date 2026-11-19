/**
 * IFC-312 — Reply-draft job handler.
 *
 * Consumes `AI_REPLY_DRAFT` queue. Re-checks `aiAutoReplyDrafting` toggle. MVP-012: a draft answers a
 * contact or a lead (exactly one), stored on that one.
 * Writes `ContactReplyDraft` with HARD-CODED `status: 'DRAFT'` (ADR-037 —
 * review-before-send). NEVER writes `status: 'SENT'` from this path.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import { replyDraftingEnabled } from '@intelliflow/domain';
import {
  alreadyAnswered,
  latestThread,
  markAnswered,
  threadMovedOn,
  supersedeWaiting,
  type DraftSubject,
  type ThreadRef,
  type ThreadDb,
} from './reply-draft-thread.js';

/** The write found a draft already answering the newest mail (written meanwhile). */
const ANSWERED = Symbol('answered');
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { draftContactReply, type EmailThreadEntry } from '../contact-reply-draft.chain.js';
import {
  eligibleSubjectEmail,
  queuedAddressBlocked,
  writeSubjectIfStillEligible,
  type SubjectPrisma,
} from '../lib/data-request-guard';

const logger = pino({
  name: 'reply-draft-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const ThreadEntrySchema = z.object({
  from: z.string(),
  to: z.string().optional(),
  /** MVP-012: Cc participants, checked for data requests like From and To (codex). */
  cc: z.string().optional(),
  subject: z.string().optional(),
  body: z.string(),
  at: z.string(),
});

export const ReplyDraftJobDataSchema = z
  .object({
    contactId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    tenantId: recordIdSchema,
    emailThreadId: z.string().optional(),
    /** MVP-012: the synced mail's mailbox; with emailThreadId the worker reads the latest thread. */
    mailboxId: z.string().optional(),
    emailThread: z.array(ThreadEntrySchema).min(1),
    userInstructions: z.string().optional(),
    createdBy: z.string().optional(),
    _otelCarrier: z.record(z.string(), z.string()).optional(),
  })
  .refine((d) => Boolean(d.contactId) !== Boolean(d.leadId), {
    message: 'A reply draft answers exactly one contact or lead',
  });
export type ReplyDraftJobData = z.infer<typeof ReplyDraftJobDataSchema>;

/**
 * One header token as an address: lowercased, without surrounding quotes or trailing full
 * stops. Apostrophes are legal inside an address (o'neil@), so they are only trimmed from the
 * ends, never split on (codex).
 */
function tokenAddress(token: string): string {
  let address = token.toLowerCase();
  while (address.startsWith("'")) address = address.slice(1);
  while (address.endsWith('.') || address.endsWith("'")) address = address.slice(0, -1);
  return address;
}

/**
 * Every address a queued thread names, in its From, To and Cc lines:
 * "Name <a@example.invalid>, (b@example.invalid), mailto:c@example.invalid." → tokens, keeping
 * the ones with an @ (codex: a missed form fails open).
 */
function threadAddresses(
  thread: ReadonlyArray<{ from: string; to?: string; cc?: string }>
): string[] {
  const lines = thread.flatMap((entry) => [entry.from, entry.to ?? '', entry.cc ?? '']);
  const addresses = lines
    .flatMap((line) => line.split(/[\s<>,;:()"[\]]+/))
    .map(tokenAddress)
    .filter((address) => address.includes('@'));
  return [...new Set(addresses)];
}

/** True when anyone else on the thread has a data request (restricted or erased). */
async function anyBlocked(db: unknown, tenantId: string, addresses: string[]): Promise<boolean> {
  for (const address of addresses) {
    if (await queuedAddressBlocked(db as never, tenantId, address)) return true;
  }
  return false;
}

/**
 * The new draft, written under the subject's row lock (ADR-037: always DRAFT). A draft written
 * meanwhile that already answers every mail of the thread wins, and so does a thread that moved on
 * since the model read it (both ANSWERED: nothing is written); else the waiting one is set aside and the mails this draft answers are marked with it (see reply-draft-thread.ts).
 */
async function writeAnsweringDraft(
  tx: ThreadDb & typeof prisma,
  args: {
    tenantId: string;
    draftSubject: DraftSubject;
    emailThreadId: string | undefined;
    ref: ThreadRef;
    recordIds: string[];
    createdBy: string | undefined;
    draft: {
      draftSubject: string;
      draftBody: string;
      tone?: string | null;
      confidence: number;
      modelVersion: string;
    };
  }
): Promise<{ id: string } | typeof ANSWERED> {
  const { tenantId, draftSubject, emailThreadId, ref, recordIds, createdBy, draft } = args;
  // Only drafts of synced mail (read from the database) take a conversation's place; one asked
  // for by hand is written as before.
  if (emailThreadId && recordIds.length > 0) {
    if (await alreadyAnswered(tx, tenantId, draftSubject, emailThreadId, recordIds)) {
      return ANSWERED;
    }
    if (await threadMovedOn(tx, ref, recordIds)) return ANSWERED;
    await supersedeWaiting(tx, tenantId, draftSubject, emailThreadId);
  }
  const created = await tx.contactReplyDraft.create({
    data: {
      ...draftSubject,
      tenantId,
      ...(emailThreadId ? { emailThreadId } : {}),
      draftSubject: draft.draftSubject,
      draftBody: draft.draftBody,
      tone: draft.tone ?? null,
      status: 'DRAFT',
      confidence: draft.confidence,
      modelVersion: draft.modelVersion,
      ...(createdBy ? { createdBy } : {}),
    },
  });
  await markAnswered(tx, tenantId, recordIds, created.id);
  return created;
}
export async function processReplyDraftJob(job: Job<ReplyDraftJobData>): Promise<{
  skipped?: boolean;
  draftId?: string;
}> {
  const data = ReplyDraftJobDataSchema.parse(job.data);
  const { contactId, leadId, tenantId, userInstructions, emailThreadId, mailboxId, createdBy } =
    data;
  const draftSubject: DraftSubject = contactId ? { contactId } : { leadId: leadId as string };
  // The person the draft answers: the contact, or (MVP-012) the lead the enquiry landed on.
  const subjectId = (contactId ?? leadId) as string;

  try {
    const setting = await prisma.contactAutomationSetting.findUnique({ where: { tenantId } });
    // MVP-012: a tenant that never saved the setting gets the default (on).
    if (!replyDraftingEnabled(setting?.aiAutoReplyDrafting)) {
      logger.info({ contactId, leadId, tenantId }, 'reply-draft skipped — toggle disabled');
      return { skipped: true };
    }

    // MVP-012: the conversation's latest stored mails (with Cc), read now rather than when queued.
    const ref: ThreadRef = {
      tenantId,
      ...(mailboxId ? { mailboxId } : {}),
      ...(emailThreadId ? { conversationId: emailThreadId } : {}),
    };
    const { thread: emailThread, recordIds } = await latestThread(
      prisma as unknown as ThreadDb,
      ref,
      data.emailThread as EmailThreadEntry[]
    );
    // The waiting draft already answers every mail of the thread: no model call, nothing written.
    if (
      emailThreadId &&
      (await alreadyAnswered(
        prisma as unknown as ThreadDb,
        tenantId,
        draftSubject,
        emailThreadId,
        recordIds
      ))
    ) {
      logger.info({ contactId, leadId, tenantId }, 'reply-draft skipped — already answered');
      return { skipped: true };
    }

    // PG-203 Q22: the thread and the person's details are never sent to the model for an
    // erased or restricted contact.
    const subject = {
      kind: contactId ? ('contact' as const) : ('lead' as const),
      id: subjectId,
      tenantId,
    };
    const email = await eligibleSubjectEmail(prisma as unknown as SubjectPrisma, subject);
    if (email === null) {
      logger.info({ contactId, leadId, tenantId }, 'reply-draft skipped — data subject request');
      return { skipped: true };
    }
    // The queued thread goes to the model as it is: no one it names may be restricted or
    // erased either, such as the contact's previous address (codex).
    // The contact's own current address was checked above as a contact (an old erasure of a
    // person who came back is not a block); the thread's other addresses are checked here.
    const own = email.trim().toLowerCase();
    const participants = threadAddresses(emailThread).filter((a) => a !== own);
    if (await anyBlocked(prisma, tenantId, participants)) {
      logger.info({ contactId, leadId, tenantId }, 'reply-draft skipped — data subject request');
      return { skipped: true };
    }

    const result = await draftContactReply({
      contactId: subjectId,
      tenantId,
      emailThread: emailThread as EmailThreadEntry[],
      ...(userInstructions ? { userInstructions } : {}),
    });

    if (!result.success) {
      logger.warn(
        { contactId, leadId, tenantId, reason: result.reason },
        'reply-draft chain failed'
      );
      return { skipped: true };
    }

    const draft = result.draft;
    // CRITICAL (ADR-037): status is HARD-CODED to DRAFT. Never emit SENT here.
    // Stored only under the contact row and address locks, after re-checking (Q22).
    const outcome = await writeSubjectIfStillEligible(
      prisma as never,
      { ...subject, email, alsoLock: participants },
      async (tx) => {
        // The thread's other people too, re-checked while their address locks are held (taken
        // with the contact's, in one sorted order): one restricted or erased while the model
        // ran stops the draft, and two drafts on one thread cannot deadlock (codex).
        if (await anyBlocked(tx, tenantId, participants)) return null;
        return writeAnsweringDraft(tx as unknown as ThreadDb & typeof prisma, {
          tenantId,
          draftSubject,
          emailThreadId,
          ref,
          recordIds,
          createdBy,
          draft,
        });
      }
    );
    if (outcome.written && outcome.value === ANSWERED) {
      logger.info(
        { contactId, leadId, tenantId },
        'reply-draft discarded — already answered or thread moved on'
      );
      return { skipped: true };
    }
    if (!outcome.written || outcome.value === null) {
      logger.info({ contactId, leadId, tenantId }, 'reply-draft discarded — data subject request');
      return { skipped: true };
    }

    return { draftId: (outcome.value as { id: string }).id };
  } catch (err) {
    logger.error({ err, contactId, leadId, tenantId }, 'reply-draft job failed');
    throw err;
  }
}
