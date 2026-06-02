/**
 * Property tests for PrismaTenantModuleRepository.syncModulesToPlan and
 * updateSubscription stale-plan logic.
 *
 * Properties covered:
 *  1. (RACE-ENTIT-M1) syncModulesToPlan — downgrade invariant: after syncing to a
 *     lower plan tier, no module exclusive to the higher plan stays enabled — the
 *     sync disables above-plan override rows (fix for the additive-only leak).
 *  2. (RACE-ENTIT-M1) syncModulesToPlan — upgrade invariant: after syncing to a
 *     higher plan tier all plan modules become accessible regardless of prior state.
 *  3. (RACE-ENTIT-M1) syncModulesToPlan — CORE_CRM is always present in the result
 *     regardless of the plan tier.
 *  4. (RACE-ENTIT-M1) syncModulesToPlan — result set is a strict superset of the new
 *     plan's module list when no à la carte additions exist.
 *  5. (RACE-ENTIT-05) stale-plan read: getTenantPlan reads the CURRENT DB value; when
 *     updateSubscription calls getTenantPlan BEFORE updating Workspace.plan the returned
 *     plan is the OLD tier — and therefore syncModulesToPlan syncs to the WRONG tier.
 *  6. getEnabledModules result ordering is always a subset of CRM_MODULES canonical order.
 *  7. getEnabledModules idempotency: calling it twice with the same DB state returns
 *     structurally equal arrays.
 *  8. (RACE-ENTIT-M1) after syncModulesToPlan(STARTER) an ENTERPRISE tenant's
 *     above-plan override rows (LEGAL/COMMERCE) are disabled — concrete regression
 *     guard that the downgrade revokes higher-plan access.
 *  9. disableModule(CORE_CRM) is a no-op: CORE_CRM is always returned as enabled=true.
 * 10. enableModule followed by disableModule leaves the module in disabled state for
 *     any non-CORE_CRM moduleId.
 * 11. syncModulesToPlan upserts exactly N modules where N = getModulesForPlan(plan).length.
 * 12. isModuleEnabled for CORE_CRM is always true without any DB call.
 *
 * Source property ids: RACE-ENTIT-05, RACE-ENTIT-M1
 *
 * @see packages/adapters/src/repositories/PrismaTenantModuleRepository.ts
 * @see docs/operations/property-testing/race-condition-findings.json
 */

import { describe, expect, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaTenantModuleRepository } from '../../../../packages/adapters/src/repositories/PrismaTenantModuleRepository';
import {
  CRM_MODULES,
  PLAN_TIERS,
  MODULE_PLAN_MAP,
  getModulesForPlan,
  type ModuleId,
  type PlanTier,
} from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Inline arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** Any valid plan tier. */
const arbPlanTier: fc.Arbitrary<PlanTier> = fc.constantFrom(...PLAN_TIERS);

/** Any non-CORE_CRM module id. */
const arbNonCoreModuleId: fc.Arbitrary<ModuleId> = fc.constantFrom(
  ...CRM_MODULES.filter((m) => m !== 'CORE_CRM')
);

/** A pair of distinct plan tiers (lowerIndex, higherIndex). */
const arbUpgradePair: fc.Arbitrary<[PlanTier, PlanTier]> = fc
  .tuple(
    fc.integer({ min: 0, max: PLAN_TIERS.length - 1 }),
    fc.integer({ min: 0, max: PLAN_TIERS.length - 1 })
  )
  .filter(([a, b]) => a < b)
  .map(([a, b]) => [PLAN_TIERS[a], PLAN_TIERS[b]] as [PlanTier, PlanTier]);

/** A pair of distinct plan tiers (higher plan first, lower plan second — downgrade). */
const arbDowngradePair: fc.Arbitrary<[PlanTier, PlanTier]> = fc
  .tuple(
    fc.integer({ min: 0, max: PLAN_TIERS.length - 1 }),
    fc.integer({ min: 0, max: PLAN_TIERS.length - 1 })
  )
  .filter(([a, b]) => a > b)
  .map(([a, b]) => [PLAN_TIERS[a], PLAN_TIERS[b]] as [PlanTier, PlanTier]);

/** A non-empty set of above-plan module ids (modules in higherPlan but not lowerPlan). */
function abovePlanModules(higherPlan: PlanTier, lowerPlan: PlanTier): readonly ModuleId[] {
  const lower = new Set(getModulesForPlan(lowerPlan));
  return getModulesForPlan(higherPlan).filter((m) => !lower.has(m));
}

// ---------------------------------------------------------------------------
// Mock Prisma factory — in-memory state simulating TenantModule table
// ---------------------------------------------------------------------------

interface InMemoryModuleRow {
  tenantId: string;
  moduleId: string;
  enabled: boolean;
  enabledAt: Date;
  disabledAt: Date | null;
}

function createMockPrisma(
  initialRows: InMemoryModuleRow[] = [],
  planForTenant: PlanTier = 'STARTER'
): Record<string, any> {
  // Mutable in-memory store keyed by `${tenantId}:${moduleId}`
  const store = new Map<string, InMemoryModuleRow>(
    initialRows.map((r) => [`${r.tenantId}:${r.moduleId}`, r])
  );

  return {
    $queryRaw: vi.fn().mockImplementation(async () => [{ plan: planForTenant }]),
    tenantModule: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where: { tenantId: string } }) => {
        return [...store.values()].filter((r) => r.tenantId === where.tenantId);
      }),
      findUnique: vi
        .fn()
        .mockImplementation(
          async ({
            where,
          }: {
            where: { tenantId_moduleId: { tenantId: string; moduleId: string } };
          }) => {
            const key = `${where.tenantId_moduleId.tenantId}:${where.tenantId_moduleId.moduleId}`;
            return store.get(key) ?? null;
          }
        ),
      upsert: vi
        .fn()
        .mockImplementation(
          async ({
            where,
            create,
            update,
          }: {
            where: { tenantId_moduleId: { tenantId: string; moduleId: string } };
            create: InMemoryModuleRow;
            update: Partial<InMemoryModuleRow>;
          }) => {
            const key = `${where.tenantId_moduleId.tenantId}:${where.tenantId_moduleId.moduleId}`;
            const existing = store.get(key);
            if (existing) {
              const updated = { ...existing, ...update };
              store.set(key, updated);
              return updated;
            }
            store.set(key, create);
            return create;
          }
        ),
      updateMany: vi.fn().mockImplementation(
        async ({
          where,
          data,
        }: {
          where: {
            tenantId: string;
            enabled?: boolean;
            moduleId?: { notIn?: string[] };
          };
          data: Partial<InMemoryModuleRow>;
        }) => {
          let count = 0;
          for (const [key, row] of store) {
            if (row.tenantId !== where.tenantId) continue;
            if (where.enabled !== undefined && row.enabled !== where.enabled) continue;
            if (where.moduleId?.notIn && where.moduleId.notIn.includes(row.moduleId)) continue;
            store.set(key, { ...row, ...data });
            count++;
          }
          return { count };
        }
      ),
    },
    // Array-form transaction: the operations above already executed against the
    // in-memory store when the array was built, so just await them.
    $transaction: vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const TENANT = 'test-tenant-prop';

function makeEnabledRow(moduleId: string, tenantId = TENANT): InMemoryModuleRow {
  return {
    tenantId,
    moduleId,
    enabled: true,
    enabledAt: new Date('2025-01-01T00:00:00Z'),
    disabledAt: null,
  };
}

// ---------------------------------------------------------------------------
// 1. RACE-ENTIT-M1 — syncModulesToPlan downgrade revokes above-plan access.
//    Invariant: after syncing a tenant to a lower plan, no module exclusive to
//    the higher plan remains enabled, even if it had an enabled override row.
// ---------------------------------------------------------------------------

describe('syncModulesToPlan — downgrade invariant (RACE-ENTIT-M1)', () => {
  test.prop([arbDowngradePair], propertyParams())(
    '1. after downgrade sync, no module exclusive to the higher plan stays enabled',
    async ([higherPlan, lowerPlan]) => {
      const above = abovePlanModules(higherPlan, lowerPlan);
      // Only run when there are modules exclusive to the higher plan
      fc.pre(above.length > 0);

      // Simulate a tenant that had higher-plan override rows set to enabled=true.
      const initialRows = above.map((m) => makeEnabledRow(m));
      const mockPrisma = createMockPrisma(initialRows, lowerPlan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      // syncModulesToPlan now disables any enabled override row whose module is
      // not in the new plan, so the downgrade actually revokes above-plan access.
      const result = await repo.syncModulesToPlan(TENANT, lowerPlan);

      const aboveSet = new Set(above);
      const stillEnabled = result.filter((m) => aboveSet.has(m));
      expect(stillEnabled.length).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// 2. syncModulesToPlan — upgrade invariant: after syncing to a higher plan all
//    plan modules become accessible.
// ---------------------------------------------------------------------------

describe('syncModulesToPlan — upgrade invariant', () => {
  test.prop([arbUpgradePair], propertyParams())(
    '2. after upgrade sync all new plan modules are present in getEnabledModules result',
    async ([lowerPlan, higherPlan]) => {
      const mockPrisma = createMockPrisma([], higherPlan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.syncModulesToPlan(TENANT, higherPlan);
      const resultSet = new Set(result);

      const expected = getModulesForPlan(higherPlan);
      for (const m of expected) {
        expect(resultSet.has(m)).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 3. syncModulesToPlan — CORE_CRM always present
// ---------------------------------------------------------------------------

describe('syncModulesToPlan — CORE_CRM invariant', () => {
  test.prop([arbPlanTier], propertyParams())(
    '3. CORE_CRM is always present in syncModulesToPlan result for any plan tier',
    async (plan) => {
      const mockPrisma = createMockPrisma([], plan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.syncModulesToPlan(TENANT, plan);
      expect(result).toContain('CORE_CRM' as ModuleId);
    }
  );
});

// ---------------------------------------------------------------------------
// 4. syncModulesToPlan — result is superset of plan when no à la carte additions
// ---------------------------------------------------------------------------

describe('syncModulesToPlan — result superset of plan modules', () => {
  test.prop([arbPlanTier], propertyParams())(
    '4. syncModulesToPlan result includes every module in the given plan (no à la carte adds)',
    async (plan) => {
      const mockPrisma = createMockPrisma([], plan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.syncModulesToPlan(TENANT, plan);
      const resultSet = new Set(result);

      for (const m of getModulesForPlan(plan)) {
        expect(resultSet.has(m)).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 5. RACE-ENTIT-05 — stale-plan read: getTenantPlan reads current DB value
//    When Workspace.plan has NOT been updated before syncModulesToPlan is called
//    (as happens in updateSubscription), the sync runs against the OLD plan tier.
//    We model this by controlling what $queryRaw returns and showing that
//    getTenantPlan() returns exactly what is in the DB at the time of the call.
// ---------------------------------------------------------------------------

describe('getTenantPlan — stale-plan read (RACE-ENTIT-05)', () => {
  test.prop([arbPlanTier, arbPlanTier], propertyParams())(
    '5. getTenantPlan returns the plan stored in DB at call time, not the intended new plan',
    async (oldPlan, newPlan) => {
      // Model the scenario where the DB still holds oldPlan (Workspace.plan not updated yet)
      const mockPrisma = createMockPrisma([], oldPlan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      // Simulate what updateSubscription does: read plan THEN sync
      const readPlan = await repo.getTenantPlan(TENANT);

      // The bug: readPlan is oldPlan (the DB value before Workspace.plan is updated),
      // not newPlan (what the user just purchased)
      expect(readPlan).toBe(oldPlan);

      // Only assert the bug when old and new plans differ
      if (oldPlan !== newPlan) {
        // syncModulesToPlan will be called with oldPlan, not newPlan
        expect(readPlan).not.toBe(newPlan);
      }
    }
  );

  test.prop([arbPlanTier], propertyParams())(
    '5b. getTenantPlan defaults to STARTER when no workspace row exists',
    async (_plan) => {
      // $queryRaw returns empty array (no workspace found)
      const mockPrisma: Record<string, any> = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        tenantModule: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn(),
        },
      };
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const plan = await repo.getTenantPlan(TENANT);
      expect(plan).toBe('STARTER');
    }
  );
});

// ---------------------------------------------------------------------------
// 6. getEnabledModules — result ordering is consistent with CRM_MODULES canonical order
// ---------------------------------------------------------------------------

describe('getEnabledModules — canonical ordering invariant', () => {
  test.prop([arbPlanTier], propertyParams())(
    '6. getEnabledModules result is always in CRM_MODULES canonical order',
    async (plan) => {
      const mockPrisma = createMockPrisma([], plan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.getEnabledModules(TENANT);

      const indices = result.map((m) => CRM_MODULES.indexOf(m as (typeof CRM_MODULES)[number]));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1]);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 7. getEnabledModules — idempotency: same DB state ⟹ same result
// ---------------------------------------------------------------------------

describe('getEnabledModules — idempotency', () => {
  test.prop([arbPlanTier], propertyParams())(
    '7. calling getEnabledModules twice with same state returns structurally equal arrays',
    async (plan) => {
      const mockPrisma = createMockPrisma([], plan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const first = await repo.getEnabledModules(TENANT);
      const second = await repo.getEnabledModules(TENANT);

      expect(Array.from(first)).toEqual(Array.from(second));
    }
  );
});

// ---------------------------------------------------------------------------
// 8. RACE-ENTIT-M1 — ENTERPRISE→STARTER downgrade revokes above-plan access.
//    Concrete regression guard: syncModulesToPlan disables above-plan override
//    rows (LEGAL, COMMERCE) so they do not survive the downgrade.
// ---------------------------------------------------------------------------

describe('syncModulesToPlan — ENTERPRISE→STARTER downgrade leaves no above-plan modules', () => {
  test('after syncModulesToPlan(STARTER) LEGAL and COMMERCE are disabled', async () => {
    // Pre-condition: tenant was on ENTERPRISE with LEGAL and COMMERCE override rows enabled=true
    const enterpriseAbove: ModuleId[] = ['LEGAL', 'COMMERCE'];
    const initialRows = enterpriseAbove.map((m) => makeEnabledRow(m));
    const mockPrisma = createMockPrisma(initialRows, 'STARTER');
    const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

    const result = await repo.syncModulesToPlan(TENANT, 'STARTER');

    // After the fix, the downgrade revokes the above-plan override rows.
    expect(result).not.toContain('LEGAL' as ModuleId);
    expect(result).not.toContain('COMMERCE' as ModuleId);
    // And the disable went through updateMany (not just an additive upsert).
    expect(mockPrisma.tenantModule.updateMany).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 9. disableModule(CORE_CRM) is always a no-op
// ---------------------------------------------------------------------------

describe('disableModule — CORE_CRM is immutable', () => {
  test.prop([fc.constant('CORE_CRM' as ModuleId)], propertyParams())(
    '9. disableModule(CORE_CRM) always returns enabled=true without touching the DB',
    async (moduleId) => {
      const mockPrisma = createMockPrisma();
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.disableModule(TENANT, moduleId);

      expect(result.enabled).toBe(true);
      expect(result.moduleId).toBe('CORE_CRM');
      expect(mockPrisma.tenantModule.upsert).not.toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
// 10. enableModule → disableModule round-trip leaves module disabled
// ---------------------------------------------------------------------------

describe('enableModule → disableModule round-trip', () => {
  test.prop([arbNonCoreModuleId], propertyParams())(
    '10. enable then disable leaves the module in disabled state',
    async (moduleId) => {
      const mockPrisma = createMockPrisma([], 'ENTERPRISE');
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      await repo.enableModule(TENANT, moduleId);
      const disabledRecord = await repo.disableModule(TENANT, moduleId);

      expect(disabledRecord.enabled).toBe(false);
      expect(disabledRecord.moduleId).toBe(moduleId);
      expect(disabledRecord.disabledAt).not.toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// 11. syncModulesToPlan upserts exactly N modules where N = plan module count
// ---------------------------------------------------------------------------

describe('syncModulesToPlan — exact upsert count', () => {
  test.prop([arbPlanTier], propertyParams())(
    '11. syncModulesToPlan issues exactly one upsert per module in the plan',
    async (plan) => {
      const mockPrisma = createMockPrisma([], plan);
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      await repo.syncModulesToPlan(TENANT, plan);

      const expectedCount = getModulesForPlan(plan).length;
      expect(mockPrisma.tenantModule.upsert).toHaveBeenCalledTimes(expectedCount);
    }
  );
});

// ---------------------------------------------------------------------------
// 12. isModuleEnabled for CORE_CRM is always true without any DB call
// ---------------------------------------------------------------------------

describe('isModuleEnabled — CORE_CRM short-circuit', () => {
  test.prop([fc.constant('CORE_CRM' as ModuleId)], propertyParams())(
    '12. isModuleEnabled(CORE_CRM) returns true without issuing any DB query',
    async (moduleId) => {
      const mockPrisma = createMockPrisma();
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.isModuleEnabled(TENANT, moduleId);

      expect(result).toBe(true);
      expect(mockPrisma.tenantModule.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
// 13. isModuleEnabled — plan-membership consistency
//     When no override exists, isModuleEnabled returns the same value as
//     MODULE_PLAN_MAP[plan].includes(moduleId).
// ---------------------------------------------------------------------------

describe('isModuleEnabled — falls back to plan-membership correctly', () => {
  test.prop([arbNonCoreModuleId, arbPlanTier], propertyParams())(
    '13. without override, isModuleEnabled matches MODULE_PLAN_MAP membership',
    async (moduleId, plan) => {
      const mockPrisma: Record<string, any> = {
        $queryRaw: vi.fn().mockResolvedValue([{ plan }]),
        tenantModule: {
          findUnique: vi.fn().mockResolvedValue(null), // no override
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn(),
        },
      };
      const repo = new PrismaTenantModuleRepository(mockPrisma as unknown as PrismaClient);

      const result = await repo.isModuleEnabled(TENANT, moduleId);
      const expected = MODULE_PLAN_MAP[plan].includes(moduleId);

      expect(result).toBe(expected);
    }
  );
});
