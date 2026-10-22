/**
 * Model config defaults and limits (PG-199, ADR-082).
 */

import { getQuotaPeriod } from '../../platform/quotas/QuotaRegistry';
import type { LLMPurpose, LLMTier } from './catalog';

/**
 * The catalog model behind each `${purpose}-${tier}` LiteLLM alias
 * (`infra/litellm/config.yaml`). Partial: there is no `rag-standard`.
 */
export const DEFAULT_MODEL: Readonly<Record<LLMPurpose, Partial<Record<LLMTier, string>>>> = {
  scoring: { free: 'llama-3.1-8b-instant', standard: 'mistral-small', premium: 'gpt-4o-mini' },
  qualification: {
    free: 'llama-3.3-70b-versatile',
    standard: 'mistral-medium',
    premium: 'gpt-4o',
  },
  email: {
    free: 'llama-3.1-8b-instant',
    standard: 'llama-3.3-70b-versatile',
    premium: 'claude-haiku-4-5',
  },
  reasoning: {
    free: 'gpt-oss-20b-free',
    standard: 'claude-haiku-4-5',
    premium: 'claude-sonnet-4-5',
  },
  structured: { free: 'gemini-2.5-flash', standard: 'mistral-small', premium: 'gpt-4o' },
  rag: { free: 'nomic-embed-text', premium: 'text-embedding-3-small' },
};

/**
 * The default tiers ai-worker callers pass for each purpose. A tenant row with a
 * NULL tier keeps each caller on its own default, so a purpose can run on more
 * than one default model. Kept in sync with the call sites by a parity test in
 * ai-worker; the callers themselves do not import it.
 */
export const CALLER_DEFAULT_TIERS: Readonly<Record<LLMPurpose, readonly LLMTier[]>> = {
  scoring: ['free', 'standard'],
  qualification: ['free', 'standard'],
  email: ['free', 'standard'],
  reasoning: ['free', 'premium'],
  structured: ['free', 'standard'],
  rag: ['free'],
};

export const MODEL_CONFIG_LIMITS = {
  temperatureMin: 0,
  temperatureMax: 2,
  maxTokensMin: 1,
  maxTokensMax: 32768,
  maxFallbacks: 3,
  /** 0 blocks the purpose outright; null (no row value) means no ceiling. */
  ceilingCentsMin: 0,
  ceilingCentsMax: 2_000_000,
} as const;

/** Usage-counter key for a purpose's monthly spend, in hundredths of a cent. */
export function purposeSpendKey(purpose: LLMPurpose): `aiSpendCentiCents:${LLMPurpose}` {
  return `aiSpendCentiCents:${purpose}`;
}

/** The UTC month bucket ('YYYY-MM') shared with the tenant-wide AI spend quota. */
export function purposeSpendPeriod(now: Date = new Date()): string {
  return getQuotaPeriod('aiSpendCentsPerMonth', now);
}
