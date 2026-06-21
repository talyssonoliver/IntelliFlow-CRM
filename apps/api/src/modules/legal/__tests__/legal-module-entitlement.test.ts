/**
 * LEGAL module — server-side entitlement guard (regression test)
 *
 * The LEGAL module is a paid Professional+ add-on (MODULE_PLAN_MAP). Its backend
 * routers MUST refuse a tenant whose plan does not include LEGAL — otherwise a
 * lower-tier tenant can call the endpoints directly and bypass the paywall (the
 * frontend `<ModuleGate>` only hides the UI).
 *
 * This is the gap this test locks shut: previously only `documents.router.ts`
 * shadowed `tenantProcedure` with `moduleTenantProcedure('LEGAL')`; `cases`,
 * `appointments`, `caseSettings`, `appointmentSettings` and `documentSettings`
 * used the plain (tenant-only) procedure, so they enforced tenant isolation but
 * NOT the module entitlement.
 *
 * Rather than spot-check one procedure, we enumerate EVERY procedure of each
 * legal router (via tRPC's flat `_def.procedures` map) and assert each one throws
 * FORBIDDEN when the tenant is NOT entitled. Any new legal procedure is therefore
 * covered automatically — forget the gate and this test goes red.
 *
 * Middle-layer rationale: the guard is a tRPC middleware decision over the
 * request ctx, so we exercise it directly through `createCaller` with a denying
 * entitlement stub — deterministic, no browser, no DB.
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createTestContext, prismaMock } from '../../../test/setup';
import { casesRouter } from '../cases.router';
import { appointmentsRouter } from '../appointments.router';
import { caseSettingsRouter } from '../case-settings.router';
import { documentSettingsRouter } from '../document-settings.router';
import { documentsRouter } from '../documents.router';

// appointments + appointment-settings are deliberately NOT here: they are SHARED
// with the core Calendar feature (CORE_CRM, all tiers) and stay on plain
// tenantProcedure. Gating them would break the calendar for non-LEGAL tenants.
const LEGAL_ROUTERS = {
  cases: casesRouter,
  caseSettings: caseSettingsRouter,
  documentSettings: documentSettingsRouter,
  documents: documentsRouter, // control: was already gated
} as const;

/** Build a ctx whose entitlement port DENIES every module (a STARTER tenant). */
function deniedCtx() {
  const ctx = createTestContext();
  (ctx.container.get as any).mockImplementation((name: string) =>
    name === 'moduleAccess'
      ? {
          isModuleEnabled: async () => false, // STARTER: LEGAL not included
          getEnabledModules: async () => ['CORE_CRM'],
          getTenantPlan: async () => 'STARTER',
        }
      : undefined
  );
  return ctx;
}

/** Resolve a dotted procedure path ("general.get") to its caller function. */
function resolve(caller: any, path: string): unknown {
  return path.split('.').reduce((node, key) => node?.[key], caller);
}

describe('LEGAL routers enforce module entitlement server-side', () => {
  for (const [name, router] of Object.entries(LEGAL_ROUTERS)) {
    // tRPC v11 exposes a flat map of every procedure keyed by dotted path.
    const procedures = Object.keys((router as any)._def.procedures ?? {});

    it(`${name}: exposes procedures and denies them all when LEGAL is not entitled`, async () => {
      expect(procedures.length).toBeGreaterThan(0); // guard against an empty/renamed map

      const caller = (router as any).createCaller(deniedCtx());

      for (const path of procedures) {
        const fn = resolve(caller, path);
        expect(typeof fn, `${name}.${path} should be callable`).toBe('function');

        let thrown: unknown;
        try {
          // The entitlement gate is an OUTER middleware: it runs before input
          // parsing, so an empty input still trips FORBIDDEN (not BAD_REQUEST).
          await (fn as (input: unknown) => Promise<unknown>)({});
        } catch (err) {
          thrown = err;
        }

        expect(thrown, `${name}.${path} must reject when not entitled`).toBeInstanceOf(TRPCError);
        expect((thrown as TRPCError).code, `${name}.${path} must be FORBIDDEN`).toBe('FORBIDDEN');
        expect((thrown as TRPCError).message).toMatch(/LEGAL module/);
      }
    });
  }

  it('the SAME procedures are reachable (not FORBIDDEN) for an entitled tenant', async () => {
    // Positive control: with the default GRANTING stub the gate must NOT be the
    // thing that blocks the call — proves the denial above is entitlement-driven,
    // not a blanket failure. (Resolvers may still fail later on the prisma mock;
    // we only assert the failure is never the entitlement gate.)
    const caller = (casesRouter as any).createCaller(createTestContext());
    let err: unknown;
    try {
      await caller.list({});
    } catch (e) {
      err = e;
    }
    const isForbidden = err instanceof TRPCError && err.code === 'FORBIDDEN';
    expect(isForbidden).toBe(false);
  });
});

// The appointments router is SHARED with the core calendar (so it is NOT in
// LEGAL_ROUTERS), but its case-linking surface IS a LEGAL feature and must still
// require entitlement — a tenant downgraded out of LEGAL keeps orphan cases.
describe('shared appointments router — case-linking requires LEGAL', () => {
  it('linkToCase / unlinkFromCase are FORBIDDEN without the LEGAL module', async () => {
    const caller = (appointmentsRouter as any).createCaller(deniedCtx());
    for (const proc of ['linkToCase', 'unlinkFromCase']) {
      let thrown: unknown;
      try {
        await caller[proc]({ appointmentId: 'a', caseId: 'c' });
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${proc} must reject when not entitled`).toBeInstanceOf(TRPCError);
      expect((thrown as TRPCError).code, `${proc} must be FORBIDDEN`).toBe('FORBIDDEN');
    }
  });

  it('core calendar list (no caseId) stays reachable without LEGAL', async () => {
    const caller = (appointmentsRouter as any).createCaller(deniedCtx());
    let err: unknown;
    try {
      await caller.list({}); // no caseId → core calendar query, not gated
    } catch (e) {
      err = e;
    }
    const isForbidden = err instanceof TRPCError && err.code === 'FORBIDDEN';
    expect(isForbidden).toBe(false);
  });

  it('cloaks orphan linkedCases from a non-entitled tenant list response', async () => {
    // A downgraded tenant can still hold orphan AppointmentCase rows; the read
    // response must not surface them.
    (prismaMock.appointment.findMany as any).mockResolvedValue([
      {
        id: 'a1',
        organizerId: 'u1',
        attendees: [],
        linkedCases: [{ id: 'lc1', caseId: 'c1', appointmentId: 'a1', tenantId: 't1' }],
      },
    ]);
    (prismaMock.appointment.count as any).mockResolvedValue(1);
    (prismaMock.user.findMany as any).mockResolvedValue([]);

    const caller = (appointmentsRouter as any).createCaller(deniedCtx());
    const res = await caller.list({});
    expect(res.appointments).toHaveLength(1);
    expect(res.appointments[0].linkedCases).toEqual([]); // cloaked
  });
});
