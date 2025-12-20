/**
 * Shared Validation Utilities for IntelliFlow CRM
 *
 * Provides:
 * - Strict mode handling (--strict flag, VALIDATION_STRICT env)
 * - Consistent logging with severity levels
 * - CSV parsing and path resolution
 * - Git-based hygiene checks
 * - Cross-platform shell execution
 *
 * @module tools/scripts/lib/validation-utils
 */

import { existsSync, readFileSync } from 'node:fs';
import * as childProcess from 'node:child_process';
import type { ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { resolve, join } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type Severity = 'PASS' | 'WARN' | 'FAIL' | 'INFO' | 'SKIP';

export interface GateResult {
  name: string;
  severity: Severity;
  message: string;
  details?: string[];
}

export interface ValidationSummary {
  gates: GateResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
  skipCount: number;
}

export interface SprintTask {
  'Task ID': string;
  Status: string;
  Description: string;
  'Target Sprint': string;
  Section?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// ANSI Colors
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const useColors =
  process.stdout.isTTY &&
  process.env.NO_COLOR === undefined &&
  process.env.FORCE_COLOR !== '0' &&
  process.env.TERM !== 'dumb';

function colorize(text: string, color: keyof typeof COLORS): string {
  if (!useColors) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// ============================================================================
// Strict Mode
// ============================================================================

/**
 * Determine if strict mode is enabled via CLI flag or environment variable.
 */
export function isStrictMode(): boolean {
  const args = process.argv.slice(2);
  const hasFlag = args.includes('--strict') || args.includes('-s');
  const hasEnv = process.env.VALIDATION_STRICT === '1' || process.env.VALIDATION_STRICT === 'true';
  return hasFlag || hasEnv;
}

/**
 * In strict mode, WARN becomes FAIL. Otherwise, WARN stays WARN.
 */
export function effectiveSeverity(severity: Severity): Severity {
  if (severity === 'WARN' && isStrictMode()) {
    return 'FAIL';
  }
  return severity;
}

// ============================================================================
// Logging
// ============================================================================

const SEVERITY_TOKENS: Record<Severity, string> = {
  PASS: '[PASS]',
  WARN: '[WARN]',
  FAIL: '[FAIL]',
  INFO: '[INFO]',
  SKIP: '[SKIP]',
};

const SEVERITY_COLORS: Record<Severity, keyof typeof COLORS> = {
  PASS: 'green',
  WARN: 'yellow',
  FAIL: 'red',
  INFO: 'blue',
  SKIP: 'gray',
};

export function log(message: string, color: keyof typeof COLORS = 'reset'): void {
  console.log(colorize(message, color));
}

export function logGate(result: GateResult): void {
  const effective = effectiveSeverity(result.severity);
  const token = SEVERITY_TOKENS[effective];
  const color = SEVERITY_COLORS[effective];
  log(`${token} ${result.name}: ${result.message}`, color);

  if (result.details && result.details.length > 0) {
    for (const detail of result.details.slice(0, 10)) {
      log(`       ${detail}`, 'gray');
    }
    if (result.details.length > 10) {
      log(`       ... and ${result.details.length - 10} more`, 'gray');
    }
  }
}

export function logSection(title: string): void {
  log(`\n${colorize(title, 'cyan')}`);
}

export function logHeader(title: string): void {
  const line = '='.repeat(70);
  log(colorize(line, 'bold'));
  log(colorize(title, 'bold'));
  log(colorize(line, 'bold'));
}

// ============================================================================
// Shell / Git helpers
// ============================================================================

function splitLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatExecError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const maybe = error as Error & {
    status?: number;
    stderr?: Buffer | string;
  };

  const status = typeof maybe.status === 'number' ? `exit ${maybe.status}` : null;
  const stderr =
    typeof maybe.stderr === 'string'
      ? maybe.stderr.trim()
      : Buffer.isBuffer(maybe.stderr)
        ? maybe.stderr.toString('utf-8').trim()
        : null;

  return [maybe.message, status, stderr].filter(Boolean).join(' | ');
}

export type ExecSyncFn = (command: string, options: ExecSyncOptionsWithStringEncoding) => string;

function execCommand(
  repoRoot: string,
  cmd: string,
  execSyncFn: ExecSyncFn = childProcess.execSync as ExecSyncFn
): { stdout: string; error?: string } {
  try {
    const stdout = execSyncFn(cmd, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim() };
  } catch (error) {
    return { stdout: '', error: formatExecError(error) };
  }
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').trim();
}

export function listGitTrackedFiles(repoRoot: string): { files: string[]; error?: string } {
  const result = execCommand(repoRoot, 'git ls-files');
  if (result.error) return { files: [], error: result.error };
  return { files: splitLines(result.stdout).map(normalizeRepoPath) };
}

export function listGitTrackedFilesInPath(
  repoRoot: string,
  searchPath: string,
  execSyncFn?: ExecSyncFn
): { files: string[]; error?: string } {
  const result = execCommand(repoRoot, `git ls-files "${searchPath}"`, execSyncFn);
  if (result.error) return { files: [], error: result.error };
  if (!result.stdout) return { files: [] };
  return { files: splitLines(result.stdout).map(normalizeRepoPath) };
}

export function listGitIgnoredFiles(
  repoRoot: string,
  searchPath: string,
  execSyncFn?: ExecSyncFn
): { files: string[]; error?: string } {
  const result = execCommand(
    repoRoot,
    `git ls-files -o -i --exclude-standard "${searchPath}"`,
    execSyncFn
  );
  if (result.error) return { files: [], error: result.error };
  if (!result.stdout) return { files: [] };
  return { files: splitLines(result.stdout).map(normalizeRepoPath) };
}

export function listGitUntrackedFiles(
  repoRoot: string,
  searchPath: string,
  execSyncFn?: ExecSyncFn
): { files: string[]; error?: string } {
  const result = execCommand(
    repoRoot,
    `git ls-files -o --exclude-standard "${searchPath}"`,
    execSyncFn
  );
  if (result.error) return { files: [], error: result.error };
  if (!result.stdout) return { files: [] };
  return { files: splitLines(result.stdout).map(normalizeRepoPath) };
}

export function listGitIgnoredOrUntrackedFiles(
  repoRoot: string,
  searchPath: string,
  execSyncFn?: ExecSyncFn
): { files: string[]; error?: string } {
  const ignored = listGitIgnoredFiles(repoRoot, searchPath, execSyncFn);
  if (ignored.error) return { files: [], error: ignored.error };

  const untracked = listGitUntrackedFiles(repoRoot, searchPath, execSyncFn);
  if (untracked.error) return { files: [], error: untracked.error };

  const merged = [...ignored.files, ...untracked.files];
  const uniq = [...new Set(merged.map(normalizeRepoPath))].sort();
  return { files: uniq };
}

// ============================================================================
// CSV Path Resolution
// ============================================================================

const CANONICAL_CSV_PATH = 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv';
const FALLBACK_CSV_PATH = 'Sprint_plan.csv';

/**
 * Resolve the canonical Sprint_plan.csv path.
 *
 * Priority:
 * 1) SPRINT_PLAN_PATH env variable (absolute or repo-relative)
 * 2) apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
 * 3) Sprint_plan.csv at repo root
 * 4) null if none found
 */
export function resolveSprintPlanPath(repoRoot: string): string | null {
  // Priority 1: Environment variable
  const envPath = process.env.SPRINT_PLAN_PATH;
  if (envPath) {
    const resolved = resolve(repoRoot, envPath);
    if (existsSync(resolved)) {
      return resolved;
    }
    log(`[WARN] SPRINT_PLAN_PATH="${envPath}" does not exist`, 'yellow');
  }

  // Priority 2: Canonical location
  const canonicalPath = join(repoRoot, CANONICAL_CSV_PATH);
  if (existsSync(canonicalPath)) {
    return canonicalPath;
  }

  // Priority 3: Root fallback
  const fallbackPath = join(repoRoot, FALLBACK_CSV_PATH);
  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return null;
}

/**
 * Get the metrics directory path.
 */
export function getMetricsDir(repoRoot: string): string {
  return join(repoRoot, 'apps/project-tracker/docs/metrics');
}

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse CSV content into task objects.
 * Returns tasks and any parse errors.
 */
export function parseSprintCsv(csvContent: string): { tasks: SprintTask[]; errors: string[] } {
  const errors: string[] = [];
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    errors.push('CSV file is empty');
    return { tasks: [], errors };
  }

  // Parse header - handle BOM
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCSVLine(headerLine);

  // Required headers
  const requiredHeaders = ['Task ID', 'Status', 'Target Sprint'];
  for (const req of requiredHeaders) {
    if (!headers.includes(req)) {
      errors.push(`Missing required CSV header: "${req}"`);
    }
  }

  if (errors.length > 0) {
    return { tasks: [], errors };
  }

  // Parse data rows
  const tasks: SprintTask[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const task: SprintTask = {
      'Task ID': '',
      Status: '',
      Description: '',
      'Target Sprint': '',
    };

    for (let j = 0; j < headers.length; j++) {
      task[headers[j]] = values[j] || '';
    }

    if (task['Task ID']) {
      tasks.push(task);
    }
  }

  return { tasks, errors };
}

/**
 * Simple CSV line parser that handles quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// ============================================================================
// Sprint Completion Check
// ============================================================================

const COMPLETED_STATUSES = ['Done', 'Completed'];

export interface CompletionResult {
  isComplete: boolean;
  totalTasks: number;
  completedTasks: number;
  incompleteTasks: SprintTask[];
}

/**
 * Check if a sprint is complete (all tasks Done/Completed).
 */
export function checkSprintCompletion(tasks: SprintTask[], targetSprint: string): CompletionResult {
  const sprintTasks = tasks.filter((t) => String(t['Target Sprint']) === targetSprint);
  const completedTasks = sprintTasks.filter((t) => COMPLETED_STATUSES.includes(t.Status));
  const incompleteTasks = sprintTasks.filter((t) => !COMPLETED_STATUSES.includes(t.Status));

  return {
    isComplete: incompleteTasks.length === 0 && sprintTasks.length > 0,
    totalTasks: sprintTasks.length,
    completedTasks: completedTasks.length,
    incompleteTasks,
  };
}

// ============================================================================
// Hygiene Checks (Git-based)
// ============================================================================

const DEFAULT_HYGIENE_ALLOWLIST = ['apps/project-tracker/docs/.specify/'];
const HYGIENE_ALLOWLIST_CONFIG_PATH = 'tools/scripts/hygiene-allowlist.json';

/**
 * Load hygiene allowlist entries from an optional config file, extending defaults.
 * Supports JSON array (`string[]`) or `{ "allowlist": string[] }`.
 */
export function getHygieneAllowlist(repoRoot: string): string[] {
  const configPath = join(repoRoot, HYGIENE_ALLOWLIST_CONFIG_PATH);
  if (!existsSync(configPath)) return DEFAULT_HYGIENE_ALLOWLIST;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));

    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && 'allowlist' in (parsed as Record<string, unknown>)
        ? (parsed as { allowlist: unknown }).allowlist
        : null;

    if (!Array.isArray(entries)) {
      log(
        `[WARN] Hygiene allowlist config has invalid shape: ${HYGIENE_ALLOWLIST_CONFIG_PATH}`,
        'yellow'
      );
      return DEFAULT_HYGIENE_ALLOWLIST;
    }

    const extra = entries.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return [...DEFAULT_HYGIENE_ALLOWLIST, ...extra];
  } catch (error) {
    log(
      `[WARN] Could not parse hygiene allowlist config: ${HYGIENE_ALLOWLIST_CONFIG_PATH} (${formatExecError(error)})`,
      'yellow'
    );
    return DEFAULT_HYGIENE_ALLOWLIST;
  }
}

export function matchForbiddenDocsRuntimeArtifacts(
  repoRelativePaths: string[],
  forbiddenPatterns: string[] = ['.locks', '.status', 'logs', 'backups', 'artifacts']
): string[] {
  const forbiddenSegments = forbiddenPatterns
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  const forbiddenMetricsFileSuffixes = ['.lock', '.log', '.tmp', '.bak', '.heartbeat', '.input'];

  return repoRelativePaths.map(normalizeRepoPath).filter((file) => {
    if (file.startsWith('apps/project-tracker/docs/artifacts/')) {
      // Allow gitkeep placeholders; everything else under docs/artifacts is treated as runtime output.
      if (file.endsWith('/.gitkeep')) return false;
      return true;
    }

    if (file.startsWith('apps/project-tracker/docs/metrics/')) {
      if (forbiddenSegments.some((segment) => file.includes(`/${segment}/`))) return true;
      return forbiddenMetricsFileSuffixes.some((suffix) => file.toLowerCase().endsWith(suffix));
    }

    return false;
  });
}

/**
 * Find forbidden docs runtime artifacts using git ls-files.
 *
 * Includes:
 * - tracked files under the path (catches repo contamination)
 * - ignored files under the path (catches runtime outputs hidden by .gitignore)
 * - untracked files under the path (catches local-only runtime outputs)
 */
export function findIgnoredRuntimeArtifacts(
  repoRoot: string,
  searchPath: string,
  forbiddenPatterns: string[] = ['.locks', '.status', 'logs', 'backups', 'artifacts'],
  execSyncFn?: ExecSyncFn
): { files: string[]; error?: string } {
  const tracked = listGitTrackedFilesInPath(repoRoot, searchPath, execSyncFn);
  if (tracked.error) return { files: [], error: tracked.error };

  const notTracked = listGitIgnoredOrUntrackedFiles(repoRoot, searchPath, execSyncFn);
  if (notTracked.error) return { files: [], error: notTracked.error };

  const all = [...tracked.files, ...notTracked.files];
  const matches = matchForbiddenDocsRuntimeArtifacts(all, forbiddenPatterns);
  const uniq = [...new Set(matches.map(normalizeRepoPath))].sort();
  return { files: uniq };
}

/**
 * Allowlist patterns for hygiene check.
 */
/**
 * Check if a path is allowed by the hygiene allowlist.
 */
export function isAllowedByHygieneAllowlist(
  filePath: string,
  allowlist: string[] = DEFAULT_HYGIENE_ALLOWLIST
): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return allowlist.some((pattern) => normalized.startsWith(pattern));
}

// ============================================================================
// Uniqueness Checks
// ============================================================================

const CANONICAL_ARTIFACTS = [
  'Sprint_plan.csv',
  'Sprint_plan.json',
  'task-registry.json',
  'dependency-graph.json',
];

export function evaluateCanonicalUniqueness(
  trackedFiles: string[],
  artifacts: string[] = CANONICAL_ARTIFACTS
): GateResult[] {
  const normalized = trackedFiles.map(normalizeRepoPath);

  return artifacts.map((artifact) => {
    const matches = normalized.filter((f) => f.endsWith(`/${artifact}`) || f === artifact);
    const details = matches.length > 0 ? matches : undefined;

    if (matches.length === 1) {
      return {
        name: `Uniqueness: ${artifact}`,
        severity: 'PASS',
        message: 'Exactly one tracked copy found',
        details,
      };
    }

    return {
      name: `Uniqueness: ${artifact}`,
      severity: 'FAIL',
      message: `Found ${matches.length} tracked copies (expected exactly 1)`,
      details,
    };
  });
}

/**
 * Check that canonical source-of-truth files exist exactly once in tracked files.
 */
export function checkCanonicalUniqueness(repoRoot: string): GateResult[] {
  const tracked = listGitTrackedFiles(repoRoot);
  if (tracked.error) {
    return [
      {
        name: 'Canonical Uniqueness',
        severity: 'FAIL',
        message: 'git ls-files failed; cannot verify tracked canonical artifacts',
        details: [tracked.error],
      },
    ];
  }

  return evaluateCanonicalUniqueness(tracked.files);
}

// ============================================================================
// Summary and Exit
// ============================================================================

/**
 * Create a validation summary from gate results.
 */
export function createSummary(gates: GateResult[]): ValidationSummary {
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const gate of gates) {
    const effective = effectiveSeverity(gate.severity);
    switch (effective) {
      case 'PASS':
        passCount++;
        break;
      case 'WARN':
        warnCount++;
        break;
      case 'FAIL':
        failCount++;
        break;
      case 'SKIP':
        skipCount++;
        break;
    }
  }

  return { gates, passCount, warnCount, failCount, skipCount };
}

/**
 * Print validation summary.
 */
export function printSummary(summary: ValidationSummary): void {
  const line = '-'.repeat(70);
  log(`\n${colorize(line, 'bold')}`);
  log(colorize('Validation Summary', 'bold'));
  log(colorize(line, 'bold'));

  const mode = isStrictMode() ? 'STRICT' : 'DEFAULT';
  log(`Mode: ${colorize(mode, isStrictMode() ? 'yellow' : 'blue')}`);
  log(`PASS: ${colorize(String(summary.passCount), 'green')}`);
  log(`WARN: ${colorize(String(summary.warnCount), 'yellow')}`);
  log(`FAIL: ${colorize(String(summary.failCount), 'red')}`);
  if (summary.skipCount > 0) {
    log(`SKIP: ${colorize(String(summary.skipCount), 'gray')}`);
  }

  log(colorize(line, 'bold'));
}

/**
 * Determine exit code based on summary.
 * FAIL always exits 1.
 * WARN exits 1 in strict mode, 0 otherwise.
 */
export function getExitCode(summary: ValidationSummary): number {
  if (summary.failCount > 0) return 1;
  if (summary.warnCount > 0 && isStrictMode()) return 1;
  return 0;
}

// ============================================================================
// Repository Root Detection
// ============================================================================

/**
 * Find the repository root by looking for turbo.json or .git.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  while (dir !== resolve(dir, '..')) {
    if (existsSync(join(dir, 'turbo.json')) || existsSync(join(dir, '.git'))) {
      return dir;
    }
    dir = resolve(dir, '..');
  }
  return startDir;
}
