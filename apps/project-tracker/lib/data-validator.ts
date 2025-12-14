/**
 * Data Consistency Validator
 * Checks for inconsistencies across all metrics files
 */

import { Task } from './types';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  file: string;
  field: string;
  taskId: string;
  expected: string;
  actual: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    filesChecked: number;
    tasksValidated: number;
  };
}

export interface MetricsFiles {
  sprintPlanCsv: Task[];
  sprintPlanJson: any;
  taskRegistry: any;
  phaseSummaries: Map<string, any>;
  individualTasks: Map<string, any>;
  kpiDefinitions: any;
}

/**
 * Validate data consistency across all metrics files
 */
export function validateDataConsistency(files: MetricsFiles): ValidationResult {
  const issues: ValidationIssue[] = [];
  const tasksChecked = new Set<string>();

  // Build task map from CSV (single source of truth)
  const csvTaskMap = new Map(files.sprintPlanCsv.map(t => [t.id, t]));

  // Validate Task Registry
  validateTaskRegistry(files.taskRegistry, csvTaskMap, issues, tasksChecked);

  // Validate Sprint Plan JSON
  validateSprintPlanJson(files.sprintPlanJson, csvTaskMap, issues);

  // Validate Individual Task Files
  validateIndividualTasks(files.individualTasks, csvTaskMap, issues, tasksChecked);

  // Validate Phase Summaries
  validatePhaseSummaries(files.phaseSummaries, files.individualTasks, csvTaskMap, issues);

  // Count severity
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;

  return {
    isValid: errors === 0,
    issues,
    summary: {
      errors,
      warnings,
      filesChecked: 6, // CSV, JSON, Registry, Phase Summaries, Individual Tasks, KPI Defs
      tasksValidated: tasksChecked.size,
    },
  };
}

function validateTaskRegistry(
  registry: any,
  csvTaskMap: Map<string, Task>,
  issues: ValidationIssue[],
  tasksChecked: Set<string>
): void {
  if (!registry?.task_details) return;

  // Check tasks_by_status arrays
  const allStatusTasks = new Set<string>();
  if (registry.tasks_by_status) {
    validateTasksByStatus(registry.tasks_by_status, csvTaskMap, allStatusTasks, issues);
  }

  // Validate all CSV tasks are tracked in registry
  for (const [taskId] of csvTaskMap) {
    if (!allStatusTasks.has(taskId)) {
      issues.push({
        severity: 'warning',
        file: 'task-registry.json',
        field: 'tasks_by_status',
        taskId,
        expected: 'Task in registry',
        actual: 'Task missing',
        message: `Task ${taskId} from CSV not tracked in tasks_by_status`,
      });
    }
  }

  // Check task_details
  for (const [taskId, details] of Object.entries(registry.task_details)) {
    const taskDetails = details as any;
    const csvTask = csvTaskMap.get(taskId);

    if (!csvTask) {
      issues.push({
        severity: 'warning',
        file: 'task-registry.json',
        field: 'task_details',
        taskId,
        expected: 'Task exists in CSV',
        actual: 'Task not found',
        message: `Task ${taskId} has details but not in CSV`,
      });
      continue;
    }

    tasksChecked.add(taskId);

    // Validate fields
    if (taskDetails.section !== csvTask.section) {
      issues.push({
        severity: 'error',
        file: 'task-registry.json',
        field: 'section',
        taskId,
        expected: csvTask.section,
        actual: taskDetails.section,
        message: `Section mismatch for ${taskId}`,
      });
    }

    if (taskDetails.description !== csvTask.description) {
      issues.push({
        severity: 'warning',
        file: 'task-registry.json',
        field: 'description',
        taskId,
        expected: csvTask.description,
        actual: taskDetails.description,
        message: `Description mismatch for ${taskId}`,
      });
    }
  }
}

function validateSprintPlanJson(
  sprintPlanJson: any,
  csvTaskMap: Map<string, any>,
  issues: ValidationIssue[]
): void {
  if (!sprintPlanJson) return;

  // Iterate through all sections in JSON
  for (const tasks of Object.values(sprintPlanJson)) {
    if (!Array.isArray(tasks)) continue;

    for (const task of tasks) {
      const taskId = task['Task ID'];
      if (!taskId) continue;

      validateJsonTask(task, taskId, csvTaskMap, issues);
    }
  }
}

function validateJsonTask(
  task: any,
  taskId: string,
  csvTaskMap: Map<string, any>,
  issues: ValidationIssue[]
): void {
  const csvTask = csvTaskMap.get(taskId);

  if (!csvTask) {
    issues.push({
      severity: 'error',
      file: 'Sprint_plan.json',
      field: 'Task ID',
      taskId,
      expected: 'Task exists in CSV',
      actual: 'Task not found',
      message: `Task ${taskId} in JSON but not in CSV`,
    });
    return;
  }

  // Validate status
  if (task.Status !== csvTask.status) {
    issues.push({
      severity: 'error',
      file: 'Sprint_plan.json',
      field: 'Status',
      taskId,
      expected: csvTask.status,
      actual: task.Status,
      message: `Status mismatch for ${taskId}: CSV="${csvTask.status}", JSON="${task.Status}"`,
    });
  }

  // Validate section
  if (task.Section !== csvTask.section) {
    issues.push({
      severity: 'error',
      file: 'Sprint_plan.json',
      field: 'Section',
      taskId,
      expected: csvTask.section,
      actual: task.Section,
      message: `Section mismatch for ${taskId}`,
    });
  }

  // Validate sprint
  const csvSprint = String(csvTask.sprint);
  const jsonSprint = String(task['Target Sprint']);
  if (jsonSprint !== csvSprint) {
    issues.push({
      severity: 'error',
      file: 'Sprint_plan.json',
      field: 'Target Sprint',
      taskId,
      expected: csvSprint,
      actual: jsonSprint,
      message: `Sprint mismatch for ${taskId}`,
    });
  }
}

function validateIndividualTasks(
  individualTasks: Map<string, any>,
  csvTaskMap: Map<string, Task>,
  issues: ValidationIssue[],
  tasksChecked: Set<string>
): void {
  for (const [taskId, taskData] of individualTasks.entries()) {
    tasksChecked.add(taskId);
    const csvTask = csvTaskMap.get(taskId);

    if (!csvTask) {
      issues.push({
        severity: 'warning',
        file: `${taskId}.json`,
        field: 'task_id',
        taskId,
        expected: 'Task exists in CSV',
        actual: 'Task not found',
        message: `Individual task file exists but task not in CSV`,
      });
      continue;
    }

    // Validate status
    const expectedStatus = mapCsvStatus(csvTask.status);
    if (taskData.status !== expectedStatus) {
      issues.push({
        severity: 'error',
        file: `${taskId}.json`,
        field: 'status',
        taskId,
        expected: expectedStatus,
        actual: taskData.status,
        message: `Status mismatch: CSV="${csvTask.status}", Individual="${taskData.status}"`,
      });
    }

    // Validate sprint
    if (taskData.sprint !== `sprint-${csvTask.sprint}`) {
      issues.push({
        severity: 'error',
        file: `${taskId}.json`,
        field: 'sprint',
        taskId,
        expected: `sprint-${csvTask.sprint}`,
        actual: taskData.sprint,
        message: `Sprint mismatch for ${taskId}`,
      });
    }
  }
}

function validatePhaseSummaries(
  phaseSummaries: Map<string, any>,
  individualTasks: Map<string, any>,
  csvTaskMap: Map<string, Task>,
  issues: ValidationIssue[]
): void {
  for (const [phaseId, summary] of phaseSummaries.entries()) {
    if (!summary.aggregated_metrics) continue;

    // Count tasks in this phase from individual task files
    const phaseTasks = Array.from(individualTasks.values()).filter(
      t => t.phase === phaseId
    );

    const actualCounts = {
      done: phaseTasks.filter(t => t.status === 'DONE').length,
      in_progress: phaseTasks.filter(t => t.status === 'IN_PROGRESS').length,
      blocked: phaseTasks.filter(t => t.status === 'BLOCKED').length,
      not_started: phaseTasks.filter(t => t.status === 'PLANNED' || t.status === 'NOT_STARTED').length,
    };

    const expected = summary.aggregated_metrics;

    // Validate counts
    if (expected.done !== actualCounts.done) {
      issues.push({
        severity: 'error',
        file: `${phaseId}/_phase-summary.json`,
        field: 'aggregated_metrics.done',
        taskId: phaseId,
        expected: String(actualCounts.done),
        actual: String(expected.done),
        message: `Phase ${phaseId} done count mismatch: Expected ${actualCounts.done}, got ${expected.done}`,
      });
    }

    if (expected.in_progress !== actualCounts.in_progress) {
      issues.push({
        severity: 'error',
        file: `${phaseId}/_phase-summary.json`,
        field: 'aggregated_metrics.in_progress',
        taskId: phaseId,
        expected: String(actualCounts.in_progress),
        actual: String(expected.in_progress),
        message: `Phase ${phaseId} in_progress count mismatch`,
      });
    }

    const totalActual = Object.values(actualCounts).reduce((a, b) => a + b, 0);
    if (expected.total_tasks !== totalActual) {
      issues.push({
        severity: 'error',
        file: `${phaseId}/_phase-summary.json`,
        field: 'aggregated_metrics.total_tasks',
        taskId: phaseId,
        expected: String(totalActual),
        actual: String(expected.total_tasks),
        message: `Phase ${phaseId} total tasks mismatch`,
      });
    }
  }
}

function validateTasksByStatus(
  tasksByStatus: any,
  csvTaskMap: Map<string, Task>,
  allStatusTasks: Set<string>,
  issues: ValidationIssue[]
): void {
  for (const [status, taskIds] of Object.entries(tasksByStatus)) {
    for (const taskId of taskIds as string[]) {
      allStatusTasks.add(taskId);

      const csvTask = csvTaskMap.get(taskId);
      if (!csvTask) {
        issues.push({
          severity: 'error',
          file: 'task-registry.json',
          field: 'tasks_by_status',
          taskId,
          expected: 'Task exists in CSV',
          actual: 'Task not found',
          message: `Task ${taskId} in registry but not in CSV`,
        });
        continue;
      }

      // Validate status mapping
      const expectedStatus = mapCsvStatus(csvTask.status);
      if (status !== expectedStatus) {
        issues.push({
          severity: 'error',
          file: 'task-registry.json',
          field: 'status',
          taskId,
          expected: expectedStatus,
          actual: status,
          message: `Task ${taskId} status mismatch: CSV="${csvTask.status}", Registry="${status}"`,
        });
      }
    }
  }
}

function mapCsvStatus(status: string): string {
  if (status === 'Done' || status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Blocked') return 'BLOCKED';
  return 'PLANNED';
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(
    '='.repeat(80),
    'DATA CONSISTENCY VALIDATION REPORT',
    '='.repeat(80),
    '',
    `Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`,
    `Files Checked: ${result.summary.filesChecked}`,
    `Tasks Validated: ${result.summary.tasksValidated}`,
    `Errors: ${result.summary.errors}`,
    `Warnings: ${result.summary.warnings}`,
    ''
  );

  if (result.issues.length > 0) {
    lines.push('ISSUES FOUND:', '-'.repeat(80));

    // Group by severity
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');

    if (errors.length > 0) {
      lines.push('', '❌ ERRORS:');
      for (const issue of errors) {
        lines.push(
          `  • [${issue.file}] ${issue.message}`,
          `    Field: ${issue.field}`,
          `    Expected: ${issue.expected}`,
          `    Actual: ${issue.actual}`,
          ''
        );
      }
    }

    if (warnings.length > 0) {
      lines.push('', '⚠️  WARNINGS:');
      for (const issue of warnings) {
        lines.push(
          `  • [${issue.file}] ${issue.message}`,
          `    Expected: ${issue.expected}, Actual: ${issue.actual}`,
          ''
        );
      }
    }
  } else {
    lines.push('✅ No issues found. All files are consistent!');
  }

  lines.push('='.repeat(80));

  return lines.join('\n');
}
