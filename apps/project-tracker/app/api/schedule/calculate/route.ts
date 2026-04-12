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
  const sprintDirs = readdirSync(metricsDir).filter((d) => d.startsWith('sprint-'));

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

  return depsStr
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .map((dep) => {
      // Parse format: TASK_ID:TYPE[+/-lag] e.g., "IFC-001:FS+30"
      const match = /^([A-Z]+-[A-Z0-9-]+):?(FS|FF|SS|SF)?([+-]\d+)?$/.exec(dep);
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
        lagMinutes: lag ? Number.parseInt(lag, 10) : 0,
      };
    });
}

/**
 * Parse three-point estimate from CSV "O/M/P" format (e.g., "30/60/120")
 */
function parseEstimateString(
  estimate: string
): { optimistic: number; mostLikely: number; pessimistic: number } | null {
  if (!estimate || estimate.trim() === '') return null;
  const parts = estimate.split('/').map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return {
    optimistic: parts[0],
    mostLikely: parts[1],
    pessimistic: parts[2],
  };
}

const TASK_ID_DURATION_MAP: Record<string, number> = {
  'IFC-': 480,
  'ENV-': 240,
  'PG-': 360,
};

const SECTION_DURATION_MAP: Array<[string, number]> = [
  ['ai', 480],
  ['intelligence', 480],
  ['security', 360],
  ['testing', 240],
  ['validation', 240],
  ['documentation', 120],
];

function estimateDurationByTaskType(taskId: string, section: string): number {
  for (const [prefix, duration] of Object.entries(TASK_ID_DURATION_MAP)) {
    if (taskId.startsWith(prefix)) return duration;
  }
  const lowerSection = section.toLowerCase();
  for (const [keyword, duration] of SECTION_DURATION_MAP) {
    if (lowerSection.includes(keyword)) return duration;
  }
  return 60;
}

function derivePercentComplete(row: TaskRecord, jsonData: TaskJsonData | null): number {
  const percentCompleteStr = row['Percent Complete'] || '';
  const parsed = Number.parseInt(percentCompleteStr, 10);
  if (!Number.isNaN(parsed)) return parsed;

  const status = row['Status'] || 'Planned';
  if (status === 'Completed' || status === 'Done' || jsonData?.status === 'DONE') return 100;
  if (status === 'In Progress') return 50;
  if (status === 'Blocked') return 25;
  return 0;
}

/**
 * Convert CSV row + JSON data to TaskScheduleInput
 */
function createTaskInput(row: TaskRecord, jsonData: TaskJsonData | null): TaskScheduleInput {
  // FIRST: Try to get three-point estimate from CSV
  const estimateStr = row['Estimate (O/M/P)'] || '';
  const estimate = parseEstimateString(estimateStr);

  // Calculate expected duration using PERT if we have estimate
  let durationMinutes: number;
  if (estimate) {
    // PERT: Expected = (O + 4M + P) / 6
    durationMinutes = Math.round(
      (estimate.optimistic + 4 * estimate.mostLikely + estimate.pessimistic) / 6
    );
  } else if (jsonData?.target_duration_minutes) {
    durationMinutes = jsonData.target_duration_minutes;
  } else {
    durationMinutes = estimateDurationByTaskType(row['Task ID'] || '', row['Section'] || '');
  }

  const percentComplete = derivePercentComplete(row, jsonData);

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
  const targetSprint = Number.parseInt(targetSprintStr, 10);

  return {
    taskId: row['Task ID'],
    estimate: estimate || undefined,
    durationMinutes,
    percentComplete,
    dependencies,
    status,
    plannedStart,
    plannedFinish,
    targetSprint: Number.isNaN(targetSprint) ? undefined : targetSprint,
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

function computeSprintEndFromMax(tasks: TaskRecord[], sprintStart: Date): Date {
  const maxSprint = Math.max(
    ...tasks
      .map((t) => Number.parseInt(t['Target Sprint'] || '0', 10))
      .filter((n) => !Number.isNaN(n)),
    0
  );
  const end = new Date(sprintStart);
  end.setDate(end.getDate() + (maxSprint + 2) * 14);
  return end;
}

function loadDatesFromSummary(summaryPath: string): { start: Date | null; end: Date | null } {
  try {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    const start = summary.started_at ? new Date(summary.started_at) : null;
    const validStart = start && !Number.isNaN(start.getTime()) ? start : null;

    let end: Date | null = null;
    if (summary.schedule?.sprint_end_date) {
      end = new Date(summary.schedule.sprint_end_date);
    } else if (summary.target_date && /^\d{4}-\d{2}-\d{2}/.test(summary.target_date)) {
      end = new Date(summary.target_date);
    }

    return { start: validStart, end };
  } catch {
    return { start: null, end: null };
  }
}

function resolveDatesFromCsv(tasks: TaskRecord[]): { start: Date | null; end: Date | null } {
  let start: Date | null = null;
  let end: Date | null = null;

  for (const task of tasks) {
    const plannedStartStr = task['Planned Start'] || '';
    const plannedFinishStr = task['Planned Finish'] || '';

    if (plannedStartStr) {
      const d = new Date(plannedStartStr);
      if (!Number.isNaN(d.getTime()) && (!start || d < start)) start = d;
    }
    if (plannedFinishStr) {
      const d = new Date(plannedFinishStr);
      if (!Number.isNaN(d.getTime()) && (!end || d > end)) end = d;
    }
  }

  return { start, end };
}

function computeDefaultEnd(tasks: TaskRecord[], sprintStart: Date, isAllSprints: boolean): Date {
  if (isAllSprints) return computeSprintEndFromMax(tasks, sprintStart);
  const end = new Date(sprintStart);
  end.setDate(end.getDate() + 14);
  return end;
}

function resolveSprintDatesFromSummaries(
  tasks: TaskRecord[],
  metricsDir: string,
  isAllSprints: boolean,
  sprintNum: number | undefined
): { start: Date | null; end: Date | null } {
  if (isAllSprints) {
    const sprintNumbers = [
      ...new Set(
        tasks
          .map((t) => Number.parseInt(t['Target Sprint'] || '0', 10))
          .filter((n) => !Number.isNaN(n))
      ),
    ].sort((a, b) => a - b);

    let start: Date | null = null;
    for (const sNum of sprintNumbers) {
      const summaryPath = join(metricsDir, `sprint-${sNum}`, '_summary.json');
      if (!existsSync(summaryPath)) continue;
      const { start: s } = loadDatesFromSummary(summaryPath);
      if (s && (!start || s < start)) start = s;
    }
    return { start, end: null };
  }

  const summaryPath = join(metricsDir, `sprint-${sprintNum}`, '_summary.json');
  if (!existsSync(summaryPath)) return { start: null, end: null };
  return loadDatesFromSummary(summaryPath);
}

function resolveSprintDates(
  tasks: TaskRecord[],
  metricsDir: string,
  isAllSprints: boolean,
  sprintNum: number | undefined,
  now: Date
): { sprintStart: Date; sprintEnd: Date; isOverdue: boolean } {
  const csvDates = resolveDatesFromCsv(tasks);
  let sprintStart: Date | null = csvDates.start;
  let sprintEnd: Date | null = csvDates.end;

  if (!sprintStart || !sprintEnd) {
    const { start, end } = resolveSprintDatesFromSummaries(
      tasks,
      metricsDir,
      isAllSprints,
      sprintNum
    );
    if (!sprintStart && start) sprintStart = start;
    if (!sprintEnd && end) sprintEnd = end;
    if (!sprintEnd && sprintStart && isAllSprints) {
      sprintEnd = computeSprintEndFromMax(tasks, sprintStart);
    }
  }

  sprintStart ??= new Date('2025-12-14');
  sprintEnd ??= computeDefaultEnd(tasks, sprintStart, isAllSprints);
  if (sprintEnd <= sprintStart) sprintEnd = computeDefaultEnd(tasks, sprintStart, isAllSprints);

  return { sprintStart, sprintEnd, isOverdue: sprintEnd < now };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');
    // 'all' or undefined means all sprints, otherwise parse as number
    const isAllSprints = !sprintParam || sprintParam === 'all';
    const sprintNum = isAllSprints ? undefined : Number.parseInt(sprintParam, 10);

    const metricsDir = findMetricsDir();
    const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');

    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }

    // Read and parse CSV
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse<TaskRecord>(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    // Filter by sprint if specified
    const tasks =
      sprintNum === undefined
        ? data
        : data.filter((t) => Number.parseInt(t['Target Sprint'] || '0', 10) === sprintNum);

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: `No tasks found for sprint ${sprintNum}` },
        { status: 404 }
      );
    }

    // Get project/sprint dates
    const now = new Date();
    const { sprintStart, sprintEnd, isOverdue } = resolveSprintDates(
      tasks,
      metricsDir,
      isAllSprints,
      sprintNum,
      now
    );

    // Convert to schedule inputs - load actual data from task JSON files
    const taskInputs: TaskScheduleInput[] = tasks.map((row) => {
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
