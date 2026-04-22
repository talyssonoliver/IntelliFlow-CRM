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

const logger = pino({
  name: 'tag-suggestion-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const TagSuggestionJobDataSchema = z.object({
  entityType: z.enum(['contact', 'account']),
  entityId: z.string().min(1),
  tenantId: z.string().min(1),
  profileSnapshot: z.record(z.string(), z.unknown()),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type TagSuggestionJobData = z.infer<typeof TagSuggestionJobDataSchema>;

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
      return await suggestContactTags({
        contactId: entityId,
        tenantId,
        profileSnapshot: profileSnapshot as ContactProfileSnapshot,
      });
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
