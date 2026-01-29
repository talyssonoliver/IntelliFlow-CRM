/**
 * Workflow Utility Functions
 *
 * Helper functions for workflow operations.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

interface SprintPlanRecord {
  'Task ID': string;
  'Target Sprint': string;
  [key: string]: string;
}

// Cache for task -> sprint mapping
let taskSprintCache: Map<string, number> | null = null;

/**
 * Get the sprint number for a task from Sprint_plan.csv
 *
 * @param taskId - The task ID (e.g., "IFC-009", "PG-015")
 * @param repoRoot - The repository root path
 * @returns The sprint number for the task
 * @throws Error if task not found or sprint is invalid
 */
export function getSprintForTask(taskId: string, repoRoot: string): number {
  // Use cache if available
  if (taskSprintCache) {
    const cached = taskSprintCache.get(taskId);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Load and cache mappings
  const csvPath = join(repoRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

  if (!existsSync(csvPath)) {
    throw new Error(`Sprint_plan.csv not found at: ${csvPath}`);
  }

  const content = readFileSync(csvPath, 'utf-8');
  const { data: records } = Papa.parse<SprintPlanRecord>(content, {
    header: true,
    skipEmptyLines: true,
  });

  // Build cache
  taskSprintCache = new Map();
  for (const record of records) {
    const id = record['Task ID'];
    const sprintStr = record['Target Sprint'];

    if (!id) continue;

    // Handle "Continuous" or empty values - default to sprint 0
    if (!sprintStr || sprintStr === 'Continuous') {
      taskSprintCache.set(id, 0);
    } else {
      const sprint = parseInt(sprintStr, 10);
      if (!isNaN(sprint)) {
        taskSprintCache.set(id, sprint);
      }
    }
  }

  // Look up the requested task
  const sprint = taskSprintCache.get(taskId);
  if (sprint === undefined) {
    throw new Error(`Task ${taskId} not found in Sprint_plan.csv`);
  }

  return sprint;
}

/**
 * Clear the task -> sprint cache
 * Useful for testing or when CSV is updated
 */
export function clearSprintCache(): void {
  taskSprintCache = null;
}

/**
 * Check if a task exists in the Sprint_plan.csv
 *
 * @param taskId - The task ID to check
 * @param repoRoot - The repository root path
 * @returns true if task exists
 */
export function taskExists(taskId: string, repoRoot: string): boolean {
  try {
    getSprintForTask(taskId, repoRoot);
    return true;
  } catch {
    return false;
  }
}
