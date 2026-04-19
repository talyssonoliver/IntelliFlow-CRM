/**
 * Registry Tenant Gate Integration Tests
 *
 * H6 (2026-04-17 audit): Verifies getForTenant correctly routes through the
 * registry and enforces the enablement gate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getForTenant, ToolDisabledError, __invalidateCache } from '../index';
import type { PrismaClient } from '@intelliflow/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPrisma(enabled: boolean | null) {
  return {
    tenantToolEnablement: {
      findUnique: vi.fn().mockResolvedValue(enabled === null ? null : { enabled }),
    },
  } as unknown as PrismaClient;
}

const TENANT = 'tenant-bbb';
const REGISTERED_TOOL = 'search_leads';
const UNKNOWN_TOOL = 'nonexistent_tool';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getForTenant', () => {
  beforeEach(() => {
    __invalidateCache();
  });

  afterEach(() => {
    __invalidateCache();
  });

  it('returns the tool definition when tool is enabled (no row → default enabled)', async () => {
    const prisma = buildPrisma(null);
    const tool = await getForTenant({ name: REGISTERED_TOOL, tenantId: TENANT, prisma });
    expect(tool).toBeDefined();
    expect(tool?.name).toBe(REGISTERED_TOOL);
  });

  it('returns the tool definition when row explicitly has enabled=true', async () => {
    const prisma = buildPrisma(true);
    const tool = await getForTenant({ name: REGISTERED_TOOL, tenantId: TENANT, prisma });
    expect(tool).toBeDefined();
    expect(tool?.name).toBe(REGISTERED_TOOL);
  });

  it('throws ToolDisabledError when row has enabled=false', async () => {
    const prisma = buildPrisma(false);
    await expect(getForTenant({ name: REGISTERED_TOOL, tenantId: TENANT, prisma })).rejects.toThrow(
      ToolDisabledError
    );
  });

  it('ToolDisabledError carries toolName and tenantId', async () => {
    const prisma = buildPrisma(false);
    let caught: ToolDisabledError | undefined;
    try {
      await getForTenant({ name: REGISTERED_TOOL, tenantId: TENANT, prisma });
    } catch (err) {
      caught = err as ToolDisabledError;
    }
    expect(caught).toBeInstanceOf(ToolDisabledError);
    expect(caught?.toolName).toBe(REGISTERED_TOOL);
    expect(caught?.tenantId).toBe(TENANT);
  });

  it('returns undefined for an unknown tool name (not ToolDisabledError)', async () => {
    const prisma = buildPrisma(null);
    // findUnique should never be called for unknown tools — but even if it is,
    // the registry lookup short-circuits first.
    const tool = await getForTenant({ name: UNKNOWN_TOOL, tenantId: TENANT, prisma });
    expect(tool).toBeUndefined();
  });
});
