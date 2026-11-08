/**
 * Integration environment guard: the suites truncate and seed the database they connect to, so
 * setup.ts refuses any database that is not a local test one (db-url-guard.ts).
 *
 * This file used to check only TEST_DATABASE_URL, while setup.ts connects with DATABASE_URL
 * first: a production DATABASE_URL with TEST_DATABASE_URL unset passed the old check.
 *
 * Earlier versions also held 22 placeholder tests, deleted on 2026-04-17. Their real coverage:
 * - Schema tables / RLS, migration chain → `packages/db/src/__tests__/rls-migrations.test.ts`
 * - Indexes + query perf → `packages/db/src/__tests__/query-performance.test.ts`
 * - CRUD via repositories → `packages/adapters/src/**\/*.test.ts`
 * - Transactions + tRPC → `apps/api/src/modules/*\/__tests__/*.router.test.ts`
 * - Prisma ESM exports → `packages/db/src/__tests__/generated-prisma-esm.test.ts`
 * - pgvector queries → `packages/db/src/__tests__/pgvector.additional.test.ts`
 */
import { describe, it, expect } from 'vitest';
import {
  NonTestDatabaseError,
  assertTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from './db-url-guard';

// Built at runtime, without credentials, so no connection-string literal sits in source.
const SCHEME = 'post' + 'gresql://';
const dbUrl = (host: string, port = '5432') => `${SCHEME}${host}:${port}/intelliflow_test`;

describe('integration database guard', () => {
  it.each(['localhost', '127.0.0.1', '[::1]', 'postgres-test'])(
    'allows the test host %s',
    (host) => {
      const url = dbUrl(host, '5433');
      expect(assertTestDatabaseUrl(url)).toBe(url);
    }
  );

  it.each([
    'db.example.invalid',
    'aws-0-eu-west-2.pooler.example.invalid',
    'localhost.example.invalid',
  ])('refuses %s', (host) => {
    expect(() => assertTestDatabaseUrl(dbUrl(host))).toThrow(NonTestDatabaseError);
  });

  it('refuses a URL it cannot parse', () => {
    expect(() => assertTestDatabaseUrl('not a url')).toThrow(NonTestDatabaseError);
  });

  it('names the host but never the credentials', () => {
    const credentials = 'tester' + ':' + 'x'.repeat(12);
    const url = `${SCHEME}${credentials}@db.example.invalid:5432/app`;
    let message = '';
    try {
      assertTestDatabaseUrl(url);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('db.example.invalid');
    expect(message).not.toContain('x'.repeat(12));
  });

  describe('the URL setup.ts connects with', () => {
    it('checks DATABASE_URL, which setup uses before TEST_DATABASE_URL', () => {
      // The case the old guard missed: production in DATABASE_URL, nothing in TEST_DATABASE_URL.
      expect(() =>
        resolveTestDatabaseUrl(null, { DATABASE_URL: dbUrl('db.example.invalid') })
      ).toThrow(NonTestDatabaseError);
      expect(() =>
        resolveTestDatabaseUrl(null, {
          DATABASE_URL: dbUrl('db.example.invalid'),
          TEST_DATABASE_URL: dbUrl('localhost'),
        })
      ).toThrow(NonTestDatabaseError);
    });

    it('checks TEST_DATABASE_URL when DATABASE_URL is unset', () => {
      expect(() =>
        resolveTestDatabaseUrl(null, { TEST_DATABASE_URL: dbUrl('db.example.invalid') })
      ).toThrow(NonTestDatabaseError);
      expect(resolveTestDatabaseUrl(null, { TEST_DATABASE_URL: dbUrl('localhost') })).toBe(
        dbUrl('localhost')
      );
    });

    it('prefers the container setup started, and checks it too', () => {
      const container = dbUrl('127.0.0.1', '55432');
      expect(resolveTestDatabaseUrl(container, { DATABASE_URL: dbUrl('localhost') })).toBe(
        container
      );
      expect(() => resolveTestDatabaseUrl(dbUrl('db.example.invalid'), {})).toThrow(
        NonTestDatabaseError
      );
    });

    it('is null when no database is configured', () => {
      expect(resolveTestDatabaseUrl(null, {})).toBeNull();
    });
  });

  it('this run, if it has a database, is pointed at a test one', () => {
    // Throws (failing this test) when the run's own environment points at a non-test host.
    expect(() => resolveTestDatabaseUrl(null)).not.toThrow();
  });
});
