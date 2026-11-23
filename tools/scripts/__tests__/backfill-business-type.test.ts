import { describe, expect, it, vi } from 'vitest';
import {
  KNOWN_TENANT_BUSINESS_TYPES,
  backfillBusinessType,
  main,
  planBackfill,
  type BackfillDb,
  type ModuleRow,
  type TenantRow,
} from '../backfill-business-type';

const LOCAL = { host: 'localhost:5433', local: true };
const REMOTE = { host: 'db.example.invalid', local: false };
const LEANGENCY = 'cmqgpih4e000004jyh6mmv87m';

const tenant = (id: string, over: Partial<TenantRow> = {}): TenantRow => ({
  id,
  slug: `slug-${id}`,
  name: `Tenant ${id}`,
  plan: 'PROFESSIONAL',
  businessType: null,
  ...over,
});

const counts = (cases: Record<string, number> = {}, tickets: Record<string, number> = {}) => ({
  LEGAL: new Map(Object.entries(cases)),
  SUPPORT: new Map(Object.entries(tickets)),
});

const row = (
  tenantId: string,
  moduleId: string,
  enabled: boolean,
  origin: string | null
): ModuleRow => ({ tenantId, moduleId, enabled, origin });

function fakeDb(opts: {
  tenants: TenantRow[];
  moduleRows?: ModuleRow[];
  cases?: Record<string, number>;
  documents?: Record<string, number>;
  tickets?: Record<string, number>;
}) {
  const group = (m: Record<string, number> = {}) =>
    vi.fn(async () =>
      Object.entries(m).map(([tenantId, n]) => ({ tenantId, _count: { _all: n } }))
    );
  const raw = {
    tenant: {
      findMany: vi.fn(async () => opts.tenants),
      update: vi.fn((args: unknown) => ({ op: 'tenant.update', args })),
    },
    tenantModule: {
      findMany: vi.fn(async () => opts.moduleRows ?? []),
      upsert: vi.fn((args: unknown) => ({ op: 'tenantModule.upsert', args })),
      update: vi.fn((args: unknown) => ({ op: 'tenantModule.update', args })),
    },
    case: { groupBy: group(opts.cases) },
    document: { groupBy: group(opts.documents) },
    ticket: { groupBy: group(opts.tickets) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { db: raw as unknown as BackfillDb, raw };
}

describe('planBackfill', () => {
  it('sets the known Leangency tenant to AGENCY and infers nothing for the others', () => {
    const plan = planBackfill({
      tenants: [tenant(LEANGENCY), tenant('a'), tenant('b')],
      moduleRows: [],
      rowCounts: counts(),
    });

    expect(plan.tenantsTotal).toBe(3);
    expect(plan.setType).toEqual([
      { tenantId: LEANGENCY, slug: `slug-${LEANGENCY}`, businessType: 'AGENCY' },
    ]);
    expect(plan.leftNull).toBe(2);
    expect(KNOWN_TENANT_BUSINESS_TYPES[LEANGENCY]).toBe('AGENCY');
  });

  it('does not change a tenant that already has a type', () => {
    const plan = planBackfill({
      tenants: [tenant(LEANGENCY, { businessType: 'OTHER' })],
      moduleRows: [],
      rowCounts: counts(),
    });
    expect(plan.setType).toEqual([]);
    expect(plan.alreadyTyped).toBe(1);
  });

  it('writes an override ON for a module the tenant has data in but would lose', () => {
    const plan = planBackfill({
      tenants: [tenant('law'), tenant('desk')],
      moduleRows: [],
      rowCounts: counts({ law: 7 }, { desk: 12 }),
    });

    expect(plan.overrides.map((o) => [o.tenantId, o.moduleId, o.rows])).toEqual([
      ['law', 'LEGAL', 7],
      ['desk', 'SUPPORT', 12],
    ]);
    expect(plan.overrides[0]!.reason).toMatch(/7 existing cases and documents/);
    expect(plan.overrides[1]!.reason).toMatch(/12 existing tickets/);
  });

  it('writes no override when the resolver already keeps the module (agency with tickets)', () => {
    const plan = planBackfill({
      tenants: [tenant(LEANGENCY)],
      moduleRows: [],
      rowCounts: counts({}, { [LEANGENCY]: 400 }),
    });
    expect(plan.overrides).toEqual([]);
  });

  it('writes no override for a tenant with no rows', () => {
    const plan = planBackfill({ tenants: [tenant('x')], moduleRows: [], rowCounts: counts() });
    expect(plan.overrides).toEqual([]);
  });

  it('is idempotent: an existing OVERRIDE ON row means nothing more to write', () => {
    const plan = planBackfill({
      tenants: [tenant('law')],
      moduleRows: [row('law', 'LEGAL', true, 'EXISTING_DATA')],
      rowCounts: counts({ law: 7 }),
    });
    expect(plan.overrides).toEqual([]);
  });

  it('an explicit OVERRIDE row is already protection', () => {
    const plan = planBackfill({
      tenants: [tenant('law')],
      moduleRows: [row('law', 'LEGAL', true, 'OVERRIDE')],
      rowCounts: counts({ law: 7 }),
    });
    expect(plan.overrides).toEqual([]);
  });

  it('flags a module the plan does not include, and a row that had been switched off', () => {
    const plan = planBackfill({
      tenants: [tenant('starter', { plan: 'STARTER' }), tenant('off')],
      moduleRows: [row('off', 'SUPPORT', false, 'PLAN')],
      rowCounts: counts({ starter: 2 }, { off: 5 }),
    });
    expect(plan.overrides.find((o) => o.tenantId === 'starter')!.reason).toMatch(
      /NOTE: plan STARTER does not include it/
    );
    expect(plan.overrides.find((o) => o.tenantId === 'off')!.reason).toMatch(
      /NOTE: it had been switched off/
    );
  });

  it('turns a legacy a-la-carte add-on into an explicit override instead of a data override', () => {
    const plan = planBackfill({
      tenants: [tenant('addon', { plan: 'STARTER' })],
      moduleRows: [row('addon', 'LEGAL', true, 'PLAN')],
      rowCounts: counts({ addon: 4 }),
    });
    expect(plan.legacyAddOns).toEqual([
      { tenantId: 'addon', slug: 'slug-addon', moduleId: 'LEGAL' },
    ]);
    expect(plan.overrides).toEqual([]);
  });

  it('does not touch a PLAN row that mirrors the plan (LEGAL on Professional)', () => {
    const plan = planBackfill({
      tenants: [tenant('pro')],
      moduleRows: [row('pro', 'LEGAL', true, 'PLAN')],
      rowCounts: counts(),
    });
    expect(plan.legacyAddOns).toEqual([]);
  });

  it('a PLAN-origin row does not count as protection (it only mirrors the plan)', () => {
    const plan = planBackfill({
      tenants: [tenant('law')],
      moduleRows: [row('law', 'LEGAL', true, 'PLAN')],
      rowCounts: counts({ law: 7 }),
    });
    expect(plan.overrides).toHaveLength(1);
  });
});

describe('backfillBusinessType', () => {
  const tenants = [tenant(LEANGENCY), tenant('law'), tenant('plain')];

  it('dry run (the default) reports counts and writes nothing', async () => {
    const { db, raw } = fakeDb({ tenants, cases: { law: 3 } });
    const result = await backfillBusinessType(db, { apply: false, target: LOCAL });

    expect(result.applied).toBe(false);
    expect(result.plan.setType).toHaveLength(1);
    expect(result.plan.overrides).toHaveLength(1);
    expect(result.plan.leftNull).toBe(2);
    const out = result.lines.join('\n');
    expect(out).toMatch(/tenants:\s+3/);
    expect(out).toMatch(/set type:\s+1/);
    expect(out).toMatch(/override ON:\s+1/);
    expect(out).toMatch(/LEGAL: 3 existing cases and documents/);
    expect(out).toMatch(/dry run: nothing written/);
    expect(raw.$transaction).not.toHaveBeenCalled();
    expect(raw.tenant.update).not.toHaveBeenCalled();
    expect(raw.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('--apply writes the type and the override in one transaction', async () => {
    const { db, raw } = fakeDb({ tenants, cases: { law: 3 } });
    const result = await backfillBusinessType(db, {
      apply: true,
      target: LOCAL,
      now: new Date('2026-11-23T00:00:00Z'),
    });

    expect(result.applied).toBe(true);
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(raw.tenant.update).toHaveBeenCalledWith({
      where: { id: LEANGENCY },
      data: { businessType: 'AGENCY' },
    });
    expect(raw.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_moduleId: { tenantId: 'law', moduleId: 'LEGAL' } },
        create: expect.objectContaining({ enabled: true, origin: 'EXISTING_DATA' }),
        update: expect.objectContaining({
          enabled: true,
          origin: 'EXISTING_DATA',
          disabledAt: null,
        }),
      })
    );
  });

  it('counts documents as LEGAL data and converts legacy add-ons when applied', async () => {
    const { db, raw } = fakeDb({
      tenants: [tenant('docs'), tenant('addon', { plan: 'STARTER' })],
      moduleRows: [row('addon', 'LEGAL', true, 'PLAN')],
      documents: { docs: 9 },
    });
    const result = await backfillBusinessType(db, { apply: true, target: LOCAL });

    expect(result.plan.overrides.map((o) => [o.tenantId, o.moduleId, o.rows])).toEqual([
      ['docs', 'LEGAL', 9],
    ]);
    expect(raw.tenantModule.update).toHaveBeenCalledWith({
      where: { tenantId_moduleId: { tenantId: 'addon', moduleId: 'LEGAL' } },
      data: { origin: 'OVERRIDE' },
    });
  });

  it('refuses to write to a database that is not local without the production flag', async () => {
    const { db, raw } = fakeDb({ tenants });
    await expect(backfillBusinessType(db, { apply: true, target: REMOTE })).rejects.toThrow(
      /not a local database/
    );
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('says so when there is nothing to do', async () => {
    const { db } = fakeDb({ tenants: [tenant('plain')] });
    const result = await backfillBusinessType(db, { apply: true, target: LOCAL });
    expect(result.applied).toBe(false);
    expect(result.lines.join('\n')).toMatch(/nothing to do/);
  });
});

describe('main', () => {
  it('needs DATABASE_URL', async () => {
    const error = vi.fn();
    const code = await main([], {}, { createDb: vi.fn(), log: vi.fn(), error });
    expect(code).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Usage/));
  });

  it('is a dry run unless --apply is passed', async () => {
    const { db, raw } = fakeDb({ tenants: [tenant(LEANGENCY)] });
    const log = vi.fn();
    const code = await main(
      [],
      { DATABASE_URL: 'postgresql://localhost:5433/test' },
      {
        createDb: async () => Object.assign(db, { $disconnect: vi.fn(async () => undefined) }),
        log,
        error: vi.fn(),
      }
    );
    expect(code).toBe(0);
    expect(raw.$transaction).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/dry run/));
  });
});
