/**
 * Tier → Module Gating — Real-Database Integration Test
 *
 * Validates the SERVER-SIDE entitlement boundary that `requireModule()`
 * (apps/api/src/trpc.ts) depends on: `PrismaTenantModuleRepository` must report
 * the correct enabled-module set for a tenant given its plan tier + any à-la-carte
 * overrides, reading the real `workspaces → workspace_members → users` join and
 * the `tenant_modules` override table.
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
 * Pricing contract (docs / pricing page):
 *   STARTER       → CORE_CRM, SUPPORT, AI_INTELLIGENCE, ANALYTICS
 *   PROFESSIONAL  → + LEGAL
 *   ENTERPRISE    → + COMMERCE
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
const EXPECTED: Record<string, readonly string[]> = {
  STARTER: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS'],
  PROFESSIONAL: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL'],
  ENTERPRISE: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL', 'COMMERCE'],
};

describeDb('Tier → module gating (DB-backed entitlement boundary)', () => {
  let prisma: any;
  let repo: PrismaTenantModuleRepository;
  // tenantId per plan tier
  const tenants: Record<string, string> = {};
  // Monotonic suffix so every provisioned tenant gets unique slug/email.
  let seq = 0;

  /** Provision a tenant whose plan resolves to `plan` via the workspace join. */
  async function provisionTenant(plan: string): Promise<string> {
    const n = seq++;
    const key = `${plan.toLowerCase()}-${n}`;
    const t = await prisma.tenant.create({
      data: { name: `${TAG}-${plan}-${n}`, slug: `${TAG}-${key}` },
    });
    const u = await prisma.user.create({
      data: { email: `${TAG}-${key}@example.com`, tenantId: t.id },
    });
    const w = await prisma.workspace.create({
      data: { name: `${TAG}-${plan}-${n}-ws`, slug: `${TAG}-${key}-ws`, plan: plan as any },
    });
    await prisma.workspaceMember.create({
      data: { userId: u.id, workspaceId: w.id, role: 'owner', isDefault: true },
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
    await prisma.workspaceMember.deleteMany({
      where: { workspace: { slug: { startsWith: TAG } } },
    });
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: TAG } } });
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

    it('ENTERPRISE is GRANTED both LEGAL and COMMERCE', async () => {
      expect(await repo.isModuleEnabled(tenants.ENTERPRISE, 'LEGAL' as any)).toBe(true);
      expect(await repo.isModuleEnabled(tenants.ENTERPRISE, 'COMMERCE' as any)).toBe(true);
    });

    it('CORE_CRM is always enabled, even for an unknown/unprovisioned tenant', async () => {
      expect(
        await repo.isModuleEnabled('00000000-0000-0000-0000-000000000000', 'CORE_CRM' as any)
      ).toBe(true);
    });
  });

  describe('à-la-carte override adds a module above the plan', () => {
    it('enabling LEGAL on a STARTER tenant grants it without changing the plan', async () => {
      const starter = await provisionTenant('STARTER');
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
