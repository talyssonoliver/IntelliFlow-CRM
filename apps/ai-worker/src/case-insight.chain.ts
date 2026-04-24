/**
 * PG-190 — Case insight chain.
 *
 * LLM generates a structured case summary (summary, predicted priority,
 * suggested resolution, recommendations) and upserts `CaseAIInsight` with
 * provenance fields. Never throws to the caller: LLM errors produce a
 * fallback insight with `source='fallback'`.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'case-insight.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const CasePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const InsightLLMSchema = z.object({
  summary: z.string().min(1).max(2000),
  predictedPriority: CasePrioritySchema.optional(),
  suggestedResolution: z.string().max(2000).optional(),
  recommendations: z.array(z.string()).optional(),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'case-insight-v1';

export interface CaseInsightContext {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  tasks?: Array<{ title: string; status: string }>;
  activities?: Array<{ type: string; at: string; summary?: string }>;
}

export interface GenerateCaseInsightInput {
  caseId: string;
  tenantId: string;
  context: CaseInsightContext;
}

export type GenerateCaseInsightResult =
  | { success: true; source: 'llm' | 'fallback'; modelVersion: string }
  | { success: false; reason: string };

export async function generateCaseInsight(
  input: GenerateCaseInsightInput
): Promise<GenerateCaseInsightResult> {
  const { caseId, tenantId, context } = input;

  let parsed: z.infer<typeof InsightLLMSchema> | null = null;
  let source: 'llm' | 'fallback' = 'llm';

  try {
    const model = await createLLMForTenant('qualification', 'standard', { tenantId });
    const structured = model.withStructuredOutput(InsightLLMSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You analyze a legal case and produce a structured insight. ' +
            'Return: summary (short narrative), predictedPriority (LOW|MEDIUM|HIGH|URGENT), ' +
            'suggestedResolution (brief recommended next action), recommendations[].',
        },
        {
          role: 'user',
          content: `Case context: ${JSON.stringify(context)}. Generate insight.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );
    const safe = InsightLLMSchema.safeParse(raw);
    if (safe.success) {
      parsed = safe.data;
    } else {
      logger.warn({ err: safe.error }, 'case insight output failed Zod validation');
      source = 'fallback';
    }
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case insight LLM call failed');
    source = 'fallback';
  }

  const payload = parsed
    ? {
        summary: parsed.summary,
        predictedPriority: parsed.predictedPriority ?? null,
        suggestedResolution: parsed.suggestedResolution ?? null,
        recommendations: parsed.recommendations ?? [],
        modelVersion: parsed.modelVersion ?? DEFAULT_MODEL_VERSION,
        source,
      }
    : {
        summary: `No insight available for case ${caseId}.`,
        predictedPriority: null,
        suggestedResolution: null,
        recommendations: [] as string[],
        modelVersion: DEFAULT_MODEL_VERSION,
        source: 'fallback' as const,
      };

  const now = new Date();
  try {
    await prisma.caseAIInsight.upsert({
      where: { caseId },
      create: {
        ...payload,
        tenantId,
        caseId,
        generatedAt: now,
      } as never,
      update: {
        ...payload,
        tenantId,
        generatedAt: now,
      } as never,
    });
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'caseAIInsight Prisma upsert failed');
    return { success: false, reason: 'db-upsert-error' };
  }

  return {
    success: true,
    source: payload.source,
    modelVersion: payload.modelVersion,
  };
}
