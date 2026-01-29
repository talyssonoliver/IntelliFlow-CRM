/**
 * Workflow Paths
 *
 * Centralized path generation for all workflow artifacts.
 * Ensures both UI and CLI use the same output locations.
 *
 * All paths use sprint-based structure: .specify/sprints/sprint-{N}/...
 */

import { join } from 'node:path';
import { OUTPUT_PATHS, FILE_NAMES } from './config';

/**
 * Generate all paths for a task within a sprint
 *
 * @param sprintNumber - The sprint number (required)
 * @param taskId - The task ID (e.g., "IFC-009")
 * @param runId - Optional run ID for execution paths
 */
export function getTaskPaths(sprintNumber: number, taskId: string, runId?: string) {
  const base = OUTPUT_PATHS.base(sprintNumber);

  return {
    // Base directories
    base,
    context: OUTPUT_PATHS.context(sprintNumber, taskId),
    specifications: OUTPUT_PATHS.specifications(sprintNumber),
    planning: OUTPUT_PATHS.planning(sprintNumber),
    attestations: OUTPUT_PATHS.attestations(sprintNumber, taskId),

    // Context files (Phase 0)
    hydratedContext: join(OUTPUT_PATHS.context(sprintNumber, taskId), FILE_NAMES.context(taskId)),
    agentSelection: join(OUTPUT_PATHS.context(sprintNumber, taskId), FILE_NAMES.agentSelection(taskId)),

    // Specification files (Phase 1)
    spec: join(OUTPUT_PATHS.specifications(sprintNumber), FILE_NAMES.spec(taskId)),
    discussion: join(OUTPUT_PATHS.specifications(sprintNumber), `${taskId}-discussion.md`),

    // Planning files (Phase 2)
    plan: join(OUTPUT_PATHS.planning(sprintNumber), FILE_NAMES.plan(taskId)),

    // Execution files (Phase 3) - require runId
    ...(runId && {
      execution: OUTPUT_PATHS.execution(sprintNumber, taskId, runId),
      implementation: join(OUTPUT_PATHS.execution(sprintNumber, taskId, runId), 'implementation'),
      stepsCompleted: join(OUTPUT_PATHS.execution(sprintNumber, taskId, runId), 'implementation', FILE_NAMES.stepsCompleted),
      filesModified: join(OUTPUT_PATHS.execution(sprintNumber, taskId, runId), 'implementation', FILE_NAMES.filesModified),
      matop: OUTPUT_PATHS.matop(sprintNumber, taskId, runId),
      gates: OUTPUT_PATHS.gates(sprintNumber, taskId, runId),
      verdicts: OUTPUT_PATHS.verdicts(sprintNumber, taskId, runId),
      gateSelection: join(OUTPUT_PATHS.matop(sprintNumber, taskId, runId), FILE_NAMES.gateSelection),
      summary: join(OUTPUT_PATHS.execution(sprintNumber, taskId, runId), FILE_NAMES.summary),
      delivery: join(OUTPUT_PATHS.execution(sprintNumber, taskId, runId), FILE_NAMES.delivery(taskId)),
      evidenceHashes: join(OUTPUT_PATHS.matop(sprintNumber, taskId, runId), FILE_NAMES.evidenceHashes),
    }),
  };
}

/**
 * Generate a unique run ID for execution
 */
export function generateRunId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
  const randomHex = Math.random().toString(16).slice(2, 10);
  return `${timestamp}-${randomHex}`;
}

/**
 * Parse a run ID to extract timestamp
 */
export function parseRunId(runId: string): { timestamp: Date; random: string } | null {
  const match = runId.match(/^(\d{14})-([a-f0-9]{8})$/);
  if (!match) return null;

  const [, timestampStr, random] = match;
  const year = parseInt(timestampStr.slice(0, 4));
  const month = parseInt(timestampStr.slice(4, 6)) - 1;
  const day = parseInt(timestampStr.slice(6, 8));
  const hour = parseInt(timestampStr.slice(8, 10));
  const minute = parseInt(timestampStr.slice(10, 12));
  const second = parseInt(timestampStr.slice(12, 14));

  return {
    timestamp: new Date(year, month, day, hour, minute, second),
    random,
  };
}

/**
 * Get the CSV path for Sprint_plan.csv
 */
export function getSprintPlanCsvPath(repoRoot?: string): string {
  const base = repoRoot || process.cwd();
  return join(base, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
}

/**
 * Get the JSON path for Sprint_plan.json
 */
export function getSprintPlanJsonPath(repoRoot?: string): string {
  const base = repoRoot || process.cwd();
  return join(base, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.json');
}

/**
 * Check if a path is within the .specify directory
 */
export function isSpecifyPath(path: string): boolean {
  return path.includes('.specify/') || path.includes('.specify\\');
}

/**
 * Extract task ID from a .specify path
 * Supports both old (.specify/{TASK_ID}/) and new (.specify/sprints/sprint-{N}/.../TASK_ID/) structures
 */
export function extractTaskIdFromPath(path: string): string | null {
  // New sprint-based: .specify/sprints/sprint-X/context/TASK-ID/
  const newMatch = path.match(/\.specify[/\\]sprints[/\\]sprint-\d+[/\\](?:context|attestations|execution)[/\\]([A-Z]+-\d+(?:-[A-Z]+)?)[/\\]/);
  if (newMatch) return newMatch[1];

  // New sprint-based: .specify/sprints/sprint-X/specifications/TASK-ID-spec.md
  const specMatch = path.match(/\.specify[/\\]sprints[/\\]sprint-\d+[/\\](?:specifications|planning)[/\\]([A-Z]+-\d+(?:-[A-Z]+)?)-/);
  if (specMatch) return specMatch[1];

  // Old task-based: .specify/{TASK_ID}/
  const oldMatch = path.match(/\.specify[/\\]([A-Z]+-\d+(?:-[A-Z]+)?)[/\\]/);
  return oldMatch ? oldMatch[1] : null;
}

/**
 * Extract sprint number from a .specify path
 */
export function extractSprintFromPath(path: string): number | null {
  const match = path.match(/\.specify[/\\]sprints[/\\]sprint-(\d+)[/\\]/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get all execution run directories for a task
 */
export function getExecutionRunsPath(sprintNumber: number, taskId: string): string {
  return join(OUTPUT_PATHS.base(sprintNumber), 'execution', taskId);
}

/**
 * Legacy path mappings for backwards compatibility
 * Maps old scattered paths to new sprint-based paths
 */
export const LEGACY_PATH_MAPPINGS = {
  // Old: artifacts/sprint-runs/<taskId>/
  // New: .specify/sprints/sprint-{N}/execution/<taskId>/
  sprintRuns: (sprintNumber: number, taskId: string) => ({
    old: `artifacts/sprint-runs/${taskId}`,
    new: join(OUTPUT_PATHS.base(sprintNumber), 'execution', taskId),
  }),

  // Old: artifacts/reports/system-audit/<runId>/
  // New: .specify/sprints/sprint-{N}/execution/<taskId>/<runId>/matop/
  systemAudit: (sprintNumber: number, taskId: string, runId: string) => ({
    old: `artifacts/reports/system-audit/${runId}`,
    new: OUTPUT_PATHS.matop(sprintNumber, taskId, runId),
  }),

  // Old: artifacts/attestations/<taskId>/
  // New: .specify/sprints/sprint-{N}/attestations/<taskId>/
  attestations: (sprintNumber: number, taskId: string) => ({
    old: `artifacts/attestations/${taskId}`,
    new: OUTPUT_PATHS.attestations(sprintNumber, taskId),
  }),

  // Old: .specify/{TASK_ID}/context/
  // New: .specify/sprints/sprint-{N}/context/{TASK_ID}/
  taskContext: (sprintNumber: number, taskId: string) => ({
    old: `.specify/${taskId}/context`,
    new: OUTPUT_PATHS.context(sprintNumber, taskId),
  }),

  // Old: .specify/{TASK_ID}/specifications/
  // New: .specify/sprints/sprint-{N}/specifications/
  taskSpecs: (sprintNumber: number, taskId: string) => ({
    old: `.specify/${taskId}/specifications`,
    new: OUTPUT_PATHS.specifications(sprintNumber),
  }),
};
