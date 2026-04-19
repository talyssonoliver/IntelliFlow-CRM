/**
 * Chain Version Loader Singleton
 *
 * Module-level VersionLoader singleton for use by AI chains inside ai-worker.
 * Chains import this to resolve tenant-specific prompts/configs from DB when
 * ChainVersionService is available, or fall back to hardcoded defaults.
 *
 * Wiring pattern: module singleton (no DI framework).
 * The versionService can be injected at startup via `configureVersionLoader()`.
 * Until configured, all calls return default configs (safe fallback).
 *
 * Task: H3 — ChainVersion state machine wiring
 */

import { createVersionLoader, VersionLoader } from './version-loader';
import type { ChainType } from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _versionLoader: VersionLoader = createVersionLoader();

/**
 * Inject a version service into the shared loader.
 * Call this once at ai-worker startup when a DB connection is available.
 */
export function configureVersionLoader(
  versionService: ConstructorParameters<typeof VersionLoader>[0]
): void {
  _versionLoader = createVersionLoader(versionService);
}

/**
 * Get the shared VersionLoader instance.
 * Always returns a valid loader (may be fallback-only if not yet configured).
 */
export function getVersionLoader(): VersionLoader {
  return _versionLoader;
}

// ---------------------------------------------------------------------------
// Chain-type mapping
// ---------------------------------------------------------------------------

/**
 * Maps each ai-worker chain to the nearest ChainType supported by the
 * ChainVersion schema.  The domain only defines 4 types today; once new
 * ChainType values are added the mapping should be updated to be exact.
 *
 * SCORING       → LeadScoringChain, ChurnRiskChain
 * QUALIFICATION → InsightGenerationChain
 * EMAIL_WRITER  → SentimentAnalysisChain, AutoResponseChain
 * FOLLOWUP      → TicketRoutingChain
 */
export const CHAIN_TYPE_MAP = {
  LEAD_SCORING: 'SCORING',
  CHURN_RISK: 'SCORING',
  INSIGHT_GENERATION: 'QUALIFICATION',
  SENTIMENT_ANALYSIS: 'EMAIL_WRITER',
  TICKET_ROUTING: 'FOLLOWUP',
  AUTO_RESPONSE: 'EMAIL_WRITER',
} as const satisfies Record<string, ChainType>;

export type WorkerChainKey = keyof typeof CHAIN_TYPE_MAP;
