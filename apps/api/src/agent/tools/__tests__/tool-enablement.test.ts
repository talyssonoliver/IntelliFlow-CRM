/**
 * Tool Enablement Helper Tests
 *
 * H6 (2026-04-17 audit): Covers all cache + DB paths for isToolEnabledForTenant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isToolEnabledForTenant,
  __invalidateCache,
  __getCacheSnapshot,
  ToolDisabledError,
} from '../tool-enablement';
import type { PrismaClient } from '@intelliflow/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TenantToolFindUnique = (args: {
  where: { tenantId_toolName: { tenantId: string; toolName: string } };
  select: { enabled: true };
}) => Promise<{ enabled: boolean } | null>;

function buildPrisma(findUnique: TenantToolFindUnique) {
  return {
    tenantToolEnablement: { findUnique },
  } as unknown as PrismaClient;
}

const TENANT = 'tenant-aaa';
const TOOL = 'search_leads';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('isToolEnabledForTenant', () => {
  beforeEach(() => {
    __invalidateCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    __invalidateCache();
  });

  it('no row in DB → returns true (default-enabled)', async () => {
    const prisma = buildPrisma(vi.fn().mockResolvedValue(null));
    const result = await isToolEnabledForTenant(prisma, TENANT, TOOL);
    expect(result).toBe(true);
  });

  it('row with enabled=true → returns true', async () => {
    const prisma = buildPrisma(vi.fn().mockResolvedValue({ enabled: true }));
    const result = await isToolEnabledForTenant(prisma, TENANT, TOOL);
    expect(result).toBe(true);
  });

  it('row with enabled=false → returns false', async () => {
    const prisma = buildPrisma(vi.fn().mockResolvedValue({ enabled: false }));
    const result = await isToolEnabledForTenant(prisma, TENANT, TOOL);
    expect(result).toBe(false);
  });

  it('DB throws → fail-open (returns true) and logs warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prisma = buildPrisma(vi.fn().mockRejectedValue(new Error('DB connection refused')));

    const result = await isToolEnabledForTenant(prisma, TENANT, TOOL);

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DB query failed'));
    warnSpy.mockRestore();
  });

  it('second call hits cache, not DB', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const prisma = buildPrisma(findUnique);

    await isToolEnabledForTenant(prisma, TENANT, TOOL);
    await isToolEnabledForTenant(prisma, TENANT, TOOL);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('__invalidateCache({tenantId, toolName}) forces DB re-query', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const prisma = buildPrisma(findUnique);

    await isToolEnabledForTenant(prisma, TENANT, TOOL);
    __invalidateCache({ tenantId: TENANT, toolName: TOOL });
    await isToolEnabledForTenant(prisma, TENANT, TOOL);

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('__invalidateCache() with no args flushes all entries', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const prisma = buildPrisma(findUnique);

    await isToolEnabledForTenant(prisma, TENANT, 'search_leads');
    await isToolEnabledForTenant(prisma, TENANT, 'create_case');
    expect(__getCacheSnapshot().size).toBe(2);

    __invalidateCache();
    expect(__getCacheSnapshot().size).toBe(0);
  });

  it('cache TTL expires after 60 s → DB re-queried', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const prisma = buildPrisma(findUnique);

    // First call — populates cache
    await isToolEnabledForTenant(prisma, TENANT, TOOL);
    expect(findUnique).toHaveBeenCalledTimes(1);

    // Advance time past TTL (60 001 ms)
    vi.advanceTimersByTime(60_001);

    // Second call — cache expired, re-queries DB
    await isToolEnabledForTenant(prisma, TENANT, TOOL);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('ToolDisabledError', () => {
  it('includes toolName and tenantId in message', () => {
    const err = new ToolDisabledError('create_case', 'tenant-xyz');
    expect(err.message).toContain('create_case');
    expect(err.message).toContain('tenant-xyz');
    expect(err.toolName).toBe('create_case');
    expect(err.tenantId).toBe('tenant-xyz');
    expect(err.name).toBe('ToolDisabledError');
    expect(err instanceof Error).toBe(true);
  });
});
