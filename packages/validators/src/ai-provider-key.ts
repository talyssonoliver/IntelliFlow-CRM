/**
 * PG-199 BYOK: validators for a workspace's own AI provider key ("bring your own key").
 *
 * One key per workspace. The provider list is the single source for the API, the worker and
 * the page. The key itself is never part of any output type: a client only ever sees the
 * provider, the last four characters, dates and status (`AIProviderKeyDto`).
 */
import { z } from 'zod';

export const AI_KEY_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter'] as const;
export type AIKeyProvider = (typeof AI_KEY_PROVIDERS)[number];

export const AI_KEY_PROVIDER_LABELS: Readonly<Record<AIKeyProvider, string>> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  openrouter: 'OpenRouter',
};

export const AI_KEY_STATUSES = ['ACTIVE', 'INVALID', 'RATE_LIMITED', 'QUOTA_EXCEEDED'] as const;
export type AIKeyStatus = (typeof AI_KEY_STATUSES)[number];

/** Longest key accepted. Real provider keys are well under 300 characters. */
export const AI_KEY_MAX_LENGTH = 512;
export const AI_KEY_MIN_LENGTH = 16;

export const aiKeyProviderSchema = z.enum(AI_KEY_PROVIDERS);

/** A pasted key: trimmed, no whitespace or control characters inside, sane length. */
export const aiProviderKeySecretSchema = z
  .string()
  .trim()
  .min(AI_KEY_MIN_LENGTH, 'That key is too short to be a provider API key')
  .max(AI_KEY_MAX_LENGTH, 'That key is too long to be a provider API key')
  // Printable ASCII, no spaces: the key goes into an HTTP header.
  .regex(/^[\x21-\x7e]+$/, 'A key contains no spaces or special characters');

export const setAIProviderKeySchema = z.object({
  provider: aiKeyProviderSchema,
  apiKey: aiProviderKeySecretSchema,
  /**
   * When the key stops working, fall back to the platform providers. Omitted: a first key
   * fails the job (false) and a replacement keeps the stored choice.
   */
  allowFallback: z.boolean().optional(),
});
export type SetAIProviderKeyInput = z.infer<typeof setAIProviderKeySchema>;

/** Change only the fallback switch of the stored key (no key needed). */
export const updateAIProviderKeyOptionsSchema = z.object({
  allowFallback: z.boolean(),
});

/** What the API returns about the stored key. Never the key. */
export interface AIProviderKeyDto {
  provider: AIKeyProvider;
  /** Last four characters of the key, for recognition only. */
  last4: string;
  status: AIKeyStatus;
  /** Short reason when the status is not ACTIVE. */
  statusDetail: string | null;
  allowFallback: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** The last four characters of a key (the whole key is never shown, whatever its length). */
export function keyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}
