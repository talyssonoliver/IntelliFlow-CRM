/**
 * Backfill the tenant business type and protect existing data. Operator-run, never over HTTP.
 *
 * Owner ruling 23/11/2026: vertical modules (Cases, Tickets, Commerce) are granted only to the business type
 * they make sense for. This script does the one-off data work the schema migration deliberately does not:
 *
 *  1. Known production tenants get their business type explicitly (KNOWN_TENANT_BUSINESS_TYPES below).
 *     Everything else is left NULL: no guessing from names. NULL gates like OTHER and the admin sees a banner.
 *  2. If a tenant already has rows in a vertical module's tables (cases and documents for LEGAL, tickets for
 *     SUPPORT) but the single resolver (plan + business type + overrides) would not enable that module, an
 *     EXISTING_DATA override ON row is written for it, so nobody loses sight of data they already have. A plan
 *     sync never switches such a row off. Each one is logged, with a note when the plan does not include the
 *     module or the row had been switched off, so the owner can see it. COMMERCE has no tables yet.
 *  3. A legacy a-la-carte add-on (an enabled tenant_modules row for a module outside the tenant's plan, written
 *     before rows had an origin) becomes an explicit OVERRIDE, so the new business-type rule does not hide a
 *     module someone enabled on purpose.
 *
 * Dry run by default: prints counts and every change it would make. `--apply` writes.
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm tsx tools/scripts/backfill-business-type.ts [--apply]
 *
 * Local database only, unless the operator points DATABASE_URL elsewhere on purpose and sets
 * ALLOW_PROD_DB_OPS=1 (owner yes required for production). Agents never run this against production.
 */

import {
  DATA_PROTECTED_MODULES,
  dataProtectionFor,
  resolveEnabledModules,
  isTenantBusinessType,
  type TenantBusinessType,
} from '../../packages/domain/src/platform/modules/VerticalModules';
import {
  MODULE_PLAN_MAP,
  type ModuleId,
  type PlanTier,
} from '../../packages/domain/src/platform/modules/ModuleRegistry';
import { assertMayWrite, describeTarget } from './lib/partner-trust';

/** Production tenants whose business type is known for certain. Never inferred from names. */
export const KNOWN_TENANT_BUSINESS_TYPES: Readonly<Record<string, TenantBusinessType>> = {
  // The owner's Leangency tenant: our own agency.
  cmqgpih4e000004jyh6mmv87m: 'AGENCY',
};

/** Vertical modules whose existing rows must stay reachable. */
export const DATA_MODULES = DATA_PROTECTED_MODULES;
export type DataModule = (typeof DATA_MODULES)[number];

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  businessType: string | null;
}

export interface ModuleRow {
  tenantId: string;
  moduleId: string;
  enabled: boolean;
  origin: string | null;
}

type CountRow = { tenantId: string; _count: { _all: number } };

export interface BackfillDb {
  tenant: {
    findMany(args: {
      select: Record<string, boolean>;
      orderBy: { createdAt: 'asc' };
    }): Promise<TenantRow[]>;
    update(args: { where: { id: string }; data: { businessType: TenantBusinessType } }): unknown;
  };
  tenantModule: {
    findMany(args: { select: Record<string, boolean> }): Promise<ModuleRow[]>;
    upsert(args: {
      where: { tenantId_moduleId: { tenantId: string; moduleId: string } };
      create: {
        tenantId: string;
        moduleId: string;
        enabled: true;
        origin: 'EXISTING_DATA';
        enabledAt: Date;
      };
      update: { enabled: true; origin: 'EXISTING_DATA'; enabledAt: Date; disabledAt: null };
    }): unknown;
    update(args: {
      where: { tenantId_moduleId: { tenantId: string; moduleId: string } };
      data: { origin: 'OVERRIDE' };
    }): unknown;
  };
  case: { groupBy(args: { by: ['tenantId']; _count: { _all: true } }): Promise<CountRow[]> };
  caseDocument: {
    groupBy(args: {
      by: ['tenantId'];
      where: { deletedAt: null };
      _count: { _all: true };
    }): Promise<CountRow[]>;
  };
  ticket: { groupBy(args: { by: ['tenantId']; _count: { _all: true } }): Promise<CountRow[]> };
  $transaction(operations: unknown[]): Promise<unknown>;
}

export interface TenantSetType {
  tenantId: string;
  slug: string;
  businessType: TenantBusinessType;
}

export interface TenantOverrideOn {
  tenantId: string;
  slug: string;
  moduleId: DataModule;
  rows: number;
  reason: string;
}

export interface LegacyAddOn {
  tenantId: string;
  slug: string;
  moduleId: ModuleId;
}

export interface BackfillPlan {
  tenantsTotal: number;
  alreadyTyped: number;
  setType: TenantSetType[];
  leftNull: number;
  overrides: TenantOverrideOn[];
  /** Data in a module the plan does not include, or one that was switched off: reported, never written. */
  review: TenantOverrideOn[];
  legacyAddOns: LegacyAddOn[];
}

const DATA_LABEL: Record<DataModule, string> = { LEGAL: 'cases and documents', SUPPORT: 'tickets' };

function asPlan(plan: string): PlanTier {
  return plan as PlanTier;
}

type ResolverRow = { moduleId: ModuleId; enabled: boolean; origin: 'PLAN' | 'OVERRIDE' };

/** The tenant's business type after the backfill: its own, else the known one, else none. */
function typeAfterBackfill(
  tenant: TenantRow,
  known: Readonly<Record<string, TenantBusinessType>>
): { businessType: TenantBusinessType | null; kind: 'typed' | 'known' | 'none' } {
  if (isTenantBusinessType(tenant.businessType)) {
    return { businessType: tenant.businessType, kind: 'typed' };
  }
  const knownType = known[tenant.id];
  return knownType
    ? { businessType: knownType, kind: 'known' }
    : { businessType: null, kind: 'none' };
}

/** A legacy a-la-carte add-on: enabled, outside the plan, still written as a PLAN row. */
function findLegacyAddOns(
  tenant: TenantRow,
  rows: readonly ResolverRow[],
  planModules: readonly ModuleId[],
  enabled: ReadonlySet<ModuleId>
): LegacyAddOn[] {
  return rows
    .filter(
      (row) =>
        row.enabled &&
        row.origin === 'PLAN' &&
        !planModules.includes(row.moduleId) &&
        !enabled.has(row.moduleId)
    )
    .map((row) => ({ tenantId: tenant.id, slug: tenant.slug, moduleId: row.moduleId }));
}

/** Notes the owner should see next to an automatic override. */
function overrideNotes(
  tenant: TenantRow,
  moduleId: ModuleId,
  rows: readonly ResolverRow[],
  planModules: readonly ModuleId[]
): string[] {
  const notes: string[] = [];
  if (!planModules.includes(moduleId)) notes.push(`plan ${tenant.plan} does not include it`);
  if (rows.some((o) => o.moduleId === moduleId && !o.enabled))
    notes.push('it had been switched off');
  return notes;
}

/**
 * The vertical modules the tenant holds rows in but the resolver would hide: those only the business type
 * hides get an EXISTING_DATA override; the rest (plan does not include them, or switched off) are for review.
 */
function dataOverrides(ctx: {
  tenant: TenantRow;
  businessType: TenantBusinessType | null;
  rows: readonly ResolverRow[];
  planModules: readonly ModuleId[];
  enabled: ReadonlySet<ModuleId>;
  legacyIds: ReadonlySet<ModuleId>;
  rowCounts: Readonly<Record<DataModule, ReadonlyMap<string, number>>>;
}): { overrides: TenantOverrideOn[]; review: TenantOverrideOn[] } {
  const out = { overrides: [] as TenantOverrideOn[], review: [] as TenantOverrideOn[] };
  for (const moduleId of DATA_MODULES) {
    const count = ctx.rowCounts[moduleId].get(ctx.tenant.id) ?? 0;
    if (ctx.legacyIds.has(moduleId)) continue;
    const verdict = dataProtectionFor({
      moduleId,
      plan: asPlan(ctx.tenant.plan),
      hasData: count > 0,
      enabled: ctx.enabled.has(moduleId),
      switchedOff: ctx.rows.some((o) => o.moduleId === moduleId && !o.enabled),
    });
    if (verdict === 'none') continue;
    const notes = overrideNotes(ctx.tenant, moduleId, ctx.rows, ctx.planModules);
    (verdict === 'protect' ? out.overrides : out.review).push({
      tenantId: ctx.tenant.id,
      slug: ctx.tenant.slug,
      moduleId,
      rows: count,
      reason:
        `${count} existing ${DATA_LABEL[moduleId]} would be hidden (business type ${ctx.businessType ?? 'not set'}, plan ${ctx.tenant.plan})` +
        (notes.length > 0 ? `; NOTE: ${notes.join(', ')}` : ''),
    });
  }
  return out;
}

/**
 * Pure: from the tenants, their module rows and their per-module row counts, decide what to write.
 * Uses the domain's single resolver, so what is protected is exactly what the product would hide.
 */
export function planBackfill(input: {
  tenants: readonly TenantRow[];
  moduleRows: readonly ModuleRow[];
  rowCounts: Readonly<Record<DataModule, ReadonlyMap<string, number>>>;
  known?: Readonly<Record<string, TenantBusinessType>>;
}): BackfillPlan {
  const known = input.known ?? KNOWN_TENANT_BUSINESS_TYPES;
  const plan: BackfillPlan = {
    tenantsTotal: input.tenants.length,
    alreadyTyped: 0,
    setType: [],
    leftNull: 0,
    overrides: [],
    review: [],
    legacyAddOns: [],
  };

  for (const tenant of input.tenants) {
    const { businessType, kind } = typeAfterBackfill(tenant, known);
    if (kind === 'typed') plan.alreadyTyped += 1;
    if (kind === 'none') plan.leftNull += 1;
    if (kind === 'known' && businessType) {
      plan.setType.push({ tenantId: tenant.id, slug: tenant.slug, businessType });
    }

    const rows: ResolverRow[] = input.moduleRows
      .filter((row) => row.tenantId === tenant.id)
      .map((row) => ({
        moduleId: row.moduleId as ModuleId,
        enabled: row.enabled,
        origin: (row.origin ?? 'PLAN') as 'PLAN' | 'OVERRIDE',
      }));
    const tenantPlan = asPlan(tenant.plan);
    const enabled = new Set(
      resolveEnabledModules({ plan: tenantPlan, businessType, overrides: rows })
    );
    const planModules: readonly ModuleId[] = MODULE_PLAN_MAP[tenantPlan] ?? [];

    const legacy = findLegacyAddOns(tenant, rows, planModules, enabled);
    plan.legacyAddOns.push(...legacy);
    const legacyIds = new Set(legacy.map((l) => l.moduleId));

    const found = dataOverrides({
      tenant,
      businessType,
      rows,
      planModules,
      enabled,
      legacyIds,
      rowCounts: input.rowCounts,
    });
    plan.overrides.push(...found.overrides);
    plan.review.push(...found.review);
  }

  return plan;
}

export interface BackfillOptions {
  apply: boolean;
  target: { host: string; local: boolean };
  now?: Date;
}

export interface BackfillResult {
  plan: BackfillPlan;
  applied: boolean;
  lines: string[];
}

function countMap(rows: readonly CountRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.tenantId, r._count._all]));
}

function sumCounts(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>
): Map<string, number> {
  const total = new Map(a);
  for (const [tenantId, n] of b) total.set(tenantId, (total.get(tenantId) ?? 0) + n);
  return total;
}

export async function backfillBusinessType(
  db: BackfillDb,
  options: BackfillOptions
): Promise<BackfillResult> {
  const [tenants, moduleRows, cases, documents, tickets] = await Promise.all([
    db.tenant.findMany({
      select: { id: true, slug: true, name: true, plan: true, businessType: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.tenantModule.findMany({
      select: { tenantId: true, moduleId: true, enabled: true, origin: true },
    }),
    db.case.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    db.caseDocument.groupBy({
      by: ['tenantId'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.ticket.groupBy({ by: ['tenantId'], _count: { _all: true } }),
  ]);

  const plan = planBackfill({
    tenants,
    moduleRows,
    rowCounts: {
      LEGAL: sumCounts(countMap(cases), countMap(documents)),
      SUPPORT: countMap(tickets),
    },
  });

  const lines = [
    `target database: ${options.target.host}${options.target.local ? ' (local)' : ' (NOT local)'}`,
    `tenants:         ${plan.tenantsTotal} (${plan.alreadyTyped} already have a business type)`,
    `set type:        ${plan.setType.length}`,
    ...plan.setType.map((s) => `  - ${s.slug} (${s.tenantId}) -> ${s.businessType}`),
    `left NULL:       ${plan.leftNull} (gated like OTHER; the admin sees a banner)`,
    `override ON:     ${plan.overrides.length} (existing data stays reachable)`,
    ...plan.overrides.map((o) => `  - ${o.slug} (${o.tenantId}) ${o.moduleId}: ${o.reason}`),
    `review (not written): ${plan.review.length} (plan does not include the module, or it was switched off: owner decides)`,
    ...plan.review.map((o) => `  - ${o.slug} (${o.tenantId}) ${o.moduleId}: ${o.reason}`),
    `legacy add-ons:  ${plan.legacyAddOns.length} (enabled outside the plan; become explicit overrides)`,
    ...plan.legacyAddOns.map((a) => `  - ${a.slug} (${a.tenantId}) ${a.moduleId}`),
  ];

  let applied = false;
  if (!options.apply) {
    lines.push('dry run: nothing written. Re-run with --apply to write.');
  } else if (
    plan.setType.length === 0 &&
    plan.overrides.length === 0 &&
    plan.legacyAddOns.length === 0
  ) {
    lines.push('nothing to do.');
  } else {
    assertMayWrite(options.target);
    const now = options.now ?? new Date();
    await db.$transaction([
      ...plan.setType.map((s) =>
        db.tenant.update({ where: { id: s.tenantId }, data: { businessType: s.businessType } })
      ),
      ...plan.overrides.map((o) =>
        db.tenantModule.upsert({
          where: { tenantId_moduleId: { tenantId: o.tenantId, moduleId: o.moduleId } },
          create: {
            tenantId: o.tenantId,
            moduleId: o.moduleId,
            enabled: true,
            origin: 'EXISTING_DATA',
            enabledAt: now,
          },
          update: { enabled: true, origin: 'EXISTING_DATA', enabledAt: now, disabledAt: null },
        })
      ),
      ...plan.legacyAddOns.map((a) =>
        db.tenantModule.update({
          where: { tenantId_moduleId: { tenantId: a.tenantId, moduleId: a.moduleId } },
          data: { origin: 'OVERRIDE' },
        })
      ),
    ]);
    applied = true;
    lines.push('written.');
  }

  return { plan, applied, lines };
}

export interface MainDeps {
  createDb(databaseUrl: string): Promise<BackfillDb & { $disconnect(): Promise<void> }>;
  log(line: string): void;
  error(line: string): void;
}

const USAGE =
  'Usage: DATABASE_URL=<url> pnpm tsx tools/scripts/backfill-business-type.ts [--apply]';

async function createPrismaDb(databaseUrl: string) {
  const { PrismaClient } = await import('../../packages/db/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  return prisma as unknown as BackfillDb & { $disconnect(): Promise<void> };
}

/** Command-line entry. Returns the exit code instead of exiting, so it can be tested. */
export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  deps: MainDeps = { createDb: createPrismaDb, log: console.log, error: console.error }
): Promise<number> {
  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) {
    deps.error(USAGE);
    return 1;
  }

  const db = await deps.createDb(databaseUrl);
  try {
    const result = await backfillBusinessType(db, {
      apply: argv.includes('--apply'),
      target: describeTarget(databaseUrl),
    });
    for (const line of result.lines) deps.log(line);
    return 0;
  } catch (err) {
    deps.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    await db.$disconnect();
  }
}

if (/backfill-business-type\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
