/**
 * IFC-312 — Account tag-suggestion chain.
 * Mirrors `contact-tag-suggestion.chain.ts` for accounts.
 */

import { z } from 'zod';
import pino from 'pino';
import { createLLMForTenant } from './lib/llm-factory.js';
import { sanitizeStringField } from './utils/input-sanitizer.js';

const logger = pino({
  name: 'account-tag-suggestion.chain',
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
const DEFAULT_MODEL_VERSION = 'account-tag-suggestion-v1';

export interface AccountProfileSnapshot {
  name?: string;
  description?: string;
  industry?: string;
  website?: string;
  recentActivitySummary?: string;
}

export interface SuggestAccountTagsInput {
  accountId: string;
  tenantId: string;
  profileSnapshot: AccountProfileSnapshot;
}

export interface Suggestion {
  label: string;
  confidence: number;
  reason: string;
}

export interface SuggestAccountTagsResult {
  suggestions: Suggestion[];
  modelVersion: string;
}

function sanitizeSnapshot(s: AccountProfileSnapshot): AccountProfileSnapshot {
  const out: AccountProfileSnapshot = {};
  if (s.name) out.name = sanitizeStringField(s.name);
  if (s.description) out.description = sanitizeStringField(s.description);
  if (s.industry) out.industry = sanitizeStringField(s.industry);
  if (s.website) out.website = sanitizeStringField(s.website);
  if (s.recentActivitySummary)
    out.recentActivitySummary = sanitizeStringField(s.recentActivitySummary);
  return out;
}

export async function suggestAccountTags(
  input: SuggestAccountTagsInput
): Promise<SuggestAccountTagsResult> {
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
            'You suggest CRM tags for a company account. Up to 5 suggestions. ' +
            'Each has a label, confidence (0-1), and one-sentence reason.',
        },
        {
          role: 'user',
          content: `Account profile: ${JSON.stringify(sanitized)}. Suggest up to 5 tags.`,
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
    logger.warn({ err, tenantId }, 'account tag-suggestion chain failed');
    return { suggestions: [], modelVersion: DEFAULT_MODEL_VERSION };
  }
}
