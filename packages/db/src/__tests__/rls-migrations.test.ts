import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve(__dirname, '../../prisma/migrations');

function collectMatches(content: string, pattern: RegExp): string[] {
  const matches = Array.from(content.matchAll(pattern), (match) => match[1]?.trim()).filter(
    (value): value is string => Boolean(value)
  );

  return matches;
}

describe('Prisma migration RLS coverage', () => {
  it('enables RLS for every public table created by the migration chain', () => {
    const migrationSqlFiles = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(migrationsDir, entry.name, 'migration.sql'))
      .filter((filePath) => existsSync(filePath));

    const createdTables = new Set<string>();
    const rlsEnabledTables = new Set<string>();

    const createTablePattern =
      /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([A-Za-z0-9_]+)"?/gi;
    const enableRlsPattern =
      /ALTER TABLE(?: ONLY)?\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s+ENABLE ROW LEVEL SECURITY;/gi;

    for (const migrationSqlFile of migrationSqlFiles) {
      const sql = readFileSync(migrationSqlFile, 'utf8');

      for (const tableName of collectMatches(sql, createTablePattern)) {
        if (tableName !== '_prisma_migrations') {
          createdTables.add(tableName);
        }
      }

      for (const tableName of collectMatches(sql, enableRlsPattern)) {
        rlsEnabledTables.add(tableName);
      }
    }

    const missingRls = [...createdTables]
      .filter((tableName) => !rlsEnabledTables.has(tableName))
      .sort((left, right) => left.localeCompare(right));

    expect(missingRls).toEqual([]);
  });

  it('locks the partner credential tables away from anon and authenticated', () => {
    const sql = readFileSync(
      path.join(migrationsDir, '20260930120000_tenant_provenance_partner', 'migration.sql'),
      'utf8'
    );

    for (const table of ['partners', 'partner_api_keys']) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated;`);
      // Deny by default: no permissive policy may be created for these tables.
      expect(sql).not.toMatch(new RegExp(`CREATE POLICY[^;]*ON "${table}"`, 'i'));
    }
  });

  it('adds tenants.plan without a backfill (production had no workspace rows; Class A)', () => {
    const sql = readFileSync(
      path.join(migrationsDir, '20260930120000_tenant_provenance_partner', 'migration.sql'),
      'utf8'
    );

    expect(sql).toMatch(/ADD COLUMN\s+"plan"\s+"PlanTier"\s+NOT NULL\s+DEFAULT 'STARTER'/);
    expect(sql).not.toMatch(/UPDATE "tenants"/);
    expect(sql).toContain('No backfill of tenants.plan');
  });
});
