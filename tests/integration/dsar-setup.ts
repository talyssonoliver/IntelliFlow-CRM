/**
 * Shared real-DB setup for the DSAR suites (dsar.test.ts, dsar-communications.test.ts): makes
 * sure the PG-203 migration's own SQL (named CHECKs, RLS, dsar_normalise_email) is present.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applySchemaSql } from './schema-lock';

const MIGRATION = join(
  __dirname,
  '../../packages/db/prisma/migrations/20261022120000_dsar_requests/migration.sql'
);

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

/** Already exists (type, constraint, policy), duplicate column, duplicate relation. */
const ALREADY_THERE = ['42710', '42701', '42P07'];

/**
 * CI builds its test database with `prisma db push`: the tables exist but the named CHECKs,
 * the partial unique index, the SQL-only user FKs and RLS do not. When the probe CHECK is
 * missing, rebuild the two DSAR tables (they hold only this suite's rows) from the
 * migration's own SQL. The enum types db push already created are tolerated.
 */
export async function ensureMigrationSql(client: any, dbUrl: string): Promise<string | null> {
  const tables: unknown[] = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_class WHERE relname = 'dsar_requests'`
  );
  if (tables.length === 0) return 'dsar_requests does not exist (schema not applied)';
  const present: unknown[] = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'dsar_requests_staff_identity_check'`
  );
  if (present.length > 0) return null;
  const sql = readFileSync(MIGRATION, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = [
    'DROP TABLE IF EXISTS "dsar_requests", "processing_restrictions" CASCADE',
    ...splitStatements(sql).filter((s) => !/^SET LOCAL/i.test(s)),
  ];
  await applySchemaSql(dbUrl, statements, { tolerate: ALREADY_THERE });
  return null;
}
