/**
 * Column Deprecation Plan Generator for IntelliFlow CRM
 *
 * Implements deterministic derivation for deprecated CSV columns:
 * - CrossQuarterDeps: derived from Target Sprint values
 * - CleanDependencies: generated from Dependencies field
 *
 * Produces a migration plan and warnings without removing columns yet.
 *
 * @module tools/scripts/lib/column-deprecation
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  findRepoRoot,
  resolveSprintPlanPath,
  parseSprintCsv,
  type SprintTask,
} from './validation-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface DeprecationPlan {
  runId: string;
  createdAt: string;
  columns: ColumnDeprecation[];
  timeline: DeprecationTimeline;
  warnings: DeprecationWarning[];
}

export interface ColumnDeprecation {
  name: string;
  status: 'warn-only' | 'enforce' | 'removed';
  reason: string;
  derivationRule: string;
  affectedTasks: number;
  divergenceCount: number;
}

export interface DeprecationTimeline {
  step1: TimelineStep;
  step2: TimelineStep;
  step3: TimelineStep;
}

export interface TimelineStep {
  phase: string;
  sprint: string;
  action: string;
  status: 'current' | 'pending' | 'completed';
}

export interface DeprecationWarning {
  taskId: string;
  column: string;
  message: string;
  expectedValue: string;
  actualValue: string;
}

// ============================================================================
// Constants
// ============================================================================

const SPRINTS_PER_QUARTER = 4; // Assuming 4 sprints per quarter

// ============================================================================
// Derivation Functions
// ============================================================================

/**
 * Compute cross-quarter dependencies based on Target Sprint values.
 * A dependency is "cross-quarter" if it references a task in a different quarter.
 */
export function computeCrossQuarterDeps(task: SprintTask, allTasks: SprintTask[]): boolean {
  const targetSprint = parseInt(task['Target Sprint'], 10);
  if (isNaN(targetSprint)) {
    return false;
  }

  const taskQuarter = Math.floor(targetSprint / SPRINTS_PER_QUARTER);

  // Parse dependencies
  const depsField = task['Dependencies'] || '';
  if (!depsField.trim()) {
    return false;
  }

  const depIds = depsField
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  // Check each dependency's quarter
  for (const depId of depIds) {
    const depTask = allTasks.find((t) => t['Task ID'] === depId);
    if (!depTask) continue;

    const depSprint = parseInt(depTask['Target Sprint'], 10);
    if (isNaN(depSprint)) continue;

    const depQuarter = Math.floor(depSprint / SPRINTS_PER_QUARTER);
    if (depQuarter !== taskQuarter) {
      return true;
    }
  }

  return false;
}

/**
 * Generate CleanDependencies from the Dependencies field.
 * Removes whitespace, sorts alphabetically, removes duplicates.
 */
export function generateCleanDependencies(dependencies: string): string {
  if (!dependencies || typeof dependencies !== 'string') {
    return '';
  }

  const depIds = dependencies
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  // Remove duplicates and sort
  const unique = [...new Set(depIds)].sort();

  return unique.join(',');
}

// ============================================================================
// Divergence Detection
// ============================================================================

/**
 * Check if a task's CleanDependencies diverges from the generated value.
 */
export function checkCleanDependenciesDivergence(task: SprintTask): DeprecationWarning | null {
  const dependencies = task['Dependencies'] || '';
  const cleanDeps = task['CleanDependencies'] || '';
  const expectedClean = generateCleanDependencies(dependencies);

  if (cleanDeps !== expectedClean && (cleanDeps || expectedClean)) {
    return {
      taskId: task['Task ID'],
      column: 'CleanDependencies',
      message: 'CleanDependencies diverges from generated value',
      expectedValue: expectedClean || '(empty)',
      actualValue: cleanDeps || '(empty)',
    };
  }

  return null;
}

/**
 * Check if a task's CrossQuarterDeps diverges from the computed value.
 */
export function checkCrossQuarterDepsDivergence(
  task: SprintTask,
  allTasks: SprintTask[]
): DeprecationWarning | null {
  const csvValue = task['CrossQuarterDeps'] || '';
  const computed = computeCrossQuarterDeps(task, allTasks);
  const expectedValue = computed ? 'True' : 'False';

  // Normalize CSV value for comparison
  const normalizedCsv = csvValue.trim().toLowerCase();
  const normalizedExpected = expectedValue.toLowerCase();

  if (normalizedCsv && normalizedCsv !== normalizedExpected) {
    return {
      taskId: task['Task ID'],
      column: 'CrossQuarterDeps',
      message: 'CrossQuarterDeps diverges from computed value',
      expectedValue,
      actualValue: csvValue,
    };
  }

  return null;
}

// ============================================================================
// Plan Generation
// ============================================================================

/**
 * Generate a deprecation plan for the CSV columns.
 */
export function generateDeprecationPlan(runId: string, repoRoot?: string): DeprecationPlan {
  const root = repoRoot || findRepoRoot();
  const createdAt = new Date().toISOString();
  const warnings: DeprecationWarning[] = [];

  // Load CSV
  const csvPath = resolveSprintPlanPath(root);
  if (!csvPath || !existsSync(csvPath)) {
    return {
      runId,
      createdAt,
      columns: [],
      timeline: createTimeline('3'),
      warnings: [
        {
          taskId: 'SYSTEM',
          column: 'ALL',
          message: 'Sprint_plan.csv not found',
          expectedValue: 'CSV file exists',
          actualValue: 'File not found',
        },
      ],
    };
  }

  const { tasks, errors } = parseSprintCsv(require('fs').readFileSync(csvPath, 'utf-8'));

  if (errors.length > 0) {
    return {
      runId,
      createdAt,
      columns: [],
      timeline: createTimeline('3'),
      warnings: errors.map((e) => ({
        taskId: 'SYSTEM',
        column: 'ALL',
        message: `CSV parse error: ${e}`,
        expectedValue: 'Valid CSV',
        actualValue: 'Parse error',
      })),
    };
  }

  // Check CleanDependencies divergences
  let cleanDepsDiv = 0;
  for (const task of tasks) {
    const warning = checkCleanDependenciesDivergence(task);
    if (warning) {
      warnings.push(warning);
      cleanDepsDiv++;
    }
  }

  // Check CrossQuarterDeps divergences
  let crossQuarterDiv = 0;
  for (const task of tasks) {
    const warning = checkCrossQuarterDepsDivergence(task, tasks);
    if (warning) {
      warnings.push(warning);
      crossQuarterDiv++;
    }
  }

  // Determine current sprint for timeline
  const currentSprint = getCurrentSprint(tasks);

  // Build column deprecation info
  const columns: ColumnDeprecation[] = [
    {
      name: 'CleanDependencies',
      status: 'warn-only',
      reason: 'Can be derived from Dependencies field by normalizing (trim, sort, dedupe)',
      derivationRule:
        'generateCleanDependencies(Dependencies): split by comma, trim, dedupe, sort, rejoin',
      affectedTasks: tasks.length,
      divergenceCount: cleanDepsDiv,
    },
    {
      name: 'CrossQuarterDeps',
      status: 'warn-only',
      reason: 'Can be computed from Target Sprint values of task and its dependencies',
      derivationRule:
        'computeCrossQuarterDeps(task, allTasks): check if any dependency is in a different quarter',
      affectedTasks: tasks.length,
      divergenceCount: crossQuarterDiv,
    },
  ];

  return {
    runId,
    createdAt,
    columns,
    timeline: createTimeline(currentSprint),
    warnings,
  };
}

/**
 * Create the three-step deprecation timeline.
 */
function createTimeline(currentSprint: string): DeprecationTimeline {
  const current = parseInt(currentSprint, 10) || 0;

  return {
    step1: {
      phase: 'Step 1: Warn-Only',
      sprint: `Sprint ${current}`,
      action:
        'Warn when CSV values diverge from generated values. Do not fail validation. Log divergences to deprecation report.',
      status: 'current',
    },
    step2: {
      phase: 'Step 2: Enforce',
      sprint: `Sprint ${current + 1}`,
      action: 'Fail validation in strict mode if CSV values diverge. Require sync before commit.',
      status: 'pending',
    },
    step3: {
      phase: 'Step 3: Remove',
      sprint: `Sprint ${current + 2}`,
      action:
        'Remove columns from CSV. Registry generator produces derived values only. CSV schema updated.',
      status: 'pending',
    },
  };
}

/**
 * Determine the current sprint based on task statuses.
 */
function getCurrentSprint(tasks: SprintTask[]): string {
  // Find the highest sprint with incomplete tasks
  const sprints = new Map<number, { total: number; complete: number }>();

  for (const task of tasks) {
    const sprint = parseInt(task['Target Sprint'], 10);
    if (isNaN(sprint)) continue;

    if (!sprints.has(sprint)) {
      sprints.set(sprint, { total: 0, complete: 0 });
    }

    const s = sprints.get(sprint)!;
    s.total++;

    if (task.Status === 'Done' || task.Status === 'Completed') {
      s.complete++;
    }
  }

  // Find first incomplete sprint
  const sortedSprints = [...sprints.keys()].sort((a, b) => a - b);
  for (const sprint of sortedSprints) {
    const s = sprints.get(sprint)!;
    if (s.complete < s.total) {
      return String(sprint);
    }
  }

  return '0';
}

// ============================================================================
// File Output
// ============================================================================

/**
 * Write the deprecation plan to a markdown file.
 */
export function writeDeprecationPlanMarkdown(plan: DeprecationPlan, outputPath: string): void {
  const lines: string[] = [];

  lines.push('# CSV Column Deprecation Plan');
  lines.push('');
  lines.push(`**Run ID:** ${plan.runId}`);
  lines.push(`**Generated:** ${plan.createdAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('This plan outlines the deprecation of columns that can be derived automatically.');
  lines.push('');
  lines.push('## Columns to Deprecate');
  lines.push('');

  for (const col of plan.columns) {
    lines.push(`### ${col.name}`);
    lines.push('');
    lines.push(`- **Status:** ${col.status}`);
    lines.push(`- **Reason:** ${col.reason}`);
    lines.push(`- **Derivation Rule:** ${col.derivationRule}`);
    lines.push(`- **Affected Tasks:** ${col.affectedTasks}`);
    lines.push(`- **Divergence Count:** ${col.divergenceCount}`);
    lines.push('');
  }

  lines.push('## Three-Step Timeline');
  lines.push('');

  const steps = [plan.timeline.step1, plan.timeline.step2, plan.timeline.step3];
  for (const step of steps) {
    const statusBadge =
      step.status === 'current'
        ? '🔵 CURRENT'
        : step.status === 'completed'
          ? '✅ DONE'
          : '⏳ PENDING';
    lines.push(`### ${step.phase} [${statusBadge}]`);
    lines.push('');
    lines.push(`**Sprint:** ${step.sprint}`);
    lines.push('');
    lines.push(`**Action:** ${step.action}`);
    lines.push('');
  }

  if (plan.warnings.length > 0) {
    lines.push('## Divergence Warnings');
    lines.push('');
    lines.push(`Found ${plan.warnings.length} divergence(s):`);
    lines.push('');

    for (const warning of plan.warnings.slice(0, 20)) {
      lines.push(`- **${warning.taskId}** [${warning.column}]: ${warning.message}`);
      lines.push(`  - Expected: \`${warning.expectedValue}\``);
      lines.push(`  - Actual: \`${warning.actualValue}\``);
    }

    if (plan.warnings.length > 20) {
      lines.push('');
      lines.push(`... and ${plan.warnings.length - 20} more`);
    }
    lines.push('');
  }

  lines.push('## Migration Steps');
  lines.push('');
  lines.push('1. **Do NOT remove columns yet** - wait for Step 3');
  lines.push('2. **Fix divergences** - update CSV to match generated values');
  lines.push('3. **Run sync** - ensure registry generator produces correct derived values');
  lines.push('4. **Verify** - run validation to confirm no divergences');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*This deprecation plan was auto-generated by the column deprecation system.*');

  // Write file
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

/**
 * Generate and write deprecation plan to the artifacts directory.
 */
export function generateAndWriteDeprecationPlan(
  runId: string,
  repoRoot?: string
): { plan: DeprecationPlan; outputPath: string } {
  const root = repoRoot || findRepoRoot();
  const plan = generateDeprecationPlan(runId, root);

  const outputPath = join(
    root,
    'artifacts',
    'reports',
    'deprecation',
    runId,
    'csv-deprecation-plan.md'
  );

  writeDeprecationPlanMarkdown(plan, outputPath);

  // Also write JSON version
  const jsonPath = outputPath.replace('.md', '.json');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2), 'utf-8');

  return { plan, outputPath };
}
