/**
 * PrismaTenantModuleRepository Tests
 *
 * Covers all public methods of PrismaTenantModuleRepository.
 * Key regression: getTenantPlan MUST issue exactly ONE $queryRaw call
 * (no per-user user.findMany) regardless of how many users exist in the tenant.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaTenantModuleRepository } from '../PrismaTenantModuleRepository';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function createMockPrisma(): Record<string, any> {
  return {
    $queryRaw: vi.fn(),
    tenantModule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-module-test';

function makeModuleRecord(moduleId: string, enabled: boolean) {
  return {
    tenantId: TENANT_ID,
    moduleId,
    enabled,
    enabledAt: new Date('2025-01-01T00:00:00Z'),
    disabledAt: null,
  };
}

// ---------------------------------------------------------------------------
// getTenantPlan — N+1 regression tests
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository.getTenantPlan', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('issues exactly ONE $queryRaw call regardless of tenant size', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'PROFESSIONAL' }]);

    await repo.getTenantPlan(TENANT_ID);

    // N+1 regression: must be exactly 1 DB call, not 1-per-user
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does NOT call user.findMany (the removed N+1 query)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);

    await repo.getTenantPlan(TENANT_ID);

    // Ensure the per-user query was removed
    expect(mockPrisma.user).toBeUndefined();
  });

  it('passes tenantId as a bound parameter in the raw query', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await repo.getTenantPlan(TENANT_ID);

    // $queryRaw with a tagged-template literal receives the TemplateStringsArray
    // as args[0] and each interpolated value as subsequent positional arguments.
    // The tenantId is the first (and only) interpolated parameter.
    const callArgs = mockPrisma.$queryRaw.mock.calls[0];
    // callArgs[0] is the TemplateStringsArray; callArgs[1] is the first bound value
    expect(callArgs[1]).toBe(TENANT_ID);
  });

  it('returns the plan from the query result', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'ENTERPRISE' }]);

    const plan = await repo.getTenantPlan(TENANT_ID);

    expect(plan).toBe('ENTERPRISE');
  });

  it('returns STARTER when no workspace is found (null row)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const plan = await repo.getTenantPlan(TENANT_ID);

    expect(plan).toBe('STARTER');
  });

  it('returns STARTER when query result has undefined plan', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: undefined }]);

    const plan = await repo.getTenantPlan(TENANT_ID);

    expect(plan).toBe('STARTER');
  });

  it('call count stays at 1 even when called multiple times independently', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'PROFESSIONAL' }]);

    // Simulates two independent calls (e.g. getEnabledModules + isModuleEnabled)
    await repo.getTenantPlan(TENANT_ID);
    await repo.getTenantPlan(TENANT_ID);

    // 2 independent calls = 2 total, but each is still only 1 DB round-trip (not N)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// getEnabledModules
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository.getEnabledModules', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('returns plan defaults when there are no overrides', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    // STARTER includes CORE_CRM, SUPPORT, AI_INTELLIGENCE, ANALYTICS (from MODULE_PLAN_MAP)
    expect(modules).toContain('CORE_CRM');
    expect(modules).toContain('SUPPORT');
    expect(modules).toContain('AI_INTELLIGENCE');
    expect(modules).toContain('ANALYTICS');
  });

  it('applies enabled override to add a module not in plan', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('LEGAL', true)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).toContain('LEGAL');
  });

  it('applies disabled override to remove a module from plan', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'PROFESSIONAL' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('LEGAL', false)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).not.toContain('LEGAL');
  });

  it('never disables CORE_CRM even with an explicit disabled override', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('CORE_CRM', false)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).toContain('CORE_CRM');
  });

  it('returns modules in canonical CRM_MODULES order', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'ENTERPRISE' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    // All returned values should appear in CRM_MODULES canonical order
    const CRM_MODULES = [
      'CORE_CRM',
      'LEGAL',
      'SUPPORT',
      'AI_INTELLIGENCE',
      'ANALYTICS',
      'COMMERCE',
    ];
    const indices = modules.map((m) => CRM_MODULES.indexOf(m));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('uses exactly one $queryRaw call for getTenantPlan', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    await repo.getEnabledModules(TENANT_ID);

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// isModuleEnabled
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository.isModuleEnabled', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('always returns true for CORE_CRM without any DB call', async () => {
    const result = await repo.isModuleEnabled(TENANT_ID, 'CORE_CRM');

    expect(result).toBe(true);
    expect(mockPrisma.tenantModule.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns override value when explicit override exists', async () => {
    mockPrisma.tenantModule.findUnique.mockResolvedValue({ enabled: true });

    const result = await repo.isModuleEnabled(TENANT_ID, 'LEGAL');

    expect(result).toBe(true);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('falls back to plan tier when no override exists', async () => {
    mockPrisma.tenantModule.findUnique.mockResolvedValue(null);
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'PROFESSIONAL' }]);

    // LEGAL is included in PROFESSIONAL
    const result = await repo.isModuleEnabled(TENANT_ID, 'LEGAL');

    expect(result).toBe(true);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns false when module not in plan and no override', async () => {
    mockPrisma.tenantModule.findUnique.mockResolvedValue(null);
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);

    // LEGAL is not included in STARTER
    const result = await repo.isModuleEnabled(TENANT_ID, 'LEGAL');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enableModule / disableModule
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository.enableModule', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('upserts the module record as enabled', async () => {
    const record = makeModuleRecord('LEGAL', true);
    mockPrisma.tenantModule.upsert.mockResolvedValue(record);

    const result = await repo.enableModule(TENANT_ID, 'LEGAL');

    expect(mockPrisma.tenantModule.upsert).toHaveBeenCalledOnce();
    const call = mockPrisma.tenantModule.upsert.mock.calls[0][0];
    expect(call.create.enabled).toBe(true);
    expect(call.update.enabled).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.moduleId).toBe('LEGAL');
  });

  it('returns correct TenantModuleRecord shape', async () => {
    const now = new Date('2025-06-01T00:00:00Z');
    mockPrisma.tenantModule.upsert.mockResolvedValue({
      tenantId: TENANT_ID,
      moduleId: 'SUPPORT',
      enabled: true,
      enabledAt: now,
      disabledAt: null,
    });

    const result = await repo.enableModule(TENANT_ID, 'SUPPORT');

    expect(result).toEqual({
      tenantId: TENANT_ID,
      moduleId: 'SUPPORT',
      enabled: true,
      enabledAt: now,
      disabledAt: null,
    });
  });
});

describe('PrismaTenantModuleRepository.disableModule', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('returns CORE_CRM as always enabled without calling upsert', async () => {
    const result = await repo.disableModule(TENANT_ID, 'CORE_CRM');

    expect(mockPrisma.tenantModule.upsert).not.toHaveBeenCalled();
    expect(result.enabled).toBe(true);
    expect(result.moduleId).toBe('CORE_CRM');
  });

  it('upserts non-CORE modules as disabled', async () => {
    const now = new Date('2025-06-01T00:00:00Z');
    mockPrisma.tenantModule.upsert.mockResolvedValue({
      tenantId: TENANT_ID,
      moduleId: 'LEGAL',
      enabled: false,
      enabledAt: now,
      disabledAt: now,
    });

    const result = await repo.disableModule(TENANT_ID, 'LEGAL');

    expect(mockPrisma.tenantModule.upsert).toHaveBeenCalledOnce();
    const call = mockPrisma.tenantModule.upsert.mock.calls[0][0];
    expect(call.create.enabled).toBe(false);
    expect(call.update.enabled).toBe(false);
    expect(result.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// syncModulesToPlan
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository.syncModulesToPlan', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('upserts all modules in the given plan as enabled', async () => {
    mockPrisma.tenantModule.upsert.mockResolvedValue({} as any);
    // For the getEnabledModules call at the end
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'PROFESSIONAL' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    await repo.syncModulesToPlan(TENANT_ID, 'PROFESSIONAL');

    // PROFESSIONAL has 5 modules
    expect(mockPrisma.tenantModule.upsert).toHaveBeenCalledTimes(5);
    for (const call of mockPrisma.tenantModule.upsert.mock.calls) {
      expect(call[0].create.enabled).toBe(true);
      expect(call[0].update.enabled).toBe(true);
    }
  });

  it('returns enabled modules after sync', async () => {
    mockPrisma.tenantModule.upsert.mockResolvedValue({} as any);
    mockPrisma.$queryRaw.mockResolvedValue([{ plan: 'STARTER' }]);
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    const result = await repo.syncModulesToPlan(TENANT_ID, 'STARTER');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('CORE_CRM');
  });
});
