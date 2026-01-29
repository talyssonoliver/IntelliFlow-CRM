/**
 * Code Review Output Path Management
 *
 * Provides canonical paths for code review artifacts using sprint-based structure.
 * Aligns with STOA evidence paths from tools/scripts/lib/stoa/evidence.ts
 *
 * @module tools/scripts/lib/code-review/paths
 */

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ============================================================================
// Run ID Generation
// ============================================================================

/**
 * Generate a unique run ID for code review reports.
 * Format: YYYYMMDD-HHMMSS-UUID (same as STOA evidence)
 */
export function generateCodeReviewRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const uuid = randomUUID().slice(0, 8);

  return `${date}-${time}-${uuid}`;
}

// ============================================================================
// Sprint-Based Code Review Paths
// ============================================================================

/**
 * Get the code review reports directory path.
 *
 * Uses canonical sprint-based structure:
 * .specify/sprints/sprint-{N}/reports/code-review/{runId}/
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number (0-based)
 * @param runId - Unique run identifier
 * @returns Absolute path to code review run directory
 *
 * @example
 * ```typescript
 * const reportDir = getCodeReviewDir(repoRoot, 0, '20260125-143022-abc123');
 * // => /repo/.specify/sprints/sprint-0/reports/code-review/20260125-143022-abc123/
 * ```
 */
export function getCodeReviewDir(
  repoRoot: string,
  sprintNumber: number,
  runId: string
): string {
  return join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'reports',
    'code-review',
    runId
  );
}

/**
 * Get the package review directory path.
 *
 * Uses sprint-based structure:
 * .specify/sprints/sprint-{N}/reports/code-review/package-review/
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number (0-based)
 * @returns Absolute path to package review directory
 *
 * @example
 * ```typescript
 * const pkgDir = getPackageReviewDir(repoRoot, 0);
 * // => /repo/.specify/sprints/sprint-0/reports/code-review/package-review/
 * ```
 */
export function getPackageReviewDir(repoRoot: string, sprintNumber: number): string {
  return join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'reports',
    'code-review',
    'package-review'
  );
}

/**
 * Get the code review base directory for a sprint (without runId).
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number (0-based)
 * @returns Absolute path to code review base directory
 */
export function getCodeReviewBaseDir(repoRoot: string, sprintNumber: number): string {
  return join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'reports', 'code-review');
}

// ============================================================================
// STOA Gate Linkage Paths
// ============================================================================

/**
 * Get the STOA gates directory for linking code review output.
 *
 * Uses MATOP execution structure:
 * .specify/sprints/sprint-{N}/execution/{taskId}/{runId}/matop/gates/
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number
 * @param taskId - Task ID (e.g., "IFC-001")
 * @param runId - Unique run identifier
 * @returns Absolute path to STOA gates directory
 *
 * @example
 * ```typescript
 * const gatesDir = getGatesLinkageDir(repoRoot, 0, 'IFC-001', '20260125-143022-abc123');
 * // => /repo/.specify/sprints/sprint-0/execution/IFC-001/20260125-143022-abc123/matop/gates/
 * ```
 */
export function getGatesLinkageDir(
  repoRoot: string,
  sprintNumber: number,
  taskId: string,
  runId: string
): string {
  return join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'execution',
    taskId,
    runId,
    'matop',
    'gates'
  );
}

// ============================================================================
// Directory Creation
// ============================================================================

/**
 * Ensure code review directories exist.
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number
 * @param runId - Unique run identifier
 */
export async function ensureCodeReviewDirs(
  repoRoot: string,
  sprintNumber: number,
  runId: string
): Promise<void> {
  const codeReviewDir = getCodeReviewDir(repoRoot, sprintNumber, runId);
  await mkdir(codeReviewDir, { recursive: true });
}

/**
 * Ensure package review directory exists.
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number
 */
export async function ensurePackageReviewDir(
  repoRoot: string,
  sprintNumber: number
): Promise<void> {
  const pkgDir = getPackageReviewDir(repoRoot, sprintNumber);
  await mkdir(pkgDir, { recursive: true });
}

/**
 * Ensure STOA gates linkage directory exists.
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number
 * @param taskId - Task ID
 * @param runId - Unique run identifier
 */
export async function ensureGatesLinkageDir(
  repoRoot: string,
  sprintNumber: number,
  taskId: string,
  runId: string
): Promise<void> {
  const gatesDir = getGatesLinkageDir(repoRoot, sprintNumber, taskId, runId);
  await mkdir(gatesDir, { recursive: true });
}

/**
 * Synchronously ensure code review directory exists.
 */
export function ensureCodeReviewDirSync(
  repoRoot: string,
  sprintNumber: number,
  runId: string
): string {
  const codeReviewDir = getCodeReviewDir(repoRoot, sprintNumber, runId);
  mkdirSync(codeReviewDir, { recursive: true });
  return codeReviewDir;
}

// ============================================================================
// Legacy Path Support (Deprecated)
// ============================================================================

/**
 * @deprecated Use getCodeReviewDir with sprint-based paths
 * Legacy function for backwards compatibility during migration.
 *
 * @param repoRoot - Repository root path
 * @param timestamp - Timestamp string (e.g., "20260125-143022")
 * @returns Legacy path: artifacts/reports/code-review-{timestamp}/
 */
export function getLegacyCodeReviewDir(repoRoot: string, timestamp: string): string {
  console.warn(
    'DEPRECATED: getLegacyCodeReviewDir uses old path structure. ' +
      'Use getCodeReviewDir(repoRoot, sprintNumber, runId) instead.'
  );
  return join(repoRoot, 'artifacts', 'reports', `code-review-${timestamp}`);
}

/**
 * @deprecated Use getPackageReviewDir with sprint-based paths
 * Legacy function for backwards compatibility during migration.
 *
 * @param repoRoot - Repository root path
 * @returns Legacy path: artifacts/reports/package-review/
 */
export function getLegacyPackageReviewDir(repoRoot: string): string {
  console.warn(
    'DEPRECATED: getLegacyPackageReviewDir uses old path structure. ' +
      'Use getPackageReviewDir(repoRoot, sprintNumber) instead.'
  );
  return join(repoRoot, 'artifacts', 'reports', 'package-review');
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Normalize path separators for cross-platform consistency.
 *
 * @param path - Path to normalize
 * @returns Path with forward slashes
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Check if a code review directory exists for a given run.
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number
 * @param runId - Run identifier
 * @returns True if directory exists
 */
export function codeReviewDirExists(
  repoRoot: string,
  sprintNumber: number,
  runId: string
): boolean {
  return existsSync(getCodeReviewDir(repoRoot, sprintNumber, runId));
}

// ============================================================================
// Report File Paths
// ============================================================================

/**
 * Standard report filenames used by code-review-analysis.ps1
 */
export const CODE_REVIEW_FILES = {
  typecheck: 'typecheck.txt',
  lint: 'lint.txt',
  lintDetails: 'lint-details.json',
  unusedExports: 'unused-exports.txt',
  unusedDependencies: 'unused-dependencies.txt',
  circular: 'circular-dependencies.txt',
  complexity: 'complexity.json',
  duplication: 'duplication.json',
  coverage: 'coverage-summary.txt',
  bundleSize: 'bundle-size.json',
  securityAudit: 'security-audit.txt',
  architectureCheck: 'architecture-check.txt',
  summary: 'summary.json',
} as const;

/**
 * Get path to a specific report file within a code review run.
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number
 * @param runId - Run identifier
 * @param filename - Report filename from CODE_REVIEW_FILES
 * @returns Absolute path to report file
 */
export function getReportFilePath(
  repoRoot: string,
  sprintNumber: number,
  runId: string,
  filename: keyof typeof CODE_REVIEW_FILES | string
): string {
  const file = typeof filename === 'string' && filename in CODE_REVIEW_FILES
    ? CODE_REVIEW_FILES[filename as keyof typeof CODE_REVIEW_FILES]
    : filename;
  return join(getCodeReviewDir(repoRoot, sprintNumber, runId), file);
}

// ============================================================================
// Usage Documentation
// ============================================================================

/**
 * USAGE EXAMPLES:
 *
 * ## Running Code Review Analysis
 * ```powershell
 * # Sprint-based output (new)
 * pwsh scripts/code-review-analysis.ps1 -Sprint 0 -Quick
 *
 * # With STOA gate linkage
 * pwsh scripts/code-review-analysis.ps1 -Sprint 0 -TaskId "IFC-001" -LinkToGates
 * ```
 *
 * ## Running Package Prioritization
 * ```bash
 * node scripts/prioritize-reviews.js --sprint=0
 * ```
 *
 * ## Path Functions
 * ```typescript
 * import {
 *   getCodeReviewDir,
 *   getPackageReviewDir,
 *   getGatesLinkageDir,
 *   ensureCodeReviewDirs,
 * } from './paths.js';
 *
 * const repoRoot = process.cwd();
 * const sprint = 0;
 * const runId = generateCodeReviewRunId();
 *
 * // Get report directory
 * const reportDir = getCodeReviewDir(repoRoot, sprint, runId);
 * // => /repo/.specify/sprints/sprint-0/reports/code-review/20260125-143022-abc123/
 *
 * // Get package review directory
 * const pkgDir = getPackageReviewDir(repoRoot, sprint);
 * // => /repo/.specify/sprints/sprint-0/reports/code-review/package-review/
 *
 * // Link to STOA gates (for gate-runner integration)
 * const gatesDir = getGatesLinkageDir(repoRoot, sprint, 'IFC-001', runId);
 * // => /repo/.specify/sprints/sprint-0/execution/IFC-001/20260125-143022-abc123/matop/gates/
 *
 * // Ensure directories exist
 * await ensureCodeReviewDirs(repoRoot, sprint, runId);
 * ```
 */
