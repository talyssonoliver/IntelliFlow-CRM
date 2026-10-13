/**
 * PG-201 — static checks on the report_schedules migration.
 *
 * The owner ruling (2026-10-13) requires the change to be additive (nothing dropped)
 * and the one-time report_settings copy to be idempotent and tenant-scoped. Semantics
 * are proven on a real database by tests/integration/report-schedules-migration.test.ts;
 * this file guards the SQL text itself.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  __dirname,
  '../../prisma/migrations/20261013120000_report_schedules_pg201/migration.sql'
);

const raw = readFileSync(MIGRATION, 'utf8');
/** SQL without comment lines, so commentary cannot satisfy or trip an assertion. */
const sql = raw
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

function copyBlock(): string {
  const start = raw.indexOf('-- PG201-COPY-BEGIN');
  const end = raw.indexOf('-- PG201-COPY-END');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return raw.slice(start, end);
}

const PALETTE = [
  'slate',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

describe('report_schedules migration (PG-201)', () => {
  it('drops, truncates and deletes nothing', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it('relaxes NOT NULL only on the three agreed columns', () => {
    const relaxed = [...sql.matchAll(/ALTER COLUMN "(\w+)" DROP NOT NULL/g)].map((m) => m[1]);
    expect(relaxed.sort()).toEqual(['reportId', 'reportId', 'timeOfDay']);
    expect(sql).toMatch(
      /ALTER TABLE "report_executions"[^;]*ALTER COLUMN "reportId" DROP NOT NULL/
    );
    expect(sql).toMatch(
      /ALTER TABLE "report_schedules"[^;]*ALTER COLUMN "timeOfDay" DROP NOT NULL/
    );
  });

  it('never writes to report_settings', () => {
    expect(sql).not.toMatch(/UPDATE\s+"report_settings"/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"report_settings"/i);
  });

  it('constrains colorToken to the 18-token palette on both tables', () => {
    for (const name of [
      'report_schedule_tags_colorToken_check',
      'report_schedules_colorToken_check',
    ]) {
      const at = sql.indexOf(`"${name}"`);
      expect(at).toBeGreaterThan(-1);
      const clause = sql.slice(at, sql.indexOf(')', sql.indexOf('IN (', at)) + 1);
      for (const token of PALETTE) expect(clause).toContain(`'${token}'`);
    }
  });

  it('adds every constraint on an existing table NOT VALID, then validates it', () => {
    for (const name of [
      'report_schedules_tenantId_templateId_fkey',
      'report_schedules_colorToken_check',
      'report_schedules_cronExpression_check',
      'report_schedules_reference_check',
    ]) {
      const addAt = sql.indexOf(`ADD CONSTRAINT "${name}"`);
      expect(addAt).toBeGreaterThan(-1);
      expect(sql.slice(addAt, sql.indexOf(';', addAt))).toMatch(/NOT VALID$/);
      expect(sql).toContain(`VALIDATE CONSTRAINT "${name}"`);
    }
  });

  it('requires an active schedule to reference a template or a report definition', () => {
    expect(sql).toMatch(
      /CHECK \(NOT "isActive" OR "templateId" IS NOT NULL OR "reportId" IS NOT NULL\)/
    );
  });

  it('keeps template references tenant-consistent and blocks template deletes with NO ACTION', () => {
    // NO ACTION (not RESTRICT): checked at the end of the statement, so a tenant delete
    // that cascades through both report_templates and report_schedules always succeeds,
    // while deleting a referenced template on its own is still refused (Codex round 2).
    expect(sql).toMatch(
      /FOREIGN KEY \("tenantId", "templateId"\) REFERENCES "report_templates"\("tenantId", "id"\) ON DELETE NO ACTION/
    );
    expect(sql).not.toMatch(/REFERENCES "report_templates"[^;]*ON DELETE RESTRICT/);
    expect(sql).toContain('CREATE UNIQUE INDEX "report_templates_tenantId_id_key"');
  });

  it('enforces case-insensitive names per tenant on schedules and tags', () => {
    expect(sql).toMatch(/ON "report_schedules"\("tenantId", lower\("name"\)\)/);
    expect(sql).toMatch(/ON "report_schedule_tags"\("tenantId", lower\("name"\)\)/);
  });

  it('enables RLS with a tenant isolation policy on the new tag table', () => {
    expect(sql).toContain('ALTER TABLE "report_schedule_tags" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toMatch(
      /CREATE POLICY "report_schedule_tags_tenant_isolation" ON "report_schedule_tags"/
    );
  });

  it('adds no scheduler objects (IFC-308 owns the cron)', () => {
    expect(sql).not.toMatch(/pg_cron|cron\.schedule/i);
  });

  describe('one-time scheduledDelivery copy', () => {
    it('is flagged as a production data write', () => {
      expect(raw).toMatch(/PRODUCTION DATA WRITE/);
    });

    it('is idempotent', () => {
      const block = copyBlock();
      expect(block).toContain('\'rs-migrated-\' || src."tenantId"');
      expect(block).toMatch(/WHERE NOT EXISTS/);
      expect(block).toMatch(/ON CONFLICT DO NOTHING;/);
    });

    it('is tenant-scoped and lands rows inactive', () => {
      const block = copyBlock();
      expect(block).toMatch(/FROM "report_settings" rs/);
      expect(block).toContain('src."tenantId",');
      expect(block).toContain('existing."tenantId" = src."tenantId"');
      // isActive column receives the literal false.
      expect(block).toMatch(/ARRAY\[\]::TEXT\[\],\s*false,/);
    });

    it('guards every cast against malformed JSON', () => {
      const block = copyBlock();
      expect(block).toMatch(/jsonb_typeof\(rs\."scheduledDelivery"->'dayOfWeek'\) = 'number'/);
      expect(block).toMatch(/jsonb_typeof\(rs\."scheduledDelivery"->'recipients'\) = 'array'/);
      expect(block).toMatch(
        /CASE WHEN jsonb_typeof\(rs\."scheduledDelivery"->'recipients'\) = 'array'\s+THEN jsonb_array_length/
      );
      expect(block).toMatch(/jsonb_typeof\(rs\."scheduledDelivery"\) = 'object'/);
    });
  });
});
