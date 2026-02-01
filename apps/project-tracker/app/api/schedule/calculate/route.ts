/**
 * Schedule Calculate API
 *
 * GET /api/schedule/calculate?sprint=0
 *
 * Returns PMBOK schedule data including:
 * - Scheduled tasks with early/late dates and float
 * - Critical path identification
 * - Schedule variance (EVM metrics)
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import {
  calculateSchedule,
  type ScheduleConfig,
  type TaskScheduleInput,
  type ScheduleDependency,
} from '../../../../lib/schedule-calculator';
import type { TaskRecord } from '../../../../lib/data-sync/types';

interface TaskJsonData {
  target_duration_minutes?: number;
  actual_duration_minutes?: number;
  status?: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * Load task JSON file to get actual duration data
 */
function loadTaskJsonData(metricsDir: string, taskId: string): TaskJsonData | null {
  // Search in all sprint directories
  const sprintDirs = readdirSync(metricsDir).filter(d => d.startsWith('sprint-'));

  for (const sprintDir of sprintDirs) {
    const sprintPath = join(metricsDir, sprintDir);

    // Search recursively in phase directories
    const searchInDir = (dir: string): TaskJsonData | null => {
      if (!existsSync(dir)) return null;

      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const result = searchInDir(join(dir, entry.name));
          if (result) return result;
        } else if (entry.name === `${taskId}.json`) {
          try {
            return JSON.parse(readFileSync(join(dir, entry.name), 'utf-8'));
          } catch {
            return null;
          }
        }
      }
      return null;
    };

    const result = searchInDir(sprintPath);
    if (result) return result;
  }

  return null;
}

/**
 * Parse dependencies from CSV Dependency Types column (format: TASK:TYPE+lag)
 */
function parseDependencyTypes(depsStr: string): ScheduleDependency[] {
  if (!depsStr || depsStr.trim() === '') return [];

  return depsStr.split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0)
    .map(dep => {
      // Parse format: TASK_ID:TYPE[+/-lag] e.g., "IFC-001:FS+30"
      const match = dep.match(/^([A-Z]+-[A-Z0-9-]+):?(FS|FF|SS|SF)?([+-]\d+)?$/);
      if (!match) {
        // Fallback: just task ID with default FS
        return {
          predecessorId: dep.split(':')[0],
          type: 'FS' as const,
          lagMinutes: 0,
        };
      }

      const [, taskId, type, lag] = match;
      return {
        predecessorId: taskId,
        type: (type || 'FS') as 'FS' | 'FF' | 'SS' | 'SF',
        lagMinutes: lag ? parseInt(lag, 10) : 0,
      };
    });
}

/**
 * Parse three-point estimate from CSV "O/M/P" format (e.g., "30/60/120")
 */
function parseEstimateString(estimate: string): { optimistic: number; mostLikely: number; pessimistic: number } | null {
  if (!estimate || estimate.trim() === '') return null;
  const parts = estimate.split('/').map(p => parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return {
    optimistic: parts[0],
    mostLikely: parts[1],
    pessimistic: parts[2],
  };
}

/**
 * Convert CSV row + JSON data to TaskScheduleInput
 */
function createTaskInput(
  row: TaskRecord,
  jsonData: TaskJsonData | null
): TaskScheduleInput {
  // FIRST: Try to get three-point estimate from CSV
  const estimateStr = row['Estimate (O/M/P)'] || '';
  const estimate = parseEstimateString(estimateStr);

  // Calculate expected duration using PERT if we have estimate
  let durationMinutes = 60; // Default 1 hour

  if (estimate) {
    // PERT: Expected = (O + 4M + P) / 6
    durationMinutes = Math.round(
      (estimate.optimistic + 4 * estimate.mostLikely + estimate.pessimistic) / 6
    );
  } else if (jsonData?.target_duration_minutes) {
    durationMinutes = jsonData.target_duration_minutes;
  } else {
    // Fallback: Estimate based on section/task type
    const section = (row['Section'] || '').toLowerCase();
    const taskId = row['Task ID'] || '';

    if (taskId.startsWith('IFC-')) {
      durationMinutes = 480; // 8 hours for core features
    } else if (taskId.startsWith('ENV-')) {
      durationMinutes = 240; // 4 hours for environment setup
    } else if (taskId.startsWith('PG-')) {
      durationMinutes = 360; // 6 hours for pages
    } else if (section.includes('ai') || section.includes('intelligence')) {
      durationMinutes = 480; // 8 hours for AI tasks
    } else if (section.includes('security')) {
      durationMinutes = 360; // 6 hours for security
    } else if (section.includes('testing') || section.includes('validation')) {
      durationMinutes = 240; // 4 hours for testing
    } else if (section.includes('documentation')) {
      durationMinutes = 120; // 2 hours for docs
    }
  }

  // FIRST: Try to get percent complete from CSV column
  const percentCompleteStr = row['Percent Complete'] || '';
  let percentComplete = parseInt(percentCompleteStr, 10);

  // If CSV column is empty/invalid, derive from status
  if (isNaN(percentComplete)) {
    const status = row['Status'] || 'Planned';
    percentComplete = 0;

    if (status === 'Completed' || status === 'Done' || jsonData?.status === 'DONE') {
      percentComplete = 100;
    } else if (status === 'In Progress') {
      percentComplete = 50;
    } else if (status === 'Blocked') {
      percentComplete = 25;
    }
  }

  // Parse dependencies from Dependency Types column (with :FS notation)
  // Fall back to Dependencies column if Dependency Types is empty
  const depTypesStr = row['Dependency Types'] || '';
  const dependencies = depTypesStr.trim()
    ? parseDependencyTypes(depTypesStr)
    : parseDependencyTypes(row['Dependencies'] || '');

  const status = row['Status'] || 'Planned';

  // Get planned dates from CSV only (not from JSON - that's actual/retrospective data)
  // JSON started_at/completed_at are ACTUAL dates, not PLANNED dates
  // For scheduling, we use: 1) CSV Planned Start, 2) Target Sprint calculation
  const plannedStartStr = row['Planned Start'] || '';
  const plannedFinishStr = row['Planned Finish'] || '';

  const plannedStart = plannedStartStr ? new Date(plannedStartStr) : undefined;
  const plannedFinish = plannedFinishStr ? new Date(plannedFinishStr) : undefined;

  // Parse target sprint number
  const targetSprintStr = row['Target Sprint'] || '';
  const targetSprint = parseInt(targetSprintStr, 10);

  return {
    taskId: row['Task ID'],
    estimate: estimate || undefined,
    durationMinutes,
    percentComplete,
    dependencies,
    status,
    plannedStart,
    plannedFinish,
    targetSprint: isNaN(targetSprint) ? undefined : targetSprint,
  };
}

function findMetricsDir(): string {
  const paths = [
    join(process.cwd(), 'docs', 'metrics'),
    join(process.cwd(), 'apps', 'project-tracker', 'docs', 'metrics'),
  ];

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  throw new Error('Metrics directory not found');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');
    // 'all' or undefined means all sprints, otherwise parse as number
    const isAllSprints = !sprintParam || sprintParam === 'all';
    const sprintNum = isAllSprints ? undefined : parseInt(sprintParam, 10);

    const metricsDir = findMetricsDir();
    const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');

    if (!existsSync(csvPath)) {
      return NextResponse.json(
        { error: 'Sprint_plan.csv not found' },
        { status: 404 }
      );
    }

    // Read and parse CSV
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse<TaskRecord>(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    // Filter by sprint if specified
    const tasks = sprintNum !== undefined
      ? data.filter((t) => parseInt(t['Target Sprint'] || '0', 10) === sprintNum)
      : data;

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: `No tasks found for sprint ${sprintNum}` },
        { status: 404 }
      );
    }

    // Get project/sprint dates
    // PRIMARY: Use Planned Start/Finish from CSV tasks
    // FALLBACK: Use sprint summary files if CSV dates not available
    const now = new Date();
    let sprintStart: Date | null = null;
    let sprintEnd: Date | null = null;
    let isOverdue = false;

    // First, calculate dates from CSV task data (most reliable source)
    for (const task of tasks) {
      const plannedStartStr = task['Planned Start'] || '';
      const plannedFinishStr = task['Planned Finish'] || '';

      if (plannedStartStr) {
        const start = new Date(plannedStartStr);
        if (!isNaN(start.getTime())) {
          if (!sprintStart || start < sprintStart) {
            sprintStart = start;
          }
        }
      }

      if (plannedFinishStr) {
        const finish = new Date(plannedFinishStr);
        if (!isNaN(finish.getTime())) {
          if (!sprintEnd || finish > sprintEnd) {
            sprintEnd = finish;
          }
        }
      }
    }

    // Fallback: Try sprint summaries if CSV dates not found
    if (!sprintStart || !sprintEnd) {
      if (isAllSprints) {
        const sprintNumbers = [...new Set(
          tasks
            .map((t) => parseInt(t['Target Sprint'] || '0', 10))
            .filter((n) => !isNaN(n))
        )].sort((a, b) => a - b);

        // For all sprints: only get the start date from summaries
        // Calculate end date based on max sprint number (summary dates are unreliable)
        for (const sNum of sprintNumbers) {
          const summaryPath = join(metricsDir, `sprint-${sNum}`, '_summary.json');
          if (existsSync(summaryPath)) {
            try {
              const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
              const start = summary.started_at ? new Date(summary.started_at) : null;

              // Only use start dates (end dates in summaries have wrong years)
              if (start && !isNaN(start.getTime())) {
                if (!sprintStart || start < sprintStart) {
                  sprintStart = start;
                }
              }
            } catch {
              // Skip invalid summaries
            }
          }
        }

        // Calculate end date based on max sprint number (2 weeks per sprint)
        if (!sprintEnd && sprintStart) {
          const maxSprint = Math.max(...sprintNumbers, 0);
          sprintEnd = new Date(sprintStart);
          sprintEnd.setDate(sprintEnd.getDate() + (maxSprint + 2) * 14); // +2 for buffer
        }
      } else {
        const summaryPath = join(metricsDir, `sprint-${sprintNum}`, '_summary.json');
        if (existsSync(summaryPath)) {
          try {
            const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
            if (!sprintStart && summary.started_at) {
              sprintStart = new Date(summary.started_at);
            }
            if (!sprintStart && summary.schedule?.sprint_start_date) {
              sprintStart = new Date(summary.schedule.sprint_start_date);
            }
            if (!sprintEnd && summary.schedule?.sprint_end_date) {
              sprintEnd = new Date(summary.schedule.sprint_end_date);
            } else if (!sprintEnd && summary.target_date && /^\d{4}-\d{2}-\d{2}/.test(summary.target_date)) {
              sprintEnd = new Date(summary.target_date);
            }
          } catch {
            // Skip
          }
        }
      }
    }

    // Final fallback: Use reasonable defaults
    if (!sprintStart) {
      sprintStart = new Date('2025-12-14'); // Project start
    }
    if (!sprintEnd) {
      sprintEnd = new Date(sprintStart);
      if (isAllSprints) {
        // For all sprints, calculate based on max sprint number (2 weeks per sprint)
        const maxSprint = Math.max(
          ...tasks.map((t) => parseInt(t['Target Sprint'] || '0', 10)).filter((n) => !isNaN(n)),
          0
        );
        // Add 2 weeks per sprint + buffer
        sprintEnd.setDate(sprintEnd.getDate() + (maxSprint + 2) * 14);
      } else {
        sprintEnd.setDate(sprintEnd.getDate() + 14); // Default 2-week sprint
      }
    }

    // Sanity check: ensure end is after start (fix for bad data with wrong years)
    if (sprintEnd <= sprintStart) {
      sprintEnd = new Date(sprintStart);
      if (isAllSprints) {
        const maxSprint = Math.max(
          ...tasks.map((t) => parseInt(t['Target Sprint'] || '0', 10)).filter((n) => !isNaN(n)),
          0
        );
        sprintEnd.setDate(sprintEnd.getDate() + (maxSprint + 2) * 14);
      } else {
        sprintEnd.setDate(sprintEnd.getDate() + 14);
      }
    }

    // Check if overdue (informational only, do NOT modify sprintEnd)
    if (sprintEnd < now) {
      isOverdue = true;
    }

    // Convert to schedule inputs - load actual data from task JSON files
    const taskInputs: TaskScheduleInput[] = tasks.map(row => {
      const jsonData = loadTaskJsonData(metricsDir, row['Task ID']);
      return createTaskInput(row, jsonData);
    });

    const config: ScheduleConfig = {
      sprintStart,
      sprintEnd,
      workingHoursPerDay: 8,
      workingDaysPerWeek: 5,
    };

    // Calculate schedule
    const result = calculateSchedule(taskInputs, config);

    // Convert Map to object for JSON response
    const scheduledTasks: Record<string, unknown> = {};
    for (const [taskId, task] of result.tasks) {
      scheduledTasks[taskId] = {
        taskId: task.taskId,
        expectedDuration: task.expectedDuration,
        earlyStart: task.earlyStart.toISOString(),
        earlyFinish: task.earlyFinish.toISOString(),
        lateStart: task.lateStart.toISOString(),
        lateFinish: task.lateFinish.toISOString(),
        totalFloat: task.totalFloat,
        freeFloat: task.freeFloat,
        isCritical: task.isCritical,
        percentComplete: task.percentComplete,
        status: task.status,
      };
    }

    return NextResponse.json({
      sprint: sprintNum ?? 'all',
      calculatedAt: result.calculatedAt.toISOString(),
      isOverdue,
      config: {
        sprintStart: sprintStart.toISOString(),
        sprintEnd: sprintEnd.toISOString(),
        workingHoursPerDay: config.workingHoursPerDay,
        workingDaysPerWeek: config.workingDaysPerWeek,
      },
      summary: {
        totalTasks: result.tasks.size,
        criticalPathTasks: result.criticalPath.taskIds.length,
        completionPercentage: result.criticalPath.completionPercentage,
        isOverdue,
      },
      criticalPath: result.criticalPath,
      scheduleVariance: result.scheduleVariance,
      tasks: scheduledTasks,
    });
  } catch (error) {
    console.error('Schedule calculation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
