/**
 * Pattern Conformance Regression Tests
 *
 * These tests FAIL when a developer adds a new file/page/endpoint that doesn't
 * follow the established performance patterns from the 5-team perf sweep. They
 * are intentionally strict — an opt-out mechanism (explicit comment) is
 * provided for legitimate exceptions.
 *
 * Patterns enforced:
 * - Team 2: every `'use cache'` function in `apps/web/src/lib/cached-queries/`
 *   must call `cacheTag(userTag(userId))` for per-user isolation
 *   (opt-out: `// @shared-cache: public-data` comment in the file)
 * - Team 4: any `$queryRaw` that contains `UNION` must cast enum columns to
 *   `::text` (Postgres can't UNION different enum types)
 * - Team 5: any `page.tsx` using `dynamic(..., { ssr: false })` must have a
 *   sibling `loading.tsx` for route-level streaming
 *
 * @see docs/claude-refs/performance-patterns.md (if it exists)
 * @see .agents/skills / memory files for context
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';

const WEB_ROOT = join(__dirname, '..');
const MONOREPO_ROOT = join(WEB_ROOT, '..', '..', '..');

// ============================================================================
// Helpers
// ============================================================================

function readTextFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Recursively list .ts/.tsx files under a dir, excluding __tests__ and .test files. */
function listSourceFiles(dir: string, filter: (path: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
        if (filter(full)) out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

// ============================================================================
// Team 2: Per-user cacheTag isolation in 'use cache' functions
// ============================================================================

describe('Pattern Conformance — Team 2: per-user cacheTag in cached-queries', () => {
  const CACHED_QUERIES_DIR = join(WEB_ROOT, 'lib', 'cached-queries');

  it('every `use cache` function must either call cacheTag(userTag(...)) or have the @shared-cache opt-out comment', () => {
    const files = listSourceFiles(CACHED_QUERIES_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const content = readTextFile(file);
      // Only check files that use the 'use cache' directive
      if (!content.includes("'use cache'") && !content.includes('"use cache"')) continue;

      // Allow explicit opt-out for data that is genuinely global/public
      if (content.includes('@shared-cache:')) continue;

      // Must import userTag
      const hasUserTagImport = /import\s+\{[^}]*\buserTag\b[^}]*\}/.test(content);
      // Must call cacheTag(userTag(...)) at least once
      const hasUserTagCall = /cacheTag\s*\(\s*userTag\s*\(/.test(content);

      if (!hasUserTagImport || !hasUserTagCall) {
        violations.push(
          `${file.replace(MONOREPO_ROOT, '.')}: uses 'use cache' but does NOT call cacheTag(userTag(userId)). ` +
            `Either add per-user isolation or mark with a // @shared-cache: <reason> comment.`
        );
      }
    }

    expect(
      violations,
      `${violations.length} cached-query file(s) missing per-user isolation:\n  ${violations.join('\n  ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// Team 4: UNION queries must cast enum columns to text
// ============================================================================

describe('Pattern Conformance — Team 4: UNION enum casts in $queryRaw', () => {
  const ADAPTERS_DIR = join(MONOREPO_ROOT, 'packages', 'adapters', 'src');
  const API_DIR = join(MONOREPO_ROOT, 'apps', 'api', 'src');

  it('any $queryRaw containing UNION must cast enum-like columns to ::text', () => {
    const files = [...listSourceFiles(ADAPTERS_DIR), ...listSourceFiles(API_DIR)];
    const violations: string[] = [];

    for (const file of files) {
      const content = readTextFile(file);
      // Skip files that don't use $queryRaw at all
      if (!content.includes('$queryRaw')) continue;

      // Find blocks that contain both $queryRaw context and UNION within a reasonable window.
      // Rough signal: any "UNION" or "UNION ALL" inside the same file as $queryRaw.
      if (!/\bUNION(\s+ALL)?\b/.test(content)) continue;

      // Must contain a ::text cast somewhere in the same file (heuristic but effective).
      // Postgres cannot UNION two different enum types; ::text cast is the universal fix.
      const hasTextCast = /::\s*text\b/.test(content);

      // Allow explicit opt-out for files that demonstrably don't UNION enum types
      // (e.g. UNION of INTEGER-only columns)
      if (content.includes('@no-enum-union:')) continue;

      if (!hasTextCast) {
        violations.push(
          `${file.replace(MONOREPO_ROOT, '.')}: contains $queryRaw with UNION but no ::text cast. ` +
            `Postgres cannot UNION different enum types. Add ::text cast to enum columns or mark with ` +
            `// @no-enum-union: <reason> if you are certain no enum columns are involved.`
        );
      }
    }

    expect(
      violations,
      `${violations.length} file(s) with UNION $queryRaw missing enum cast:\n  ${violations.join('\n  ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// Team 5: dynamic({ ssr: false }) pages must have a sibling loading.tsx
// ============================================================================

describe('Pattern Conformance — Team 5: dynamic(ssr:false) needs sibling loading.tsx', () => {
  const APP_DIR = join(WEB_ROOT, 'app');

  it('any page.tsx using dynamic with ssr: false must have a sibling loading.tsx', () => {
    const pageFiles = listSourceFiles(APP_DIR, (path) => /[\\/]page\.tsx?$/.test(path));
    const violations: string[] = [];

    for (const pageFile of pageFiles) {
      const content = readTextFile(pageFile);
      // Fast reject: file doesn't import `dynamic` from 'next/dynamic'
      if (!content.includes("from 'next/dynamic'") && !content.includes('from "next/dynamic"')) continue;

      // Detect `ssr: false` in a dynamic() call. Tolerates whitespace and comments.
      const hasSsrFalse = /dynamic\s*\([^)]*\{[^}]*ssr\s*:\s*false/s.test(content);
      if (!hasSsrFalse) continue;

      // Allow explicit opt-out
      if (content.includes('@no-loading-required:')) continue;

      const pageDir = dirname(pageFile);
      const siblingLoading =
        existsSync(join(pageDir, 'loading.tsx')) || existsSync(join(pageDir, 'loading.ts'));

      if (!siblingLoading) {
        violations.push(
          `${pageFile.replace(MONOREPO_ROOT, '.')}: uses dynamic(ssr:false) but has no sibling loading.tsx. ` +
            `Add a loading.tsx for route-level streaming, or mark with // @no-loading-required: <reason>.`
        );
      }
    }

    expect(
      violations,
      `${violations.length} page(s) using dynamic(ssr:false) without a sibling loading.tsx:\n  ${violations.join('\n  ')}`
    ).toEqual([]);
  });
});
