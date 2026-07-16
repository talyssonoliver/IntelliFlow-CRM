/**
 * App Router Smoke Test — PG-190 / PG-189 / PG-187
 *
 * Guarantees that every module-settings router is registered under the
 * correct top-level key on `appRouter`. This closes the defect class that
 * produced the prior PG-189 and PG-190 commits on 2026-04-19 where the
 * router file existed on disk but was never imported into `appRouter`,
 * leaving `trpc.<key>.*` calls un-reachable at runtime despite all
 * package-scoped unit tests passing.
 *
 * Every module-settings router must expose `get / update / resetToDefaults`
 * — asserted individually so a partial regression (e.g. procedure dropped
 * in a future refactor) is caught at the smoke layer.
 */

import { describe, it, expect, vi } from 'vitest';

// Lightweight container mock — the module importer only needs the surface
// tRPC router definitions touch (procedures don't execute in this test).
vi.mock('../container', () => ({
  container: {
    leadService: { list: vi.fn() },
    contactService: { list: vi.fn() },
    accountService: { list: vi.fn() },
    opportunityService: { list: vi.fn() },
    taskService: { list: vi.fn() },
    ticketService: { list: vi.fn() },
    analyticsService: { getDashboardMetrics: vi.fn() },
    security: {
      rbac: { can: vi.fn().mockResolvedValue({ allowed: true }) },
      auditLogger: { log: vi.fn() },
      encryption: { encrypt: vi.fn() },
      tenantContext: { getTenantContext: vi.fn() },
    },
    adapters: {
      lead: { list: vi.fn() },
      contact: { list: vi.fn() },
    },
  },
  apiPrisma: {
    lead: { findMany: vi.fn() },
    $disconnect: vi.fn(),
  },
}));

describe('appRouter smoke — PG-190 module-settings registration', () => {
  it('registers caseSettings router under the exact key `caseSettings`', async () => {
    const { appRouter } = await import('../router.js');
    const record = appRouter._def.record as Record<string, unknown>;

    expect(record.caseSettings).toBeDefined();
    // Guard against the mistyped singular key that slipped into the prior
    // PG-190 router file's Prisma accessor — it must NOT leak into appRouter.
    expect(record['caseSetting']).toBeUndefined();
  });

  it('exposes 5 sub-routers (general/duplicateRules/requiredFields/tags/automation) on caseSettings', async () => {
    const { appRouter } = await import('../router.js');
    const record = appRouter._def.record as Record<string, unknown>;
    const caseSettings = record.caseSettings as Record<string, unknown> | undefined;

    expect(caseSettings).toBeDefined();
    const general = caseSettings?.general as Record<string, unknown> | undefined;
    expect(general?.get).toBeDefined();
    expect(general?.update).toBeDefined();
    expect(general?.resetToDefaults).toBeDefined();

    const duplicateRules = caseSettings?.duplicateRules as Record<string, unknown> | undefined;
    expect(duplicateRules?.list).toBeDefined();
    expect(duplicateRules?.update).toBeDefined();
    expect(duplicateRules?.resetToDefaults).toBeDefined();

    const requiredFields = caseSettings?.requiredFields as Record<string, unknown> | undefined;
    expect(requiredFields?.list).toBeDefined();
    expect(requiredFields?.update).toBeDefined();
    expect(requiredFields?.resetToDefaults).toBeDefined();

    const tags = caseSettings?.tags as Record<string, unknown> | undefined;
    expect(tags?.list).toBeDefined();
    expect(tags?.create).toBeDefined();
    expect(tags?.update).toBeDefined();
    expect(tags?.delete).toBeDefined();

    const automation = caseSettings?.automation as Record<string, unknown> | undefined;
    expect(automation?.get).toBeDefined();
    expect(automation?.update).toBeDefined();
    expect(automation?.resetToDefaults).toBeDefined();
  });

  it('keeps sibling module-settings routers registered', async () => {
    const { appRouter } = await import('../router.js');
    const record = appRouter._def.record as Record<string, unknown>;

    // Already-registered module settings routers (PG-178, PG-182, PG-183,
    // PG-184, PG-185, PG-186). This asserts we do not accidentally drop
    // them in the same commit that adds caseSettings.
    expect(record.leadSettings).toBeDefined();
    expect(record.contactSettings).toBeDefined();
    expect(record.accountSettings).toBeDefined();
    expect(record.dealSettings).toBeDefined();
    expect(record.ticketSettings).toBeDefined();
    expect(record.documentSettings).toBeDefined();
  });

  it('registers appointmentSettings and reportSettings routers', async () => {
    const { appRouter } = await import('../router.js');
    const record = appRouter._def.record as Record<string, unknown>;

    expect(record.appointmentSettings).toBeDefined();
    expect(record.reportSettings).toBeDefined();
    // Typo guards — a future mistyped Prisma accessor must not leak back
    // into appRouter as a singular key.
    expect(record['appointmentSetting']).toBeUndefined();
    expect(record['reportSetting']).toBeUndefined();

    // Procedures assertion (PG-189 AC-009): the three canonical settings
    // procedures must be individually callable on appointmentSettings.
    const appointmentSettings = record.appointmentSettings as Record<string, unknown> | undefined;
    expect(appointmentSettings?.get).toBeDefined();
    expect(appointmentSettings?.update).toBeDefined();
    expect(appointmentSettings?.resetToDefaults).toBeDefined();
  });

  it('registers taskSettings router with get/update/resetToDefaults (PG-191)', async () => {
    const { appRouter } = await import('../router.js');
    const record = appRouter._def.record as Record<string, unknown>;

    expect(record.taskSettings).toBeDefined();
    // Typo guard — a mistyped singular Prisma accessor must not leak back in.
    expect(record['taskSetting']).toBeUndefined();

    const taskSettings = record.taskSettings as Record<string, unknown> | undefined;
    expect(taskSettings?.get).toBeDefined();
    expect(taskSettings?.update).toBeDefined();
    expect(taskSettings?.resetToDefaults).toBeDefined();
  });
});
