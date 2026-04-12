/**
 * Tests for A11y Route Reconciliation Script
 *
 * Verifies route drift detection between WCAG conformance statement
 * and actual Next.js App Router directory tree.
 *
 * 38 test cases across 4 function groups:
 * - parseConformanceRoutes (10 cases)
 * - normalizeAppRoute (10 cases)
 * - reconcileRoutes (13 cases)
 * - runReconciliation (5 cases)
 *
 * @module tools/scripts/a11y-route-reconcile.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseConformanceRoutes,
  normalizeAppRoute,
  reconcileRoutes,
  runReconciliation,
  type ReconcileResult,
} from './a11y-route-reconcile.js';

// ============================================================================
// parseConformanceRoutes — 10 cases (P01–P10)
// ============================================================================

describe('parseConformanceRoutes', () => {
  // P01: Extracts routes from Section 2 bullet list
  it('P01: extracts routes from Section 2 bullet list', () => {
    const content = `
## 2. Scope

Routes covered:
- \`/dashboard\`, \`/leads\`, \`/contacts\`
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/leads');
    expect(routes).toContain('/contacts');
  });

  // P02: Handles backtick-quoted routes
  it('P02: handles backtick-quoted routes', () => {
    const content = `
## 2. Scope

These routes: \`/login\` and \`/signup\` are covered.
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toContain('/login');
    expect(routes).toContain('/signup');
  });

  // P03: Deduplicates routes appearing in multiple lines
  it('P03: deduplicates routes appearing multiple times', () => {
    const content = `
## 2. Scope

- \`/dashboard\`, \`/leads\`
- \`/dashboard\`, \`/contacts\`
`;
    const routes = parseConformanceRoutes(content);
    const dashboardCount = routes.filter((r) => r === '/dashboard').length;
    expect(dashboardCount).toBe(1);
  });

  // P04: Normalizes routes to lowercase with leading slash
  it('P04: normalizes routes to lowercase with leading slash', () => {
    const content = `
## 2. Scope

Routes: \`/Dashboard\`, \`/LEADS\`
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/leads');
  });

  // P05: Strips trailing slashes
  it('P05: strips trailing slashes', () => {
    const content = `
## 2. Scope

Routes: \`/dashboard/\`, \`/leads/\`
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/leads');
    expect(routes).not.toContain('/dashboard/');
  });

  // P06: Returns empty array for empty string
  it('P06: returns empty array for empty string', () => {
    const routes = parseConformanceRoutes('');
    expect(routes).toEqual([]);
  });

  // P07: Returns empty array when no routes present
  it('P07: returns empty array when no routes in Section 2', () => {
    const content = `
## 2. Scope

This section has no backtick-enclosed routes.

## 3. Details
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toEqual([]);
  });

  // P08: Parses real conformance statement and extracts >=26 routes
  it('P08: parses real conformance statement and extracts >=26 routes', () => {
    const realPath = resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md');
    const content = readFileSync(realPath, 'utf-8');
    const routes = parseConformanceRoutes(content);
    expect(routes.length).toBeGreaterThanOrEqual(26);
  });

  // P09: Ignores non-route identifiers (URLs, plain words)
  it('P09: ignores non-route identifiers', () => {
    const content = `
## 2. Scope

Uses \`React\` and \`https://example.com\` and \`/dashboard\`
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toContain('/dashboard');
    expect(routes).not.toContain('React');
    expect(routes).not.toContain('https://example.com');
  });

  // P10: Extracts correct count from inline prose format
  it('P10: extracts routes from inline comma-separated format', () => {
    const content = `
## 2. Scope

This statement covers all 4 configured routes:

- **4 public routes:** \`/\` (landing), \`/login\`, \`/signup\`, \`/pricing\`
`;
    const routes = parseConformanceRoutes(content);
    expect(routes).toHaveLength(4);
    expect(routes).toContain('/');
    expect(routes).toContain('/login');
    expect(routes).toContain('/signup');
    expect(routes).toContain('/pricing');
  });
});

// ============================================================================
// normalizeAppRoute — 10 cases (N01–N10)
// ============================================================================

describe('normalizeAppRoute', () => {
  // N01: Strips (public) route group
  it('N01: strips (public) route group', () => {
    expect(normalizeAppRoute('(public)/login/page.tsx')).toBe('/login');
  });

  // N02: Strips (list) route group
  it('N02: strips (list) route group', () => {
    expect(normalizeAppRoute('accounts/(list)/page.tsx')).toBe('/accounts');
  });

  // N03: Strips (developer) route group
  it('N03: strips (developer) route group', () => {
    expect(normalizeAppRoute('(developer)/docs/page.tsx')).toBe('/docs');
  });

  // N04: Returns null for dynamic segment [id]
  it('N04: returns null for dynamic segment [id]', () => {
    expect(normalizeAppRoute('contacts/[id]/page.tsx')).toBeNull();
  });

  // N05: Maps root (public)/page.tsx to /
  it('N05: maps root (public)/page.tsx to /', () => {
    expect(normalizeAppRoute('(public)/page.tsx')).toBe('/');
  });

  // N06: Handles deeply nested paths
  it('N06: handles deeply nested paths', () => {
    expect(normalizeAppRoute('agent-approvals/page.tsx')).toBe('/agent-approvals');
  });

  // N07: Handles Windows backslash separators
  it('N07: handles Windows backslash separators', () => {
    expect(normalizeAppRoute('(public)\\login\\page.tsx')).toBe('/login');
  });

  // N08: Strips trailing /page.tsx suffix
  it('N08: strips trailing /page.tsx suffix', () => {
    expect(normalizeAppRoute('dashboard/page.tsx')).toBe('/dashboard');
  });

  // N09: Strips (list) between parent and leaf segments
  it('N09: strips (list) between parent and leaf segments', () => {
    expect(normalizeAppRoute('leads/(list)/new/page.tsx')).toBe('/leads/new');
  });

  // N10: Produces correct routes for nested layouts
  it('N10: produces correct routes for nested layouts', () => {
    expect(normalizeAppRoute('settings/ai/page.tsx')).toBe('/settings/ai');
  });
});

// ============================================================================
// reconcileRoutes — 13 cases (R01–R13)
// ============================================================================

describe('reconcileRoutes', () => {
  // R01: All gates PASS when doc and fs match perfectly
  it('R01: all gates PASS when doc and fs match perfectly', () => {
    const docRoutes = ['/dashboard', '/leads', '/contacts'];
    const fsRoutes = ['/dashboard', '/leads', '/contacts'];
    const result: ReconcileResult = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.docOnlyRoutes).toHaveLength(0);
    expect(result.fsOnlyRoutes).toHaveLength(0);
    expect(result.matchedRoutes).toHaveLength(3);
    const failGates = result.gates.filter((g) => g.severity === 'FAIL');
    expect(failGates).toHaveLength(0);
  });

  // R02: docOnlyRoutes populated when doc has route not in fs
  it('R02: docOnlyRoutes populated when doc has route not in fs', () => {
    const docRoutes = ['/dashboard', '/leads', '/missing'];
    const fsRoutes = ['/dashboard', '/leads'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.docOnlyRoutes).toContain('/missing');
  });

  // R03: fsOnlyRoutes populated when fs has route not in doc
  it('R03: fsOnlyRoutes populated when fs has route not in doc', () => {
    const docRoutes = ['/dashboard'];
    const fsRoutes = ['/dashboard', '/extra'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.fsOnlyRoutes).toContain('/extra');
  });

  // R04: matchedRoutes contains intersection
  it('R04: matchedRoutes contains intersection', () => {
    const docRoutes = ['/a', '/b', '/c'];
    const fsRoutes = ['/b', '/c', '/d'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.matchedRoutes).toEqual(expect.arrayContaining(['/b', '/c']));
    expect(result.matchedRoutes).toHaveLength(2);
  });

  // R05: Gate severity FAIL when docOnlyRoutes non-empty
  it('R05: gate severity FAIL when docOnlyRoutes non-empty', () => {
    const docRoutes = ['/dashboard', '/ghost'];
    const fsRoutes = ['/dashboard'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    const g3 = result.gates.find((g) => g.name === 'STATEMENT_COVERS_DISK');
    expect(g3).toBeDefined();
    expect(g3!.severity).toBe('FAIL');
  });

  // R06: Gate severity WARN when fsOnlyRoutes non-empty
  it('R06: gate severity WARN when fsOnlyRoutes non-empty', () => {
    const docRoutes = ['/dashboard'];
    const fsRoutes = ['/dashboard', '/undocumented'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    const g4 = result.gates.find((g) => g.name === 'DISK_COVERED_BY_STATEMENT');
    expect(g4).toBeDefined();
    expect(g4!.severity).toBe('WARN');
  });

  // R07: Empty docRoutes produces FAIL gate (vacuous guard)
  it('R07: empty docRoutes produces FAIL gate', () => {
    const result = reconcileRoutes([], ['/dashboard']);
    const g1 = result.gates.find((g) => g.name === 'PARSE_OK');
    expect(g1).toBeDefined();
    expect(g1!.severity).toBe('FAIL');
  });

  // R08: Empty fsRoutes produces FAIL gate
  it('R08: empty fsRoutes produces FAIL gate', () => {
    const result = reconcileRoutes(['/dashboard'], []);
    const g3 = result.gates.find((g) => g.name === 'STATEMENT_COVERS_DISK');
    expect(g3).toBeDefined();
    expect(g3!.severity).toBe('FAIL');
  });

  // R09: Route comparison is case-insensitive
  it('R09: route comparison is case-insensitive', () => {
    const docRoutes = ['/dashboard'];
    const fsRoutes = ['/Dashboard'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.matchedRoutes).toHaveLength(1);
    expect(result.docOnlyRoutes).toHaveLength(0);
    expect(result.fsOnlyRoutes).toHaveLength(0);
  });

  // R10: Dynamic segments handled correctly in comparison
  it('R10: dynamic segments handled correctly', () => {
    // Dynamic segments should already be excluded by normalizeAppRoute
    // reconcileRoutes just compares the arrays it's given
    const docRoutes = ['/contacts'];
    const fsRoutes = ['/contacts'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.matchedRoutes).toContain('/contacts');
  });

  // R11: Deduplicates routes before comparing
  it('R11: deduplicates routes before comparing', () => {
    const docRoutes = ['/dashboard', '/dashboard', '/leads'];
    const fsRoutes = ['/dashboard', '/leads', '/leads'];
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.matchedRoutes).toHaveLength(2);
    expect(result.docOnlyRoutes).toHaveLength(0);
    expect(result.fsOnlyRoutes).toHaveLength(0);
  });

  // R12: Does not flag [id] sub-routes as fsOnly when parent declared
  it('R12: does not flag dynamic sub-routes when parent declared', () => {
    // normalizeAppRoute returns null for [id] routes, so they're excluded
    // from fsRoutes before reconciliation
    const docRoutes = ['/contacts'];
    const fsRoutes = ['/contacts']; // [id] was already filtered out
    const result = reconcileRoutes(docRoutes, fsRoutes);
    expect(result.fsOnlyRoutes).toHaveLength(0);
  });

  // R13: Produces FAIL when doc declares fewer than minimum expected routes
  it('R13: produces FAIL when doc has zero routes', () => {
    const result = reconcileRoutes([], []);
    const g1 = result.gates.find((g) => g.name === 'PARSE_OK');
    expect(g1).toBeDefined();
    expect(g1!.severity).toBe('FAIL');
  });
});

// ============================================================================
// runReconciliation — 5 cases (RN01–RN05)
// ============================================================================

describe('runReconciliation', () => {
  // RN01: Calls exitFn(0) when all routes match
  it('RN01: calls exitFn(0) when all routes match', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    runReconciliation({
      conformancePath: resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md'),
      appDir: resolve(__dirname, '../../apps/web/src/app'),
      printSummary: false,
      exitFn,
    });
    expect(exitFn).toHaveBeenCalledWith(0);
  });

  // RN02: Calls exitFn(1) when docOnlyRoutes non-empty
  it('RN02: calls exitFn(1) when docOnlyRoutes non-empty', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    // Create a temp conformance file with a fake route
    const fakeContent = `
## 2. Scope

Routes: \`/dashboard\`, \`/nonexistent-route-xyz\`
`;
    // Use vi.mock or create temp file approach
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync, writeFileSync } = require('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require('node:os');
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'a11y-test-'));
    const tmpFile = resolve(tmpDir, 'conformance.md');
    writeFileSync(tmpFile, fakeContent);

    runReconciliation({
      conformancePath: tmpFile,
      appDir: resolve(__dirname, '../../apps/web/src/app'),
      printSummary: false,
      exitFn,
    });
    expect(exitFn).toHaveBeenCalledWith(1);
  });

  // RN03: Does not throw when printSummary is false
  it('RN03: does not throw when printSummary is false', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    expect(() => {
      runReconciliation({
        conformancePath: resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md'),
        appDir: resolve(__dirname, '../../apps/web/src/app'),
        printSummary: false,
        exitFn,
      });
    }).not.toThrow();
  });

  // RN04: Reads conformancePath from options
  it('RN04: reads conformancePath from options', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    const customPath = resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md');
    runReconciliation({
      conformancePath: customPath,
      appDir: resolve(__dirname, '../../apps/web/src/app'),
      printSummary: false,
      exitFn,
    });
    // If it didn't throw, it read the custom path successfully
    expect(exitFn).toHaveBeenCalled();
  });

  // RN05: Reads appDir from options
  it('RN05: reads appDir from options', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    const customAppDir = resolve(__dirname, '../../apps/web/src/app');
    runReconciliation({
      conformancePath: resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md'),
      appDir: customAppDir,
      printSummary: false,
      exitFn,
    });
    expect(exitFn).toHaveBeenCalled();
  });

  // Error path: non-existent conformancePath exits 1
  it('exits 1 when conformancePath does not exist', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    runReconciliation({
      conformancePath: '/nonexistent/path/conformance.md',
      appDir: resolve(__dirname, '../../apps/web/src/app'),
      printSummary: false,
      exitFn,
    });
    expect(exitFn).toHaveBeenCalledWith(1);
  });

  // Error path: non-existent appDir exits 1
  it('exits 1 when appDir does not exist', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    runReconciliation({
      conformancePath: resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md'),
      appDir: '/nonexistent/app/dir',
      printSummary: false,
      exitFn,
    });
    expect(exitFn).toHaveBeenCalledWith(1);
  });

  // Coverage path: printSummary true exercises logging code paths
  it('runs with printSummary enabled without error', () => {
    const exitFn = vi.fn() as any; // mock for process.exit — (code: number) => never
    expect(() => {
      runReconciliation({
        conformancePath: resolve(__dirname, '../../docs/compliance/wcag-conformance-statement.md'),
        appDir: resolve(__dirname, '../../apps/web/src/app'),
        printSummary: true,
        exitFn,
      });
    }).not.toThrow();
    expect(exitFn).toHaveBeenCalledWith(0);
  });
});
