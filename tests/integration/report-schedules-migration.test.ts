/**
 * PG-201 — report_schedules migration, real-Database integration test.
 *
 * Runner ruling 3 (2026-10-13): the one-time report_settings.scheduledDelivery ->
 * report_schedules copy must be proven IDEMPOTENT (running it twice produces no
 * duplicates) and NO-LOSS (every enabled / recipient-bearing tenant setting maps to a
 * row with the same recipients, format and schedule; the legacy JSON is untouched).
 * Also proves the SQL-only constraints the migration adds.
 *
 * The copy block is read from the migration file itself (between the PG201-COPY
 * markers), so the test exercises the exact SQL that ships. Lives in
 * `tests/integration/` (CI "Integration Tests" lane). Skips when DATABASE_URL is unset.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { presetToCron } from '../../packages/validators/src/scheduled-reports';

const MIGRATION_PATH = join(
  __dirname,
  '../../packages/db/prisma/migrations/20261013120000_report_schedules_pg201/migration.sql'
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf-8');
const COPY_BEGIN = '-- PG201-COPY-BEGIN';
const COPY_END = '-- PG201-COPY-END';
const MIGRATED_NAME = 'Scheduled delivery (from Report Settings)';

function stripComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** The exact copy statement that ships in the migration. */
const COPY_SQL = stripComments(
  MIGRATION_SQL.slice(MIGRATION_SQL.indexOf(COPY_BEGIN), MIGRATION_SQL.indexOf(COPY_END))
)
  .trim()
  .replace(/;$/, '');

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

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const message = String((error as { message?: string })?.message ?? '');
  // Prisma raw-query errors wrap the SQLSTATE in P2010: "Raw query failed. Code: `42701`. ..."
  const raw = /Code: `([0-9A-Z]{5})`/.exec(message + text);
  if (raw) return raw[1];
  const match = /"(?:code|originalCode)":"(\d{5}|[0-9A-Z]{5}|P\d{4})"/.exec(text);
  if (match) return match[1];
  if (/check constraint|CheckConstraint/i.test(message + text)) return '23514';
  if (/unique constraint|duplicate key|UniqueConstraint/i.test(message + text)) return '23505';
  if (/foreign key|ForeignKeyConstraint/i.test(message + text)) return '23503';
  return undefined;
}

/**
 * CI builds its test database with `prisma db push`, which creates the columns and
 * the tag table from schema.prisma but never runs migration SQL: the CHECKs, the
 * expression unique indexes, the NOT VALID FK and the RLS policy are absent there.
 * When they are missing, re-apply the migration's DDL (not the copy block), skipping
 * statements whose objects db push already created. The tag table holds only this
 * suite's rows, so it is rebuilt to pick up its CHECK.
 */
async function ensureMigrationSql(client: any): Promise<void> {
  const present = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'report_schedules_reference_check'`
  );
  if (present.length > 0) return;
  await client.$executeRawUnsafe('DROP TABLE IF EXISTS "report_schedule_tags" CASCADE');
  const ddl = stripComments(MIGRATION_SQL.slice(0, MIGRATION_SQL.indexOf(COPY_BEGIN)));
  const ALREADY_THERE = ['42701', '42P07', '42710'];
  for (const stmt of splitStatements(ddl)) {
    try {
      await client.$executeRawUnsafe(stmt);
    } catch (error) {
      const code = pgCode(error);
      if (!code || !ALREADY_THERE.includes(code)) throw error;
    }
  }
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

const UNIQUE = ['23505', 'P2002', 'P2010'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FOREIGN_KEY = ['23503', 'P2003', 'P2010'];

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping report-schedules migration integration test: DATABASE_URL not set');
}

const RUN = `pg201_${Date.now()}`;
const T = {
  enabled: `${RUN}_a`,
  disabledWithRecipients: `${RUN}_b`,
  empty: `${RUN}_c`,
  malformed: `${RUN}_d`,
  nameTaken: `${RUN}_e`,
};
const ALL_TENANTS = Object.values(T);

// Seeded legacy settings: what each tenant had in Report Settings.
const LEGACY: Record<string, unknown> = {
  [T.enabled]: {
    enabled: true,
    frequency: 'weekly',
    dayOfWeek: 2,
    time: '08:15',
    recipients: ['ops@example.invalid', 'lead@example.invalid'],
    format: 'csv',
  },
  [T.disabledWithRecipients]: {
    enabled: false,
    frequency: 'monthly',
    time: '07:00',
    recipients: ['finance@example.invalid'],
    format: 'pdf',
  },
  [T.empty]: {
    enabled: false,
    frequency: 'weekly',
    dayOfWeek: 1,
    time: '09:00',
    recipients: [],
    format: 'pdf',
  },
  [T.malformed]: {
    enabled: true,
    frequency: 'hourly',
    dayOfWeek: 9,
    time: 'x',
    recipients: 'oops',
    format: 'docx',
  },
  [T.nameTaken]: {
    enabled: true,
    frequency: 'daily',
    time: '06:30',
    recipients: ['cfo@example.invalid'],
    format: 'pdf',
  },
};

interface ScheduleRow {
  id: string;
  tenantId: string;
  name: string | null;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string | null;
  cronExpression: string | null;
  timezone: string;
  recipients: unknown;
  format: string;
  isActive: boolean;
  templateId: string | null;
  reportId: string | null;
  description: string | null;
  colorToken: string;
  createdAt: Date;
}

describeDb('PG-201 report_schedules migration (real DB)', () => {
  let prisma: any;
  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  async function rowsFor(tenantIds: string[]): Promise<ScheduleRow[]> {
    return prisma.$queryRawUnsafe(
      `SELECT "id", "tenantId", "name", "frequency", "dayOfWeek", "dayOfMonth", "timeOfDay",
              "cronExpression", "timezone", "recipients", "format", "isActive", "templateId",
              "reportId", "description", "colorToken", "createdAt"
         FROM "report_schedules" WHERE "tenantId" = ANY($1::text[]) ORDER BY "tenantId", "id"`,
      tenantIds
    );
  }

  async function runCopy(): Promise<void> {
    await prisma.$executeRawUnsafe(COPY_SQL);
  }

  async function legacySettings(): Promise<Record<string, unknown>> {
    const rows: Array<{ tenantId: string; scheduledDelivery: unknown }> =
      await prisma.$queryRawUnsafe(
        `SELECT "tenantId", "scheduledDelivery" FROM "report_settings" WHERE "tenantId" = ANY($1::text[])`,
        ALL_TENANTS
      );
    return Object.fromEntries(rows.map((r) => [r.tenantId, r.scheduledDelivery]));
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureMigrationSql(prisma);
    for (const id of ALL_TENANTS) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "tenants" ("id", "name", "slug", "updatedAt") VALUES ($1, $1, $1, NOW())`,
        id
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "report_settings" ("id", "tenantId", "scheduledDelivery", "updatedAt")
         VALUES ($1, $2, $3::jsonb, NOW())`,
        `${id}_rs`,
        id,
        JSON.stringify(LEGACY[id])
      );
    }
    // Tenant E already has a user-created schedule with the migrated name.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "report_schedules" ("id", "tenantId", "name", "frequency", "timeOfDay",
         "cronExpression", "recipients", "isActive", "updatedAt")
       VALUES ($1, $2, $3, 'daily', '06:30', '30 6 * * *', '[]'::jsonb, false, NOW())`,
      `${RUN}_user_row`,
      T.nameTaken,
      MIGRATED_NAME.toUpperCase()
    );
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "report_schedules" WHERE "tenantId" = ANY($1::text[])`,
        ALL_TENANTS
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "report_schedule_tags" WHERE "tenantId" = ANY($1::text[])`,
        ALL_TENANTS
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "report_templates" WHERE "tenantId" = ANY($1::text[])`,
        ALL_TENANTS
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "report_settings" WHERE "tenantId" = ANY($1::text[])`,
        ALL_TENANTS
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "tenants" WHERE "id" = ANY($1::text[])`,
        ALL_TENANTS
      );
    }
    await prisma.$disconnect();
  });

  describe('scheduledDelivery copy', () => {
    let firstRun: ScheduleRow[] = [];

    it('copies enabled and recipient-bearing settings, and only those', async () => {
      await runCopy();
      firstRun = await rowsFor(ALL_TENANTS);
      const migrated = firstRun.filter((r) => r.id.startsWith('rs-migrated-'));
      expect(migrated.map((r) => r.tenantId).sort()).toEqual(
        [T.enabled, T.disabledWithRecipients, T.malformed].sort()
      );
    });

    it('maps an enabled weekly setting field for field', () => {
      const row = firstRun.find((r) => r.tenantId === T.enabled)!;
      expect(row).toMatchObject({
        id: `rs-migrated-${T.enabled}`,
        name: MIGRATED_NAME,
        frequency: 'weekly',
        dayOfWeek: 2,
        dayOfMonth: null,
        timeOfDay: '08:15',
        cronExpression: presetToCron({ cadence: 'weekly', dayOfWeek: 2, timeOfDay: '08:15' }),
        timezone: 'Europe/London',
        format: 'csv',
        isActive: false,
        templateId: null,
        reportId: null,
        colorToken: 'slate',
      });
      expect(row.recipients).toEqual(['ops@example.invalid', 'lead@example.invalid']);
      expect(row.description).toMatch(/was enabled/);
    });

    it('maps a saved-but-disabled monthly setting, recipients included', () => {
      const row = firstRun.find((r) => r.tenantId === T.disabledWithRecipients)!;
      expect(row).toMatchObject({
        frequency: 'monthly',
        dayOfWeek: null,
        dayOfMonth: 1,
        timeOfDay: '07:00',
        cronExpression: presetToCron({ cadence: 'monthly', dayOfMonth: 1, timeOfDay: '07:00' }),
        format: 'pdf',
        isActive: false,
      });
      expect(row.recipients).toEqual(['finance@example.invalid']);
      expect(row.description).toMatch(/not enabled/);
    });

    it('falls back to safe defaults for malformed JSON instead of failing', () => {
      const row = firstRun.find((r) => r.tenantId === T.malformed)!;
      expect(row).toMatchObject({
        frequency: 'weekly',
        dayOfWeek: 1,
        timeOfDay: '09:00',
        cronExpression: '0 9 * * 1',
        format: 'pdf',
        isActive: false,
      });
      expect(row.recipients).toEqual([]);
    });

    it('never duplicates a name the tenant already uses', () => {
      const rows = firstRun.filter((r) => r.tenantId === T.nameTaken);
      expect(rows.map((r) => r.id)).toEqual([`${RUN}_user_row`]);
    });

    it('is idempotent: a second run inserts nothing and changes nothing', async () => {
      await runCopy();
      const secondRun = await rowsFor(ALL_TENANTS);
      expect(secondRun).toEqual(firstRun);
    });

    it('loses nothing: the legacy report_settings JSON is unchanged', async () => {
      const legacy = await legacySettings();
      for (const tenantId of ALL_TENANTS) {
        expect(legacy[tenantId]).toEqual(LEGACY[tenantId]);
      }
    });
  });

  describe('constraints', () => {
    const insertSchedule = (fields: Record<string, unknown>) => {
      const row = {
        id: `${RUN}_${Math.random().toString(36).slice(2)}`,
        tenantId: T.enabled,
        frequency: 'daily',
        timeOfDay: '09:00',
        recipients: '[]',
        isActive: false,
        ...fields,
      };
      const keys = Object.keys(row);
      const values = Object.values(row);
      const placeholders = keys.map((k, i) =>
        k === 'recipients' ? `$${i + 1}::jsonb` : `$${i + 1}`
      );
      const columns = keys.map((k) => '"' + k + '"').join(', ');
      return prisma.$executeRawUnsafe(
        `INSERT INTO "report_schedules" (${columns}, "updatedAt")
         VALUES (${placeholders.join(', ')}, NOW())`,
        ...values
      );
    };

    async function template(tenantId: string, id: string): Promise<void> {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "report_templates" ("id", "tenantId", "createdBy", "name", "selectedColumns", "updatedAt")
         VALUES ($1, $2, 'u1', $1, '["name"]'::jsonb, NOW())`,
        id,
        tenantId
      );
    }

    it('rejects an active schedule with neither a template nor a report', async () => {
      await expectRejected(insertSchedule({ name: `${RUN} orphan`, isActive: true }), CHECK);
    });

    it('rejects a colour token outside the palette', async () => {
      await expectRejected(insertSchedule({ name: `${RUN} neon`, colorToken: 'neon' }), CHECK);
    });

    it('rejects a cron expression that is not 5 fields', async () => {
      await expectRejected(
        insertSchedule({ name: `${RUN} six`, cronExpression: '0 0 9 * * 1' }),
        CHECK
      );
    });

    it('rejects a case-insensitive duplicate name in the same tenant only', async () => {
      await insertSchedule({ name: `${RUN} Pipeline` });
      await expectRejected(insertSchedule({ name: `${RUN} PIPELINE` }), UNIQUE);
      await insertSchedule({ name: `${RUN} Pipeline`, tenantId: T.disabledWithRecipients });
    });

    it('rejects a template that belongs to another tenant', async () => {
      await template(T.disabledWithRecipients, `${RUN}_tpl_b`);
      await expectRejected(
        insertSchedule({ name: `${RUN} cross`, templateId: `${RUN}_tpl_b` }),
        FOREIGN_KEY
      );
    });

    it('accepts an active schedule on its own template and restricts that template delete', async () => {
      await template(T.enabled, `${RUN}_tpl_a`);
      await insertSchedule({
        name: `${RUN} active`,
        templateId: `${RUN}_tpl_a`,
        isActive: true,
        cronExpression: '0 9 * * 1',
      });
      await expectRejected(
        prisma.$executeRawUnsafe(`DELETE FROM "report_templates" WHERE "id" = $1`, `${RUN}_tpl_a`),
        FOREIGN_KEY
      );
    });

    it('enforces the tag palette and case-insensitive tag names', async () => {
      const tag = (id: string, name: string, colorToken = 'blue') =>
        prisma.$executeRawUnsafe(
          `INSERT INTO "report_schedule_tags" ("id", "tenantId", "name", "colorToken", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          id,
          T.enabled,
          name,
          colorToken
        );
      await tag(`${RUN}_t1`, 'Finance');
      await expectRejected(tag(`${RUN}_t2`, 'FINANCE'), UNIQUE);
      await expectRejected(tag(`${RUN}_t3`, 'Ops', 'neon'), CHECK);
    });
  });
});
