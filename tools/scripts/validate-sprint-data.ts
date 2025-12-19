#!/usr/bin/env ts-node
/**
 * Sprint Data Validation Script
 * Prevents data inconsistencies before committing Sprint metrics
 *
 * Validates:
 * 1. CSV status values are from allowed list
 * 2. JSON files match CSV data (status, description, sprint)
 * 3. _summary.json counts match CSV task counts
 * 4. No orphaned JSON files (tasks not in CSV)
 * 5. All Sprint 0 tasks have corresponding JSON files
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const ALLOWED_STATUSES = ['Done', 'Completed', 'In Progress', 'Blocked', 'Planned', 'Backlog'];
const CSV_PATH = 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv';
const METRICS_DIR = 'apps/project-tracker/docs/metrics';

function validateSprintData(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate CSV exists and has valid statuses
  if (!existsSync(CSV_PATH)) {
    errors.push(`CSV file not found: ${CSV_PATH}`);
    return { passed: false, errors, warnings };
  }

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const tasks = data as any[];

  console.log(`📊 Validating ${tasks.length} tasks from CSV...`);

  // Check for invalid statuses
  const invalidStatuses = new Set<string>();
  for (const task of tasks) {
    const status = task.Status;
    if (status && !ALLOWED_STATUSES.includes(status)) {
      invalidStatuses.add(status);
      errors.push(
        `Task ${task['Task ID']}: Invalid status "${status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`
      );
    }
  }

  // 2. Validate Sprint 0 tasks
  const sprint0Tasks = tasks.filter((t) => String(t['Target Sprint']) === '0');
  console.log(`🎯 Found ${sprint0Tasks.length} Sprint 0 tasks`);

  // Count by status
  const statusCounts = {
    done: sprint0Tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length,
    in_progress: sprint0Tasks.filter((t) => t.Status === 'In Progress').length,
    blocked: sprint0Tasks.filter((t) => t.Status === 'Blocked').length,
    planned: sprint0Tasks.filter((t) => t.Status === 'Planned').length,
    backlog: sprint0Tasks.filter((t) => t.Status === 'Backlog').length,
  };

  console.log(`   ✅ Completed: ${statusCounts.done}`);
  console.log(`   🔄 In Progress: ${statusCounts.in_progress}`);
  console.log(`   📋 Planned: ${statusCounts.planned}`);
  console.log(`   📦 Backlog: ${statusCounts.backlog}`);
  console.log(`   ⛔ Blocked: ${statusCounts.blocked}`);

  // 3. Validate _summary.json matches CSV counts
  const summaryPath = join(METRICS_DIR, 'sprint-0', '_summary.json');
  if (existsSync(summaryPath)) {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    const summaryTotal = summary.task_summary?.total || 0;
    const summaryDone = summary.task_summary?.done || 0;
    const summaryInProgress = summary.task_summary?.in_progress || 0;
    const summaryNotStarted = summary.task_summary?.not_started || 0;

    if (summaryTotal !== sprint0Tasks.length) {
      errors.push(
        `_summary.json total (${summaryTotal}) doesn't match CSV (${sprint0Tasks.length})`
      );
    }
    if (summaryDone !== statusCounts.done) {
      errors.push(`_summary.json done (${summaryDone}) doesn't match CSV (${statusCounts.done})`);
    }
    if (summaryInProgress !== statusCounts.in_progress) {
      errors.push(
        `_summary.json in_progress (${summaryInProgress}) doesn't match CSV (${statusCounts.in_progress})`
      );
    }

    const expectedNotStarted = statusCounts.planned + statusCounts.backlog + statusCounts.blocked;
    if (summaryNotStarted !== expectedNotStarted) {
      warnings.push(
        `_summary.json not_started (${summaryNotStarted}) should be ${expectedNotStarted} (planned + backlog + blocked)`
      );
    }
  } else {
    warnings.push(`_summary.json not found at ${summaryPath}`);
  }

  // 4. Validate individual task JSON files
  const sprint0Dir = join(METRICS_DIR, 'sprint-0');
  const taskJsonFiles = findAllTaskJsons(sprint0Dir);
  const csvTaskIds = new Set(sprint0Tasks.map((t) => t['Task ID']));

  console.log(`📄 Found ${taskJsonFiles.length} task JSON files`);

  // Check for orphaned JSON files
  for (const jsonFile of taskJsonFiles) {
    const content = readFileSync(jsonFile, 'utf-8');
    const taskData = JSON.parse(content);
    const taskId = taskData.task_id || taskData.taskId;

    if (!csvTaskIds.has(taskId)) {
      warnings.push(`Orphaned JSON file: ${jsonFile} (task ${taskId} not in CSV or not Sprint 0)`);
    }
  }

  // Check for missing JSON files
  for (const task of sprint0Tasks) {
    const taskId = task['Task ID'];
    const hasJsonFile = taskJsonFiles.some((f) => {
      const content = readFileSync(f, 'utf-8');
      const data = JSON.parse(content);
      return (data.task_id || data.taskId) === taskId;
    });

    if (!hasJsonFile) {
      errors.push(`Missing JSON file for Sprint 0 task: ${taskId}`);
    }
  }

  // 5. Cross-validate task data
  for (const task of sprint0Tasks) {
    const taskId = task['Task ID'];
    const taskFile = taskJsonFiles.find((f) => {
      try {
        const content = readFileSync(f, 'utf-8');
        const data = JSON.parse(content);
        return (data.task_id || data.taskId) === taskId;
      } catch {
        return false;
      }
    });

    if (taskFile) {
      const taskData = JSON.parse(readFileSync(taskFile, 'utf-8'));
      const jsonStatus = taskData.status?.toUpperCase();
      const csvStatus = mapCsvToJsonStatus(task.Status);

      if (jsonStatus !== csvStatus) {
        errors.push(
          `${taskId}: Status mismatch - CSV: "${task.Status}" → JSON should be: "${csvStatus}" but got: "${jsonStatus}"`
        );
      }

      // Validate description if present
      if (taskData.description && task.Description && taskData.description !== task.Description) {
        warnings.push(`${taskId}: Description in JSON doesn't match CSV (this may be intentional)`);
      }
    }
  }

  return { passed: errors.length === 0, errors, warnings };
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

function mapCsvToJsonStatus(csvStatus: string): string {
  if (csvStatus === 'Done' || csvStatus === 'Completed') return 'DONE';
  if (csvStatus === 'In Progress') return 'IN_PROGRESS';
  if (csvStatus === 'Blocked') return 'BLOCKED';
  if (csvStatus === 'Planned') return 'PLANNED';
  if (csvStatus === 'Backlog') return 'BACKLOG';
  return 'UNKNOWN';
}

// Main execution
console.log('🔍 Starting Sprint Data Validation...\n');
const result = validateSprintData();

if (result.warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  for (const warning of result.warnings) {
    console.log(`   ${warning}`);
  }
}

if (result.errors.length > 0) {
  console.log('\n❌ VALIDATION FAILED:');
  for (const error of result.errors) {
    console.log(`   ${error}`);
  }
  console.log(
    '\n💡 Fix: Run "cd apps/project-tracker && npx tsx scripts/sync-metrics.ts" to sync data\n'
  );
  process.exit(1);
}

console.log('\n✅ All Sprint data validations passed!\n');
process.exit(0);
