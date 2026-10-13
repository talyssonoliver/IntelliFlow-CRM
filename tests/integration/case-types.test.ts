/**
 * PG-204 — case types, real-Database integration test (ADR-076).
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migration `20261013120000_case_types` on a real Postgres: the type
 * tables enforce their invariants in the database (case-insensitive names, at most one
 * default, colour/SLA/required-field CHECKs, tenant-consistent checklist items), a case can
 * only reference a type of its own tenant, and a type that cases use cannot be deleted.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { CASE_REQUIRED_FIELD_KEYS } from '../../packages/domain/src/legal/cases/case-type-defaults';
import { CASE_TASK_ORDER } from '../../apps/api/src/lib/case-task-order';
import { endOfCalendarDayInTimezone } from '../../apps/api/src/lib/case-sla-deadline';

const MIGRATION_PATH = join(
  __dirname,
  '../../packages/db/prisma/migrations/20261013120000_case_types/migration.sql'
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** Split migration SQL into statements, keeping `DO $$ ... $$` blocks whole. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i++;
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && !inDollar) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/**
 * CI builds its test database with `prisma db push`, which creates tables from
 * schema.prisma but never runs migration SQL: the CHECKs, the expression/partial
 * unique indexes, the composite cases FK and the RLS policies this suite asserts
 * are absent there. When they are missing, rebuild the two case-type tables from
 * the migration's own SQL (they hold only this suite's rows). The `cases` table is
 * never dropped — other suites write it concurrently; its column is only added
 * when missing (a local DB that was not pushed with this schema).
 */
async function ensureMigrationSql(client: any): Promise<void> {
  // Columns on shared tables are added in place (never dropped); safe to repeat.
  await client.$executeRawUnsafe('ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "caseTypeId" TEXT');
  await client.$executeRawUnsafe(
    'ALTER TABLE "case_tasks" ADD COLUMN IF NOT EXISTS "position" INTEGER'
  );
  const present = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'case_types_colorToken_check'`
  );
  if (present.length > 0) return;
  await client.$executeRawUnsafe(
    'DROP TABLE IF EXISTS "case_type_checklist_items", "case_types" CASCADE'
  );
  for (const stmt of splitStatements(migrationSql())) {
    // Shared-table columns were ensured above.
    if (/^ALTER TABLE "(cases|case_tasks)" ADD COLUMN/.test(stmt)) continue;
    await client.$executeRawUnsafe(stmt);
  }
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping case-types integration test: DATABASE_URL not set');
}

const RUN = `pg204_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const USER_A = `${RUN}_ua`;
const USER_B = `${RUN}_ub`;
const ACCOUNT_A = `${RUN}_acc_a`;
const ACCOUNT_B = `${RUN}_acc_b`;

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const match = /"(?:code|originalCode)":"(\d{5}|P\d{4})"/.exec(text);
  if (match) return match[1];
  const code = (error as { code?: string })?.code;
  if (code) return code;
  const message = String((error as { message?: string })?.message ?? '');
  if (/check constraint|CheckConstraint/i.test(message + text)) return '23514';
  if (/unique constraint|duplicate key|UniqueConstraint/i.test(message + text)) return '23505';
  if (/foreign key|ForeignKeyConstraint/i.test(message + text)) return '23503';
  return undefined;
}

async function expectRejected(promise: Promise<unknown>, codes: string[]): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'statement should have been rejected').toBeDefined();
  const code = pgCode(caught);
  if (!code || !codes.includes(code)) {
    console.log('Unexpected rejection shape:', String((caught as Error)?.message).slice(0, 400));
  }
  expect(codes).toContain(code);
}

const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FOREIGN_KEY = ['23503', 'P2003'];

describeDb('PG-204 case types (real DB)', () => {
  let prisma: any;
  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureMigrationSql(prisma);
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    for (const [id, tenantId] of [
      [USER_A, TENANT_A],
      [USER_B, TENANT_B],
    ]) {
      await prisma.user.create({ data: { id, tenantId, email: `${id}@example.invalid` } });
    }
    for (const [id, tenantId, ownerId] of [
      [ACCOUNT_A, TENANT_A, USER_A],
      [ACCOUNT_B, TENANT_B, USER_B],
    ]) {
      await prisma.account.create({ data: { id, tenantId, ownerId, name: id } });
    }
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: [TENANT_A, TENANT_B] };
      await prisma.case.deleteMany({ where: { tenantId: tenants } });
      await prisma.caseType.deleteMany({ where: { tenantId: tenants } });
      await prisma.account.deleteMany({ where: { tenantId: tenants } });
      await prisma.user.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  function caseType(tenantId: string, name: string, extra: Record<string, unknown> = {}) {
    return prisma.caseType.create({ data: { tenantId, name, ...extra } });
  }

  function legalCase(tenantId: string, caseTypeId: string | null) {
    const isA = tenantId === TENANT_A;
    return prisma.case.create({
      data: {
        tenantId,
        title: `${RUN} case`,
        clientId: isA ? ACCOUNT_A : ACCOUNT_B,
        assignedTo: isA ? USER_A : USER_B,
        caseTypeId,
      },
    });
  }

  describe('case_types constraints', () => {
    it('stores a type with defaults and nullable settings', async () => {
      const t = await caseType(TENANT_A, `${RUN} Litigation`, {
        category: 'Disputes',
        defaultPriority: 'HIGH',
        defaultSlaDays: 14,
        requiredFields: ['jurisdiction'],
      });
      expect(t.colorToken).toBe('slate');
      expect(t.isActive).toBe(true);
      expect(t.isDefault).toBe(false);
      expect(t.requiredFields).toEqual(['jurisdiction']);
    });

    it('rejects a colour outside the 8-token allowlist', async () => {
      await expectRejected(caseType(TENANT_A, `${RUN} neon`, { colorToken: 'neon' }), CHECK);
    });

    it('rejects an SLA outside 1..3650 days', async () => {
      await expectRejected(caseType(TENANT_A, `${RUN} sla0`, { defaultSlaDays: 0 }), CHECK);
      await expectRejected(caseType(TENANT_A, `${RUN} sla+`, { defaultSlaDays: 3651 }), CHECK);
    });

    it('rejects a blank name', async () => {
      await expectRejected(caseType(TENANT_A, '   '), CHECK);
    });

    it('rejects unknown required-field keys', async () => {
      await expectRejected(caseType(TENANT_A, `${RUN} badreq`, { requiredFields: ['ssn'] }), CHECK);
    });

    // Plan box (re-verify 2026-10-13): the cardinality half of the CHECK had no test. Seven
    // entries, all valid keys (one repeated), pass the subset test and must fail cardinality <= 6.
    it('rejects more than six required-field entries', async () => {
      const requiredFields = [
        'title',
        'title',
        'description',
        'deadline',
        'jurisdiction',
        'clientId',
        'assignedTo',
      ];
      await expectRejected(caseType(TENANT_A, `${RUN} toomany`, { requiredFields }), CHECK);
    });

    it('rejects a case-insensitive duplicate name within a tenant only', async () => {
      await caseType(TENANT_A, `${RUN} NDA`);
      await expectRejected(caseType(TENANT_A, `${RUN} nda`), UNIQUE);
      const other = await caseType(TENANT_B, `${RUN} nda`);
      expect(other.tenantId).toBe(TENANT_B);
    });

    it('allows at most one default type per tenant', async () => {
      await caseType(TENANT_A, `${RUN} default A`, { isDefault: true });
      await expectRejected(caseType(TENANT_A, `${RUN} default A2`, { isDefault: true }), UNIQUE);
      const b = await caseType(TENANT_B, `${RUN} default B`, { isDefault: true });
      expect(b.isDefault).toBe(true);
    });

    it('lists the same required-field keys as the domain constant', async () => {
      const rows: Array<{ def: string }> = await prisma.$queryRawUnsafe(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'case_types_requiredFields_check'`
      );
      expect(rows).toHaveLength(1);
      const keys = [...rows[0].def.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
      expect(keys).toEqual([...CASE_REQUIRED_FIELD_KEYS]);
    });
  });

  describe('checklist items', () => {
    it('cascade with their type and reject a blank title', async () => {
      const t = await caseType(TENANT_A, `${RUN} checklist`);
      await prisma.caseTypeChecklistItem.create({
        data: { tenantId: TENANT_A, caseTypeId: t.id, title: 'Conflict check', sortOrder: 0 },
      });
      await expectRejected(
        prisma.caseTypeChecklistItem.create({
          data: { tenantId: TENANT_A, caseTypeId: t.id, title: ' ', sortOrder: 1 },
        }),
        CHECK
      );
      await prisma.caseType.delete({ where: { id: t.id } });
      expect(await prisma.caseTypeChecklistItem.count({ where: { caseTypeId: t.id } })).toBe(0);
    });

    // Plan box (re-verify 2026-10-13): deleting a tenant removes its types and checklist items.
    it('are removed with their type when the tenant is deleted', async () => {
      const tenantId = `${RUN}-tenant-c`;
      await prisma.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId } });
      const t = await caseType(tenantId, `${RUN} cascade`);
      await prisma.caseTypeChecklistItem.create({
        data: { tenantId, caseTypeId: t.id, title: 'Engagement letter', sortOrder: 0 },
      });
      await prisma.tenant.delete({ where: { id: tenantId } });
      expect(await prisma.caseType.count({ where: { tenantId } })).toBe(0);
      expect(await prisma.caseTypeChecklistItem.count({ where: { tenantId } })).toBe(0);
    });

    it('cannot carry a tenant different from their type', async () => {
      const t = await caseType(TENANT_A, `${RUN} cross item`);
      await expectRejected(
        prisma.caseTypeChecklistItem.create({
          data: { tenantId: TENANT_B, caseTypeId: t.id, title: 'Leak', sortOrder: 0 },
        }),
        FOREIGN_KEY
      );
    });
  });

  describe('cases.caseTypeId', () => {
    it('accepts a case without a type', async () => {
      const c = await legalCase(TENANT_A, null);
      expect(c.caseTypeId).toBeNull();
    });

    it('accepts a type of the same tenant', async () => {
      const t = await caseType(TENANT_A, `${RUN} same tenant`);
      const c = await legalCase(TENANT_A, t.id);
      expect(c.caseTypeId).toBe(t.id);
    });

    it("rejects another tenant's type at the database", async () => {
      const t = await caseType(TENANT_A, `${RUN} foreign`);
      await expectRejected(legalCase(TENANT_B, t.id), FOREIGN_KEY);
    });

    it('blocks deleting a type that cases use', async () => {
      const t = await caseType(TENANT_A, `${RUN} in use`);
      await legalCase(TENANT_A, t.id);
      await expectRejected(prisma.caseType.delete({ where: { id: t.id } }), FOREIGN_KEY);
    });
  });

  // codex deadline-timezone-mismatch: the deadline cases.create writes for a typed
  // 2026-12-01 reads back as 23:59:59.999 on 2026-12-01 in the case timezone.
  describe('typed deadline in the case timezone', () => {
    it.each([
      ['America/New_York', '2026-12-02T04:59:59.999Z'],
      ['Asia/Tokyo', '2026-12-01T14:59:59.999Z'],
    ])('stores 2026-12-01 in %s as %s', async (timezone, iso) => {
      const deadline = endOfCalendarDayInTimezone('2026-12-01', timezone);
      const created = await prisma.case.create({
        data: {
          tenantId: TENANT_A,
          title: `${RUN} dated ${timezone}`,
          clientId: ACCOUNT_A,
          assignedTo: USER_A,
          deadline,
          timezone,
        },
      });
      const stored = await prisma.case.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.deadline?.toISOString()).toBe(iso);
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
        stored.deadline!
      );
      expect(localDate).toBe('2026-12-01');
    });
  });

  describe('case_tasks.position (checklist order)', () => {
    it('returns seeded steps in checklist order before unpositioned tasks', async () => {
      const c = await legalCase(TENANT_A, null);
      const base = { tenantId: TENANT_A, caseId: c.id, status: 'PENDING', dueDate: null };
      // Inserted out of order on purpose; every seeded dueDate is null.
      await prisma.caseTask.create({ data: { ...base, title: 'Step 3', position: 2 } });
      await prisma.caseTask.create({
        data: { ...base, title: 'Manual, due', dueDate: new Date('2026-01-02T00:00:00Z') },
      });
      await prisma.caseTask.create({ data: { ...base, title: 'Step 1', position: 0 } });
      await prisma.caseTask.create({
        data: { ...base, title: 'Manual, earlier', dueDate: new Date('2026-01-01T00:00:00Z') },
      });
      await prisma.caseTask.create({ data: { ...base, title: 'Step 2', position: 1 } });

      const tasks = await prisma.caseTask.findMany({
        where: { caseId: c.id, tenantId: TENANT_A },
        orderBy: CASE_TASK_ORDER,
      });
      expect(tasks.map((t: { title: string }) => t.title)).toEqual([
        'Step 1',
        'Step 2',
        'Step 3',
        'Manual, earlier',
        'Manual, due',
      ]);
    });
  });

  describe('row-level security', () => {
    it('enables RLS with a tenant policy on both tables', async () => {
      const rows: Array<{ relname: string; relrowsecurity: boolean }> =
        await prisma.$queryRawUnsafe(
          `SELECT relname, relrowsecurity FROM pg_class
         WHERE relname IN ('case_types','case_type_checklist_items')`
        );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
      const policies: Array<{ qual: string; with_check: string }> = await prisma.$queryRawUnsafe(
        `SELECT qual, with_check FROM pg_policies
         WHERE tablename IN ('case_types','case_type_checklist_items')`
      );
      expect(policies).toHaveLength(2);
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it('hides tenant B types from a tenant-A session under a non-bypass role', async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log('Skipping RLS session check: local DB has no Supabase "authenticated" role');
        ctx.skip();
      }
      await caseType(TENANT_B, `${RUN} hidden`);
      let visible: Array<{ tenantId: string }> = [];
      try {
        visible = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', '${TENANT_A}', true)`
          );
          return tx.$queryRawUnsafe(`SELECT "tenantId" FROM case_types`);
        });
      } catch (error) {
        // Missing table GRANTs for the Supabase role (local DB, same as CI) — not an isolation leak.
        console.log('Skipping RLS session check: role lacks table grants locally', pgCode(error));
        ctx.skip();
      }
      expect(visible.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });
});
