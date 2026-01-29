#!/usr/bin/env tsx

/**
 * Sprint Data Validation Script
 *
 * Validates consistency between Sprint_plan.csv and JSON task files.
 * This is a DATA CONSISTENCY validator, NOT a completion validator.
 *
 * Validates:
 * 1. CSV structure (required headers, no duplicates)
 * 2. Status values are from allowed list
 * 3. JSON files match CSV data (status, description)
 * 4. _summary.json counts match CSV counts
 * 5. No orphaned JSON files (tasks not in CSV)
 * 6. All sprint tasks have corresponding JSON files
 *
 * Exit Codes:
 * - 0: All consistency checks passed (or only WARNs in default mode)
 * - 1: Consistency errors found (or WARNs in strict mode)
 *
 * Usage:
 *   pnpm run validate:sprint-data                  # Default mode, Sprint 0
 *   pnpm run validate:sprint-data -- --sprint 1    # Default mode, Sprint 1
 *   pnpm run validate:sprint-data -- --strict      # Strict mode, Sprint 0
 *   pnpm run validate:sprint-data -- --strict --sprint 1  # Strict mode, Sprint 1
 *
 * @module tools/scripts/validate-sprint-data
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  log,
  logSection,
  logHeader,
  logGate,
  isStrictMode,
  resolveSprintPlanPath,
  getMetricsDir,
  parseSprintCsv,
  createSummary,
  printSummary,
  getExitCode,
  findRepoRoot,
  type GateResult,
  type SprintTask,
} from './lib/validation-utils.js';

// ============================================================================
// Configuration
// ============================================================================

const ALLOWED_STATUSES = ['Done', 'Completed', 'In Progress', 'Blocked', 'Planned', 'Backlog'];

const repoRoot = findRepoRoot();

function getArgValue(names: string[]): string | undefined {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) continue;

    for (const name of names) {
      if (current === name) return args[index + 1];
      if (current.startsWith(`${name}=`)) return current.slice(name.length + 1);
    }
  }
  return undefined;
}

function resolveTargetSprint(): { sprint: string; error?: string } {
  const raw = getArgValue(['--sprint']);
  if (!raw) return { sprint: '0' };

  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith('sprint-') ? trimmed.slice('sprint-'.length) : trimmed;
  if (!/^\d+$/.test(withoutPrefix)) {
    return {
      sprint: '0',
      error: `Invalid --sprint "${raw}" (expected an integer like 0, 1, 2...)`,
    };
  }
  return { sprint: withoutPrefix };
}

// ============================================================================
// Helpers
// ============================================================================

function findAllTaskJsons(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...findAllTaskJsons(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore read errors
  }

  return results;
}

function mapCsvToJsonStatus(csvStatus: string): string {
  const map: Record<string, string> = {
    Done: 'DONE',
    Completed: 'DONE',
    'In Progress': 'IN_PROGRESS',
    Blocked: 'BLOCKED',
    Planned: 'PLANNED',
    Backlog: 'BACKLOG',
  };
  return map[csvStatus] || 'UNKNOWN';
}

function normalizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\s+/g, ' ');
}

type ParsedTaskJson = {
  taskId: string;
  status: string;
  description: string;
  filePath: string;
  repoRelativePath: string;
};

function indexTaskJsonFiles(taskJsonFiles: string[]): {
  byId: Map<string, ParsedTaskJson>;
  parseErrors: string[];
  missingTaskIdFiles: string[];
  duplicateTaskIds: string[];
} {
  const byId = new Map<string, ParsedTaskJson>();
  const parseErrors: string[] = [];
  const missingTaskIdFiles: string[] = [];
  const duplicateTaskIds: string[] = [];

  for (const jsonFile of taskJsonFiles) {
    const repoRelativePath = jsonFile.replace(repoRoot, '').replace(/\\/g, '/');
    try {
      const raw = readFileSync(jsonFile, 'utf-8');
      const data = JSON.parse(raw);
      const taskId: unknown = data?.task_id ?? data?.taskId;

      if (typeof taskId !== 'string' || taskId.trim().length === 0) {
        missingTaskIdFiles.push(repoRelativePath || jsonFile);
        continue;
      }

      if (byId.has(taskId)) {
        duplicateTaskIds.push(taskId);
        continue;
      }

      byId.set(taskId, {
        taskId,
        status: normalizeText(data?.status).toUpperCase(),
        description: normalizeText(data?.description),
        filePath: jsonFile,
        repoRelativePath: repoRelativePath || jsonFile,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      parseErrors.push(`${repoRelativePath || jsonFile}: ${msg}`);
    }
  }

  return { byId, parseErrors, missingTaskIdFiles, duplicateTaskIds };
}

// ============================================================================
// Gate: CSV Structure
// ============================================================================

function validateCsvStructure(tasks: SprintTask[]): GateResult[] {
  logSection('Gate 1: CSV Structure');
  const results: GateResult[] = [];

  // Check for duplicate Task IDs
  const taskIds = tasks.map((t) => t['Task ID']);
  const duplicates = taskIds.filter((id, idx) => taskIds.indexOf(id) !== idx);
  const uniqueDuplicates = [...new Set(duplicates)];

  if (uniqueDuplicates.length > 0) {
    const result: GateResult = {
      name: 'CSV: Task ID Uniqueness',
      severity: 'FAIL',
      message: `Found ${uniqueDuplicates.length} duplicate Task ID(s)`,
      details: uniqueDuplicates.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'CSV: Task ID Uniqueness',
      severity: 'PASS',
      message: `All ${taskIds.length} Task IDs are unique`,
    };
    results.push(result);
    logGate(result);
  }

  // Check for invalid statuses
  const invalidStatuses: { taskId: string; status: string }[] = [];
  for (const task of tasks) {
    const status = task.Status;
    if (status && !ALLOWED_STATUSES.includes(status)) {
      invalidStatuses.push({ taskId: task['Task ID'], status });
    }
  }

  if (invalidStatuses.length > 0) {
    const result: GateResult = {
      name: 'CSV: Status Values',
      severity: 'FAIL',
      message: `Found ${invalidStatuses.length} invalid status value(s)`,
      details: invalidStatuses.slice(0, 5).map((i) => `${i.taskId}: "${i.status}"`),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'CSV: Status Values',
      severity: 'PASS',
      message: `All status values are valid`,
    };
    results.push(result);
    logGate(result);
  }

  return results;
}

// ============================================================================
// Gate: Sprint Task Counts
// ============================================================================

function validateSprintCounts(
  tasks: SprintTask[],
  metricsDir: string,
  targetSprint: string
): GateResult[] {
  logSection(`Gate 2: Sprint ${targetSprint} Task Counts`);
  const results: GateResult[] = [];

  const sprintTasks = tasks.filter((t) => String(t['Target Sprint']) === targetSprint);

  // Count by status
  const statusCounts = {
    done: sprintTasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length,
    in_progress: sprintTasks.filter((t) => t.Status === 'In Progress').length,
    blocked: sprintTasks.filter((t) => t.Status === 'Blocked').length,
    planned: sprintTasks.filter((t) => t.Status === 'Planned').length,
    backlog: sprintTasks.filter((t) => t.Status === 'Backlog').length,
  };

  log(`   Sprint ${targetSprint} tasks: ${sprintTasks.length}`, 'gray');
  log(`   - Completed: ${statusCounts.done}`, 'gray');
  log(`   - In Progress: ${statusCounts.in_progress}`, 'gray');
  log(`   - Planned: ${statusCounts.planned}`, 'gray');
  log(`   - Backlog: ${statusCounts.backlog}`, 'gray');
  log(`   - Blocked: ${statusCounts.blocked}`, 'gray');

  // Check _summary.json consistency
  const summaryPath = join(metricsDir, `sprint-${targetSprint}`, '_summary.json');
  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
      const summaryTotal = summary.task_summary?.total || 0;
      const summaryDone = summary.task_summary?.done || 0;
      const summaryInProgress = summary.task_summary?.in_progress || 0;

      const mismatches: string[] = [];

      if (summaryTotal !== sprintTasks.length) {
        mismatches.push(`total: summary=${summaryTotal} vs csv=${sprintTasks.length}`);
      }
      if (summaryDone !== statusCounts.done) {
        mismatches.push(`done: summary=${summaryDone} vs csv=${statusCounts.done}`);
      }
      if (summaryInProgress !== statusCounts.in_progress) {
        mismatches.push(
          `in_progress: summary=${summaryInProgress} vs csv=${statusCounts.in_progress}`
        );
      }

      if (mismatches.length > 0) {
        const result: GateResult = {
          name: 'Summary: Count Consistency',
          severity: 'WARN',
          message: `_summary.json counts don't match CSV`,
          details: mismatches,
        };
        results.push(result);
        logGate(result);
      } else {
        const result: GateResult = {
          name: 'Summary: Count Consistency',
          severity: 'PASS',
          message: `_summary.json counts match CSV`,
        };
        results.push(result);
        logGate(result);
      }
    } catch (error) {
      const result: GateResult = {
        name: 'Summary: Count Consistency',
        severity: 'WARN',
        message: `Could not parse _summary.json`,
      };
      results.push(result);
      logGate(result);
    }
  } else {
    const result: GateResult = {
      name: 'Summary: Count Consistency',
      severity: 'WARN',
      message: `_summary.json not found`,
    };
    results.push(result);
    logGate(result);
  }

  return results;
}

// ============================================================================
// Gate: JSON File Consistency
// ============================================================================

function validateJsonFiles(
  tasks: SprintTask[],
  metricsDir: string,
  targetSprint: string
): GateResult[] {
  logSection('Gate 3: JSON File Consistency');
  const results: GateResult[] = [];

  const sprintDir = join(metricsDir, `sprint-${targetSprint}`);
  const taskJsonFiles = findAllTaskJsons(sprintDir);
  const sprintTasks = tasks.filter((t) => String(t['Target Sprint']) === targetSprint);
  const csvTaskIds = new Set(sprintTasks.map((t) => t['Task ID']));

  log(`   Found ${taskJsonFiles.length} task JSON files`, 'gray');

  const index = indexTaskJsonFiles(taskJsonFiles);

  if (index.parseErrors.length > 0) {
    const result: GateResult = {
      name: 'JSON: Parse Errors',
      severity: 'FAIL',
      message: `Failed to parse ${index.parseErrors.length} task JSON file(s)`,
      details: index.parseErrors.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: Parse Errors',
      severity: 'PASS',
      message: `All task JSON files are valid JSON`,
    };
    results.push(result);
    logGate(result);
  }

  if (index.missingTaskIdFiles.length > 0) {
    const result: GateResult = {
      name: 'JSON: task_id Presence',
      severity: 'FAIL',
      message: `Missing task_id/taskId in ${index.missingTaskIdFiles.length} task JSON file(s)`,
      details: index.missingTaskIdFiles.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: task_id Presence',
      severity: 'PASS',
      message: `All task JSON files contain task_id`,
    };
    results.push(result);
    logGate(result);
  }

  if (index.duplicateTaskIds.length > 0) {
    const result: GateResult = {
      name: 'JSON: Task ID Uniqueness',
      severity: 'FAIL',
      message: `Found ${index.duplicateTaskIds.length} duplicate task_id value(s)`,
      details: index.duplicateTaskIds.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: Task ID Uniqueness',
      severity: 'PASS',
      message: `All task_id values are unique`,
    };
    results.push(result);
    logGate(result);
  }

  // Check for orphaned JSON files
  const orphanedFiles = [...index.byId.values()]
    .filter((entry) => !csvTaskIds.has(entry.taskId))
    .map((entry) => `${entry.taskId} (${entry.repoRelativePath})`);

  if (orphanedFiles.length > 0) {
    const result: GateResult = {
      name: 'JSON: Orphaned Files',
      severity: 'WARN',
      message: `Found ${orphanedFiles.length} orphaned JSON file(s)`,
      details: orphanedFiles.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: Orphaned Files',
      severity: 'PASS',
      message: `No orphaned JSON files`,
    };
    results.push(result);
    logGate(result);
  }

  // Check for missing JSON files
  const missingFiles = sprintTasks
    .map((t) => t['Task ID'])
    .filter((taskId) => !index.byId.has(taskId));

  if (missingFiles.length > 0) {
    const result: GateResult = {
      name: 'JSON: Missing Files',
      severity: 'WARN',
      message: `Missing JSON for ${missingFiles.length} Sprint ${targetSprint} task(s)`,
      details: missingFiles.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: Missing Files',
      severity: 'PASS',
      message: `All Sprint ${targetSprint} tasks have JSON files`,
    };
    results.push(result);
    logGate(result);
  }

  // Check status mismatches
  const statusMismatches: string[] = [];
  for (const task of sprintTasks) {
    const taskId = task['Task ID'];
    const entry = index.byId.get(taskId);
    if (!entry) continue;

    const expectedStatus = mapCsvToJsonStatus(task.Status);
    if (entry.status !== expectedStatus) {
      statusMismatches.push(
        `${taskId}: CSV="${task.Status}" -> expected "${expectedStatus}", got "${entry.status}"`
      );
    }
  }

  if (statusMismatches.length > 0) {
    const result: GateResult = {
      name: 'JSON: Status Consistency',
      severity: 'WARN',
      message: `Found ${statusMismatches.length} status mismatch(es)`,
      details: statusMismatches.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: Status Consistency',
      severity: 'PASS',
      message: `All JSON statuses match CSV`,
    };
    results.push(result);
    logGate(result);
  }

  // Check description mismatches (normalized whitespace)
  const descriptionMismatches: string[] = [];
  for (const task of sprintTasks) {
    const taskId = task['Task ID'];
    const entry = index.byId.get(taskId);
    if (!entry) continue;

    const csvDescription = normalizeText(task.Description);
    const jsonDescription = normalizeText(entry.description);

    if (csvDescription && jsonDescription && csvDescription !== jsonDescription) {
      descriptionMismatches.push(
        `${taskId}: CSV and JSON descriptions differ (${entry.repoRelativePath})`
      );
    }
  }

  if (descriptionMismatches.length > 0) {
    const result: GateResult = {
      name: 'JSON: Description Consistency',
      severity: 'WARN',
      message: `Found ${descriptionMismatches.length} description mismatch(es)`,
      details: descriptionMismatches.slice(0, 5),
    };
    results.push(result);
    logGate(result);
  } else {
    const result: GateResult = {
      name: 'JSON: Description Consistency',
      severity: 'PASS',
      message: `All JSON descriptions match CSV (normalized)`,
    };
    results.push(result);
    logGate(result);
  }

  return results;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  logHeader('IntelliFlow CRM - Sprint Data Validation');

  const sprintArg = resolveTargetSprint();
  if (sprintArg.error) {
    log(`\n[FAIL] ${sprintArg.error}`, 'red');
    process.exit(1);
  }

  const mode = isStrictMode() ? 'STRICT' : 'DEFAULT';
  log(`\nMode: ${mode}`, isStrictMode() ? 'yellow' : 'blue');
  log(`Repo: ${repoRoot}`, 'gray');
  log(`Sprint: ${sprintArg.sprint}`, 'gray');

  // Resolve paths
  const csvPath = resolveSprintPlanPath(repoRoot);
  const metricsDir = getMetricsDir(repoRoot);

  if (!csvPath) {
    log('\n[FAIL] Sprint_plan.csv not found', 'red');
    log('Checked locations:', 'gray');
    log('  - SPRINT_PLAN_PATH env variable', 'gray');
    log('  - apps/project-tracker/docs/metrics/_global/Sprint_plan.csv', 'gray');
    log('  - Sprint_plan.csv (repo root)', 'gray');
    process.exit(1);
  }

  log(`\nResolved paths:`, 'gray');
  log(`  CSV: ${csvPath}`, 'gray');
  log(`  Metrics: ${metricsDir}`, 'gray');

  // Parse CSV
  const csvContent = readFileSync(csvPath, 'utf-8');
  const { tasks, errors } = parseSprintCsv(csvContent);

  if (errors.length > 0) {
    log('\n[FAIL] CSV parsing errors:', 'red');
    for (const error of errors) {
      log(`  ${error}`, 'red');
    }
    process.exit(1);
  }

  log(`\nParsed ${tasks.length} tasks from CSV`, 'gray');

  // Run all gates
  const allResults: GateResult[] = [];

  allResults.push(...validateCsvStructure(tasks));
  allResults.push(...validateSprintCounts(tasks, metricsDir, sprintArg.sprint));
  allResults.push(...validateJsonFiles(tasks, metricsDir, sprintArg.sprint));

  // Summary
  const summary = createSummary(allResults);
  printSummary(summary);

  // Final message - explicitly state what this script does and doesn't do
  const exitCode = getExitCode(summary);

  if (exitCode === 0) {
    if (summary.warnCount > 0) {
      log('\n[OK] Sprint data consistency checks passed (with warnings).', 'yellow');
    } else {
      log('\n[OK] Sprint data consistency checks passed.', 'green');
    }
  } else {
    log('\n[FAIL] Sprint data consistency checks failed.', 'red');
  }

  // Explicit clarification
  log('\nNote: This validates DATA CONSISTENCY only. It does NOT:', 'gray');
  log('      - Verify sprint completion (use validate:sprint for that)', 'gray');
  log('      - Run tests or code quality checks', 'gray');

  // Suggestion for fixing sync issues
  if (summary.warnCount > 0 || summary.failCount > 0) {
    log('\nTo fix sync issues, run:', 'cyan');
    log('  cd apps/project-tracker && npx tsx scripts/sync-metrics.ts', 'gray');
  }

  process.exit(exitCode);
}

main();
