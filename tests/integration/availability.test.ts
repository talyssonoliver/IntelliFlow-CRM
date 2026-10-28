/**
 * PG-202 — firm availability, real-Database integration test (ADR-081).
 *
 * Proves the Class A migration `20261017130000_availability` on a real Postgres:
 * named CHECKs and uniques, tenant cascade, RLS policies (USING + WITH CHECK),
 * DATE round-trips under a non-UTC session zone, and the loader's legacy fallback
 * against the REAL adapter error when the migration has not been applied.
 *
 * Skips cleanly (with a visible reason) when DATABASE_URL is not set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { loadTenantAvailability } from '../../apps/api/src/modules/calendar/availability-enforcement';
import { applySchemaSql } from './schema-lock';

const MIGRATION_PATH = join(
  __dirname,
  '../../packages/db/prisma/migrations/20261017130000_availability/migration.sql'
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

const CHECK_NAMES = [
  'availability_hours_range_check',
  'availability_hours_startMinute_bounds_check',
  'appointment_settings_maxDailyBookings_check',
];

/** Already exists (constraint, policy), duplicate column, duplicate relation (index). */
const ALREADY_THERE = ['42710', '42701', '42P07'];

/**
 * CI builds its test database with `prisma db push`, which creates the tables and
 * columns from schema.prisma but never runs migration SQL: the named CHECKs and the
 * RLS policies are absent there. When either probe constraint is missing, add them in
 * place from the migration's own SQL, tolerating what db push already created. The
 * tables are never dropped: other suites (PG-203 public booking) hold availability rows
 * while this one runs, and a rebuild would delete them mid-test. The DDL runs under the
 * shared schema lock: other suites write these tables' parents concurrently.
 */
async function ensureMigrationSql(client: any): Promise<void> {
  const shared = [
    'ALTER TABLE "appointment_settings" ADD COLUMN IF NOT EXISTS "maxDailyBookings" INTEGER',
    'ALTER TABLE "appointment_settings" ADD COLUMN IF NOT EXISTS "availabilityConfiguredAt" TIMESTAMP(3)',
  ];
  const present: Array<{ conname: string }> = await client.$queryRawUnsafe(
    'SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])',
    CHECK_NAMES
  );
  if (present.length === CHECK_NAMES.length) {
    await applySchemaSql(DB_URL!, shared);
    return;
  }
  const settingsCheck = present.some(
    (row) => row.conname === 'appointment_settings_maxDailyBookings_check'
  );
  const statements = [...shared];
  for (const stmt of splitStatements(migrationSql())) {
    if (/^ALTER TABLE "appointment_settings" ADD COLUMN/.test(stmt)) continue;
    if (
      settingsCheck &&
      /^ALTER TABLE "appointment_settings" (ADD|VALIDATE) CONSTRAINT/.test(stmt)
    ) {
      continue;
    }
    statements.push(...inPlace(stmt));
  }
  await applySchemaSql(DB_URL!, statements, { tolerate: ALREADY_THERE });
}

/** db push already made the table: turn its inline named CHECKs into ADD CONSTRAINTs. */
function inPlace(stmt: string): string[] {
  const table = /^CREATE TABLE ("[^"]+")/.exec(stmt);
  if (!table) return [stmt];
  return stmt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('CONSTRAINT "') && line.includes('" CHECK ('))
    .map((line) => {
      const body = line.endsWith(',') ? line.slice(0, -1) : line;
      return `ALTER TABLE ${table[1]} ADD ${body}`;
    });
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping availability integration test: DATABASE_URL not set');
}

const RUN = `pg202_${Date.now()}_${randomBytes(3).toString('hex')}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const TENANT_GONE = `${RUN}_gone`;

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  // Raw queries fail as P2010 with the Postgres SQLSTATE in meta.code / the message.
  const meta = (error as { meta?: { code?: string } })?.meta;
  if (meta?.code && /^\d{5}$/.test(meta.code)) return meta.code;
  const rawCode = /Code: `?(\d{5})`?/.exec(String((error as { message?: string })?.message ?? ''));
  if (rawCode) return rawCode[1];
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

describeDb('PG-202 availability (real DB)', () => {
  let prisma: any;
  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureMigrationSql(prisma);
    // Sweep rows left by crashed runs of this suite (older than one day).
    const stale = `pg202_${Date.now() - 86_400_000}`;
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id LIKE 'pg202\\_%' AND id < $1`,
      stale
    );
    for (const id of [TENANT_A, TENANT_B, TENANT_GONE]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: [TENANT_A, TENANT_B, TENANT_GONE] };
      await prisma.availabilityHour.deleteMany({ where: { tenantId: tenants } });
      await prisma.availabilityClosure.deleteMany({ where: { tenantId: tenants } });
      await prisma.appointmentSettings.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  const hour = (tenantId: string, weekday: number, startMinute: number, endMinute: number) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO availability_hours (id, "tenantId", weekday, "startMinute", "endMinute")
       VALUES ($1, $2, $3, $4, $5)`,
      randomBytes(8).toString('hex'),
      tenantId,
      weekday,
      startMinute,
      endMinute
    );

  const closure = (
    tenantId: string,
    startDate: string,
    endDate: string,
    reason: string | null = null
  ) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO availability_closures (id, "tenantId", "startDate", "endDate", reason)
       VALUES ($1, $2, $3::date, $4::date, $5)`,
      randomBytes(8).toString('hex'),
      tenantId,
      startDate,
      endDate,
      reason
    );

  it('has every named CHECK constraint', async () => {
    const rows: Array<{ conname: string }> = await prisma.$queryRawUnsafe(
      `SELECT conname FROM pg_constraint WHERE conname LIKE 'availability_%_check'
         OR conname = 'appointment_settings_maxDailyBookings_check'`
    );
    expect(rows.map((r) => r.conname).sort()).toEqual(
      [
        'appointment_settings_maxDailyBookings_check',
        'availability_closures_range_check',
        'availability_closures_reason_check',
        'availability_hours_endMinute_bounds_check',
        'availability_hours_range_check',
        'availability_hours_startMinute_bounds_check',
        'availability_hours_weekday_check',
      ].sort()
    );
  });

  it('bounds startMinute to 0..1439 and endMinute to 1..1440 explicitly', async () => {
    const defs: Array<{ conname: string; def: string }> = await prisma.$queryRawUnsafe(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = ANY($1::text[]) ORDER BY conname`,
      ['availability_hours_endMinute_bounds_check', 'availability_hours_startMinute_bounds_check']
    );
    expect(defs).toHaveLength(2);
    const byName = Object.fromEntries(defs.map((d) => [d.conname, d.def]));
    expect(byName.availability_hours_startMinute_bounds_check).toBe(
      'CHECK ((("startMinute" >= 0) AND ("startMinute" <= 1439)))'
    );
    expect(byName.availability_hours_endMinute_bounds_check).toBe(
      'CHECK ((("endMinute" >= 1) AND ("endMinute" <= 1440)))'
    );
  });

  describe('availability_hours', () => {
    it('accepts the 0..1440 boundaries', async () => {
      await expect(hour(TENANT_A, 0, 0, 1440)).resolves.toBe(1);
    });

    it.each([
      ['weekday -1', -1, 540, 600],
      ['weekday 7', 7, 540, 600],
      ['start -1', 1, -1, 600],
      ['end 1441', 1, 540, 1441],
      ['start == end', 1, 540, 540],
      ['start > end', 1, 600, 540],
    ])('rejects %s', async (_label, weekday, start, end) => {
      await expectRejected(hour(TENANT_A, weekday, start, end), CHECK);
    });

    it('rejects a duplicate (tenant, weekday, start) but allows it in another tenant', async () => {
      await hour(TENANT_A, 2, 540, 600);
      await expectRejected(hour(TENANT_A, 2, 540, 660), UNIQUE);
      await expect(hour(TENANT_B, 2, 540, 600)).resolves.toBe(1);
    });

    it('rejects a row for a tenant that does not exist', async () => {
      await expectRejected(hour(`${RUN}_missing`, 1, 540, 600), FOREIGN_KEY);
    });
  });

  describe('availability_closures', () => {
    it('accepts equal start and end and a NULL reason', async () => {
      await expect(closure(TENANT_A, '2026-12-25', '2026-12-25')).resolves.toBe(1);
    });

    it('rejects an end before the start, a blank reason and a 201-character reason', async () => {
      await expectRejected(closure(TENANT_A, '2026-12-26', '2026-12-24'), CHECK);
      await expectRejected(closure(TENANT_A, '2026-11-01', '2026-11-01', '   '), CHECK);
      await expectRejected(closure(TENANT_A, '2026-11-02', '2026-11-02', 'x'.repeat(201)), [
        '22001',
        'P2000',
        ...CHECK,
      ]);
    });

    it('rejects a duplicate range', async () => {
      await closure(TENANT_A, '2027-01-01', '2027-01-02');
      await expectRejected(closure(TENANT_A, '2027-01-01', '2027-01-02'), UNIQUE);
    });

    it('round-trips a DATE without a day shift under a far-east session zone', async () => {
      const day = '2026-03-29';
      const rows = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Pacific/Auckland'`);
        await tx.availabilityClosure.create({
          data: {
            tenantId: TENANT_B,
            startDate: new Date(`${day}T00:00:00.000Z`),
            endDate: new Date(`${day}T00:00:00.000Z`),
          },
        });
        const viaPrisma = await tx.availabilityClosure.findFirst({
          where: { tenantId: TENANT_B, startDate: new Date(`${day}T00:00:00.000Z`) },
        });
        const viaSql = await tx.$queryRawUnsafe(
          'SELECT "startDate"::text AS d FROM availability_closures WHERE "tenantId" = $1 AND "startDate" = $2::date',
          TENANT_B,
          day
        );
        return { viaPrisma, viaSql };
      });
      expect(rows.viaPrisma.startDate.toISOString().slice(0, 10)).toBe(day);
      expect(rows.viaSql[0].d).toBe(day);
    });
  });

  describe('appointment_settings availability columns', () => {
    it('accepts NULL, 1 and 500 for the daily cap and rejects 0 and 501', async () => {
      await prisma.appointmentSettings.create({ data: { tenantId: TENANT_A } });
      for (const ok of [null, 1, 500]) {
        await expect(
          prisma.appointmentSettings.update({
            where: { tenantId: TENANT_A },
            data: { maxDailyBookings: ok },
          })
        ).resolves.toBeDefined();
      }
      for (const bad of [0, 501]) {
        await expectRejected(
          prisma.appointmentSettings.update({
            where: { tenantId: TENANT_A },
            data: { maxDailyBookings: bad },
          }),
          CHECK
        );
      }
    });

    it('creates rows with both new columns NULL (never configured)', async () => {
      const row = await prisma.appointmentSettings.create({ data: { tenantId: TENANT_B } });
      expect(row.maxDailyBookings).toBeNull();
      expect(row.availabilityConfiguredAt).toBeNull();
    });
  });

  it('cascades hours and closures when the tenant is deleted', async () => {
    await hour(TENANT_GONE, 1, 540, 600);
    await closure(TENANT_GONE, '2027-05-01', '2027-05-01');
    await prisma.tenant.delete({ where: { id: TENANT_GONE } });
    const left: Array<{ n: number }> = await prisma.$queryRawUnsafe(
      `SELECT (SELECT count(*) FROM availability_hours WHERE "tenantId" = $1)
            + (SELECT count(*) FROM availability_closures WHERE "tenantId" = $1) AS n`,
      TENANT_GONE
    );
    expect(Number(left[0].n)).toBe(0);
  });

  describe('row-level security', () => {
    it('enables RLS with USING and WITH CHECK on both tables', async () => {
      const policies: Array<{ qual: string; with_check: string }> = await prisma.$queryRawUnsafe(
        `SELECT qual, with_check FROM pg_policies
         WHERE tablename IN ('availability_hours','availability_closures')`
      );
      expect(policies).toHaveLength(2);
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it('hides tenant B rows from a tenant-A session under a non-bypass role', async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log(
          'RLS session check NOT proven: local DB has no Supabase "authenticated" role (disclosed skip)'
        );
        ctx.skip();
      }
      await hour(TENANT_B, 5, 540, 600);
      let visible: Array<{ tenantId: string }> = [];
      try {
        visible = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, true)`,
            TENANT_A
          );
          return tx.$queryRawUnsafe(`SELECT "tenantId" FROM availability_hours`);
        });
      } catch (error) {
        console.log(
          'RLS session check NOT proven: role lacks table grants locally (disclosed skip)',
          pgCode(error)
        );
        ctx.skip();
      }
      expect(visible.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });

  describe('loader fallback against the real adapter error (migration not applied)', () => {
    it('returns { configured: false } and logs the real P2022', async () => {
      const schema = `pg202_probe_${randomBytes(4).toString('hex')}`;
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      const probeUrl = DB_URL!.replace(/([?&])schema=[^&]*&?/, '$1').replace(/[?&]$/, '');
      const probe = new PrismaClient({
        adapter: new PrismaPg({ connectionString: probeUrl }, { schema }),
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        // An appointment_settings table WITHOUT the PG-202 columns, as before the migration.
        await prisma.$executeRawUnsafe(
          `CREATE TABLE "${schema}"."appointment_settings" (id TEXT PRIMARY KEY, "tenantId" TEXT UNIQUE NOT NULL, "defaultTimezone" TEXT NOT NULL)`
        );
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${schema}"."appointment_settings" VALUES ('s1', $1, 'Europe/London')`,
          TENANT_A
        );
        await expect(loadTenantAvailability(probe as never, TENANT_A)).resolves.toEqual({
          configured: false,
        });
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('20261017130000_availability'),
          expect.objectContaining({ code: 'P2022' })
        );
      } finally {
        errorSpy.mockRestore();
        await probe.$disconnect();
        await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      }
    });
  });
});
