/**
 * Feature Flag Provider — AI Worker
 *
 * Uses InMemoryFeatureFlagProvider from @intelliflow/platform to evaluate
 * AI-worker feature flags.  An env-var override layer is preserved on top so
 * ops can emergency-kill a job class without a deploy:
 *   ENABLE_AI_SCORING_JOB=false   → always disables ai.scoring.enabled
 *   ENABLE_AI_INSIGHTS_JOB=false  → always disables ai.insights.enabled
 *   ENABLE_AI_PREDICTION_JOB=false → always disables ai.prediction.enabled
 *
 * Seed flags mirror apps/api/src/config/feature-flags.config.ts (the three
 * AI BullMQ job flags).  All three default to enabled:true.
 */

import { InMemoryFeatureFlagProvider } from '@intelliflow/platform/feature-flags';

// ---------------------------------------------------------------------------
// Seed — mirrors the ai-job flags declared in the API feature-flags config
// ---------------------------------------------------------------------------

const AI_JOB_FLAGS_SEED = {
  version: 1 as const,
  flags: [
    {
      key: 'ai.scoring.enabled',
      description: 'Enable AI scoring job for tenant',
      enabled: true,
    },
    {
      key: 'ai.insights.enabled',
      description: 'Enable AI insights job for tenant',
      enabled: true,
    },
    {
      key: 'ai.prediction.enabled',
      description: 'Enable AI prediction job for tenant',
      enabled: true,
    },
  ],
};

// Module-level singleton — constructed once at import time.
const provider = InMemoryFeatureFlagProvider.fromConfig(AI_JOB_FLAGS_SEED);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AiFeatureFlagKey =
  | 'ai.scoring.enabled'
  | 'ai.insights.enabled'
  | 'ai.prediction.enabled';

/** Map of flag key → env-var name that can emergency-disable it. */
const FLAG_ENV_MAP: Record<AiFeatureFlagKey, string> = {
  'ai.scoring.enabled': 'ENABLE_AI_SCORING_JOB',
  'ai.insights.enabled': 'ENABLE_AI_INSIGHTS_JOB',
  'ai.prediction.enabled': 'ENABLE_AI_PREDICTION_JOB',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when the flag is enabled for the given tenant/subject.
 *
 * Evaluation order:
 * 1. If the corresponding env var is exactly `"false"`, return false.
 *    (Emergency ops kill-switch — takes priority over everything.)
 * 2. Delegate to InMemoryFeatureFlagProvider.isEnabled() with subjectId.
 * 3. Unknown flag key → default true (consistent with original shim behaviour).
 */
export function isAiFeatureEnabled(key: AiFeatureFlagKey, subjectId?: string): boolean {
  // Layer 1: env-var emergency override
  const envVar = FLAG_ENV_MAP[key];
  if (envVar && process.env[envVar] === 'false') return false;

  // Layer 2: provider evaluation
  return provider.isEnabled(key, subjectId ? { subjectId } : undefined);
}
