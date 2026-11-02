/**
 * IFC-312 — Tag-suggestion job handler.
 *
 * Consumes `AI_TAG_SUGGESTION` queue. Called synchronously via BullMQ
 * `waitUntilFinished(events, 5000)` from the router — so this handler returns
 * the suggestions payload as `job.returnvalue` (no Prisma write). Re-checks
 * `aiTagSuggestions` toggle.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import {
  suggestContactTags,
  type ContactProfileSnapshot,
} from '../contact-tag-suggestion.chain.js';
import {
  suggestAccountTags,
  type AccountProfileSnapshot,
} from '../account-tag-suggestion.chain.js';
import {
  eligibleSubjectEmail,
  SUBJECT_NOT_PROCESSABLE,
  type SubjectPrisma,
} from '../lib/data-request-guard';

const logger = pino({
  name: 'tag-suggestion-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const TagSuggestionJobDataSchema = z.object({
  entityType: z.enum(['contact', 'account']),
  entityId: z.string().min(1),
  tenantId: recordIdSchema,
  profileSnapshot: z.record(z.string(), z.unknown()),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type TagSuggestionJobData = z.infer<typeof TagSuggestionJobDataSchema>;

/** The contact's profile as stored now, in the shape the router queues (null: gone). */
async function currentContactProfile(
  contactId: string,
  tenantId: string
): Promise<ContactProfileSnapshot | null> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    select: { firstName: true, lastName: true, title: true, company: true, contactNotes: true },
  });
  if (!contact) return null;
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title ?? undefined,
    company: contact.company ?? undefined,
    bio: contact.contactNotes ?? undefined,
  };
}

export async function processTagSuggestionJob(job: Job<TagSuggestionJobData>): Promise<{
  suggestions: Array<{ label: string; confidence: number; reason: string }>;
  modelVersion: string;
}> {
  const data = TagSuggestionJobDataSchema.parse(job.data);
  const { entityType, entityId, tenantId, profileSnapshot } = data;

  try {
    if (entityType === 'contact') {
      const setting = await prisma.contactAutomationSetting.findUnique({ where: { tenantId } });
      if (!setting?.aiTagSuggestions) {
        return { suggestions: [], modelVersion: 'disabled' };
      }
      // PG-203 Q22: an erased or restricted person is never sent to the model. Nothing is
      // stored here, so the caller just gets no suggestions.
      const subject = { kind: 'contact' as const, id: entityId, tenantId };
      const guard = prisma as unknown as SubjectPrisma;
      const email = await eligibleSubjectEmail(guard, subject);
      if (email === null) return { suggestions: [], modelVersion: SUBJECT_NOT_PROCESSABLE };
      // The profile is read now, never taken from the queued snapshot: an erasure that ran
      // while the job waited must not have its old names and notes sent (codex).
      const current = await currentContactProfile(entityId, tenantId);
      if (!current) return { suggestions: [], modelVersion: SUBJECT_NOT_PROCESSABLE };
      const result = await suggestContactTags({
        contactId: entityId,
        tenantId,
        profileSnapshot: current,
      });
      // The suggestions go back to the caller and stay in the job result: none survive an
      // erasure, restriction or address change that landed while the model ran (codex).
      if ((await eligibleSubjectEmail(guard, subject)) !== email) {
        return { suggestions: [], modelVersion: SUBJECT_NOT_PROCESSABLE };
      }
      return result;
    }

    const setting = await prisma.accountAutomationSetting.findUnique({ where: { tenantId } });
    if (!setting?.aiTagSuggestions) {
      return { suggestions: [], modelVersion: 'disabled' };
    }
    return await suggestAccountTags({
      accountId: entityId,
      tenantId,
      profileSnapshot: profileSnapshot as AccountProfileSnapshot,
    });
  } catch (err) {
    logger.error({ err, entityType, entityId, tenantId }, 'tag-suggestion job failed');
    // Synchronous caller relies on return value. Return empty on error rather than throw.
    return { suggestions: [], modelVersion: 'error' };
  }
}
