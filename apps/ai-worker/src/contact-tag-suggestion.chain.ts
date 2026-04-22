/**
 * IFC-312 — Contact tag-suggestion chain.
 *
 * Synchronous chain invoked by `contact.suggestTags` tRPC procedure via the
 * BullMQ AI_TAG_SUGGESTION queue + `waitUntilFinished(5s)` pattern. Returns
 * up to 5 suggestions filtered by `confidence >= 0.3`. Never throws to the
 * caller — LLM errors / parse errors resolve to an empty list.
 */

import { z } from 'zod';
import pino from 'pino';
import { createLLMForTenant } from './lib/llm-factory.js';
import { sanitizeStringField } from './utils/input-sanitizer.js';

const logger = pino({
  name: 'contact-tag-suggestion.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const SuggestionSchema = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const LLMOutputSchema = z.object({
  suggestions: z.array(SuggestionSchema),
  modelVersion: z.string().optional(),
});

const MAX_SUGGESTIONS = 5;
const MIN_CONFIDENCE = 0.3;
const DEFAULT_MODEL_VERSION = 'contact-tag-suggestion-v1';

export interface ContactProfileSnapshot {
  bio?: string;
  company?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  recentActivitySummary?: string;
}

export interface SuggestContactTagsInput {
  contactId: string;
  tenantId: string;
  profileSnapshot: ContactProfileSnapshot;
}

export interface Suggestion {
  label: string;
  confidence: number;
  reason: string;
}

export interface SuggestContactTagsResult {
  suggestions: Suggestion[];
  modelVersion: string;
}

function sanitizeSnapshot(s: ContactProfileSnapshot): ContactProfileSnapshot {
  const out: ContactProfileSnapshot = {};
  if (s.bio) out.bio = sanitizeStringField(s.bio);
  if (s.company) out.company = sanitizeStringField(s.company);
  if (s.title) out.title = sanitizeStringField(s.title);
  if (s.firstName) out.firstName = sanitizeStringField(s.firstName);
  if (s.lastName) out.lastName = sanitizeStringField(s.lastName);
  if (s.recentActivitySummary)
    out.recentActivitySummary = sanitizeStringField(s.recentActivitySummary);
  return out;
}

export async function suggestContactTags(
  input: SuggestContactTagsInput
): Promise<SuggestContactTagsResult> {
  const { tenantId, profileSnapshot } = input;
  const sanitized = sanitizeSnapshot(profileSnapshot);

  try {
    const model = await createLLMForTenant('structured', 'free', { tenantId });
    const structured = model.withStructuredOutput(LLMOutputSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You suggest CRM tags for a contact profile. Return up to 5 suggestions. ' +
            'Each suggestion includes a short tag label, confidence (0-1), and one-sentence reason. ' +
            'Only emit suggestions you are confident in. Confidence must reflect evidence strength.',
        },
        {
          role: 'user',
          content: `Profile: ${JSON.stringify(sanitized)}. Return up to 5 tag suggestions.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );

    const parsed = LLMOutputSchema.safeParse(raw);
    if (!parsed.success) {
      return { suggestions: [], modelVersion: DEFAULT_MODEL_VERSION };
    }

    const filtered = parsed.data.suggestions
      .filter((s) => s.confidence >= MIN_CONFIDENCE)
      .slice(0, MAX_SUGGESTIONS);

    return {
      suggestions: filtered,
      modelVersion: parsed.data.modelVersion ?? DEFAULT_MODEL_VERSION,
    };
  } catch (err) {
    logger.warn({ err, tenantId }, 'tag-suggestion chain failed');
    return { suggestions: [], modelVersion: DEFAULT_MODEL_VERSION };
  }
}
