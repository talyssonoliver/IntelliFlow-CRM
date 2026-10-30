/**
 * IFC-312 — Reply-draft job handler.
 *
 * Consumes `AI_REPLY_DRAFT` queue. Re-checks `aiAutoReplyDrafting` toggle.
 * Writes `ContactReplyDraft` with HARD-CODED `status: 'DRAFT'` (ADR-037 —
 * review-before-send). NEVER writes `status: 'SENT'` from this path.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
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
  subject: z.string().optional(),
  body: z.string(),
  at: z.string(),
});

export const ReplyDraftJobDataSchema = z.object({
  contactId: z.string().min(1),
  tenantId: z.string().min(1),
  emailThreadId: z.string().optional(),
  emailThread: z.array(ThreadEntrySchema).min(1),
  userInstructions: z.string().optional(),
  createdBy: z.string().optional(),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
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
 * Every address a queued thread names, in its From and To lines:
 * "Name <a@example.invalid>, (b@example.invalid), mailto:c@example.invalid." → tokens, keeping
 * the ones with an @ (codex: a missed form fails open).
 */
function threadAddresses(thread: ReadonlyArray<{ from: string; to?: string }>): string[] {
  const lines = thread.flatMap((entry) => [entry.from, entry.to ?? '']);
  const addresses = lines
    .flatMap((line) => line.split(/[\s<>,;:()"[\]]+/))
    .map(tokenAddress)
    .filter((address) => address.includes('@'));
  return [...new Set(addresses)];
}

export async function processReplyDraftJob(job: Job<ReplyDraftJobData>): Promise<{
  skipped?: boolean;
  draftId?: string;
}> {
  const data = ReplyDraftJobDataSchema.parse(job.data);
  const { contactId, tenantId, emailThread, userInstructions, emailThreadId, createdBy } = data;

  try {
    const setting = await prisma.contactAutomationSetting.findUnique({ where: { tenantId } });
    if (!setting?.aiAutoReplyDrafting) {
      logger.info({ contactId, tenantId }, 'reply-draft skipped — toggle disabled');
      return { skipped: true };
    }

    // PG-203 Q22: the thread and the person's details are never sent to the model for an
    // erased or restricted contact.
    const subject = { kind: 'contact' as const, id: contactId, tenantId };
    const email = await eligibleSubjectEmail(prisma as unknown as SubjectPrisma, subject);
    if (email === null) {
      logger.info({ contactId, tenantId }, 'reply-draft skipped — data subject request');
      return { skipped: true };
    }
    // The queued thread goes to the model as it is: no one it names may be restricted or
    // erased either, such as the contact's previous address (codex).
    // The contact's own current address was checked above as a contact (an old erasure of a
    // person who came back is not a block); the thread's other addresses are checked here.
    const own = email.trim().toLowerCase();
    const participants = threadAddresses(emailThread).filter((a) => a !== own);
    for (const address of participants) {
      if (await queuedAddressBlocked(prisma as never, tenantId, address)) {
        logger.info({ contactId, tenantId }, 'reply-draft skipped — data subject request');
        return { skipped: true };
      }
    }

    const result = await draftContactReply({
      contactId,
      tenantId,
      emailThread: emailThread as EmailThreadEntry[],
      ...(userInstructions ? { userInstructions } : {}),
    });

    if (!result.success) {
      logger.warn({ contactId, tenantId, reason: result.reason }, 'reply-draft chain failed');
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
        for (const address of participants) {
          if (await queuedAddressBlocked(tx as never, tenantId, address)) return null;
        }
        return (tx as unknown as typeof prisma).contactReplyDraft.create({
          data: {
            contactId,
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
      }
    );
    if (!outcome.written || outcome.value === null) {
      logger.info({ contactId, tenantId }, 'reply-draft discarded — data subject request');
      return { skipped: true };
    }

    return { draftId: outcome.value.id };
  } catch (err) {
    logger.error({ err, contactId, tenantId }, 'reply-draft job failed');
    throw err;
  }
}
