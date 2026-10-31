/**
 * Embedding column dimension (owner ruling 2026-10-31, gh #1108).
 *
 * The free OpenRouter embedding model (nvidia/nemotron-3-embed-1b:free) only returns
 * 2048-dimension vectors, so the four embedding columns move from vector(1536) to
 * vector(2048) and the write guards follow one constant. This file pins the constant to
 * the schema and checks the SQL text of the Class B migration that changes it.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { VECTOR_COLUMN_DIMENSIONS, validateEmbedding } from '../client';
import { validateEmbedding as validatePgVectorEmbedding } from '../pgvector';

const SCHEMA = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../prisma/migrations/20261031120000_embeddings_vector_2048/migration.sql'
);
const MIGRATION = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : '';
/** SQL without comment lines, so commentary cannot satisfy an assertion. */
const sql = MIGRATION.split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const TABLES = ['leads', 'lead_notes', 'contacts', 'contact_notes'];

describe('embedding column dimension', () => {
  it('is 2048, the only size the free Nemotron embedding model returns', () => {
    expect(VECTOR_COLUMN_DIMENSIONS).toBe(2048);
  });

  it('matches every vector column in the Prisma schema', () => {
    const sizes = [...SCHEMA.matchAll(/Unsupported\("vector\((\d+)\)"\)/g)].map((m) =>
      Number(m[1])
    );
    expect(sizes).toHaveLength(4);
    expect(new Set(sizes)).toEqual(new Set([VECTOR_COLUMN_DIMENSIONS]));
  });

  it('write guards accept a column-sized vector and reject the old 1536 size', () => {
    const fits = new Array(VECTOR_COLUMN_DIMENSIONS).fill(0.1);
    const old = new Array(1536).fill(0.1);
    expect(validateEmbedding(fits)).toBe(true);
    expect(validateEmbedding(old)).toBe(false);
    expect(validatePgVectorEmbedding(fits)).toBe(true);
    expect(validatePgVectorEmbedding(old)).toBe(false);
  });
});

describe('migration 20261031120000_embeddings_vector_2048', () => {
  it('bounds the lock wait like the other migrations', () => {
    expect(sql).toMatch(/SET LOCAL lock_timeout = '5s';/);
  });

  it.each(TABLES)('widens %s.embedding to vector(2048) and clears it in one statement', (t) => {
    const statement = new RegExp(
      `ALTER TABLE "${t}"\\s+ALTER COLUMN "embedding" TYPE vector\\(2048\\)\\s+USING NULL::vector\\(2048\\);`
    );
    expect(sql).toMatch(statement);
  });

  it('alters only the four embedding columns and drops nothing', () => {
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(TABLES.length);
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it('documents the class, the recovery plan and the backfill', () => {
    expect(MIGRATION).toMatch(/Class B/);
    expect(MIGRATION).toMatch(/Recovery plan/);
    expect(MIGRATION).toMatch(/halfvec\(2048\)/);
    expect(MIGRATION).toMatch(/enqueueMissingEmbeddings/);
  });
});
