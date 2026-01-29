/**
 * Schedule Sync Module
 *
 * Integrates PMBOK schedule calculation with the data sync system.
 * Calculates schedule data from Sprint_plan.csv and updates:
 * - Sprint summary files with critical path and EVM metrics
 * - Individual task files with schedule data
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskRecord } from './types';
import {
  calculateSchedule,
  csvRowToTaskInput,
  type ScheduleConfig,
  type ScheduleResult,
  type TaskScheduleInput,
} from '../schedule-calculator';

export interface ScheduleSyncResult {
  success: boolean;
  sprintsProcessed: number;
  tasksScheduled: number;
  criticalPathTasks: number;
  errors: string[];
}

/**
 * Calculate and sync schedule data for all sprints
 */
export function syncScheduleData(
  tasks: TaskRecord[],
  metricsDir: string
): ScheduleSyncResult {
  const errors: string[] = [];
  let tasksScheduled = 0;
  let criticalPathTasks = 0;

  // Group tasks by sprint
  const tasksBySprint = new Map<number, TaskRecord[]>();
  for (const task of tasks) {
    const sprintRaw = task['Target Sprint'];
    const sprintNum = parseInt(sprintRaw || '0', 10);
    if (!isNaN(sprintNum) && sprintNum >= 0) {
      if (!tasksBySprint.has(sprintNum)) {
        tasksBySprint.set(sprintNum, []);
      }
      tasksBySprint.get(sprintNum)!.push(task);
    }
  }

  // Process each sprint
  for (const [sprintNum, sprintTasks] of tasksBySprint) {
    try {
      const result = calculateSprintSchedule(sprintTasks, sprintNum, metricsDir);
      if (result) {
        tasksScheduled += result.tasks.size;
        criticalPathTasks += result.criticalPath.taskIds.length;

        // Update sprint summary with schedule data
        updateSprintSummaryWithSchedule(sprintNum, result, metricsDir);
      }
    } catch (err) {
      errors.push(`Sprint ${sprintNum}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    success: errors.length === 0,
    sprintsProcessed: tasksBySprint.size,
    tasksScheduled,
    criticalPathTasks,
    errors,
  };
}

/**
 * Calculate schedule for a single sprint
 */
function calculateSprintSchedule(
  sprintTasks: TaskRecord[],
  sprintNum: number,
  metricsDir: string
): ScheduleResult | null {
  // Convert CSV rows to schedule inputs
  const taskInputs: TaskScheduleInput[] = sprintTasks.map(csvRowToTaskInput);

  // Skip if no tasks with valid data
  if (taskInputs.length === 0) return null;

  // Get sprint dates from summary or use defaults
  const summaryPath = join(metricsDir, `sprint-${sprintNum}`, '_summary.json');
  let sprintStart = new Date();
  let sprintEnd = new Date();
  sprintEnd.setDate(sprintEnd.getDate() + 14); // Default 2-week sprint

  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
      if (summary.schedule?.sprint_start_date) {
        sprintStart = new Date(summary.schedule.sprint_start_date);
      }
      if (summary.schedule?.sprint_end_date) {
        sprintEnd = new Date(summary.schedule.sprint_end_date);
      } else if (summary.target_date) {
        sprintEnd = new Date(summary.target_date);
      }
    } catch {
      // Use defaults
    }
  }

  const config: ScheduleConfig = {
    sprintStart,
    sprintEnd,
    workingHoursPerDay: 8,
    workingDaysPerWeek: 5,
  };

  return calculateSchedule(taskInputs, config);
}

/**
 * Update sprint summary file with schedule data
 */
function updateSprintSummaryWithSchedule(
  sprintNum: number,
  scheduleResult: ScheduleResult,
  metricsDir: string
): void {
  const summaryPath = join(metricsDir, `sprint-${sprintNum}`, '_summary.json');

  if (!existsSync(summaryPath)) return;

  try {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

    // Add/update schedule data
    summary.schedule = {
      ...summary.schedule,
      sprint_start_date: summary.schedule?.sprint_start_date || null,
      sprint_end_date: summary.schedule?.sprint_end_date || summary.target_date || null,
      working_hours_per_day: 8,
      working_days_per_week: 5,
      critical_path: {
        task_ids: scheduleResult.criticalPath.taskIds,
        total_duration_minutes: scheduleResult.criticalPath.totalDuration,
        completion_percentage: scheduleResult.criticalPath.completionPercentage,
        bottleneck_task_id: scheduleResult.criticalPath.bottleneckTaskId || null,
      },
      schedule_variance: {
        sv_minutes: scheduleResult.scheduleVariance.svMinutes,
        spi: scheduleResult.scheduleVariance.spi,
        status: scheduleResult.scheduleVariance.status,
      },
      calculated_at: scheduleResult.calculatedAt.toISOString(),
    };

    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error(`Failed to update sprint ${sprintNum} summary:`, err);
  }
}

/**
 * Get schedule summary for API response
 */
export function getScheduleSummary(
  tasks: TaskRecord[],
  sprintNum?: number
): {
  totalTasks: number;
  criticalPathTasks: string[];
  scheduleVariance: { sv: number; spi: number; status: string };
  completionPercentage: number;
} | null {
  // Filter by sprint if specified
  const filteredTasks = sprintNum !== undefined
    ? tasks.filter((t) => parseInt(t['Target Sprint'] || '0', 10) === sprintNum)
    : tasks;

  if (filteredTasks.length === 0) return null;

  const taskInputs: TaskScheduleInput[] = filteredTasks.map(csvRowToTaskInput);

  const config: ScheduleConfig = {
    sprintStart: new Date(),
    sprintEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    workingHoursPerDay: 8,
    workingDaysPerWeek: 5,
  };

  const result = calculateSchedule(taskInputs, config);

  return {
    totalTasks: result.tasks.size,
    criticalPathTasks: result.criticalPath.taskIds,
    scheduleVariance: {
      sv: result.scheduleVariance.svMinutes,
      spi: result.scheduleVariance.spi,
      status: result.scheduleVariance.status,
    },
    completionPercentage: result.criticalPath.completionPercentage,
  };
}
