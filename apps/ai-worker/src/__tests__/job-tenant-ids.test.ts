/**
 * Job tenant and user ids are bounded record ids (#1075).
 *
 * These job schemas took any non-empty string as `tenantId` (and the insight and
 * ingestion jobs any string as `userId`), so a malformed id reached tenant-scoped
 * queries. Each case parses only the id field and looks at issues on that field.
 */

import { describe, it, expect } from 'vitest';
import type { ZodType } from 'zod';

import { AccountScoringJobDataSchema } from '../jobs/account-scoring.job';
import { CaseAiAutomationJobDataSchema } from '../jobs/case-ai-automation.job';
import { DealAiAutomationJobDataSchema } from '../jobs/deal-ai-automation.job';
import { EnrichmentJobDataSchema } from '../jobs/enrichment.job';
import { EntityInsightJobDataSchema } from '../jobs/entity-insight.job';
import { InsightJobDataSchema } from '../jobs/insight-generation.job';
import { PredictionJobDataSchema } from '../jobs/prediction.job';
import { ReplyDraftJobDataSchema } from '../jobs/reply-draft.job';
import { ScoringJobDataSchema } from '../jobs/scoring.job';
import { TagSuggestionJobDataSchema } from '../jobs/tag-suggestion.job';
import { TicketAiAutomationJobDataSchema } from '../jobs/ticket-ai-automation.job';
import { CaseDeadlineMonitorJobDataSchema } from '../workers/case-deadline-monitor.job';
import { ContactEmbedJobDataSchema } from '../workers/contact-embed-worker';
import { IngestionJobDataSchema } from '../workers/ingestion-workers';
import { NotificationEmailJobDataSchema } from '../workers/notification-email-worker';
import { TicketAutoCloseJobDataSchema } from '../workers/ticket-auto-close.job';
import { TicketSlaMonitorJobDataSchema } from '../workers/ticket-sla-monitor.job';

const CUID = 'cmhbx3k2p0000l8086a1b2c3d';

const CASES: Array<[string, string, ZodType]> = [
  ['account-scoring', 'tenantId', AccountScoringJobDataSchema],
  ['case-ai-automation', 'tenantId', CaseAiAutomationJobDataSchema],
  ['deal-ai-automation', 'tenantId', DealAiAutomationJobDataSchema],
  ['enrichment', 'tenantId', EnrichmentJobDataSchema],
  ['entity-insight', 'tenantId', EntityInsightJobDataSchema],
  ['insight-generation', 'userId', InsightJobDataSchema],
  ['prediction', 'tenantId', PredictionJobDataSchema],
  ['reply-draft', 'tenantId', ReplyDraftJobDataSchema],
  ['scoring', 'tenantId', ScoringJobDataSchema],
  ['tag-suggestion', 'tenantId', TagSuggestionJobDataSchema],
  ['ticket-ai-automation', 'tenantId', TicketAiAutomationJobDataSchema],
  ['case-deadline-monitor', 'tenantId', CaseDeadlineMonitorJobDataSchema],
  ['contact-embed', 'tenantId', ContactEmbedJobDataSchema],
  ['ingestion', 'tenantId', IngestionJobDataSchema],
  ['ingestion', 'userId', IngestionJobDataSchema],
  ['notification-email', 'tenantId', NotificationEmailJobDataSchema],
  ['ticket-auto-close', 'tenantId', TicketAutoCloseJobDataSchema],
  ['ticket-sla-monitor', 'tenantId', TicketSlaMonitorJobDataSchema],
];

function idIssues(schema: ZodType, field: string, value: unknown) {
  const result = schema.safeParse({ [field]: value });
  return result.success ? [] : result.error.issues.filter((i) => i.path[0] === field);
}

describe('job tenant and user ids are bounded record ids (#1075)', () => {
  it.each(CASES)('%s job accepts a cuid %s', (_job, field, schema) => {
    expect(idIssues(schema, field, CUID)).toEqual([]);
  });

  it.each(CASES)('%s job rejects a malformed %s', (_job, field, schema) => {
    expect(idIssues(schema, field, '../other-tenant')).not.toEqual([]);
    expect(idIssues(schema, field, 'tenant 1')).not.toEqual([]);
    expect(idIssues(schema, field, 'a'.repeat(65))).not.toEqual([]);
  });

  it('keeps the tenant-isolation message when a prediction job has no tenantId', () => {
    const issues = idIssues(PredictionJobDataSchema, 'tenantId', undefined);
    expect(issues.map((i) => i.message)).toEqual([
      'tenantId is required for prediction jobs - tenant isolation enforced',
    ]);
  });
});
