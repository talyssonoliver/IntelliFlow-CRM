/**
 * PG-190 — Case priority prediction chain.
 *
 * LLM inspects the case + its tasks + deadline and predicts a priority level
 * (LOW|MEDIUM|HIGH|URGENT). Writes to CaseAIInsight.predictedPriority so the
 * UI can surface the suggestion next to the user-selected priority.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'case-priority-prediction.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const CasePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const PriorityLLMSchema = z.object({
  predictedPriority: CasePrioritySchema,
  rationale: z.string().max(500).optional(),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'case-priority-prediction-v1';

export interface CasePriorityContext {
  title?: string;
  description?: string | null;
  currentPriority?: string;
  deadline?: string | null;
  tasks?: Array<{ title: string; status: string }>;
}

export interface PredictCasePriorityInput {
  caseId: string;
  tenantId: string;
  context: CasePriorityContext;
}

export type PredictCasePriorityResult =
  | {
      success: true;
      source: 'llm' | 'fallback';
      modelVersion: string;
      predictedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    }
  | { success: false; reason: string };

export async function predictCasePriority(
  input: PredictCasePriorityInput
): Promise<PredictCasePriorityResult> {
  const { caseId, tenantId, context } = input;

  let parsed: z.infer<typeof PriorityLLMSchema> | null = null;
  let source: 'llm' | 'fallback' = 'llm';

  try {
    const model = await createLLMForTenant('qualification', 'standard', { tenantId });
    const structured = model.withStructuredOutput(PriorityLLMSchema);
    const raw = await structured.invoke([
      {
        role: 'system',
        content:
          'Given a legal case, predict its appropriate priority: LOW|MEDIUM|HIGH|URGENT. ' +
          'Consider deadline proximity, task complexity, and open-task count. ' +
          'Return only the priority plus a one-sentence rationale.',
      },
      {
        role: 'user',
        content: `Case context: ${JSON.stringify(context)}.`,
      },
    ] as unknown as Parameters<typeof structured.invoke>[0]);
    const safe = PriorityLLMSchema.safeParse(raw);
    if (safe.success) parsed = safe.data;
    else source = 'fallback';
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case priority prediction LLM call failed');
    source = 'fallback';
  }

  const predictedPriority = parsed?.predictedPriority ?? 'MEDIUM';
  const modelVersion = parsed?.modelVersion ?? DEFAULT_MODEL_VERSION;
  const now = new Date();

  try {
    await prisma.caseAIInsight.upsert({
      where: { caseId },
      create: {
        caseId,
        tenantId,
        predictedPriority,
        modelVersion,
        source,
        generatedAt: now,
      },
      update: {
        predictedPriority,
        modelVersion,
        source,
        generatedAt: now,
      },
    });
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case priority prediction upsert failed');
    return { success: false, reason: 'db-upsert-error' };
  }

  return { success: true, source, modelVersion, predictedPriority };
}
