/**
 * MVP-011 — static checks on the email_mailboxes look-back migration.
 *
 * Class A (additive, ADR-069): only nullable columns are added, nothing is read, dropped, rewritten
 * or constrained, and the columns match the Prisma model so the client and the table agree.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  __dirname,
  '../../prisma/migrations/20261120120000_email_mailbox_lookback/migration.sql'
);
const SCHEMA = path.resolve(__dirname, '../../prisma/schema.prisma');

const raw = readFileSync(MIGRATION, 'utf8');
/** SQL without comment lines, so commentary cannot satisfy or trip an assertion. */
const sql = raw
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const COLUMNS = {
  lookbackWatermark: 'TIMESTAMP(3)',
  lookbackUntil: 'TIMESTAMP(3)',
  lookbackCursor: 'TEXT',
  lookbackSentCursor: 'TEXT',
} as const;

describe('email_mailboxes look-back migration', () => {
  it('declares itself Class A with a recovery plan', () => {
    expect(raw).toMatch(/Class A/);
    expect(raw).toMatch(/Recovery plan/);
  });

  it('only adds nullable columns to email_mailboxes', () => {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^ALTER TABLE "email_mailboxes"\s+ADD COLUMN/);
    expect(sql).not.toMatch(
      /\b(DROP|UPDATE|DELETE|INSERT|TRUNCATE|NOT NULL|DEFAULT|UNIQUE|INDEX)\b/i
    );
  });

  it('adds exactly the four columns with the types the model uses', () => {
    for (const [name, type] of Object.entries(COLUMNS)) {
      expect(sql).toContain(`ADD COLUMN "${name}" ${type}`);
    }
    expect((sql.match(/ADD COLUMN/g) ?? []).length).toBe(Object.keys(COLUMNS).length);
  });

  it('matches the EmailMailbox model in schema.prisma', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const start = schema.indexOf('model EmailMailbox {');
    const model = schema.slice(start, schema.indexOf('\n}', start));
    for (const name of Object.keys(COLUMNS)) {
      expect(model).toMatch(new RegExp(`\\n\\s+${name}\\s+(DateTime|String)\\?`));
    }
  });
});
