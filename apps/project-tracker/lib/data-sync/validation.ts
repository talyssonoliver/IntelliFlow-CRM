/**
 * Metrics Validation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import type { ValidationResult, TaskRecord } from './types';
import { findAllTaskJsons } from './file-io';

/**
 * Validate metrics consistency after sync
 */
export function validateMetricsConsistency(
  csvPath: string,
  metricsDir: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as TaskRecord[];

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
