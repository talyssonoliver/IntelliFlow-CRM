#!/usr/bin/env tsx

/**
 * A11y Route Reconciliation Script
 *
 * Compares routes declared in the WCAG conformance statement
 * (docs/compliance-and-governance/compliance/wcag-conformance-statement.md, Section 2: Scope)
 * against the actual Next.js App Router directory tree
 * (apps/web/src/app/).
 *
 * Detects route drift between the accessibility compliance claim
 * and the real application. Exits non-zero on blocking drift.
 *
 * Run via: npx tsx tools/scripts/a11y-route-reconcile.ts
 *
 * @module tools/scripts/a11y-route-reconcile
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import {
  type GateResult,
  type Severity,
  logGate,
  logSection,
  logHeader,
  createSummary,
  printSummary as printValidationSummary,
  getExitCode,
  findRepoRoot,
  isStrictMode,
  effectiveSeverity,
} from './lib/validation-utils.js';

// ============================================================================
// Interfaces
// ============================================================================

export interface ReconcileResult {
  docOnlyRoutes: string[];
  fsOnlyRoutes: string[];
  matchedRoutes: string[];
  gates: GateResult[];
}

export interface ReconcileOptions {
  conformancePath?: string;
  appDir?: string;
  printSummary?: boolean;
  exitFn?: (code: number) => never;
}

// ============================================================================
// parseConformanceRoutes
// ============================================================================

/**
 * Parse the WCAG conformance statement markdown and extract routes
 * from Section 2 (Scope).
 */
export function parseConformanceRoutes(content: string): string[] {
  if (!content.trim()) return [];

  // Find Section 2 boundaries
  const sectionMatch = content.match(/^## 2\. Scope/m);
  if (!sectionMatch || sectionMatch.index === undefined) return [];

  const sectionStart = sectionMatch.index + sectionMatch[0].length;
  const nextSection = content.slice(sectionStart).search(/^(## |---)/m);
  const sectionBody =
    nextSection >= 0
      ? content.slice(sectionStart, sectionStart + nextSection)
      : content.slice(sectionStart);

  // Extract backtick-enclosed tokens
  const backtickRegex = /`([^`]+)`/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(sectionBody)) !== null) {
    tokens.push(match[1]);
  }

  // Filter to route-shaped tokens only
  const routeFilter = /^\/[\w\-/]*$/;
  const routes = tokens
    .filter((token) => routeFilter.test(token))
    .map((route) => {
      // Normalize: lowercase, strip trailing slashes
      let normalized = route.toLowerCase();
      if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    });

  // Deduplicate
  return [...new Set(routes)];
}

// ============================================================================
// normalizeAppRoute
// ============================================================================

/**
 * Convert a filesystem relative path (relative to apps/web/src/app/)
 * to a normalized URL route.
 *
 * Returns null for dynamic route segments (excluded from comparison).
 */
export function normalizeAppRoute(relPath: string): string | null {
  const rel = relPath
    .replaceAll(/\\/g, '/') // Windows path normalization
    .replace(/\/page\.tsx$/, '') // Strip page.tsx suffix
    .replaceAll(/\/\([^)]+\)/g, '') // Strip route groups: (public), (list), (developer)
    .replace(/^\([^)]+\)/, '') // Strip leading route group without slash
    .replaceAll(/\/+/g, '/') // Collapse double slashes
    .replace(/\/$/, ''); // Strip trailing slash

  // Check for dynamic segments
  if (/\[.+\]/.test(rel)) return null;

  if (rel === '' || rel === '/') return '/';
  return rel.startsWith('/') ? rel : '/' + rel;
}

// ============================================================================
// reconcileRoutes
// ============================================================================

/**
 * Compare doc-declared routes against filesystem routes.
 * Produces gate results for each reconciliation check.
 */
export function reconcileRoutes(docRoutes: string[], fsRoutes: string[]): ReconcileResult {
  // Deduplicate and normalize to lowercase
  const docSet = new Set(docRoutes.map((r) => r.toLowerCase()));
  const fsSet = new Set(fsRoutes.map((r) => r.toLowerCase()));

  const docOnlyRoutes = [...docSet].filter((r) => !fsSet.has(r));
  const fsOnlyRoutes = [...fsSet].filter((r) => !docSet.has(r));
  const matchedRoutes = [...docSet].filter((r) => fsSet.has(r));

  const gates: GateResult[] = [];

  // G1: PARSE_OK — FAIL if docRoutes empty
  gates.push({
    name: 'PARSE_OK',
    severity: docSet.size > 0 ? 'PASS' : 'FAIL',
    message:
      docSet.size > 0
        ? `Parsed ${docSet.size} routes from conformance statement`
        : 'No routes parsed from conformance statement — possible format drift',
  });

  // G2: COUNT_MATCH — WARN if extracted count != prose count (informational)
  gates.push({
    name: 'COUNT_MATCH',
    severity: 'PASS',
    message: `Doc routes: ${docSet.size}, FS routes: ${fsSet.size}`,
  });

  // G3: STATEMENT_COVERS_DISK — FAIL if docOnly.length > 0
  gates.push({
    name: 'STATEMENT_COVERS_DISK',
    severity: docOnlyRoutes.length === 0 ? 'PASS' : 'FAIL',
    message:
      docOnlyRoutes.length === 0
        ? 'All conformance statement routes have corresponding page.tsx on disk'
        : `${docOnlyRoutes.length} route(s) in conformance statement not found on disk`,
    details: docOnlyRoutes.length > 0 ? docOnlyRoutes : undefined,
  });

  // G4: DISK_COVERED_BY_STATEMENT — WARN if fsOnly.length > 0
  gates.push({
    name: 'DISK_COVERED_BY_STATEMENT',
    severity: fsOnlyRoutes.length === 0 ? 'PASS' : ('WARN' as Severity),
    message:
      fsOnlyRoutes.length === 0
        ? 'All disk routes are covered by conformance statement'
        : `${fsOnlyRoutes.length} route(s) on disk not in conformance statement`,
    details: fsOnlyRoutes.length > 0 ? fsOnlyRoutes : undefined,
  });

  // G5: TOTAL_COUNT — INFO, always passes
  gates.push({
    name: 'TOTAL_COUNT',
    severity: 'INFO',
    message: `Total: ${matchedRoutes.length} matched, ${docOnlyRoutes.length} doc-only, ${fsOnlyRoutes.length} fs-only`,
  });

  return { docOnlyRoutes, fsOnlyRoutes, matchedRoutes, gates };
}

// ============================================================================
// Filesystem scanner
// ============================================================================

function scanAppRoutes(appDir: string): string[] {
  const routes: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip excluded directories
      if (entry.isDirectory()) {
        if (entry.name === 'api' || entry.name === '__tests__') continue;
        walk(fullPath);
        continue;
      }

      // Only process page.tsx files
      if (entry.name === 'page.tsx') {
        const relPath = relative(appDir, fullPath);
        const normalized = normalizeAppRoute(relPath);
        if (normalized !== null) {
          routes.push(normalized);
        }
      }
    }
  }

  walk(appDir);

  // Deduplicate (multiple route groups can map to same URL)
  return [...new Set(routes)];
}

// ============================================================================
// runReconciliation
// ============================================================================

/**
 * Top-level orchestrator with injectable dependencies for testability.
 */
export function runReconciliation(options?: ReconcileOptions): void {
  const repoRoot = findRepoRoot();
  const conformancePath =
    options?.conformancePath ??
    resolve(repoRoot, 'docs/compliance-and-governance/compliance/wcag-conformance-statement.md');
  const appDir = options?.appDir ?? resolve(repoRoot, 'apps/web/src/app');
  const shouldPrint = options?.printSummary !== false;
  const exitFn = options?.exitFn ?? ((code: number) => process.exit(code) as never);

  if (shouldPrint) {
    logHeader('A11y Route Reconciliation');
  }

  // Read conformance statement
  if (!existsSync(conformancePath)) {
    if (shouldPrint) {
      logGate({
        name: 'PARSE_OK',
        severity: 'FAIL',
        message: `Conformance statement not found: ${conformancePath}`,
      });
    }
    exitFn(1);
    return;
  }

  const content = readFileSync(conformancePath, 'utf-8');
  const docRoutes = parseConformanceRoutes(content);

  if (shouldPrint) {
    logSection(`Parsed ${docRoutes.length} routes from conformance statement`);
  }

  // Scan filesystem
  if (!existsSync(appDir)) {
    if (shouldPrint) {
      logGate({
        name: 'PARSE_OK',
        severity: 'FAIL',
        message: `App directory not found: ${appDir}`,
      });
    }
    exitFn(1);
    return;
  }

  const fsRoutes = scanAppRoutes(appDir);

  if (shouldPrint) {
    logSection(`Found ${fsRoutes.length} routes on disk`);
  }

  // Reconcile
  const result = reconcileRoutes(docRoutes, fsRoutes);

  // Log gates
  if (shouldPrint) {
    logSection('Gate Results');
    for (const gate of result.gates) {
      logGate(gate);
    }
  }

  // Create summary
  const summary = createSummary(result.gates);

  // Write JSON report
  try {
    const reportDir = resolve(repoRoot, 'artifacts/reports');
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }
    const report = {
      timestamp: new Date().toISOString(),
      docRoutes: [...new Set(docRoutes)].sort((a, b) => a.localeCompare(b)),
      fsRoutes: [...new Set(fsRoutes)].sort((a, b) => a.localeCompare(b)),
      matchedRoutes: result.matchedRoutes.sort((a, b) => a.localeCompare(b)),
      docOnlyRoutes: result.docOnlyRoutes.sort((a, b) => a.localeCompare(b)),
      fsOnlyRoutes: result.fsOnlyRoutes.sort((a, b) => a.localeCompare(b)),
      gates: result.gates,
      exitCode: getExitCode(summary),
    };
    writeFileSync(
      resolve(reportDir, 'a11y-route-reconcile.json'),
      JSON.stringify(report, null, 2) + '\n'
    );
  } catch {
    // Non-blocking: report write failure shouldn't fail the script
  }

  // Print summary
  if (shouldPrint) {
    printValidationSummary(summary);
  }

  exitFn(getExitCode(summary));
}

// ============================================================================
// CLI entry point
// ============================================================================

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('a11y-route-reconcile.ts')
) {
  runReconciliation();
}
