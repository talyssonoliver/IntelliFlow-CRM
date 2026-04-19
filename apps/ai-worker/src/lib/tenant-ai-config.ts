/**
 * tenant-ai-config.ts
 *
 * Resolves per-tenant LLM tier overrides from the TenantAIConfig table.
 *
 * Design:
 * - Absence of a DB row means "use the factory hardcoded default tier".
 * - A row overrides the tier for that tenant+purpose combination.
 * - 60-second TTL cache keyed by `${tenantId}:${purpose}` minimises DB hits;
 *   this TTL matches the circuit-breaker reset timeout used elsewhere.
 * - Validation: if the stored tier is not one of the known LLMTier values,
 *   log a warning and fall back to the caller-supplied default.
 * - Fail-open: DB errors return the default tier so chains stay functional.
 */

import { prisma } from '@intelliflow/db';
import pino from 'pino';
import type { LLMPurpose, LLMTier } from './llm-factory.js';

const logger = pino({
  name: 'tenant-ai-config',
  level: process.env['LOG_LEVEL'] || 'info',
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  tier: LLMTier;
  temperature?: number | null;
  maxTokens?: number | null;
  expiresAt: number; // ms epoch
}

// Exported so tests can clear it between runs.
export const _tierCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 60_000; // 60 seconds

function _cacheKey(tenantId: string, purpose: LLMPurpose): string {
  return `${tenantId}:${purpose}`;
}

const VALID_TIERS: ReadonlySet<string> = new Set<LLMTier>(['free', 'standard', 'premium']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of resolving the effective tier for a tenant+purpose.
 * Includes optional overrides for temperature and maxTokens
 * if the DB row specifies them.
 */
export interface EffectiveTierConfig {
  tier: LLMTier;
  temperature?: number | null;
  maxTokens?: number | null;
}

/**
 * Resolve the effective LLM tier (and optional model params) for a given
 * tenant + purpose combination.
 *
 * Resolution order:
 *  1. In-memory cache (60-second TTL).
 *  2. `tenant_ai_config` table lookup.
 *  3. Falls back to `defaultTier` on cache miss, invalid row value, or DB error.
 *
 * Fail-open: any DB error returns the caller-supplied default so the chain
 * continues to operate normally.
 */
export async function resolveEffectiveTier(
  tenantId: string,
  purpose: LLMPurpose,
  defaultTier: LLMTier
): Promise<EffectiveTierConfig> {
  const key = _cacheKey(tenantId, purpose);
  const now = Date.now();

  // 1. Cache hit
  const cached = _tierCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { tier: cached.tier, temperature: cached.temperature, maxTokens: cached.maxTokens };
  }

  // 2. DB lookup
  try {
    const row = await prisma.tenantAIConfig.findUnique({
      where: { tenantId_purpose: { tenantId, purpose } },
    });

    if (!row) {
      // No override configured — cache the default so we skip DB on the next call.
      _tierCache.set(key, {
        tier: defaultTier,
        temperature: null,
        maxTokens: null,
        expiresAt: now + CACHE_TTL_MS,
      });
      return { tier: defaultTier };
    }

    // Validate tier value
    if (!VALID_TIERS.has(row.tier)) {
      logger.warn(
        { tenantId, purpose, rowTier: row.tier },
        'TenantAIConfig row has invalid tier value — falling back to default'
      );
      _tierCache.set(key, {
        tier: defaultTier,
        temperature: null,
        maxTokens: null,
        expiresAt: now + CACHE_TTL_MS,
      });
      return { tier: defaultTier };
    }

    const effectiveTier = row.tier as LLMTier;
    const entry: CacheEntry = {
      tier: effectiveTier,
      temperature: row.temperature ?? null,
      maxTokens: row.maxTokens ?? null,
      expiresAt: now + CACHE_TTL_MS,
    };
    _tierCache.set(key, entry);

    return { tier: effectiveTier, temperature: entry.temperature, maxTokens: entry.maxTokens };
  } catch (err) {
    logger.warn(
      { tenantId, purpose, error: err instanceof Error ? err.message : String(err) },
      'TenantAIConfig DB lookup failed — using default tier (fail-open)'
    );
    return { tier: defaultTier };
  }
}

// ---------------------------------------------------------------------------
// P2.8 — Per-tenant rate-limit resolver
// ---------------------------------------------------------------------------

interface RateLimitCacheEntry {
  rateLimitPerMinute: number | null;
  expiresAt: number;
}

/** Cache for per-tenant rate-limit overrides. Keyed by `${tenantId}:${purpose}`. */
export const _rateLimitCache = new Map<string, RateLimitCacheEntry>();

/**
 * Resolve the effective per-minute rate limit for a tenant+purpose.
 *
 * Resolution order:
 *  1. In-memory cache (60-second TTL).
 *  2. `tenant_ai_config.rateLimitPerMinute` lookup.
 *  3. `globalDefault` (typically the `AI_RATE_LIMIT_PER_MINUTE` env var).
 *
 * A DB column value of NULL, a missing row, an invalid row, or any DB error
 * all degrade to `globalDefault`. Fail-open: never throws.
 */
export async function resolveRateLimit(
  tenantId: string,
  purpose: LLMPurpose,
  globalDefault: number
): Promise<number> {
  const key = _cacheKey(tenantId, purpose);
  const now = Date.now();

  const cached = _rateLimitCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.rateLimitPerMinute ?? globalDefault;
  }

  try {
    const row = await prisma.tenantAIConfig.findUnique({
      where: { tenantId_purpose: { tenantId, purpose } },
      select: { rateLimitPerMinute: true },
    });

    const value = row?.rateLimitPerMinute ?? null;
    _rateLimitCache.set(key, { rateLimitPerMinute: value, expiresAt: now + CACHE_TTL_MS });
    return value ?? globalDefault;
  } catch (err) {
    logger.warn(
      { tenantId, purpose, error: err instanceof Error ? err.message : String(err) },
      'TenantAIConfig rate-limit lookup failed — using global default (fail-open)'
    );
    return globalDefault;
  }
}
