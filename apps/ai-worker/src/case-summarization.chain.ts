/**
 * PG-190 — Case summarization chain.
 *
 * LLM produces a concise narrative summary of a case + its activities and
 * persists it into CaseAIInsight.summary. Distinct from case-insight in that
 * this is the text-only summarization path; insight generation is the full
 * structured-analysis path.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'case-summarization.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const SummaryLLMSchema = z.object({
  summary: z.string().min(1).max(2000),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'case-summarization-v1';

export interface CaseSummarizationContext {
  title?: string;
  description?: string | null;
  tasks?: Array<{ title: string; status: string }>;
  activities?: Array<{ type: string; at: string; summary?: string }>;
}

export interface GenerateCaseSummaryInput {
  caseId: string;
  tenantId: string;
  context: CaseSummarizationContext;
}

export type GenerateCaseSummaryResult =
  | { success: true; source: 'llm' | 'fallback'; modelVersion: string; summary: string }
  | { success: false; reason: string };

export async function generateCaseSummary(
  input: GenerateCaseSummaryInput
): Promise<GenerateCaseSummaryResult> {
  const { caseId, tenantId, context } = input;

  let parsed: z.infer<typeof SummaryLLMSchema> | null = null;
  let source: 'llm' | 'fallback' = 'llm';

  try {
    const model = await createLLMForTenant('qualification', 'standard', { tenantId });
    const structured = model.withStructuredOutput(SummaryLLMSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You summarize a legal case for a busy attorney. Return a short ' +
            'paragraph (max 2000 chars) covering current status, key parties, ' +
            'and what the next action should be.',
        },
        {
          role: 'user',
          content: `Case context: ${JSON.stringify(context)}. Generate summary.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );
    const safe = SummaryLLMSchema.safeParse(raw);
    if (safe.success) parsed = safe.data;
    else source = 'fallback';
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case summarization LLM call failed');
    source = 'fallback';
  }

  const summary = parsed?.summary ?? `Case ${caseId}: automatic summary unavailable.`;
  const modelVersion = parsed?.modelVersion ?? DEFAULT_MODEL_VERSION;
  const now = new Date();

  try {
    await prisma.caseAIInsight.upsert({
      where: { caseId },
      create: {
        caseId,
        tenantId,
        summary,
        modelVersion,
        source,
        generatedAt: now,
      } as never,
      update: {
        summary,
        modelVersion,
        source,
        generatedAt: now,
      } as never,
    });
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case summarization upsert failed');
    return { success: false, reason: 'db-upsert-error' };
  }

  return { success: true, source, modelVersion, summary };
}
