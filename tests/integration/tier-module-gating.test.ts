/**
 * Tier → Module Gating — Real-Database Integration Test
 *
 * Validates the SERVER-SIDE entitlement boundary that `requireModule()`
 * (apps/api/src/trpc.ts) depends on: `PrismaTenantModuleRepository` must report
 * the correct enabled-module set for a tenant given its plan tier + any à-la-carte
 * overrides, reading `Tenant.plan` (ADR-070) and the `tenant_modules` override table.
 *
 * Why this is a MIDDLE-layer (integration) test, not E2E and not a unit test:
 *  - The gating decision is a DB query (`getTenantPlan` raw join) merged with the
 *    `tenant_modules` table — a pure unit test would mock all of that away and
 *    assert nothing about the real schema/queries (the existing mocked
 *    `cross-tenant.test.ts` is exactly that false-confidence trap).
 *  - It does NOT need a browser/HTTP round-trip; the security guarantee lives in
 *    the repository + DB, so we exercise that directly and deterministically.
 *
 * The EXPECTED per-tier module sets are hardcoded here on purpose — the test
 * asserts the pricing contract independently instead of comparing the production
 * MODULE_PLAN_MAP to itself.
 *
 * Pricing contract (docs / pricing page), bounded by the business type (owner ruling 23/11/2026:
 * enabled = plan modules ∩ the business type's modules, plus explicit overrides):
 *   STARTER       → CORE_CRM, SUPPORT, AI_INTELLIGENCE, ANALYTICS
 *   PROFESSIONAL  → + LEGAL
 *   ENTERPRISE    → + COMMERCE
 * Business types: LAW_FIRM may have LEGAL, AGENCY SUPPORT, SHOP_ECOMMERCE COMMERCE, everyone the core set.
 * The plan tenants below are law firms, so the LEGAL boundary is exercised by plan; the vertical block at
 * the end proves the business-type boundary.
 *
 * Relates to the tier-system work (IFC-208/209) and the entitlement-downgrade
 * leak fix (RACE-ENTIT-M1).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createIsolatedTestPrismaClient } from './setup';
// Production code under test — the real adapter, not a reimplementation.
import { PrismaTenantModuleRepository } from '../../packages/adapters/src/repositories/PrismaTenantModuleRepository';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('⏭️  Skipping tier-module-gating integration test: DATABASE_URL not set');
}

const TAG = `tiergate_${Date.now()}`;

// The pricing contract, asserted independently of MODULE_PLAN_MAP.
// Plan tenants are LAW_FIRM: SUPPORT and COMMERCE belong to other business types.
const EXPECTED: Record<string, readonly string[]> = {
  STARTER: ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS'],
  PROFESSIONAL: ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL'],
  ENTERPRISE: ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL'],
};

describeDb('Tier → module gating (DB-backed entitlement boundary)', () => {
  let prisma: any;
  let repo: PrismaTenantModuleRepository;
  // tenantId per plan tier
  const tenants: Record<string, string> = {};
  // Monotonic suffix so every provisioned tenant gets unique slug/email.
  let seq = 0;

  /** Provision a tenant on `plan` (Tenant.plan, ADR-070) with a business type (default LAW_FIRM). */
  async function provisionTenant(
    plan: string,
    businessType: string | null = 'LAW_FIRM'
  ): Promise<string> {
    const n = seq++;
    const key = `${plan.toLowerCase()}-${n}`;
    const t = await prisma.tenant.create({
      data: {
        name: `${TAG}-${plan}-${n}`,
        slug: `${TAG}-${key}`,
        plan: plan as any,
        businessType: businessType as any,
      },
    });
    await prisma.user.create({
      data: { email: `${TAG}-${key}@example.com`, tenantId: t.id },
    });
    return t.id;
  }

  // Skip every test when the integration harness has no real DB (e.g. the
  // merged-coverage run without Docker) — createIsolatedTestPrismaClient() is
  // null there even with DATABASE_URL set. Matches the other DB-backed suites.
  beforeEach((ctx) => {
    if (!prisma) ctx.skip();
  });

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return; // infra unavailable — beforeEach will skip the tests
    repo = new PrismaTenantModuleRepository(prisma);

    for (const plan of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE']) {
      tenants[plan] = await provisionTenant(plan);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    // Children first (FK), then tenants. tenant_modules cascade on tenant delete.
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    // tenant_modules cascade-delete with their tenant (onDelete: Cascade).
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  describe('plan resolution + enabled-module set', () => {
    for (const plan of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const) {
      it(`${plan} resolves its plan and enables exactly the contracted modules`, async () => {
        const resolved = await repo.getTenantPlan(tenants[plan]);
        expect(resolved).toBe(plan);

        const enabled = await repo.getEnabledModules(tenants[plan]);
        expect([...enabled].sort()).toEqual([...EXPECTED[plan]].sort());
      });
    }
  });

  describe('isModuleEnabled honours the tier boundary', () => {
    it('STARTER is DENIED the add-on modules (LEGAL, COMMERCE)', async () => {
      expect(await repo.isModuleEnabled(tenants.STARTER, 'LEGAL' as any)).toBe(false);
      expect(await repo.isModuleEnabled(tenants.STARTER, 'COMMERCE' as any)).toBe(false);
      // …but still gets everything in its own tier.
      expect(await repo.isModuleEnabled(tenants.STARTER, 'AI_INTELLIGENCE' as any)).toBe(true);
    });

    it('PROFESSIONAL is GRANTED LEGAL but still DENIED COMMERCE', async () => {
      expect(await repo.isModuleEnabled(tenants.PROFESSIONAL, 'LEGAL' as any)).toBe(true);
      expect(await repo.isModuleEnabled(tenants.PROFESSIONAL, 'COMMERCE' as any)).toBe(false);
    });

    it('ENTERPRISE law firm is GRANTED LEGAL; COMMERCE belongs to shops', async () => {
      expect(await repo.isModuleEnabled(tenants.ENTERPRISE, 'LEGAL' as any)).toBe(true);
      expect(await repo.isModuleEnabled(tenants.ENTERPRISE, 'COMMERCE' as any)).toBe(false);
    });

    it('CORE_CRM is always enabled, even for an unknown/unprovisioned tenant', async () => {
      expect(
        await repo.isModuleEnabled('00000000-0000-0000-0000-000000000000', 'CORE_CRM' as any)
      ).toBe(true);
    });
  });

  describe('business type bounds the plan (owner ruling 23/11/2026)', () => {
    it('a trades business on ENTERPRISE never gets LEGAL, SUPPORT or COMMERCE', async () => {
      const t = await provisionTenant('ENTERPRISE', 'TRADES_HOME_SERVICES');
      try {
        // Plan sync writes PLAN-origin rows for every plan module; they must not widen the vertical.
        await repo.syncModulesToPlan(t, 'ENTERPRISE' as any);
        expect([...(await repo.getEnabledModules(t))].sort()).toEqual(
          ['AI_INTELLIGENCE', 'ANALYTICS', 'CORE_CRM'].sort()
        );
        for (const m of ['LEGAL', 'SUPPORT', 'COMMERCE']) {
          expect(await repo.isModuleEnabled(t, m as any)).toBe(false);
        }
      } finally {
        await prisma.tenantModule.deleteMany({ where: { tenantId: t } });
      }
    });

    it('an agency gets SUPPORT but not LEGAL; a shop gets COMMERCE only on ENTERPRISE', async () => {
      const agency = await provisionTenant('PROFESSIONAL', 'AGENCY');
      const shopPro = await provisionTenant('PROFESSIONAL', 'SHOP_ECOMMERCE');
      const shopEnt = await provisionTenant('ENTERPRISE', 'SHOP_ECOMMERCE');
      expect(await repo.isModuleEnabled(agency, 'SUPPORT' as any)).toBe(true);
      expect(await repo.isModuleEnabled(agency, 'LEGAL' as any)).toBe(false);
      expect(await repo.isModuleEnabled(shopPro, 'COMMERCE' as any)).toBe(false);
      expect(await repo.isModuleEnabled(shopEnt, 'COMMERCE' as any)).toBe(true);
    });

    it('no business type yet gates like OTHER; setBusinessType takes effect straight away', async () => {
      const t = await provisionTenant('PROFESSIONAL', null);
      expect(await repo.getBusinessType(t)).toBeNull();
      expect(await repo.isModuleEnabled(t, 'LEGAL' as any)).toBe(false);
      await repo.setBusinessType(t, 'LAW_FIRM' as any);
      expect(await repo.isModuleEnabled(t, 'LEGAL' as any)).toBe(true);
    });

    it('an explicit OVERRIDE keeps a module for existing data despite the business type', async () => {
      const t = await provisionTenant('PROFESSIONAL', 'TRADES_HOME_SERVICES');
      try {
        expect(await repo.isModuleEnabled(t, 'LEGAL' as any)).toBe(false);
        await repo.enableModule(t, 'LEGAL' as any);
        expect(await repo.isModuleEnabled(t, 'LEGAL' as any)).toBe(true);
      } finally {
        await prisma.tenantModule.deleteMany({ where: { tenantId: t } });
      }
    });
  });

  describe('à-la-carte override adds a module above the plan', () => {
    it('enabling LEGAL on a STARTER tenant grants it without changing the plan', async () => {
      const starter = await provisionTenant('STARTER', 'LAW_FIRM');
      try {
        expect(await repo.isModuleEnabled(starter, 'LEGAL' as any)).toBe(false);
        await repo.enableModule(starter, 'LEGAL' as any);
        expect(await repo.isModuleEnabled(starter, 'LEGAL' as any)).toBe(true);
        expect(await repo.getEnabledModules(starter)).toContain('LEGAL');
        // plan itself is unchanged — COMMERCE stays denied
        expect(await repo.isModuleEnabled(starter, 'COMMERCE' as any)).toBe(false);
      } finally {
        await prisma.tenantModule.deleteMany({ where: { tenantId: starter } });
      }
    });
  });

  describe('downgrade revokes above-plan modules (RACE-ENTIT-M1 leak guard)', () => {
    it('syncing a LEGAL-enabled tenant down to STARTER disables LEGAL', async () => {
      const t = await provisionTenant('PROFESSIONAL');
      try {
        // Sync up to PROFESSIONAL → LEGAL on.
        await repo.syncModulesToPlan(t, 'PROFESSIONAL' as any);
        expect(await repo.isModuleEnabled(t, 'LEGAL' as any)).toBe(true);

        // Downgrade. The additive-only bug would LEAVE LEGAL enabled (paid leak).
        const after = await repo.syncModulesToPlan(t, 'STARTER' as any);
        expect(after).not.toContain('LEGAL');
        expect(await repo.isModuleEnabled(t, 'LEGAL' as any)).toBe(false);
        // CORE_CRM survives the downgrade.
        expect(after).toContain('CORE_CRM');
      } finally {
        await prisma.tenantModule.deleteMany({ where: { tenantId: t } });
      }
    });
  });
});
