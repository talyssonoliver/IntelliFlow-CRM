/**
 * #1074: job and chain schemas must accept the ids real records carry.
 *
 * Every core model uses `@default(cuid())` (schema.prisma has no uuid column), but
 * these schemas validated ids with `z.uuid()`, so jobs built from real records
 * failed validation and were dead-lettered (production ai-insights job 395,
 * 2026-10-29 18:00Z). Each case below builds the smallest valid payload with a
 * real cuid in every id field; the unsafe-id cases keep the bound in place.
 */

import { describe, it, expect } from 'vitest';

import { InsightJobDataSchema } from '../jobs/insight-generation.job';
import { SummarizeConversationJobSchema } from '../jobs/summarize-conversation.job';
import { ScoringJobDataSchema, ScoringJobResultSchema } from '../jobs/scoring.job';
import { PredictionJobDataSchema, PredictionJobResultSchema } from '../jobs/prediction.job';
import { FeedbackAnalyticsJobDataSchema } from '../jobs/feedback-analytics.job';
import { MemoryRetentionJobDataSchema } from '../jobs/memory-retention.job';
import { nbaContextSchema } from '../agents/next-best-action.agent';
import { churnRiskInputSchema } from '../chains/churn-risk.chain';
import { ragContextInputSchema } from '../chains/rag-context.chain';
import { SearchConfigSchema } from '../services/retrieval-service';
import { IngestionJobDataSchema } from '../workers/ingestion-workers';
import { ReindexJobDataSchema } from '../workers/reindex-worker';

// The shape Prisma's @default(cuid()) issues: 'c' plus 24 lower-case base36 chars.
const CUID = 'cmhbx3k2p0000l8086a1b2c3d';
const CUID_2 = 'cmhbx3k2p0001l8086e4f5g6h';
const NOW = '2026-10-29T18:00:02.000Z';

const cases: Array<[string, { safeParse: (v: unknown) => { success: boolean } }, unknown]> = [
  ['insight job tenantId', InsightJobDataSchema, { tenantId: CUID, userId: CUID_2 }],
  [
    'summarize-conversation job tenantId',
    SummarizeConversationJobSchema,
    { tenantId: CUID, sessionId: 's1', conversationId: CUID_2 },
  ],
  [
    'scoring job leadId',
    ScoringJobDataSchema,
    { leadId: CUID, tenantId: CUID_2, lead: { email: 'lead@example.invalid', source: 'web' } },
  ],
  [
    'scoring result leadId',
    ScoringJobResultSchema,
    {
      leadId: CUID,
      score: 70,
      confidence: 0.8,
      tier: 'WARM',
      factors: [],
      recommendations: [],
      modelVersion: 'v1',
      processedAt: NOW,
      processingTimeMs: 1,
    },
  ],
  [
    'prediction job entityId',
    PredictionJobDataSchema,
    { entityType: 'lead', entityId: CUID, predictionType: 'CHURN_RISK', tenantId: CUID_2 },
  ],
  [
    'prediction result entityId',
    PredictionJobResultSchema,
    {
      entityType: 'lead',
      entityId: CUID,
      predictionType: 'CHURN_RISK',
      prediction: { value: 0.2, confidence: 0.9, explanation: 'x' },
      recommendations: [],
      processedAt: NOW,
      processingTimeMs: 1,
    },
  ],
  ['feedback-analytics job tenantId', FeedbackAnalyticsJobDataSchema, { tenantId: CUID }],
  ['memory-retention job tenantId', MemoryRetentionJobDataSchema, { tenantId: CUID }],
  [
    'next-best-action context ids',
    nbaContextSchema,
    { entityType: 'lead', entityId: CUID, tenantId: CUID_2, userId: CUID },
  ],
  ['churn-risk input entityId', churnRiskInputSchema, { entityType: 'account', entityId: CUID }],
  [
    'rag-context input ids',
    ragContextInputSchema,
    { query: 'renewal terms', tenantId: CUID, userId: CUID_2 },
  ],
  [
    'retrieval search caseId',
    SearchConfigSchema,
    { tenantId: CUID_2, userId: CUID, query: 'q', caseId: CUID },
  ],
  [
    'ingestion job documentId',
    IngestionJobDataSchema,
    {
      documentId: CUID,
      sourceUrl: 'https://files.example.invalid/doc.pdf',
      format: 'pdf',
      tenantId: CUID_2,
    },
  ],
  [
    'reindex job ids',
    ReindexJobDataSchema,
    { tenantId: CUID, documentIds: [CUID_2], noteIds: [CUID], requestedBy: CUID_2 },
  ],
];

describe('job and chain schemas accept cuid record ids (#1074)', () => {
  it.each(cases)('%s', (_label, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['path traversal', '../x'],
    ['whitespace', 'c abc'],
    ['over 64 characters', 'c'.repeat(65)],
  ])('still rejects an unsafe id (%s)', (_label, id) => {
    expect(InsightJobDataSchema.safeParse({ tenantId: id, userId: CUID }).success).toBe(false);
    expect(
      ScoringJobDataSchema.safeParse({
        leadId: id,
        tenantId: CUID,
        lead: { email: 'lead@example.invalid', source: 'web' },
      }).success
    ).toBe(false);
    expect(ReindexJobDataSchema.safeParse({ documentIds: [id] }).success).toBe(false);
  });
});
