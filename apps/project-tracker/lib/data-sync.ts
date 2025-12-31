/**
 * Data Synchronization Utility
 * Single Source of Truth: Sprint_plan.csv
 * Automatically updates all derived files
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import Papa from 'papaparse';
import { splitSprintPlan } from '../../../tools/scripts/split-sprint-plan';

const nodeRequire = createRequire(import.meta.url);

// Read a JSON file that may be wrapped in Markdown code fences (```json ... ```)
function readJsonTolerant(path: string): any {
  let content = readFileSync(path, 'utf-8');
  // Remove ```json or ``` markers if present
  content = content.replace(/^```\s*json\s*/i, '');
  content = content.replace(/^```\s*/i, '');
  content = content.replace(/```\s*$/i, '');
  content = content.trim();
  return JSON.parse(content);
}

function writeJsonFile(path: string, data: unknown, space = 2): void {
  writeFileSync(path, `${JSON.stringify(data, null, space)}\n`, 'utf-8');
}

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, '.git'))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolvePrettierBin(repoRoot: string): string | null {
  // Try to find prettier in node_modules directly (avoids Turbopack virtual path issues)
  // On Windows, prioritize the actual JS files over .bin scripts (which are bash scripts)
  const isWindows = process.platform === 'win32';
  const nodeModulesPaths = isWindows
    ? [
        join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
        join(repoRoot, 'node_modules', 'prettier', 'bin-prettier.cjs'),
        join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.js'),
      ]
    : [
        join(repoRoot, 'node_modules', '.bin', 'prettier'),
        join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
        join(repoRoot, 'node_modules', 'prettier', 'bin-prettier.cjs'),
      ];

  for (const candidate of nodeModulesPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: try require.resolve (may fail in Turbopack)
  const requireCandidates = [
    'prettier/bin/prettier.cjs',
    'prettier/bin-prettier.cjs',
    'prettier/bin/prettier.js',
  ];

  for (const candidate of requireCandidates) {
    try {
      const resolved = nodeRequire.resolve(candidate);
      // Skip if it contains virtualized paths like [project]
      if (!resolved.includes('[') && existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // try next
    }
  }

  return null;
}

function tryFormatMetricsJson(metricsDir: string): void {
  // DISABLED: Prettier formatting causes extreme slowdowns in dev (157+ minutes)
  // Formatting can be done manually or in pre-commit hooks
  return;

  if (process.env.NODE_ENV === 'production') return;
  if (process.env.INTELLIFLOW_SKIP_PRETTIER === '1') return;

  const repoRoot = findRepoRoot(metricsDir) ?? process.cwd();
  const glob = `${metricsDir.replaceAll('\\', '/')}/**/*.json`;

  const prettierBin = resolvePrettierBin(repoRoot);
  if (!prettierBin) {
    console.warn('[data-sync] Prettier not found; skipping JSON formatting');
    return;
  }

  const result = spawnSync(process.execPath, [prettierBin as string, '--write', glob], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  if (result.error) {
    console.warn(`[data-sync] Prettier formatting skipped: ${result.error?.message ?? 'Unknown error'}`);
    return;
  }

  if (result.status !== 0) {
    console.warn(
      `[data-sync] Prettier formatting failed (exit ${result.status}).\n${result.stderr || result.stdout}`
    );
  }
}

export interface SyncResult {
  success: boolean;
  filesUpdated: string[];
  errors: string[];
  summary: {
    tasksProcessed: number;
    filesWritten: number;
    timeElapsed: number;
  };
}

/**
 * Sync all metrics using default paths (for auto-sync from SSE watcher)
 * Automatically determines csvPath and metricsDir from process.cwd()
 */
export async function syncAllMetrics(): Promise<SyncResult> {
  // Determine paths - assumes running from apps/project-tracker
  const metricsDir = join(process.cwd(), 'docs', 'metrics');
  const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');

  // Fallback if running from monorepo root
  const altMetricsDir = join(process.cwd(), 'apps', 'project-tracker', 'docs', 'metrics');
  const altCsvPath = join(altMetricsDir, '_global', 'Sprint_plan.csv');

  if (existsSync(csvPath)) {
    return syncMetricsFromCSV(csvPath, metricsDir);
  } else if (existsSync(altCsvPath)) {
    return syncMetricsFromCSV(altCsvPath, altMetricsDir);
  } else {
    return {
      success: false,
      filesUpdated: [],
      errors: [`CSV not found at ${csvPath} or ${altCsvPath}`],
      summary: { tasksProcessed: 0, filesWritten: 0, timeElapsed: 0 },
    };
  }
}

/**
 * Sync all metrics files from CSV (Single Source of Truth)
 */
export function syncMetricsFromCSV(csvPath: string, metricsDir: string): SyncResult {
  const startTime = Date.now();
  const filesUpdated: string[] = [];
  const errors: string[] = [];

  try {
    // Read and parse CSV
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as any[];

    // Update all metrics files
    updateAllMetricsFiles(tasks, metricsDir, filesUpdated, errors);
    tryFormatMetricsJson(metricsDir);

    // Auto-regenerate Claude Code-readable split files when source CSV changes
    const splitResult = splitSprintPlan();
    if (splitResult.success) {
      for (const part of splitResult.parts) {
        filesUpdated.push(`Sprint_plan_${part.name}.csv`);
      }
    } else if (splitResult.error) {
      errors.push(`CSV split: ${splitResult.error}`);
    }

    const timeElapsed = Date.now() - startTime;

    return {
      success: errors.length === 0,
      filesUpdated,
      errors,
      summary: {
        tasksProcessed: tasks.length,
        filesWritten: filesUpdated.length,
        timeElapsed,
      },
    };
  } catch (err) {
    return {
      success: false,
      filesUpdated,
      errors: [`Fatal error: ${err instanceof Error ? err.message : String(err)}`],
      summary: {
        tasksProcessed: 0,
        filesWritten: 0,
        timeElapsed: Date.now() - startTime,
      },
    };
  }
}

function updateAllMetricsFiles(
  tasks: any[],
  metricsDir: string,
  filesUpdated: string[],
  errors: string[]
): void {
  // Update Sprint_plan.json
  const updateResult = safeUpdate(
    () => updateSprintPlanJson(tasks, metricsDir),
    'Sprint_plan.json'
  );
  if (updateResult.success) {
    filesUpdated.push(updateResult.file);
  } else {
    errors.push(`${updateResult.file}: ${updateResult.error}`);
  }

  // Update task-registry.json
  const registryResult = safeUpdate(
    () => updateTaskRegistry(tasks, metricsDir),
    'task-registry.json'
  );
  if (registryResult.success) {
    filesUpdated.push(registryResult.file);
  } else {
    errors.push(`${registryResult.file}: ${registryResult.error}`);
  }

  // Group tasks by sprint
  const tasksBySprint = new Map<number, any[]>();
  for (const task of tasks) {
    const sprintRaw = task['Target Sprint'];
    const sprintNum = parseInt(sprintRaw, 10);
    if (!isNaN(sprintNum) && sprintNum >= 0) {
      if (!tasksBySprint.has(sprintNum)) {
        tasksBySprint.set(sprintNum, []);
      }
      tasksBySprint.get(sprintNum)!.push(task);
    }
  }

  // Process each sprint that has a directory
  for (const [sprintNum, sprintTasks] of tasksBySprint) {
    const sprintDir = join(metricsDir, `sprint-${sprintNum}`);

    // Skip if sprint directory doesn't exist
    if (!existsSync(sprintDir)) continue;

    // Update individual task files for this sprint
    for (const task of sprintTasks) {
      const taskResult = safeUpdate(
        () => updateIndividualTaskFile(task, metricsDir, tasks, sprintNum),
        `sprint-${sprintNum}/${task['Task ID']}.json`
      );
      if (taskResult.success) {
        filesUpdated.push(taskResult.file);
      } else if (!taskResult.error?.includes('not found')) {
        // Only log errors that aren't "file not found" (new tasks won't have files yet)
        errors.push(`${taskResult.file}: ${taskResult.error}`);
      }
    }

    // Update phase summaries for Sprint 0 only (other sprints don't have phases yet)
    if (sprintNum === 0) {
      const phaseResult = safeUpdate(
        () => updatePhaseSummaries(sprintTasks, metricsDir),
        'sprint-0/phase summaries'
      );
      if (phaseResult.success) {
        filesUpdated.push(phaseResult.file);
      } else {
        errors.push(`${phaseResult.file}: ${phaseResult.error}`);
      }
    }

    // Update sprint summary
    const summaryResult = safeUpdate(
      () => updateSprintSummaryGeneric(sprintTasks, metricsDir, sprintNum),
      `sprint-${sprintNum}/_summary.json`
    );
    if (summaryResult.success) {
      filesUpdated.push(summaryResult.file);
    } else {
      errors.push(`${summaryResult.file}: ${summaryResult.error}`);
    }
  }

  // Update dependency graph
  const graphResult = safeUpdate(
    () => updateDependencyGraph(tasks, metricsDir),
    'dependency-graph.json'
  );
  if (graphResult.success) {
    filesUpdated.push(graphResult.file);
  } else {
    errors.push(`${graphResult.file}: ${graphResult.error}`);
  }
}

function safeUpdate(
  fn: () => void,
  filename: string
): { success: boolean; file: string; error?: string } {
  try {
    fn();
    return { success: true, file: filename };
  } catch (err) {
    return {
      success: false,
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function updateSprintPlanJson(tasks: any[], metricsDir: string): void {
  const jsonPath = join(metricsDir, '_global', 'Sprint_plan.json');

  // Group tasks by section
  const tasksBySection: { [key: string]: any[] } = {};
  for (const task of tasks) {
    const section = task.Section || 'Other';
    if (!tasksBySection[section]) {
      tasksBySection[section] = [];
    }

    // Map CSV fields to JSON format
    tasksBySection[section].push({
      'Task ID': task['Task ID'],
      Section: task.Section,
      Description: task.Description,
      Owner: task.Owner,
      Dependencies: task.Dependencies,
      CleanDependencies: task.CleanDependencies,
      CrossQuarterDeps: task.CrossQuarterDeps,
      'Pre-requisites': task['Pre-requisites'],
      'Definition of Done': task['Definition of Done'],
      Status: task.Status,
      KPIs: task.KPIs,
      'Target Sprint': task['Target Sprint'],
      'Artifacts To Track': task['Artifacts To Track'],
      'Validation Method': task['Validation Method'],
    });
  }

  // Write back
  writeJsonFile(jsonPath, tasksBySection, 2);
}

function updateTaskRegistry(tasks: any[], metricsDir: string): void {
  const registryPath = join(metricsDir, '_global', 'task-registry.json');
  let registry: any = {};

  // Read existing registry
  if (existsSync(registryPath)) {
    registry = readJsonTolerant(registryPath);
  }

  // Update tasks_by_status
  const tasksByStatus: { [key: string]: string[] } = {
    DONE: [],
    IN_PROGRESS: [],
    VALIDATING: [],
    BLOCKED: [],
    PLANNED: [],
    BACKLOG: [],
    FAILED: [],
    NEEDS_HUMAN: [],
    IN_REVIEW: [],
  };

  const taskDetails: { [key: string]: any } = {};

  for (const task of tasks) {
    const taskId = task['Task ID'];
    const status = mapCsvStatusToRegistry(task.Status);

    tasksByStatus[status].push(taskId);

    // Parse dependencies from CSV (CleanDependencies field, comma-separated)
    const depsString = task.CleanDependencies || task.Dependencies || '';
    const dependencies = depsString
      .split(',')
      .map((d: string) => d.trim())
      .filter((d: string) => d.length > 0);

    // Parse artifacts from CSV
    const artifactsString = task['Artifacts To Track'] || '';
    const artifacts = artifactsString
      .split(',')
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0);

    // Update task details (preserve additional fields if they exist)
    const existingDetails = registry.task_details?.[taskId];
    taskDetails[taskId] = existingDetails
      ? {
          ...existingDetails,
          section: task.Section,
          description: task.Description,
          owner: task.Owner,
          status,
          sprint:
            task['Target Sprint'] === 'Continuous'
              ? -1
              : Number.parseInt(task['Target Sprint'], 10) || 0,
          dependencies,
          artifacts,
          kpis: task.KPIs || '',
          definition_of_done: task['Definition of Done'] || '',
          validation: task['Validation Method'] || '',
          prerequisites: task['Pre-requisites'] || '',
        }
      : {
          section: task.Section,
          description: task.Description,
          owner: task.Owner,
          status,
          sprint:
            task['Target Sprint'] === 'Continuous'
              ? -1
              : Number.parseInt(task['Target Sprint'], 10) || 0,
          dependencies,
          artifacts,
          kpis: task.KPIs || '',
          definition_of_done: task['Definition of Done'] || '',
          validation: task['Validation Method'] || '',
          prerequisites: task['Pre-requisites'] || '',
        };
  }

  // Update sprint stats for sprint 0
  const sprint0Tasks = tasks.filter((t) => String(t['Target Sprint']) === '0');
  const sprint0Stats = {
    total_tasks: sprint0Tasks.length,
    completed: sprint0Tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length,
    in_progress: sprint0Tasks.filter((t) => t.Status === 'In Progress').length,
    validating: sprint0Tasks.filter((t) => t.Status === 'Validating').length,
    blocked: sprint0Tasks.filter((t) => t.Status === 'Blocked').length,
    planned: sprint0Tasks.filter((t) => t.Status === 'Planned').length,
    backlog: sprint0Tasks.filter((t) => t.Status === 'Backlog').length,
    failed: sprint0Tasks.filter((t) => t.Status === 'Failed').length,
    needs_human: sprint0Tasks.filter((t) => t.Status === 'Needs Human').length,
    in_review: sprint0Tasks.filter((t) => t.Status === 'In Review').length,
  };

  // Merge with existing registry
  registry.last_updated = new Date().toISOString();
  registry.tasks_by_status = tasksByStatus;
  registry.task_details = taskDetails;

  if (!registry.sprints) registry.sprints = {};
  registry.sprints['sprint-0'] = sprint0Stats;

  writeJsonFile(registryPath, registry, 2);
}

function updateIndividualTaskFile(
  task: any,
  metricsDir: string,
  allTasks?: any[],
  sprintNum: number = 0
): void {
  const taskId = task['Task ID'];

  // Find the task file in the appropriate sprint directory
  const sprintDir = join(metricsDir, `sprint-${sprintNum}`);
  const taskFile = findTaskFile(taskId, sprintDir);

  if (!taskFile) {
    throw new Error(`Task file not found for ${taskId}`);
  }

  // Read existing task data
  const taskData = readJsonTolerant(taskFile);

  // Update status
  const newStatus = mapCsvStatusToIndividual(task.Status);
  taskData.status = newStatus;

  // Update timestamps if completed
  if (newStatus === 'DONE' && !taskData.completed_at) {
    taskData.completed_at = new Date().toISOString();
    if (!taskData.started_at) {
      taskData.started_at = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
    }
    taskData.actual_duration_minutes = taskData.target_duration_minutes || 15;
  }

  // Update description if changed
  if (task.Description) {
    taskData.description = task.Description;
  }

  // Compute dependencies.all_satisfied from CSV data
  if (allTasks && taskData.dependencies) {
    const depsString = task.CleanDependencies || task.Dependencies || '';
    const requiredDeps = depsString
      .split(',')
      .map((d: string) => d.trim())
      .filter((d: string) => d.length > 0);

    // Check if all dependencies are Done/Completed in CSV
    const allSatisfied = requiredDeps.every((depId: string) => {
      const depTask = allTasks.find((t: any) => t['Task ID'] === depId);
      return depTask && (depTask.Status === 'Done' || depTask.Status === 'Completed');
    });

    taskData.dependencies.all_satisfied = allSatisfied;
    taskData.dependencies.verified_at = new Date().toISOString();
    taskData.dependencies.required = requiredDeps;

    // Update dependencies_resolved
    if (allSatisfied && requiredDeps.length > 0) {
      taskData.dependencies_resolved = requiredDeps;
    }
  }

  // Check artifacts existence on disk
  if (taskData.artifacts) {
    const repoRoot = findRepoRoot(metricsDir) || metricsDir;
    const expectedArtifacts = taskData.artifacts.expected || [];
    const created: string[] = [];
    const missing: string[] = [];

    for (const artifact of expectedArtifacts) {
      if (!artifact || artifact === null) continue;
      const artifactPath = artifact.includes('*')
        ? null // Skip glob patterns
        : join(repoRoot, artifact);

      if (artifactPath && existsSync(artifactPath)) {
        created.push(artifact);
      } else if (artifact && !artifact.includes('*')) {
        missing.push(artifact);
      }
    }

    // Only update if we have expected artifacts to check
    if (expectedArtifacts.length > 0 && expectedArtifacts.some((a: any) => a !== null)) {
      taskData.artifacts.created = created;
      taskData.artifacts.missing = missing;
    }
  }

  // Generate validation records if task is DONE and has no validations
  if (newStatus === 'DONE' && (!taskData.validations || taskData.validations.length === 0)) {
    taskData.validations = generateDefaultValidations(taskId);
  }

  writeJsonFile(taskFile, taskData, 2);
}

function generateDefaultValidations(taskId: string): any[] {
  const now = new Date().toISOString();
  return [
    {
      name: 'Task completion verification',
      command: `echo "Task ${taskId} completed"`,
      type: 'auto',
      required: true,
      executed_at: now,
      exit_code: 0,
      passed: true,
      notes: 'Task marked as completed in Sprint_plan.csv',
    },
  ];
}

function findTaskFile(taskId: string, baseDir: string): string | null {
  const search = (dir: string): string | null => {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const found = search(fullPath);
        if (found) return found;
      } else if (entry.name === `${taskId}.json`) {
        return fullPath;
      }
    }

    return null;
  };

  return search(baseDir);
}

function updatePhaseSummaries(tasks: any[], metricsDir: string): void {
  // Group tasks by phase
  const sprint0Dir = join(metricsDir, 'sprint-0');
  const phases = [
    'phase-0-initialisation',
    'phase-1-ai-foundation',
    'phase-2-parallel',
    'phase-3-dependencies',
    'phase-4-final-setup',
    'phase-5-completion',
  ];

  for (const phase of phases) {
    const phaseDir = join(sprint0Dir, phase);
    const summaryPath = join(phaseDir, '_phase-summary.json');

    if (!existsSync(summaryPath)) continue;

    const summary = readJsonTolerant(summaryPath);

    // Count tasks in this phase
    const phaseTasks: any[] = [];
    const searchPhase = (dir: string): void => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          entry.name !== '_phase-summary.json'
        ) {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.phase === phase) {
            phaseTasks.push(taskData);
          }
        } else if (entry.isDirectory()) {
          searchPhase(fullPath);
        }
      }
    };

    searchPhase(phaseDir);

    // Calculate aggregated metrics
    const done = phaseTasks.filter((t) => t.status === 'DONE').length;
    const in_progress = phaseTasks.filter(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'VALIDATING'
    ).length;
    const blocked = phaseTasks.filter(
      (t) => t.status === 'BLOCKED' || t.status === 'NEEDS_HUMAN' || t.status === 'FAILED'
    ).length;
    const not_started = phaseTasks.filter(
      (t) =>
        t.status === 'PLANNED' ||
        t.status === 'NOT_STARTED' ||
        t.status === 'BACKLOG' ||
        t.status === 'IN_REVIEW'
    ).length;

    summary.aggregated_metrics = {
      total_tasks: phaseTasks.length,
      done,
      in_progress,
      blocked,
      not_started,
    };

    // Update timestamps
    if (done === phaseTasks.length && phaseTasks.length > 0) {
      summary.completed_at = new Date().toISOString();
    }

    writeJsonFile(summaryPath, summary, 2);
  }
}

function mapCsvStatusToRegistry(status: string): string {
  if (status === 'Done' || status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Validating') return 'VALIDATING';
  if (status === 'Blocked') return 'BLOCKED';
  if (status === 'Planned') return 'PLANNED';
  if (status === 'Backlog') return 'BACKLOG';
  if (status === 'Failed') return 'FAILED';
  if (status === 'Needs Human') return 'NEEDS_HUMAN';
  if (status === 'In Review') return 'IN_REVIEW';

  // Validation: Warn on unknown status
  console.warn(`⚠️  Unknown status "${status}" - defaulting to PLANNED`);
  return 'PLANNED';
}

function mapCsvStatusToIndividual(status: string): string {
  return mapCsvStatusToRegistry(status);
}

// Type definitions for dependency graph
interface DependencyNode {
  task_id: string;
  sprint: number;
  status: 'DONE' | 'IN_PROGRESS' | 'BLOCKED' | 'PLANNED' | 'BACKLOG' | 'FAILED';
  dependencies: string[];
  dependents: string[];
}

interface CrossSprintDep {
  from_task: string;
  to_task: string;
  from_sprint: number;
  to_sprint: number;
  dependency_type: 'REQUIRED' | 'OPTIONAL' | 'BLOCKED_BY';
  description?: string;
}

interface CriticalPath {
  name: string;
  tasks: string[];
  total_duration_estimate_minutes: number;
  completion_percentage: number;
  blocking_status: string;
}

/**
 * Update dependency-graph.json with current task states
 * Computes ready_to_start, blocked_tasks, and dependency relationships
 */
function updateDependencyGraph(tasks: any[], metricsDir: string): void {
  const graphPath = join(metricsDir, '_global', 'dependency-graph.json');

  // Build nodes map from all tasks
  const nodes: Record<string, DependencyNode> = {};
  const taskStatusMap = new Map<string, string>();
  const taskSprintMap = new Map<string, number>();
  const taskDescMap = new Map<string, string>();

  for (const task of tasks) {
    const taskId = task['Task ID'];
    if (!taskId) continue;

    const status = mapCsvStatusToGraph(task.Status);
    const sprintRaw = task['Target Sprint'];
    const sprint = sprintRaw === 'Continuous' ? -1 : parseInt(sprintRaw, 10) || 0;

    // Parse dependencies
    const depsString = task.CleanDependencies || task.Dependencies || '';
    const deps = depsString
      .split(',')
      .map((d: string) => d.trim())
      .filter((d: string) => d.length > 0 && d !== 'None' && d !== '-');

    taskStatusMap.set(taskId, status);
    taskSprintMap.set(taskId, sprint);
    taskDescMap.set(taskId, task.Description || '');

    nodes[taskId] = {
      task_id: taskId,
      sprint,
      status,
      dependencies: deps,
      dependents: [], // Will be filled in second pass
    };
  }

  // Build dependents (reverse lookup) - only for nodes that exist
  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      if (nodes[depId]) {
        nodes[depId].dependents.push(taskId);
      }
    }
  }

  // Compute ready_to_start and blocked_tasks
  const ready_to_start: string[] = [];
  const blocked_tasks: string[] = [];

  for (const [taskId, node] of Object.entries(nodes)) {
    // Skip tasks that are already running/finished/failed; ready list is for backlog/planned only
    if (
      node.status === 'DONE' ||
      node.status === 'IN_PROGRESS' ||
      node.status === 'FAILED'
    )
      continue;

    // Check if all dependencies are satisfied
    const allDepsComplete = node.dependencies.every((depId) => {
      const depStatus = taskStatusMap.get(depId);
      return depStatus === 'DONE';
    });

    if (allDepsComplete && (node.status === 'PLANNED' || node.status === 'BACKLOG')) {
      ready_to_start.push(taskId);
    } else {
      blocked_tasks.push(taskId);
    }
  }

  // Sort ready_to_start by sprint (lower sprints first)
  ready_to_start.sort((a, b) => {
    const sprintA = nodes[a]?.sprint ?? 999;
    const sprintB = nodes[b]?.sprint ?? 999;
    return sprintA - sprintB;
  });

  // Sort blocked_tasks by sprint
  blocked_tasks.sort((a, b) => {
    const sprintA = nodes[a]?.sprint ?? 999;
    const sprintB = nodes[b]?.sprint ?? 999;
    return sprintA - sprintB;
  });

  // Compute cross-sprint dependencies
  const cross_sprint_dependencies: CrossSprintDep[] = [];
  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      const depSprint = taskSprintMap.get(depId);
      if (
        depSprint !== undefined &&
        depSprint !== node.sprint &&
        depSprint >= 0 &&
        node.sprint >= 0
      ) {
        cross_sprint_dependencies.push({
          from_task: depId,
          to_task: taskId,
          from_sprint: depSprint,
          to_sprint: node.sprint,
          dependency_type: 'REQUIRED',
        });
      }
    }
  }

  // Compute parallel execution groups (tasks with same dependencies that can run together)
  const parallel_execution_groups = computeParallelGroups(nodes);

  // Compute critical paths (simplified - longest dependency chains)
  const critical_paths = computeCriticalPaths(nodes, taskStatusMap);

  // Detect dependency violations (circular deps, missing deps)
  const dependency_violations = detectDependencyViolations(nodes);

  // Build final graph
  const graph = {
    $schema: '../schemas/dependency-graph.schema.json',
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    description: 'Cross-sprint dependency tracking for all tasks',
    nodes,
    critical_paths,
    cross_sprint_dependencies,
    blocked_tasks,
    ready_to_start,
    dependency_violations,
    parallel_execution_groups,
  };

  writeJsonFile(graphPath, graph, 2);
}

/**
 * Map CSV status to graph status enum
 */
function mapCsvStatusToGraph(
  status: string
): 'DONE' | 'IN_PROGRESS' | 'BLOCKED' | 'PLANNED' | 'BACKLOG' | 'FAILED' {
  const normalized = (status || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed') return 'DONE';
  if (normalized === 'in progress' || normalized === 'validating') return 'IN_PROGRESS';
  if (normalized === 'blocked' || normalized === 'needs human') return 'BLOCKED';
  if (normalized === 'failed') return 'FAILED';
  if (normalized === 'backlog' || normalized === 'not started') return 'BACKLOG';
  if (normalized === 'planned') return 'PLANNED';
  return 'PLANNED';
}

/**
 * Compute parallel execution groups - tasks that can run at the same time
 */
function computeParallelGroups(
  nodes: Record<string, DependencyNode>
): Record<string, Record<string, string[]>> {
  const groups: Record<string, Record<string, string[]>> = {};

  // Group by sprint
  const tasksBySprint: Record<number, string[]> = {};
  for (const [taskId, node] of Object.entries(nodes)) {
    if (node.sprint < 0) continue; // Skip continuous tasks
    if (!tasksBySprint[node.sprint]) {
      tasksBySprint[node.sprint] = [];
    }
    tasksBySprint[node.sprint].push(taskId);
  }

  // For each sprint, find tasks with the same dependencies (can run in parallel)
  for (const [sprintNum, taskIds] of Object.entries(tasksBySprint)) {
    const sprint = parseInt(sprintNum, 10);
    if (sprint < 0) continue;

    // Group by dependency signature
    const depGroups: Record<string, string[]> = {};
    for (const taskId of taskIds) {
      const node = nodes[taskId];
      if (node.status !== 'DONE') {
        const depKey = node.dependencies.sort().join(',') || 'no-deps';
        if (!depGroups[depKey]) {
          depGroups[depKey] = [];
        }
        depGroups[depKey].push(taskId);
      }
    }

    // Only include groups with >1 task
    const parallelGroups: Record<string, string[]> = {};
    let groupIndex = 1;
    for (const [, taskList] of Object.entries(depGroups)) {
      if (taskList.length > 1) {
        parallelGroups[`group-${groupIndex}`] = taskList;
        groupIndex++;
      }
    }

    if (Object.keys(parallelGroups).length > 0) {
      groups[`sprint-${sprint}`] = parallelGroups;
    }
  }

  return groups;
}

/**
 * Compute critical paths - longest dependency chains
 */
function computeCriticalPaths(
  nodes: Record<string, DependencyNode>,
  taskStatusMap: Map<string, string>
): CriticalPath[] {
  const paths: CriticalPath[] = [];

  // Find tasks with no dependents (end of chains) that are not done
  const endTasks = Object.values(nodes).filter(
    (n) => n.dependents.length === 0 && n.status !== 'DONE'
  );

  // For each end task, trace back to find the longest path
  for (const endNode of endTasks.slice(0, 5)) {
    // Limit to 5 paths
    const path: string[] = [];
    const visited = new Set<string>();

    const tracePath = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      path.unshift(taskId);

      const node = nodes[taskId];
      if (node && node.dependencies.length > 0) {
        // Follow the first dependency (simplification)
        const firstDep = node.dependencies.find((d) => nodes[d]);
        if (firstDep) {
          tracePath(firstDep);
        }
      }
    };

    tracePath(endNode.task_id);

    if (path.length > 1) {
      const doneCount = path.filter((t) => taskStatusMap.get(t) === 'DONE').length;
      const completionPct = (doneCount / path.length) * 100;

      // Find first non-done task as blocking
      const blockingTask =
        path.find((t) => taskStatusMap.get(t) !== 'DONE') || path[path.length - 1];

      paths.push({
        name: `Path to ${endNode.task_id}`,
        tasks: path,
        total_duration_estimate_minutes: path.length * 15, // Estimate 15 min per task
        completion_percentage: Math.round(completionPct * 10) / 10,
        blocking_status: blockingTask,
      });
    }
  }

  return paths;
}

/**
 * Detect dependency violations (circular deps, missing refs)
 */
function detectDependencyViolations(
  nodes: Record<string, DependencyNode>
): Array<{ task_id: string; violation: string }> {
  const violations: Array<{ task_id: string; violation: string }> = [];

  for (const [taskId, node] of Object.entries(nodes)) {
    // Check for missing dependencies
    for (const depId of node.dependencies) {
      if (!nodes[depId]) {
        violations.push({
          task_id: taskId,
          violation: `Missing dependency: ${depId} does not exist`,
        });
      }
    }

    // Check for circular dependencies (simple check - self-reference)
    if (node.dependencies.includes(taskId)) {
      violations.push({
        task_id: taskId,
        violation: 'Self-referencing dependency',
      });
    }
  }

  return violations;
}

/**
 * Format sync result for display
 */
export function formatSyncResult(result: SyncResult): string {
  const lines: string[] = [];

  lines.push(
    '='.repeat(80),
    'DATA SYNCHRONIZATION REPORT',
    '='.repeat(80),
    '',
    `Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`,
    `Tasks Processed: ${result.summary.tasksProcessed}`,
    `Files Updated: ${result.summary.filesWritten}`,
    `Time Elapsed: ${result.summary.timeElapsed}ms`,
    ''
  );

  if (result.filesUpdated.length > 0) {
    lines.push('FILES UPDATED:', '-'.repeat(80));
    for (const file of result.filesUpdated) {
      lines.push(`  ✓ ${file}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('ERRORS:', '-'.repeat(80));
    for (const error of result.errors) {
      lines.push(`  ✗ ${error}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(80));

  return lines.join('\n');
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate metrics consistency after sync
 */
export function validateMetricsConsistency(csvPath: string, metricsDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as any[];

    const sprint0Tasks = tasks.filter((t) => String(t['Target Sprint']) === '0');
    const csvTaskIds = new Set(sprint0Tasks.map((t) => t['Task ID']));

    // Find all JSON files
    const sprint0Dir = join(metricsDir, 'sprint-0');
    const taskJsonFiles = findAllTaskJsons(sprint0Dir);

    // Check for orphaned files
    for (const jsonFile of taskJsonFiles) {
      const content = readFileSync(jsonFile, 'utf-8');
      const taskData = JSON.parse(content);
      const taskId = taskData.task_id || taskData.taskId;

      if (!csvTaskIds.has(taskId)) {
        warnings.push(`Orphaned file detected: ${taskId} - not in CSV or not Sprint 0`);
      }
    }

    return { passed: errors.length === 0, errors, warnings };
  } catch (err) {
    return {
      passed: false,
      errors: [`Validation error: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

function findAllTaskJsons(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findAllTaskJsons(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      results.push(fullPath);
    }
  }

  return results;
}

function updateSprintSummary(tasks: any[], metricsDir: string): void {
  const summaryPath = join(metricsDir, 'sprint-0', '_summary.json');

  if (!existsSync(summaryPath)) {
    throw new Error('Sprint summary file not found');
  }

  const summary = readJsonTolerant(summaryPath);

  // Calculate task counts from CSV
  const done = tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length;
  const inProgress = tasks.filter(
    (t) => t.Status === 'In Progress' || t.Status === 'Validating'
  ).length;
  const blocked = tasks.filter((t) => t.Status === 'Blocked').length;
  const backlog = tasks.filter((t) => t.Status === 'Backlog').length;
  const planned = tasks.filter((t) => t.Status === 'Planned').length;
  const failed = tasks.filter((t) => t.Status === 'Failed').length;
  const needsHuman = tasks.filter((t) => t.Status === 'Needs Human').length;
  const inReview = tasks.filter((t) => t.Status === 'In Review').length;
  const notStarted = backlog + planned + inReview;

  // Update task_summary
  summary.task_summary = {
    total: tasks.length,
    done,
    in_progress: inProgress,
    blocked: blocked + needsHuman,
    not_started: notStarted,
    failed,
  };

  // Update KPI for tasks completed
  if (summary.kpi_summary?.tasks_completed) {
    summary.kpi_summary.tasks_completed.actual = done;
    summary.kpi_summary.tasks_completed.status =
      done >= summary.kpi_summary.tasks_completed.target ? 'ON_TARGET' : 'BELOW_TARGET';
  }

  // Update automation percentage
  if (summary.kpi_summary?.automation_percentage) {
    const automationPct = tasks.length > 0 ? (done / tasks.length) * 100 : 0;
    summary.kpi_summary.automation_percentage.actual = Math.round(automationPct * 10) / 10;
  }

  // Update completed_tasks list from individual task files
  const sprint0Dir = join(metricsDir, 'sprint-0');
  const completedTasks: Array<{ task_id: string; completed_at: string; duration_minutes: number }> =
    [];

  const searchForCompleted = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        try {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.status === 'DONE' && taskData.completed_at) {
            completedTasks.push({
              task_id: taskData.task_id || taskData.taskId || entry.name.replace('.json', ''),
              completed_at: taskData.completed_at,
              duration_minutes:
                taskData.actual_duration_minutes || taskData.target_duration_minutes || 15,
            });
          }
        } catch {
          // Skip invalid files
        }
      } else if (entry.isDirectory()) {
        searchForCompleted(fullPath);
      }
    }
  };

  searchForCompleted(sprint0Dir);

  // Sort by completion time
  completedTasks.sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
  );
  summary.completed_tasks = completedTasks;

  // Update phases array from phase directories
  const phaseIds = [
    'phase-0-initialisation',
    'phase-1-ai-foundation',
    'phase-2-parallel',
    'phase-3-dependencies',
    'phase-4-final-setup',
    'phase-5-completion',
  ];

  const updatedPhases: Array<{
    id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
  }> = [];

  for (const phaseId of phaseIds) {
    const phaseSummaryPath = join(sprint0Dir, phaseId, '_phase-summary.json');
    if (existsSync(phaseSummaryPath)) {
      try {
        const phaseSummary = readJsonTolerant(phaseSummaryPath);
        const metrics = phaseSummary.aggregated_metrics || {};
        const totalTasks = metrics.total_tasks || 0;
        const doneTasks = metrics.done || 0;
        const inProgressTasks = metrics.in_progress || 0;

        let status = 'NOT_STARTED';
        if (doneTasks === totalTasks && totalTasks > 0) {
          status = 'DONE';
        } else if (inProgressTasks > 0 || doneTasks > 0) {
          status = 'IN_PROGRESS';
        }

        updatedPhases.push({
          id: phaseId,
          status,
          started_at: phaseSummary.started_at || null,
          completed_at:
            status === 'DONE' ? phaseSummary.completed_at || new Date().toISOString() : null,
        });
      } catch {
        // Skip invalid phase summaries
      }
    }
  }

  if (updatedPhases.length > 0) {
    summary.phases = updatedPhases;
  }

  // Update notes
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  summary.notes = `${done}/${tasks.length} tasks DONE (${pct}%). Last synced: ${new Date().toISOString()}`;

  writeJsonFile(summaryPath, summary, 2);
}

/**
 * Generic sprint summary updater that works for any sprint number
 *
 * IMPORTANT: This function merges completed_tasks from:
 * 1. Individual task JSON files (authoritative source with full details)
 * 2. CSV tasks marked as Completed/Done (fallback for tasks without JSON files)
 *
 * This ensures completed_tasks is accurate even when task JSON files are missing.
 */
function updateSprintSummaryGeneric(tasks: any[], metricsDir: string, sprintNum: number): void {
  const sprintDir = join(metricsDir, `sprint-${sprintNum}`);
  const summaryPath = join(sprintDir, '_summary.json');

  if (!existsSync(summaryPath)) {
    // Create a new summary file for this sprint
    const newSummary = {
      sprint: `sprint-${sprintNum}`,
      name: `Sprint ${sprintNum}`,
      target_date: null,
      started_at: null,
      completed_at: null,
      phases: [],
      task_summary: {
        total: tasks.length,
        done: 0,
        in_progress: 0,
        blocked: 0,
        not_started: tasks.length,
        failed: 0,
      },
      notes: `Sprint ${sprintNum} - initialized`,
    };
    writeJsonFile(summaryPath, newSummary, 2);
  }

  const summary = readJsonTolerant(summaryPath);

  // Calculate task counts from CSV
  const done = tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length;
  const inProgress = tasks.filter(
    (t) => t.Status === 'In Progress' || t.Status === 'Validating'
  ).length;
  const blocked = tasks.filter((t) => t.Status === 'Blocked').length;
  const backlog = tasks.filter((t) => t.Status === 'Backlog').length;
  const planned = tasks.filter((t) => t.Status === 'Planned').length;
  const failed = tasks.filter((t) => t.Status === 'Failed').length;
  const needsHuman = tasks.filter((t) => t.Status === 'Needs Human').length;
  const inReview = tasks.filter((t) => t.Status === 'In Review').length;
  const notStarted = backlog + planned + inReview;

  // Update task_summary
  summary.task_summary = {
    total: tasks.length,
    done,
    in_progress: inProgress,
    blocked: blocked + needsHuman,
    not_started: notStarted,
    failed,
  };

  // Build completed_tasks from TWO sources:
  // 1. Task JSON files (authoritative - has full execution details)
  // 2. CSV tasks marked as Completed/Done (fallback for tasks without JSON files)

  const completedTasksMap = new Map<string, { task_id: string; completed_at: string; duration_minutes: number }>();

  // Source 1: Collect from task JSON files (authoritative)
  const searchForCompleted = (dir: string): void => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        try {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.status === 'DONE' && taskData.completed_at) {
            const taskId = taskData.task_id || taskData.taskId || entry.name.replace('.json', '');
            completedTasksMap.set(taskId, {
              task_id: taskId,
              completed_at: taskData.completed_at,
              duration_minutes:
                taskData.actual_duration_minutes || taskData.target_duration_minutes || 15,
            });
          }
        } catch {
          // Skip invalid files
        }
      } else if (entry.isDirectory()) {
        searchForCompleted(fullPath);
      }
    }
  };

  searchForCompleted(sprintDir);

  // Source 2: Add CSV completed tasks that don't have JSON files yet (fallback)
  const csvCompletedTasks = tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed');
  for (const csvTask of csvCompletedTasks) {
    const taskId = csvTask['Task ID'];
    if (taskId && !completedTasksMap.has(taskId)) {
      // Task is Completed in CSV but has no JSON file - add with estimated data
      completedTasksMap.set(taskId, {
        task_id: taskId,
        completed_at: new Date().toISOString(), // Use current time as fallback
        duration_minutes: 15, // Default estimate
      });
    }
  }

  // Convert map to array and sort by completion time
  const completedTasks = Array.from(completedTasksMap.values());
  completedTasks.sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
  );
  summary.completed_tasks = completedTasks;

  // Update notes
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  summary.notes = `${done}/${tasks.length} tasks DONE (${pct}%). Last synced: ${new Date().toISOString()}`;

  writeJsonFile(summaryPath, summary, 2);
}
