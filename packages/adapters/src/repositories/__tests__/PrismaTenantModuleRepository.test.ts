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
    // Row counts that decide which modules hold data a business-type change must not hide.
    case: { count: vi.fn().mockResolvedValue(0) },
    caseDocument: { count: vi.fn().mockResolvedValue(0) },
    ticket: { count: vi.fn().mockResolvedValue(0) },
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

function makeModuleRecord(
  moduleId: string,
  enabled: boolean,
  origin: 'PLAN' | 'OVERRIDE' = 'OVERRIDE'
) {
  return {
    tenantId: TENANT_ID,
    moduleId,
    enabled,
    origin,
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
      select: { plan: true, businessType: true },
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

  it('returns plan modules intersected with the business type when there are no overrides', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: 'AGENCY' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    expect(await repo.getEnabledModules(TENANT_ID)).toEqual([
      'CORE_CRM',
      'SUPPORT',
      'AI_INTELLIGENCE',
      'ANALYTICS',
    ]);
  });

  it('a workspace with no business type gets the core set only (gated like OTHER)', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'PROFESSIONAL', businessType: null });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    expect(await repo.getEnabledModules(TENANT_ID)).toEqual([
      'CORE_CRM',
      'AI_INTELLIGENCE',
      'ANALYTICS',
    ]);
  });

  it('a trades business never gets LEGAL or SUPPORT, even when plan-sync rows say enabled', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([
      makeModuleRecord('LEGAL', true, 'PLAN'),
      makeModuleRecord('SUPPORT', true, 'PLAN'),
    ]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).not.toContain('LEGAL');
    expect(modules).not.toContain('SUPPORT');
  });

  it('an explicit OVERRIDE row keeps a module on outside the business type (existing data)', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([
      makeModuleRecord('LEGAL', true, 'OVERRIDE'),
    ]);

    expect(await repo.getEnabledModules(TENANT_ID)).toContain('LEGAL');
  });

  it('applies enabled override to add a module not in plan', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('LEGAL', true)]);

    const modules = await repo.getEnabledModules(TENANT_ID);

    expect(modules).toContain('LEGAL');
  });

  it('applies disabled override to remove a module from plan', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'LAW_FIRM',
    });
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

  it('returns true when an explicit OVERRIDE row switches the module on', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: null });
    mockPrisma.tenantModule.findMany.mockResolvedValue([makeModuleRecord('LEGAL', true)]);

    expect(await repo.isModuleEnabled(TENANT_ID, 'LEGAL')).toBe(true);
  });

  it('returns true when plan and business type both include the module', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'LAW_FIRM',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    expect(await repo.isModuleEnabled(TENANT_ID, 'LEGAL')).toBe(true);
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns false when the plan includes the module but the business type does not', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    expect(await repo.isModuleEnabled(TENANT_ID, 'LEGAL')).toBe(false);
    expect(await repo.isModuleEnabled(TENANT_ID, 'SUPPORT')).toBe(false);
  });

  it('returns false when the business type allows it but the plan does not', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: 'LAW_FIRM' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    expect(await repo.isModuleEnabled(TENANT_ID, 'LEGAL')).toBe(false);
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
    // An explicit enable is an OVERRIDE: it can switch a module on outside the business type.
    expect(call.create.origin).toBe('OVERRIDE');
    expect(call.update.origin).toBe('OVERRIDE');
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

// ---------------------------------------------------------------------------
// business type
// ---------------------------------------------------------------------------

describe('PrismaTenantModuleRepository business type', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('getBusinessType returns the stored type', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: 'AGENCY' });
    expect(await repo.getBusinessType(TENANT_ID)).toBe('AGENCY');
  });

  it('getBusinessType returns null when none is chosen, or the value is unknown', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: null });
    expect(await repo.getBusinessType(TENANT_ID)).toBeNull();
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: 'PLUMBER' });
    expect(await repo.getBusinessType(TENANT_ID)).toBeNull();
  });

  it('setBusinessType writes the type on the tenant', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'LAW_FIRM',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    const protectedModules = await repo.setBusinessType(TENANT_ID, 'LAW_FIRM');

    expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { businessType: 'LAW_FIRM' },
    });
    expect(protectedModules).toEqual([]);
    expect(mockPrisma.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('a change that would hide a module holding data writes an EXISTING_DATA override', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockResolvedValue(12);
    mockPrisma.caseDocument.count.mockResolvedValue(3);
    mockPrisma.tenantModule.upsert.mockResolvedValue({});

    const protectedModules = await repo.setBusinessType(TENANT_ID, 'TRADES_HOME_SERVICES');

    expect(protectedModules).toEqual(['LEGAL', 'SUPPORT']);
    expect(mockPrisma.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'SUPPORT' } },
        create: expect.objectContaining({ enabled: true, origin: 'EXISTING_DATA' }),
        update: expect.objectContaining({
          enabled: true,
          origin: 'EXISTING_DATA',
          disabledAt: null,
        }),
      })
    );
  });

  it('writes the new type and the data protection in one transaction, protection computed for the new type', async () => {
    // The stored type is still the OLD one (LAW_FIRM) when the change is requested.
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'LAW_FIRM',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.case.count.mockResolvedValue(4);
    mockPrisma.tenantModule.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockClear();

    const protectedModules = await repo.setBusinessType(TENANT_ID, 'TRADES_HOME_SERVICES');

    expect(protectedModules).toEqual(['LEGAL']);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect((mockPrisma.$transaction.mock.calls[0][0] as unknown[]).length).toBe(2);
  });

  it('a failing read leaves the business type unchanged', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'PROFESSIONAL', businessType: null });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockRejectedValue(new Error('pool timeout'));
    mockPrisma.tenant.update.mockClear();

    await expect(repo.setBusinessType(TENANT_ID, 'TRADES_HOME_SERVICES')).rejects.toThrow(
      'pool timeout'
    );
    expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
  });

  it('legal documents alone (no cases) keep LEGAL on for a trades business', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.caseDocument.count.mockResolvedValue(5);
    mockPrisma.tenantModule.upsert.mockResolvedValue({});

    expect(await repo.setBusinessType(TENANT_ID, 'TRADES_HOME_SERVICES')).toEqual(['LEGAL']);
    expect(mockPrisma.caseDocument.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, deletedAt: null },
    });
  });

  it('a module the new business type already has is not overridden even with data', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'AGENCY',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockResolvedValue(12);

    expect(await repo.setBusinessType(TENANT_ID, 'AGENCY')).toEqual([]);
    expect(mockPrisma.tenantModule.upsert).not.toHaveBeenCalled();
  });
});

describe('PrismaTenantModuleRepository.syncModulesToPlan downgrade', () => {
  it('switches off every enabled above-plan row, whatever its origin (no paid-module leak)', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: 'AGENCY' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.tenantModule.upsert.mockResolvedValue({});
    const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

    await repo.syncModulesToPlan(TENANT_ID, 'STARTER');

    const call = mockPrisma.tenantModule.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId: TENANT_ID,
      enabled: true,
      moduleId: { notIn: expect.any(Array) },
    });
    expect(call.where.origin).toBeUndefined();
  });
});

describe('PrismaTenantModuleRepository.protectExistingData leaves decisions to a human', () => {
  let repo: PrismaTenantModuleRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockPrisma.tenantModule.upsert.mockResolvedValue({});
    repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);
  });

  it('does not hand out a module the plan does not include, even with data (downgrade)', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'STARTER', businessType: 'LAW_FIRM' });
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);
    mockPrisma.case.count.mockResolvedValue(8);

    expect(await repo.setBusinessType(TENANT_ID, 'LAW_FIRM')).toEqual([]);
    expect(mockPrisma.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('does not undo an admin who deliberately switched a module off', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    mockPrisma.tenantModule.findMany.mockResolvedValue([
      makeModuleRecord('SUPPORT', false, 'PLAN'),
    ]);
    mockPrisma.ticket.count.mockResolvedValue(12);

    expect(await repo.setBusinessType(TENANT_ID, 'TRADES_HOME_SERVICES')).toEqual([]);
    expect(mockPrisma.tenantModule.upsert).not.toHaveBeenCalled();
  });
});
