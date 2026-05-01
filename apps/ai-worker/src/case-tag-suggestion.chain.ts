/**
 * PG-190 — Case tag suggestion chain.
 *
 * LLM proposes 3-7 candidate tags for a given case based on its title,
 * description, jurisdiction, and priority. Called synchronously from the
 * settings page or cases router via the shared tag-suggestion queue with
 * entityType='case'. Does NOT persist; the returned payload is the response
 * to the waitUntilFinished caller.
 */

import { z } from 'zod';
import pino from 'pino';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'case-tag-suggestion.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const TagSuggestionLLMSchema = z.object({
  suggestions: z
    .array(
      z.object({
        label: z.string().min(1).max(50),
        confidence: z.number().min(0).max(1),
        reason: z.string().min(1).max(200),
      })
    )
    .min(1)
    .max(10),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'case-tag-suggestion-v1';

export interface CaseProfileSnapshot {
  title?: string;
  description?: string | null;
  jurisdiction?: string | null;
  priority?: string;
  status?: string;
}

export interface SuggestCaseTagsInput {
  caseId: string;
  tenantId: string;
  profileSnapshot: CaseProfileSnapshot;
}

export interface SuggestCaseTagsResult {
  suggestions: Array<{ label: string; confidence: number; reason: string }>;
  modelVersion: string;
}

export async function suggestCaseTags(input: SuggestCaseTagsInput): Promise<SuggestCaseTagsResult> {
  const { caseId, tenantId, profileSnapshot } = input;

  try {
    const model = await createLLMForTenant('qualification', 'standard', { tenantId });
    const structured = model.withStructuredOutput(TagSuggestionLLMSchema);
    const raw = await structured.invoke([
      {
        role: 'system',
        content:
          'Suggest 3-7 short tags (one-two words each) that organize a legal case. ' +
          'Each tag must include a 0-1 confidence and a one-sentence reason. ' +
          'Prefer practice-area terms, jurisdiction, and case-type over people names.',
      },
      {
        role: 'user',
        content: `Case profile: ${JSON.stringify(profileSnapshot)}.`,
      },
    ] as unknown as Parameters<typeof structured.invoke>[0]);
    const safe = TagSuggestionLLMSchema.safeParse(raw);
    if (safe.success) {
      return {
        suggestions: safe.data.suggestions,
        modelVersion: safe.data.modelVersion ?? DEFAULT_MODEL_VERSION,
      };
    }
    logger.warn({ err: safe.error, caseId, tenantId }, 'case tag suggestion parse failed');
    return { suggestions: [], modelVersion: DEFAULT_MODEL_VERSION };
  } catch (err) {
    logger.warn({ err, caseId, tenantId }, 'case tag suggestion LLM call failed');
    return { suggestions: [], modelVersion: DEFAULT_MODEL_VERSION };
  }
}
