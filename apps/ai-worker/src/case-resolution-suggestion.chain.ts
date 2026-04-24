/**
 * PG-190 — Case resolution suggestion chain.
 *
 * LLM proposes a concrete next-action "resolution" for a case (e.g. "File
 * motion to dismiss by {date}", "Request additional discovery from opposing
 * counsel"). Written to CaseAIInsight.suggestedResolution.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'case-resolution-suggestion.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const ResolutionLLMSchema = z.object({
  suggestedResolution: z.string().min(1).max(2000),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'case-resolution-suggestion-v1';

export interface CaseResolutionContext {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  tasks?: Array<{ title: string; status: string }>;
  activities?: Array<{ type: string; at: string; summary?: string }>;
}

export interface SuggestCaseResolutionInput {
  caseId: string;
  tenantId: string;
  context: CaseResolutionContext;
}

export type SuggestCaseResolutionResult =
  | {
      success: true;
      source: 'llm' | 'fallback';
      modelVersion: string;
      suggestedResolution: string;
    }
  | { success: false; reason: string };

export async function suggestCaseResolution(
  input: SuggestCaseResolutionInput
): Promise<SuggestCaseResolutionResult> {
  const { caseId, tenantId, context } = input;

  let parsed: z.infer<typeof ResolutionLLMSchema> | null = null;
  let source: 'llm' | 'fallback' = 'llm';

  try {
    const model = await createLLMForTenant('qualification', 'standard', { tenantId });
    const structured = model.withStructuredOutput(ResolutionLLMSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You advise an attorney on the best next action to move a case toward resolution. ' +
            'Return a single concrete recommended action with a rationale.',
        },
        {
          role: 'user',
          content: `Case context: ${JSON.stringify(context)}. Suggest the single most impactful next action.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );
    const safe = ResolutionLLMSchema.safeParse(raw);
    if (safe.success) parsed = safe.data;
    else source = 'fallback';
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case resolution suggestion LLM call failed');
    source = 'fallback';
  }

  const suggestedResolution =
    parsed?.suggestedResolution ?? 'Review case materials and identify open blockers before next status meeting.';
  const modelVersion = parsed?.modelVersion ?? DEFAULT_MODEL_VERSION;
  const now = new Date();

  try {
    await prisma.caseAIInsight.upsert({
      where: { caseId },
      create: {
        caseId,
        tenantId,
        suggestedResolution,
        modelVersion,
        source,
        generatedAt: now,
      } as never,
      update: {
        suggestedResolution,
        modelVersion,
        source,
        generatedAt: now,
      } as never,
    });
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case resolution suggestion upsert failed');
    return { success: false, reason: 'db-upsert-error' };
  }

  return { success: true, source, modelVersion, suggestedResolution };
}
