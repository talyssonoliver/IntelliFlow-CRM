/**
 * PrismaTenantModuleRepository Tests
 *
 * Covers all public methods of PrismaTenantModuleRepository.
 * Key regression: getTenantPlan reads Tenant.plan (ADR-070), not the workspaces join.
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
    tenant: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    // Array-form transaction used by syncModulesToPlan: the operation promises
    // are already created when the array is built, so just await them.
    $transaction: vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    tenantModule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
// getTenantPlan — reads Tenant.plan (ADR-070)
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository.getTenantPlan', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('reads the plan from Tenant.plan with a single select', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'PROFESSIONAL' });

    const plan = await repo.getTenantPlan(TENANT_ID);

    expect(plan).toBe('PROFESSIONAL');
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      select: { plan: true },
    });
  });

  it('never touches the deprecated workspaces join', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'ENTERPRISE' });

    await repo.getTenantPlan(TENANT_ID);

    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns STARTER when the tenant does not exist', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    expect(await repo.getTenantPlan(TENANT_ID)).toBe('STARTER');
  });

  it('returns STARTER for a plan the module registry does not know yet', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'SOMETHING_NEW' });

    expect(await repo.getTenantPlan(TENANT_ID)).toBe('STARTER');
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
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    // STARTER includes CORE_CRM, SUPPORT, AI_INTELLIGENCE, ANALYTICS (from MODULE_PLAN_MAP)
    expect(modules).toContain('CORE_CRM');
    expect(modules).toContain('SUPPORT');
    expect(modules).toContain('AI_INTELLIGENCE');
    expect(modules).toContain('ANALYTICS');
  });

  it('applies enabled override to add a module not in plan', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('LEGAL', true)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).toContain('LEGAL');
  });

  it('applies disabled override to remove a module from plan', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'PROFESSIONAL' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('LEGAL', false)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).not.toContain('LEGAL');
  });

  it('never disables CORE_CRM even with an explicit disabled override', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('CORE_CRM', false)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).toContain('CORE_CRM');
  });

  it('returns modules in canonical CRM_MODULES order', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'ENTERPRISE' });
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

  it('reads the plan with exactly one tenant lookup', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    await repo.getEnabledModules(TENANT_ID);

    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
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
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('returns override value when explicit override exists', async () => {
    mockPrisma.tenantModule.findUnique.mockResolvedValue({ enabled: true });

    const result = await repo.isModuleEnabled(TENANT_ID, 'LEGAL');

    expect(result).toBe(true);
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to plan tier when no override exists', async () => {
    mockPrisma.tenantModule.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'PROFESSIONAL' });

    // LEGAL is included in PROFESSIONAL
    const result = await repo.isModuleEnabled(TENANT_ID, 'LEGAL');

    expect(result).toBe(true);
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns false when module not in plan and no override', async () => {
    mockPrisma.tenantModule.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });

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
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'PROFESSIONAL' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    await repo.syncModulesToPlan(TENANT_ID, 'PROFESSIONAL');

    // PROFESSIONAL has 5 modules
    expect(mockPrisma.tenantModule.upsert).toHaveBeenCalledTimes(5);
    for (const call of mockPrisma.tenantModule.upsert.mock.calls) {
      expect(call[0].create.enabled).toBe(true);
      expect(call[0].update.enabled).toBe(true);
    }
  });

  it('persists the plan on Tenant in the same transaction as the module sync', async () => {
    mockPrisma.tenantModule.upsert.mockResolvedValue({} as any);
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'ENTERPRISE' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    await repo.syncModulesToPlan(TENANT_ID, 'ENTERPRISE');

    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { plan: 'ENTERPRISE' },
    });
    // One $transaction call carries the tenant update together with the module writes.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = mockPrisma.$transaction.mock.calls[0][0] as unknown[];
    expect(ops.length).toBeGreaterThan(mockPrisma.tenantModule.upsert.mock.calls.length);
  });

  it('returns enabled modules after sync', async () => {
    mockPrisma.tenantModule.upsert.mockResolvedValue({} as any);
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    const result = await repo.syncModulesToPlan(TENANT_ID, 'STARTER');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('CORE_CRM');
  });
});
