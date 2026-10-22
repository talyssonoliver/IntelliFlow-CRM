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
  /**
   * The row's own tier, or null when no row / NULL tier / invalid tier: the caller's
   * default is applied on read, because callers of one purpose pass different defaults
   * (PG-199 A1) and a cached default must never leak from one caller to another.
   */
  tier: LLMTier | null;
  temperature?: number | null;
  maxTokens?: number | null;
  /** PG-199 model pin, ordered fallbacks and monthly ceiling (null/[] when unset). */
  modelId?: string | null;
  fallbackModelIds?: string[];
  ceilingCents?: number | null;
  /** False for a "no row" entry: nothing beyond the caller default applies. */
  hasRow: boolean;
  expiresAt: number; // ms epoch
}

// Exported so tests can clear it between runs.
export const _tierCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 60_000; // 60 seconds

function _cacheKey(tenantId: string, purpose: LLMPurpose): string {
  return `${tenantId}:${purpose}`;
}

const VALID_TIERS: ReadonlySet<string> = new Set<LLMTier>(['free', 'standard', 'premium']);

/** Columns that exist before the PG-199 migration (20261019120000). */
const LEGACY_SELECT = { tier: true, temperature: true, maxTokens: true } as const;

/** Prisma "table/column does not exist": the database has not been migrated yet. */
function isSchemaPending(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'P2021' || code === 'P2022';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of resolving the effective tier for a tenant+purpose.
 * Includes optional overrides for temperature and maxTokens and, since PG-199,
 * the model pin, fallback chain and monthly ceiling, when the DB row specifies them.
 */
export interface EffectiveTierConfig {
  tier: LLMTier;
  temperature?: number | null;
  maxTokens?: number | null;
  modelId?: string | null;
  fallbackModelIds?: string[];
  ceilingCents?: number | null;
}

function fromEntry(entry: CacheEntry, defaultTier: LLMTier): EffectiveTierConfig {
  if (!entry.hasRow) {
    return { tier: defaultTier, temperature: entry.temperature, maxTokens: entry.maxTokens };
  }
  return {
    tier: entry.tier ?? defaultTier,
    temperature: entry.temperature ?? null,
    maxTokens: entry.maxTokens ?? null,
    modelId: entry.modelId ?? null,
    fallbackModelIds: entry.fallbackModelIds ?? [],
    ceilingCents: entry.ceilingCents ?? null,
  };
}

interface TenantAIConfigRow {
  tier: string | null;
  temperature: number | null;
  maxTokens: number | null;
  modelId?: string | null;
  fallbackModelIds?: string[] | null;
  monthlyCostCeilingCents?: number | null;
}

/**
 * Read the row; on a pre-migration database (PG-199 columns missing) retry with the
 * legacy columns so the tier/temperature/maxTokens overrides keep working.
 */
async function readRow(tenantId: string, purpose: LLMPurpose): Promise<TenantAIConfigRow | null> {
  const where = { tenantId_purpose: { tenantId, purpose } };
  try {
    return (await prisma.tenantAIConfig.findUnique({ where })) as TenantAIConfigRow | null;
  } catch (err) {
    if (!isSchemaPending(err)) throw err;
    logger.warn(
      { tenantId, purpose, reason: 'schema_pending' },
      'TenantAIConfig PG-199 columns missing (migration not applied) — model pin and ceiling not enforced'
    );
    return (await prisma.tenantAIConfig.findUnique({
      where,
      select: LEGACY_SELECT,
    })) as TenantAIConfigRow | null;
  }
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
 * A NULL tier means "this caller's default tier" (PG-199 A1); the row's other
 * overrides still apply.
 *
 * Fail-open: a DB error returns the last known row for this tenant+purpose when there
 * is one (so an outage never lifts a ceiling), else the caller-supplied default, so
 * the chain continues to operate normally.
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
    return fromEntry(cached, defaultTier);
  }

  // 2. DB lookup
  try {
    const row = await readRow(tenantId, purpose);

    if (!row) {
      // No override configured — cache "no row" so we skip DB on the next call.
      _tierCache.set(key, {
        tier: null,
        temperature: null,
        maxTokens: null,
        hasRow: false,
        expiresAt: now + CACHE_TTL_MS,
      });
      return { tier: defaultTier };
    }

    // Validate tier value (NULL = this caller's default tier, PG-199)
    if (row.tier !== null && !VALID_TIERS.has(row.tier)) {
      logger.warn(
        { tenantId, purpose, rowTier: row.tier },
        'TenantAIConfig row has invalid tier value — falling back to default'
      );
      _tierCache.set(key, {
        tier: null,
        temperature: null,
        maxTokens: null,
        hasRow: false,
        expiresAt: now + CACHE_TTL_MS,
      });
      return { tier: defaultTier };
    }

    const entry: CacheEntry = {
      tier: row.tier as LLMTier | null,
      temperature: row.temperature ?? null,
      maxTokens: row.maxTokens ?? null,
      modelId: row.modelId ?? null,
      fallbackModelIds: row.fallbackModelIds ?? [],
      ceilingCents: row.monthlyCostCeilingCents ?? null,
      hasRow: true,
      expiresAt: now + CACHE_TTL_MS,
    };
    _tierCache.set(key, entry);

    return fromEntry(entry, defaultTier);
  } catch (err) {
    logger.warn(
      { tenantId, purpose, error: err instanceof Error ? err.message : String(err) },
      cached
        ? 'TenantAIConfig DB lookup failed — serving the last known row (fail-open)'
        : 'TenantAIConfig DB lookup failed — using default tier (fail-open)'
    );
    return cached ? fromEntry(cached, defaultTier) : { tier: defaultTier };
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
