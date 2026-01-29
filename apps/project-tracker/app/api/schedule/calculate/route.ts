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
 * Parse dependencies from CSV Dependencies column
 */
function parseDependencies(depsStr: string): ScheduleDependency[] {
  if (!depsStr || depsStr.trim() === '') return [];

  return depsStr.split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0)
    .map(depId => ({
      predecessorId: depId,
      type: 'FS' as const, // Default Finish-to-Start
      lagMinutes: 0,
    }));
}

/**
 * Convert CSV row + JSON data to TaskScheduleInput
 */
function createTaskInput(
  row: TaskRecord,
  jsonData: TaskJsonData | null
): TaskScheduleInput {
  // Get duration from JSON file, or estimate based on task type
  let durationMinutes = 60; // Default 1 hour

  if (jsonData?.target_duration_minutes) {
    durationMinutes = jsonData.target_duration_minutes;
  } else {
    // Estimate based on section/task type
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

  // Determine percent complete from status
  const status = row['Status'] || 'Planned';
  let percentComplete = 0;

  if (status === 'Completed' || status === 'Done' || jsonData?.status === 'DONE') {
    percentComplete = 100;
  } else if (status === 'In Progress') {
    percentComplete = 50;
  } else if (status === 'Blocked') {
    percentComplete = 25;
  }

  // Parse dependencies
  const dependencies = parseDependencies(row['Dependencies'] || '');

  return {
    taskId: row['Task ID'],
    durationMinutes,
    percentComplete,
    dependencies,
    status,
    plannedStart: jsonData?.started_at ? new Date(jsonData.started_at) : undefined,
    plannedFinish: jsonData?.completed_at ? new Date(jsonData.completed_at) : undefined,
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

    // Get sprint dates
    const now = new Date();
    let sprintStart = new Date();
    let sprintEnd = new Date();
    sprintEnd.setDate(sprintEnd.getDate() + 14); // Default 2-week sprint
    let isOverdue = false;

    if (isAllSprints) {
      // For "all sprints", find the full project date range
      // Get unique sprint numbers from tasks
      const sprintNumbers = [...new Set(
        tasks
          .map((t) => parseInt(t['Target Sprint'] || '0', 10))
          .filter((n) => !isNaN(n))
      )].sort((a, b) => a - b);

      // Find earliest start and latest end across all sprints
      let earliestStart: Date | null = null;
      let latestEnd: Date | null = null;

      for (const sNum of sprintNumbers) {
        const summaryPath = join(metricsDir, `sprint-${sNum}`, '_summary.json');
        if (existsSync(summaryPath)) {
          try {
            const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
            const start = summary.started_at ? new Date(summary.started_at) : null;
            const end = summary.target_date ? new Date(summary.target_date) : null;

            if (start && (!earliestStart || start < earliestStart)) {
              earliestStart = start;
            }
            if (end && (!latestEnd || end > latestEnd)) {
              latestEnd = end;
            }
          } catch {
            // Skip invalid summaries
          }
        }
      }

      if (earliestStart) sprintStart = earliestStart;
      if (latestEnd) sprintEnd = latestEnd;

      // Check if overall project is overdue
      if (sprintEnd < now) {
        isOverdue = true;
        sprintEnd = new Date(now);
        sprintEnd.setDate(sprintEnd.getDate() + 30); // Longer buffer for all sprints
      }
    } else {
      // Single sprint mode
      const summaryPath = join(metricsDir, `sprint-${sprintNum}`, '_summary.json');
      if (existsSync(summaryPath)) {
        try {
          const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
          if (summary.started_at) {
            sprintStart = new Date(summary.started_at);
          }
          if (summary.schedule?.sprint_start_date) {
            sprintStart = new Date(summary.schedule.sprint_start_date);
          }
          if (summary.schedule?.sprint_end_date) {
            sprintEnd = new Date(summary.schedule.sprint_end_date);
          } else if (summary.target_date) {
            sprintEnd = new Date(summary.target_date);
          }

          // Check if sprint is overdue
          if (sprintEnd < now) {
            isOverdue = true;
            sprintEnd = new Date(now);
            sprintEnd.setDate(sprintEnd.getDate() + 7);
          }
        } catch {
          // Use defaults
        }
      }
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
