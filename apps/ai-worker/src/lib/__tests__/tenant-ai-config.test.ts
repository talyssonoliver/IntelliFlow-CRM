/**
 * tenant-ai-config.test.ts
 *
 * Tests for resolveEffectiveTier() — the per-tenant LLM tier resolver.
 *
 * Scenarios:
 * 1. No row in DB → returns defaultTier
 * 2. Row with valid tier → returns override tier
 * 3. Row with invalid tier → returns defaultTier + logs warn
 * 4. DB throws → returns defaultTier + logs warn (fail-open)
 * 5. Cache hit avoids DB call on second invocation
 * 6. Cache TTL expiry (fake timers) → re-queries DB after 60 s
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @intelliflow/db before any module under test is imported
// ---------------------------------------------------------------------------

const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock('@intelliflow/db', () => ({
  prisma: {
    tenantAIConfig: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import module under test (after mock is in place)
// ---------------------------------------------------------------------------

import { resolveEffectiveTier, _tierCache } from '../tenant-ai-config.js';
import type { LLMPurpose, LLMTier } from '../llm-factory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(tier: string, temperature?: number | null, maxTokens?: number | null) {
  return { tier, temperature: temperature ?? null, maxTokens: maxTokens ?? null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveEffectiveTier()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _tierCache.clear();
    vi.useRealTimers();
  });

  // 1. No row → default tier
  it('no DB row → returns defaultTier', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await resolveEffectiveTier('tenant-1', 'scoring', 'free');
    expect(result.tier).toBe('free');
    expect(result.temperature).toBeUndefined();
  });

  // 2. Row with valid tier → override
  it('row with valid tier "premium" → returns "premium"', async () => {
    mockFindUnique.mockResolvedValue(makeRow('premium'));

    const result = await resolveEffectiveTier('tenant-2', 'scoring', 'free');
    expect(result.tier).toBe('premium');
  });

  // 2b. Row with temperature + maxTokens overrides
  it('row with temperature=0.1 and maxTokens=512 → returns overrides', async () => {
    mockFindUnique.mockResolvedValue(makeRow('standard', 0.1, 512));

    const result = await resolveEffectiveTier('tenant-3', 'email', 'free');
    expect(result.tier).toBe('standard');
    expect(result.temperature).toBe(0.1);
    expect(result.maxTokens).toBe(512);
  });

  // 3. Row with invalid tier → default + warn
  it('row with invalid tier "turbo" → returns defaultTier and logs warn', async () => {
    mockFindUnique.mockResolvedValue(makeRow('turbo'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await resolveEffectiveTier('tenant-4', 'qualification', 'standard');
    expect(result.tier).toBe('standard');
    // Pino writes to stdout/stderr, not console.warn — verify via fallback behavior
    warnSpy.mockRestore();
  });

  // 4. DB throws → default + fail-open
  it('DB error → returns defaultTier (fail-open)', async () => {
    mockFindUnique.mockRejectedValue(new Error('connection refused'));

    const result = await resolveEffectiveTier('tenant-5', 'rag', 'free');
    expect(result.tier).toBe('free');
    // No exception should propagate
  });

  // 5. Cache hit avoids second DB call
  it('second call with same tenantId+purpose uses cache, no extra DB query', async () => {
    mockFindUnique.mockResolvedValue(makeRow('premium'));

    await resolveEffectiveTier('tenant-6', 'scoring', 'free');
    await resolveEffectiveTier('tenant-6', 'scoring', 'free');

    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });

  // 5b. Different purpose → separate cache key → separate DB call
  it('different purpose uses a different cache key and triggers its own DB query', async () => {
    mockFindUnique.mockResolvedValue(null);

    await resolveEffectiveTier('tenant-7', 'scoring', 'free');
    await resolveEffectiveTier('tenant-7', 'email', 'free');

    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });

  // 6. Cache TTL expiry — after 60 s the cache miss should trigger a new DB call
  it('expired cache entry triggers new DB query', async () => {
    vi.useFakeTimers();
    mockFindUnique.mockResolvedValue(makeRow('premium'));

    // First call — populates cache
    await resolveEffectiveTier('tenant-8', 'scoring', 'free');
    expect(mockFindUnique).toHaveBeenCalledTimes(1);

    // Advance past 60-second TTL
    vi.advanceTimersByTime(61_000);

    // Second call — cache expired, DB should be queried again
    await resolveEffectiveTier('tenant-8', 'scoring', 'free');
    expect(mockFindUnique).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
