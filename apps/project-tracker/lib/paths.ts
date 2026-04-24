/**
 * Centralized Path Configuration for IntelliFlow CRM
 *
 * This module provides canonical paths following IFC-160 artifact conventions.
 * The project-tracker app runs from apps/project-tracker/, so we need to
 * resolve paths relative to the monorepo root (2 levels up).
 *
 * Key distinction:
 * - Sprint tracking metrics (docs/metrics/) -> COMMITTED to git
 * - Ephemeral artifacts (artifacts/) -> GITIGNORED, never committed
 */

import { basename, join, resolve, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';

// Monorepo root (2 levels up from apps/project-tracker/)
export const MONOREPO_ROOT = join(process.cwd(), '..', '..');

/**
 * Canonical paths per IFC-160 artifact conventions
 */
export const PATHS = {
  // Ephemeral artifacts (gitignored) - CONSOLIDATE WITH EXISTING /artifacts/
  artifacts: {
    root: join(MONOREPO_ROOT, 'artifacts'),
    logs: join(MONOREPO_ROOT, 'artifacts', 'logs'),
    swarmLogs: join(MONOREPO_ROOT, 'artifacts', 'logs', 'swarm'),
    reports: join(MONOREPO_ROOT, 'artifacts', 'reports'),
    metrics: join(MONOREPO_ROOT, 'artifacts', 'metrics'),
    misc: join(MONOREPO_ROOT, 'artifacts', 'misc'),
    locks: join(MONOREPO_ROOT, 'artifacts', 'misc', '.locks'),
    tasks: join(MONOREPO_ROOT, 'artifacts', 'misc', 'tasks'), // Question logs + answers
    forensics: join(MONOREPO_ROOT, 'artifacts', 'forensics'), // Already exists from swarm-manager.sh
  },

  // Persistent metrics (committed) - STAYS IN project-tracker
  sprintTracking: {
    root: join(process.cwd(), 'docs', 'metrics'),
    global: join(process.cwd(), 'docs', 'metrics', '_global'),
    sprint0: join(process.cwd(), 'docs', 'metrics', 'sprint-0'),
    schemas: join(process.cwd(), 'docs', 'metrics', 'schemas'),
    // Core data files
    SPRINT_PLAN_CSV: join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv'),
    SPRINT_PLAN_JSON: join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.json'),
    TASK_REGISTRY: join(process.cwd(), 'docs', 'metrics', '_global', 'task-registry.json'),
    DEPENDENCY_GRAPH: join(process.cwd(), 'docs', 'metrics', '_global', 'dependency-graph.json'),
    REVIEW_QUEUE: join(process.cwd(), 'docs', 'metrics', 'review-queue.json'),
  },

  // Documentation
  docs: {
    root: join(MONOREPO_ROOT, 'docs'),
    operations: join(MONOREPO_ROOT, 'docs', 'ops'),
    playbooks: join(MONOREPO_ROOT, 'docs', 'ops', 'playbooks'),
  },

  // Scripts - Canonical location in /scripts/swarm/
  scripts: {
    root: join(MONOREPO_ROOT, 'scripts', 'swarm'),
    orchestrator: join(MONOREPO_ROOT, 'scripts', 'swarm', 'orchestrator.sh'),
    swarmManager: join(MONOREPO_ROOT, 'scripts', 'swarm', 'swarm-manager.sh'),
  },
} as const;

/**
 * Ensure all artifact directories exist.
 * Call this at app startup or before writing artifacts.
 */
export async function ensureArtifactDirs(): Promise<void> {
  const dirs = [
    PATHS.artifacts.swarmLogs,
    PATHS.artifacts.locks,
    PATHS.artifacts.tasks,
    PATHS.artifacts.reports,
    PATHS.artifacts.metrics,
    PATHS.artifacts.forensics,
  ];

  await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
}

/**
 * Get the swarm log file path for a specific task
 */
export function getSwarmLogPath(taskId: string): string {
  return join(PATHS.artifacts.swarmLogs, `${taskId}.log`);
}

/**
 * Get the aggregate swarm log path
 */
export function getAggregateSwarmLogPath(): string {
  return join(PATHS.artifacts.swarmLogs, 'swarm.log');
}

/**
 * Get the swarm health file path
 */
export function getSwarmHealthPath(): string {
  return join(PATHS.artifacts.swarmLogs, 'swarm-health.json');
}

/**
 * Get lock file path for a specific task
 */
export function getLockFilePath(taskId: string): string {
  return join(PATHS.artifacts.locks, `${taskId}.lock`);
}

/**
 * Get heartbeat file path for a specific task
 */
export function getHeartbeatPath(taskId: string): string {
  return join(PATHS.artifacts.locks, `${taskId}.heartbeat`);
}

/**
 * Get input file path for a specific task (terminal input)
 */
export function getInputFilePath(taskId: string): string {
  return join(PATHS.artifacts.locks, `${taskId}.input`);
}

/**
 * Get task answers file path
 */
export function getTaskAnswersPath(taskId: string): string {
  return join(PATHS.artifacts.tasks, `${taskId}_answers.md`);
}

/**
 * Get task questions log path
 */
export function getTaskQuestionsPath(taskId: string, type: 'spec' | 'plan'): string {
  return join(PATHS.artifacts.tasks, `${taskId}_claude_${type}_questions.log`);
}

// =============================================================================
// Sprint Tracking Path Helpers
// =============================================================================

/**
 * Get sprint directory path
 */
export function getSprintDir(sprint: number | string): string {
  return join(PATHS.sprintTracking.root, `sprint-${sprint}`);
}

/**
 * Get sprint summary file path
 */
export function getSprintSummaryPath(sprint: number | string): string {
  return join(getSprintDir(sprint), '_summary.json');
}

/**
 * Get phase directory path
 */
export function getPhaseDir(sprint: number | string, phase: string): string {
  return join(getSprintDir(sprint), phase);
}

/**
 * Get phase summary file path
 */
function _getPhaseSummaryPath(sprint: number | string, phase: string): string {
  return join(getPhaseDir(sprint, phase), '_phase-summary.json');
}

/**
 * Get task file path
 */
function _getTaskFilePath(sprint: number | string, phase: string, taskId: string): string {
  return join(getPhaseDir(sprint, phase), `${taskId}.json`);
}

/**
 * Get governance file paths
 */
const _GOVERNANCE_PATHS = {
  get PLAN_OVERRIDES() {
    return join(PATHS.sprintTracking.global, 'plan-overrides.yaml');
  },
  get REVIEW_QUEUE() {
    return PATHS.sprintTracking.REVIEW_QUEUE;
  },
  get LINT_REPORT() {
    return join(PATHS.artifacts.reports, 'plan-lint-report.json');
  },
  get PHANTOM_AUDIT() {
    return join(PATHS.artifacts.reports, 'phantom-completion-audit.json');
  },
} as const;

// =============================================================================
// Input Validation Utilities
// =============================================================================

/**
 * Valid task ID patterns:
 * - IFC-001, IFC-106
 * - PG-001, PG-015
 * - ENV-001-AI, ENV-012-AI
 * - AI-SETUP-001, AI-SETUP-003
 * - EXC-INIT-001, EXC-SEC-001
 * - AUTOMATION-001
 * - ANALYTICS-001
 * - BRAND-001
 * - DOC-001
 * - GOV-001
 * - GTM-001
 * - SALES-001
 * - ENG-OPS-001
 * - PM-OPS-001
 * - EP-001-AI
 * - EXP-PLATFORM-001, EXP-SCRIPTS-001
 */
const TASK_ID_PATTERN = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-\d{3}(-[A-Z]+)?$/;

/**
 * Validate a task ID against the expected pattern
 *
 * @param taskId The task ID to validate
 * @returns true if valid, false if invalid
 */
export function isValidTaskId(taskId: string): boolean {
  if (!taskId || typeof taskId !== 'string') {
    return false;
  }

  // Basic length check
  if (taskId.length < 5 || taskId.length > 30) {
    return false;
  }

  return TASK_ID_PATTERN.test(taskId);
}

/**
 * Sanitize a task ID for safe use in paths and commands
 * Returns null if the task ID is invalid
 *
 * @param taskId The task ID to sanitize
 * @returns Sanitized task ID or null if invalid
 */
export function sanitizeTaskId(taskId: string): string | null {
  if (!isValidTaskId(taskId)) {
    return null;
  }

  // Additional sanitization - remove any characters that could be shell injection
  // Since we've already validated the pattern, this is just an extra safety layer
  return taskId.replaceAll(/[^A-Z0-9-]/g, '');
}

/**
 * Coerce an arbitrary sprint value (from CSV or JSON body) to a safe integer.
 * Rejects anything that isn't a finite non-negative integer <= 999.
 */
export function sanitizeSprintNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n > 999) return null;
  return n;
}

/**
 * Containment check — resolves `candidate` and ensures it stays under `root`.
 * Returns the resolved path on success, or null if traversal would escape.
 * Pair with `sanitizeTaskId` + `sanitizeSprintNumber` to neutralise taint from
 * user input before passing to `fs` operations.
 */
export function resolveWithin(root: string, ...segments: string[]): string | null {
  const base = resolve(root);
  const candidate = resolve(base, ...segments);
  // Enforce the separator so /app/foobar cannot masquerade as /app/foo.
  if (candidate !== base && !candidate.startsWith(base + sep)) {
    return null;
  }
  return candidate;
}

/**
 * Resolve a path under `.specify/sprints/sprint-{N}/...` safely, validating
 * both the sprint number and each trailing segment, and ensuring the result
 * stays within the sprints tree.
 */
export function resolveSprintPath(
  sprintsRoot: string,
  sprint: number,
  ...segments: string[]
): string | null {
  const sprintSafe = sanitizeSprintNumber(sprint);
  if (sprintSafe === null) return null;
  // Reject absolute segments and explicit traversal components up-front —
  // resolveWithin does a final containment check as a defence-in-depth.
  for (const s of segments) {
    if (typeof s !== 'string' || s.length === 0) return null;
    if (s.includes('\0')) return null;
    if (s === '..' || s.startsWith('../') || s.startsWith('..\\')) return null;
  }
  return resolveWithin(sprintsRoot, `sprint-${sprintSafe}`, ...segments);
}

/**
 * Taint-breaking task-id → filename builder.
 *
 * CodeQL (js/path-injection) recognises `path.basename(x)` as a sanitiser
 * because it collapses any path-traversal away. Combining that with a
 * whitelist-regex `.replace` yields a fresh scalar whose provenance chain no
 * longer includes raw user input.
 *
 * Returns null if the input doesn't match the canonical task-id shape.
 */
export function buildSafeTaskFilename(taskId: unknown, suffix: string): string | null {
  if (typeof taskId !== 'string' || !isValidTaskId(taskId)) return null;
  // `basename` strips any directory component, then the regex drops anything
  // outside our canonical task-id alphabet. The output is, by construction,
  // a brand-new string whose characters are a closed subset of [A-Z0-9-].
  const safe = basename(taskId).replaceAll(/[^A-Z0-9-]/g, '');
  if (safe.length === 0) return null;
  return `${safe}${suffix}`;
}

/**
 * Taint-breaking session-id → filename builder. Same rationale as
 * `buildSafeTaskFilename` — `basename` + regex replace breaks the CodeQL
 * path-injection taint chain.
 */
const SESSION_ID_PATTERN = /^\d{14}-[0-9a-f]{8}$/;
export function buildSafeSessionFilename(sessionId: unknown, suffix: string): string | null {
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) return null;
  const safe = basename(sessionId).replaceAll(/[^0-9a-f-]/gi, '');
  if (safe.length === 0) return null;
  return `${safe}${suffix}`;
}
