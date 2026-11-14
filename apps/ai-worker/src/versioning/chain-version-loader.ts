/**
 * Chain Version Loader Singleton
 *
 * Module-level VersionLoader singleton for use by AI chains inside ai-worker.
 * Chains import this to resolve tenant-specific prompts/configs from DB when
 * ChainVersionService is available, or fall back to hardcoded defaults.
 *
 * Wiring pattern: module singleton (no DI framework).
 * The ai-worker configures it at startup with `configureVersionLoaderFromPrisma()` (ai-worker.ts,
 * once Prisma is up), so a tenant's saved, active chain version is what its chains use. Until then,
 * and when a tenant has no active version, calls return the built-in configs (safe fallback).
 * Chains still keep their own prompt when a version's prompt has no slot for their input
 * (usableVersionedPrompt).
 *
 * Task: H3 — ChainVersion state machine wiring
 */

import { createVersionLoader, VersionLoader } from './version-loader';
import type { ChainType } from '@intelliflow/domain';
import type { EventBusPort } from '@intelliflow/application';

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

/** The loader only reads versions; nothing on this path publishes events. */
const READ_ONLY_EVENT_BUS: EventBusPort = {
  publish: async () => {},
  publishAll: async () => {},
  subscribe: async () => {},
};

/**
 * Point the shared loader at the database: a ChainVersionService over the Prisma chain-version
 * repositories. Each lookup is by (chain type, tenant), so a tenant only ever reads its own
 * versions. Feature flags are not wired here, so a percentage rollout serves the active version.
 */
export async function configureVersionLoaderFromPrisma(prisma: unknown): Promise<void> {
  const { PrismaChainVersionRepository, PrismaChainVersionAuditRepository } =
    await import('@intelliflow/adapters');
  const { ChainVersionService } = await import('@intelliflow/application');
  const service = new ChainVersionService(
    new PrismaChainVersionRepository(prisma as never),
    new PrismaChainVersionAuditRepository(prisma as never),
    null,
    READ_ONLY_EVENT_BUS
  );
  configureVersionLoader(service);
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
