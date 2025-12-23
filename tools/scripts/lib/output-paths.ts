/**
 * Centralized Output Path Management
 *
 * Provides canonical paths for all artifact outputs.
 * Supports environment variable overrides for CI/CD.
 * Ensures compliance with IFC-160 artifact conventions.
 *
 * @module tools/scripts/lib/output-paths
 */

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Base artifacts directory (overridable via ARTIFACTS_DIR env var)
 */
export const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';

/**
 * Current run ID (overridable via RUN_ID env var)
 * Format: YYYYMMDD-HHMMSS-UUID or CI-specific format
 */
export const RUN_ID = process.env.RUN_ID || generateRunId();

/**
 * Execution environment (CI, local, test)
 */
export const ENV = process.env.CI ? 'ci' : process.env.NODE_ENV || 'local';

// ============================================================================
// Run ID Generation
// ============================================================================

/**
 * Generate a unique run ID for the current execution.
 *
 * - In CI: Uses run number + commit SHA
 * - Locally: Uses ISO timestamp + process PID
 *
 * @returns Unique run identifier
 */
function generateRunId(): string {
  if (process.env.CI) {
    // In CI: use run number + sha
    const runNumber = process.env.GITHUB_RUN_NUMBER || process.env.CI_PIPELINE_ID || Date.now();
    const sha = (process.env.GITHUB_SHA || randomUUID()).slice(0, 8);
    return `${runNumber}-${sha}`;
  }

  // Local: timestamp + pid for uniqueness
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .slice(0, 15); // YYYYMMDDTHHmmss

  return `${timestamp}-${process.pid}`;
}

// ============================================================================
// Repo Root Detection
// ============================================================================

let cachedRepoRoot: string | undefined;

/**
 * Get repository root directory.
 * Walks up from cwd until package.json is found.
 *
 * @returns Absolute path to repo root
 * @throws Error if repo root cannot be determined
 */
export function getRepoRoot(): string {
  if (cachedRepoRoot) {
    return cachedRepoRoot;
  }

  let current = process.cwd();
  const root = process.platform === 'win32' ? current.split('\\')[0] + '\\' : '/';

  while (current !== root) {
    const pkgPath = join(current, 'package.json');
    if (existsSync(pkgPath)) {
      cachedRepoRoot = current;
      return current;
    }
    current = join(current, '..');
  }

  throw new Error('Could not find repo root (package.json not found in any parent directory)');
}

// ============================================================================
// Canonical Path Builders
// ============================================================================

/**
 * Build path under artifacts/reports/{tool}/{runId}/
 *
 * Creates directory structure if it doesn't exist.
 *
 * @param tool - Tool name (e.g., 'sonarqube', 'security', 'system-audit')
 * @param filename - Optional filename to append
 * @returns Absolute path to report directory or file
 *
 * @example
 * ```typescript
 * const reportDir = getReportPath('sonarqube');
 * // => /repo/artifacts/reports/sonarqube/20251221-143022-8a4f/
 *
 * const reportFile = getReportPath('sonarqube', 'analysis.json');
 * // => /repo/artifacts/reports/sonarqube/20251221-143022-8a4f/analysis.json
 * ```
 */
export function getReportPath(tool: string, filename?: string): string {
  const base = join(getRepoRoot(), ARTIFACTS_DIR, 'reports', tool, RUN_ID);
  mkdirSync(base, { recursive: true });
  return filename ? join(base, filename) : base;
}

/**
 * Build path under artifacts/benchmarks/
 *
 * @param filename - Benchmark filename
 * @returns Absolute path to benchmark file
 *
 * @example
 * ```typescript
 * const benchPath = getBenchmarkPath('baseline.json');
 * // => /repo/artifacts/benchmarks/baseline.json
 * ```
 */
export function getBenchmarkPath(filename: string): string {
  const base = join(getRepoRoot(), ARTIFACTS_DIR, 'benchmarks');
  mkdirSync(base, { recursive: true });
  return join(base, filename);
}

/**
 * Build path under artifacts/coverage/
 *
 * @param filename - Optional coverage filename
 * @returns Absolute path to coverage directory or file
 *
 * @example
 * ```typescript
 * const coverageDir = getCoveragePath();
 * // => /repo/artifacts/coverage/
 *
 * const lcovFile = getCoveragePath('lcov.info');
 * // => /repo/artifacts/coverage/lcov.info
 * ```
 */
export function getCoveragePath(filename?: string): string {
  const base = join(getRepoRoot(), ARTIFACTS_DIR, 'coverage');
  mkdirSync(base, { recursive: true });
  return filename ? join(base, filename) : base;
}

/**
 * Build path under artifacts/logs/{category}/
 *
 * @param category - Log category (e.g., 'execution', 'validation', 'swarm')
 * @param filename - Log filename
 * @returns Absolute path to log file
 *
 * @example
 * ```typescript
 * const execLog = getLogPath('execution', 'run.log');
 * // => /repo/artifacts/logs/execution/run.log
 * ```
 */
export function getLogPath(category: string, filename: string): string {
  const base = join(getRepoRoot(), ARTIFACTS_DIR, 'logs', category);
  mkdirSync(base, { recursive: true });
  return join(base, filename);
}

/**
 * Build path under artifacts/reports/system-audit/{runId}/
 * Used for STOA evidence bundles.
 *
 * @param filename - Optional evidence filename
 * @returns Absolute path to STOA evidence directory or file
 *
 * @example
 * ```typescript
 * const evidenceDir = getStoaEvidencePath();
 * // => /repo/artifacts/reports/system-audit/20251221-143022-8a4f/
 *
 * const summaryFile = getStoaEvidencePath('summary.json');
 * // => /repo/artifacts/reports/system-audit/20251221-143022-8a4f/summary.json
 * ```
 */
export function getStoaEvidencePath(filename?: string): string {
  const base = join(getRepoRoot(), ARTIFACTS_DIR, 'reports', 'system-audit', RUN_ID);
  mkdirSync(base, { recursive: true });
  return filename ? join(base, filename) : base;
}

/**
 * Get path to 'latest' symlink for a report type.
 *
 * @param tool - Tool name
 * @returns Absolute path to latest symlink
 *
 * @example
 * ```typescript
 * const latestLink = getLatestSymlink('sonarqube');
 * // => /repo/artifacts/reports/sonarqube/latest
 * ```
 */
export function getLatestSymlink(tool: string): string {
  return join(getRepoRoot(), ARTIFACTS_DIR, 'reports', tool, 'latest');
}

// ============================================================================
// Windows Compatibility
// ============================================================================

/**
 * Normalize path separators for cross-platform consistency.
 * Converts backslashes to forward slashes.
 *
 * @param path - Path to normalize
 * @returns Normalized path with forward slashes
 *
 * @example
 * ```typescript
 * normalizePath('C:\\repo\\artifacts\\reports');
 * // => 'C:/repo/artifacts/reports'
 * ```
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Create a 'latest' symlink to the current run directory.
 * On Windows, uses junction points (no admin required).
 * Falls back to copying if symlinks fail.
 *
 * @param source - Source directory (absolute path)
 * @param linkPath - Symlink path (absolute path)
 *
 * @example
 * ```typescript
 * await createLatestLink(
 *   getReportPath('sonarqube'),
 *   getLatestSymlink('sonarqube')
 * );
 * ```
 */
export async function createLatestLink(source: string, linkPath: string): Promise<void> {
  const { symlink, copyFile, unlink } = await import('node:fs/promises');

  try {
    // Remove existing link/file
    await unlink(linkPath).catch(() => {
      /* ignore if doesn't exist */
    });

    if (process.platform === 'win32') {
      // Windows: try junction, fall back to marker file
      try {
        await symlink(source, linkPath, 'junction');
      } catch {
        // If junction fails, create a marker file with the target path
        const markerPath = linkPath + '.txt';
        await copyFile(source, markerPath).catch(() => {
          /* best effort */
        });
      }
    } else {
      // Unix: use standard symlink
      await symlink(source, linkPath);
    }
  } catch (err) {
    console.warn(`Warning: Could not create latest link: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// Usage Documentation
// ============================================================================

/**
 * USAGE EXAMPLES:
 *
 * ## SonarQube Reports
 * ```typescript
 * import { getReportPath, createLatestLink, getLatestSymlink } from './output-paths.js';
 *
 * const reportDir = getReportPath('sonarqube');
 * const analysisFile = getReportPath('sonarqube', 'analysis.json');
 *
 * fs.writeFileSync(analysisFile, JSON.stringify(data));
 *
 * // Create latest symlink
 * await createLatestLink(reportDir, getLatestSymlink('sonarqube'));
 * ```
 *
 * ## Security Reports (GitLeaks)
 * ```typescript
 * const gitleaksFile = getReportPath('security', 'gitleaks-report.json');
 * // => artifacts/reports/security/20251221-143022-8a4f/gitleaks-report.json
 * ```
 *
 * ## Performance Benchmarks
 * ```typescript
 * const benchFile = getBenchmarkPath('baseline.json');
 * // => artifacts/benchmarks/baseline.json
 * ```
 *
 * ## STOA Evidence
 * ```typescript
 * const evidenceFile = getStoaEvidencePath('summary.json');
 * // => artifacts/reports/system-audit/20251221-143022-8a4f/summary.json
 * ```
 *
 * ## Environment Variable Overrides
 * ```bash
 * # Custom artifacts directory
 * ARTIFACTS_DIR=build/artifacts node script.js
 *
 * # Custom run ID (useful in CI)
 * RUN_ID=ci-1234-abc123 node script.js
 * ```
 */
