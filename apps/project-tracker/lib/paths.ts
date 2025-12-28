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

import { join } from 'path';
import { mkdir } from 'fs/promises';

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
export function getPhaseSummaryPath(sprint: number | string, phase: string): string {
  return join(getPhaseDir(sprint, phase), '_phase-summary.json');
}

/**
 * Get task file path
 */
export function getTaskFilePath(sprint: number | string, phase: string, taskId: string): string {
  return join(getPhaseDir(sprint, phase), `${taskId}.json`);
}

/**
 * Get governance file paths
 */
export const GOVERNANCE_PATHS = {
  get PLAN_OVERRIDES() {
    return join(PATHS.sprintTracking.global, 'plan-overrides.yaml');
  },
  get REVIEW_QUEUE() {
    return PATHS.sprintTracking.REVIEW_QUEUE;
  },
  get LINT_REPORT() {
    return join(PATHS.artifacts.reports, 'plan-lint-report.json');
  },
  get DEBT_LEDGER() {
    return join(PATHS.artifacts.reports, 'debt-ledger.json');
  },
  get PHANTOM_AUDIT() {
    return join(PATHS.artifacts.reports, 'phantom-completion-audit.json');
  },
} as const;
