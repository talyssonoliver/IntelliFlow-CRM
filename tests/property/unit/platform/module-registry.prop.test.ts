/**
 * Property tests for ModuleRegistry — getModulesForPlan and
 * getMinimumPlanForModule monotonicity and consistency invariants.
 *
 * Properties covered:
 *  1. getModulesForPlan always returns a non-empty array for every PlanTier.
 *  2. CORE_CRM is always present in every plan's module list.
 *  3. Plan tier ordering is monotone (superset): higher-ranked plans include at
 *     least all modules of every lower-ranked plan.
 *  4. getMinimumPlanForModule returns undefined only for CORE_CRM.
 *  5. For every non-CORE module, getMinimumPlanForModule returns a PlanTier
 *     that actually includes the module (isModuleInPlan guard).
 *  6. The returned minimum tier is the LOWEST such tier — no earlier tier in
 *     PLAN_TIERS contains the module.
 *  7. isModuleInPlan is consistent with the set returned by getModulesForPlan.
 *  8. getModulesForPlan result contains no duplicates.
 *  9. All elements returned by getModulesForPlan are valid CRM_MODULES entries.
 * 10. isModuleInPlan(CORE_CRM, plan) is true for every PlanTier.
 * 11. MODULE_PLAN_MAP entries are subsets of CRM_MODULES (no invented module ids).
 * 12. getModulesForPlan returns a stable (reference-stable contents) result on
 *     repeated calls — idempotency.
 *
 * Source property ids: race-condition-findings.json propertyCandidates for
 * ModuleRegistry.getMinimumPlanForModule and ModuleRegistry.getModulesForPlan
 *
 * @see packages/domain/src/platform/modules/ModuleRegistry.ts
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  CRM_MODULES,
  PLAN_TIERS,
  MODULE_PLAN_MAP,
  getModulesForPlan,
  getMinimumPlanForModule,
  isModuleInPlan,
  type ModuleId,
  type PlanTier,
} from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Inline arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** Any valid plan tier. */
const arbPlanTier: fc.Arbitrary<PlanTier> = fc.constantFrom(...PLAN_TIERS);

/** Any valid module id. */
const arbModuleId: fc.Arbitrary<ModuleId> = fc.constantFrom(...CRM_MODULES);

/** Any non-CORE_CRM module id. */
const arbNonCoreModuleId: fc.Arbitrary<ModuleId> = fc.constantFrom(
  ...CRM_MODULES.filter((m) => m !== 'CORE_CRM')
);

/** A pair of distinct plan tiers as (lowerIndex, higherIndex). */
const arbTierPair: fc.Arbitrary<[PlanTier, PlanTier]> = fc
  .tuple(
    fc.integer({ min: 0, max: PLAN_TIERS.length - 1 }),
    fc.integer({ min: 0, max: PLAN_TIERS.length - 1 })
  )
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => {
    const lower = Math.min(a, b);
    const higher = Math.max(a, b);
    return [PLAN_TIERS[lower], PLAN_TIERS[higher]] as [PlanTier, PlanTier];
  });

// ---------------------------------------------------------------------------
// 1. getModulesForPlan always returns a non-empty array
// ---------------------------------------------------------------------------

describe('getModulesForPlan — basic invariants', () => {
  test.prop([arbPlanTier], propertyParams())(
    '1. returns a non-empty list for every PlanTier',
    (plan) => {
      const modules = getModulesForPlan(plan);
      expect(modules.length).toBeGreaterThanOrEqual(1);
    }
  );

  // ---------------------------------------------------------------------------
  // 2. CORE_CRM is always present
  // ---------------------------------------------------------------------------

  test.prop([arbPlanTier], propertyParams())(
    '2. CORE_CRM is always included regardless of plan tier',
    (plan) => {
      const modules = getModulesForPlan(plan);
      expect(modules).toContain('CORE_CRM' as ModuleId);
    }
  );

  // ---------------------------------------------------------------------------
  // 8. No duplicates in result
  // ---------------------------------------------------------------------------

  test.prop([arbPlanTier], propertyParams())(
    '8. result contains no duplicate module ids',
    (plan) => {
      const modules = getModulesForPlan(plan);
      const unique = new Set(modules);
      expect(unique.size).toBe(modules.length);
    }
  );

  // ---------------------------------------------------------------------------
  // 9. All returned ids are valid CRM_MODULES entries
  // ---------------------------------------------------------------------------

  test.prop([arbPlanTier], propertyParams())(
    '9. all returned ids are members of CRM_MODULES',
    (plan) => {
      const modules = getModulesForPlan(plan);
      const validSet = new Set<string>(CRM_MODULES);
      for (const m of modules) {
        expect(validSet.has(m)).toBe(true);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 12. Idempotency — repeated calls return structurally equal arrays
  // ---------------------------------------------------------------------------

  test.prop([arbPlanTier], propertyParams())(
    '12. repeated calls to getModulesForPlan return structurally equal results (idempotent)',
    (plan) => {
      const first = getModulesForPlan(plan);
      const second = getModulesForPlan(plan);
      expect(Array.from(first)).toEqual(Array.from(second));
    }
  );
});

// ---------------------------------------------------------------------------
// 3. Monotone / superset property across plan tier ordering
// ---------------------------------------------------------------------------

describe('getModulesForPlan — monotone superset across tier ordering', () => {
  test.prop([arbTierPair], propertyParams())(
    '3. higher-ranked plan includes at least every module of the lower-ranked plan',
    ([lowerTier, higherTier]) => {
      const lowerModules = new Set(getModulesForPlan(lowerTier));
      const higherModules = new Set(getModulesForPlan(higherTier));

      for (const m of lowerModules) {
        expect(higherModules.has(m)).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 7. isModuleInPlan consistency with getModulesForPlan
// ---------------------------------------------------------------------------

describe('isModuleInPlan — consistency with getModulesForPlan', () => {
  test.prop([arbModuleId, arbPlanTier], propertyParams())(
    '7. isModuleInPlan(m, plan) iff m is in getModulesForPlan(plan)',
    (moduleId, plan) => {
      const inList = getModulesForPlan(plan).includes(moduleId);
      const flagResult = isModuleInPlan(moduleId, plan);
      expect(flagResult).toBe(inList);
    }
  );

  // ---------------------------------------------------------------------------
  // 10. CORE_CRM is always in every plan
  // ---------------------------------------------------------------------------

  test.prop([arbPlanTier], propertyParams())(
    '10. isModuleInPlan(CORE_CRM, plan) is always true',
    (plan) => {
      expect(isModuleInPlan('CORE_CRM', plan)).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 4–6. getMinimumPlanForModule invariants
// ---------------------------------------------------------------------------

describe('getMinimumPlanForModule — invariants', () => {
  test.prop([fc.constant('CORE_CRM' as ModuleId)], propertyParams())(
    '4. returns undefined for CORE_CRM (always-available module)',
    (moduleId) => {
      expect(getMinimumPlanForModule(moduleId)).toBeUndefined();
    }
  );

  test.prop([arbNonCoreModuleId], propertyParams())(
    '4b. returns a defined PlanTier for every non-CORE module',
    (moduleId) => {
      const result = getMinimumPlanForModule(moduleId);
      expect(result).toBeDefined();
      expect(PLAN_TIERS).toContain(result as PlanTier);
    }
  );

  // ---------------------------------------------------------------------------
  // 5. The returned tier actually includes the module
  // ---------------------------------------------------------------------------

  test.prop([arbNonCoreModuleId], propertyParams())(
    '5. isModuleInPlan(m, getMinimumPlanForModule(m)!) is always true for non-CORE modules',
    (moduleId) => {
      const minTier = getMinimumPlanForModule(moduleId);
      // Non-CORE modules must return a real tier
      expect(minTier).toBeDefined();
      expect(isModuleInPlan(moduleId, minTier!)).toBe(true);
    }
  );

  // ---------------------------------------------------------------------------
  // 6. The returned tier is the LOWEST one that includes the module
  // ---------------------------------------------------------------------------

  test.prop([arbNonCoreModuleId], propertyParams())(
    '6. returned tier is the lowest in PLAN_TIERS that includes the module — no earlier tier contains it',
    (moduleId) => {
      const minTier = getMinimumPlanForModule(moduleId);
      expect(minTier).toBeDefined();

      const minIndex = PLAN_TIERS.indexOf(minTier!);
      expect(minIndex).toBeGreaterThanOrEqual(0);

      // Every tier before minIndex must NOT include the module
      for (let i = 0; i < minIndex; i++) {
        const earlierTier = PLAN_TIERS[i];
        expect(isModuleInPlan(moduleId, earlierTier)).toBe(false);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 11. MODULE_PLAN_MAP sanity: no invented module ids in any plan tier
// ---------------------------------------------------------------------------

describe('MODULE_PLAN_MAP — structural sanity', () => {
  test.prop([arbPlanTier], propertyParams())(
    '11. MODULE_PLAN_MAP entries contain only valid CRM_MODULES ids',
    (plan) => {
      const validSet = new Set<string>(CRM_MODULES);
      const entries = MODULE_PLAN_MAP[plan];
      for (const m of entries) {
        expect(validSet.has(m)).toBe(true);
      }
    }
  );
});
