/**
 * PG-190 — Case AI automation job.
 *
 * Consumes `AI_CASE_AI_AUTOMATION` queue. Discriminates by `operation` to
 * dispatch to the five case chains. Re-checks the matching
 * `CaseAutomationSetting.<flag>` before running. Returns `{ skipped: true }`
 * when the flag is off.
 *
 * Queue: ai-case-ai-automation.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { generateCaseInsight } from '../case-insight.chain.js';
import { generateCaseSummary } from '../case-summarization.chain.js';
import { predictCasePriority } from '../case-priority-prediction.chain.js';
import { suggestCaseResolution } from '../case-resolution-suggestion.chain.js';

const logger = pino({
  name: 'case-ai-automation-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const CASE_AI_AUTOMATION_QUEUE = 'ai-case-ai-automation';

export const CaseAiAutomationJobDataSchema = z.object({
  tenantId: z.string().min(1),
  caseId: z.string().min(1),
  operation: z.enum([
    'summarization',
    'priority-prediction',
    'resolution-suggestion',
    'tag-suggestions',
    'insight-generation',
  ]),
  context: z.record(z.string(), z.unknown()).optional(),
  triggeredBy: z.string().optional(),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type CaseAiAutomationJobData = z.infer<typeof CaseAiAutomationJobDataSchema>;

export interface CaseAiAutomationJobResult {
  caseId: string;
  operation: string;
  skipped: boolean;
  reason?: string;
  result?: unknown;
  elapsedMs: number;
  completedAt: string;
}

export async function processCaseAiAutomationJob(
  job: Job<CaseAiAutomationJobData>
): Promise<CaseAiAutomationJobResult> {
  const start = Date.now();
  const data = CaseAiAutomationJobDataSchema.parse(job.data);
  const { tenantId, caseId, operation } = data;

  const makeSkip = (reason: string): CaseAiAutomationJobResult => ({
    caseId,
    operation,
    skipped: true,
    reason,
    elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(),
  });

  const makeOk = (result: unknown): CaseAiAutomationJobResult => ({
    caseId,
    operation,
    skipped: false,
    result,
    elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(),
  });

  try {
    const setting = await prisma.caseAutomationSetting.findUnique({ where: { tenantId } });

    switch (operation) {
      case 'insight-generation': {
        if (!setting?.aiInsightGeneration) return makeSkip('aiInsightGeneration=false');
        const context = (data.context ?? {}) as Parameters<typeof generateCaseInsight>[0]['context'];
        const result = await generateCaseInsight({ caseId, tenantId, context });
        return makeOk(result);
      }
      case 'summarization': {
        if (!setting?.aiCaseSummarization) return makeSkip('aiCaseSummarization=false');
        const context = (data.context ?? {}) as Parameters<typeof generateCaseSummary>[0]['context'];
        const result = await generateCaseSummary({ caseId, tenantId, context });
        return makeOk(result);
      }
      case 'priority-prediction': {
        if (!setting?.aiPriorityPrediction) return makeSkip('aiPriorityPrediction=false');
        const context = (data.context ?? {}) as Parameters<typeof predictCasePriority>[0]['context'];
        const result = await predictCasePriority({ caseId, tenantId, context });
        return makeOk(result);
      }
      case 'resolution-suggestion': {
        if (!setting?.aiResolutionSuggestion) return makeSkip('aiResolutionSuggestion=false');
        const context = (data.context ?? {}) as Parameters<typeof suggestCaseResolution>[0]['context'];
        const result = await suggestCaseResolution({ caseId, tenantId, context });
        return makeOk(result);
      }
      case 'tag-suggestions': {
        if (!setting?.aiTagSuggestions) return makeSkip('aiTagSuggestions=false');
        // Phase 5c reuses AI_TAG_SUGGESTION queue with entityType='case', so
        // this branch is intentionally a skip — router dispatches to the tag
        // suggestion queue directly, not here.
        return makeSkip('routed-via-AI_TAG_SUGGESTION-queue');
      }
      default:
        return makeSkip('unknown-operation');
    }
  } catch (err) {
    logger.error({ err, caseId, tenantId, operation }, 'case-ai-automation job failed');
    throw err;
  }
}
