/**
 * Integration environment guard.
 *
 * Earlier versions of this file contained 22 placeholder `expect(true).toBe(true)`
 * tests that rendered a mock Prisma client and short-circuited via
 * `if (!dbAvailable) return;` — i.e. fake-green no-ops that never exercised
 * any real behavior. They were deleted on 2026-04-17.
 *
 * The real coverage for each domain now lives in the correct package:
 *
 * - Schema tables / RLS → `packages/db/src/__tests__/rls-migrations.test.ts`
 * - Indexes + query perf → `packages/db/src/__tests__/query-performance.test.ts`
 * - CRUD via repositories → `packages/adapters/src/**\/*.test.ts`
 * - Transactions + tRPC → `apps/api/src/modules/*\/__tests__/*.router.test.ts`
 * - Constraint validation → Prisma schema + `packages/validators/**`
 * - Migration chain integrity → `packages/db/src/__tests__/rls-migrations.test.ts`
 * - Prisma ESM exports → `packages/db/src/__tests__/generated-prisma-esm.test.ts`
 * - pgvector queries → `packages/db/src/__tests__/pgvector.additional.test.ts`
 *
 * What stays here: a single environment-safety assertion that prevents a
 * misconfigured `TEST_DATABASE_URL` from pointing at a production cluster
 * when the caller has opted into integration-mode.
 */

import { describe, it, expect } from 'vitest';

describe('Integration test environment', () => {
  it('TEST_DATABASE_URL (when set) must not target a production database', () => {
    const dbUrl = process.env['TEST_DATABASE_URL'];

    if (!dbUrl) {
      // Not opted into integration mode in this run — nothing to guard.
      expect(dbUrl).toBeUndefined();
      return;
    }

    const lowered = dbUrl.toLowerCase();
    expect(lowered).not.toContain('production');
    expect(lowered).not.toContain('prod.');
    expect(lowered.includes('test') || lowered.includes('local')).toBe(true);
  });
});
