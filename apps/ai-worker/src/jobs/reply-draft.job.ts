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
    const row = await prisma.contactReplyDraft.create({
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

    return { draftId: row.id };
  } catch (err) {
    logger.error({ err, contactId, tenantId }, 'reply-draft job failed');
    throw err;
  }
}
