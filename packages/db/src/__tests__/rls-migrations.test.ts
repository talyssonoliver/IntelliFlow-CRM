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
});
