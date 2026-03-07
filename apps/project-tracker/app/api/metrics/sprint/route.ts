import { NextResponse } from 'next/server';
import { readFile, access } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { normalizeStatus, TASK_STATUSES, STATUS_GROUPS } from '@/lib/csv-parser';
import { PATHS, getSprintSummaryPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  KPIs: string;
}

function countTaskStatus(tasks: CsvTask[]): {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  failed: number;
} {
  const counts = { total: tasks.length, done: 0, in_progress: 0, blocked: 0, not_started: 0, failed: 0 };
  for (const task of tasks) {
    const status = normalizeStatus(task.Status || '');
    if (STATUS_GROUPS.completed.includes(status)) {
      counts.done++;
    } else if (STATUS_GROUPS.active.includes(status)) {
      counts.in_progress++;
    } else if (status === TASK_STATUSES.BLOCKED || status === TASK_STATUSES.NEEDS_HUMAN) {
      counts.blocked++;
    } else if (status === TASK_STATUSES.FAILED) {
      counts.failed++;
    } else {
      counts.not_started++;
    }
  }
  return counts;
}

function groupTasksBySection(tasks: CsvTask[]): Record<string, { total: number; done: number }> {
  const sections: Record<string, { total: number; done: number }> = {};
  for (const task of tasks) {
    const section = task.Section || 'Other';
    if (!sections[section]) {
      sections[section] = { total: 0, done: 0 };
    }
    sections[section].total++;
    const status = normalizeStatus(task.Status || '');
    if (STATUS_GROUPS.completed.includes(status)) {
      sections[section].done++;
    }
  }
  return sections;
}

function getSprintDataFromCsv(tasks: CsvTask[], sprintNumber: string) {
  // Filter tasks for this sprint
  const sprintTasks = tasks.filter((task) => task['Target Sprint'] === sprintNumber);

  // Count statuses using shared normalizeStatus function
  const statusCounts = countTaskStatus(sprintTasks);

  // Group by section for phase-like breakdown
  const sections = groupTasksBySection(sprintTasks);

  // Create KPI summary
  const measuringOrBelowTarget = statusCounts.done > 0 ? 'MEASURING' : 'BELOW_TARGET';
  const completionRateStatus =
    statusCounts.done === statusCounts.total ? 'MET' : measuringOrBelowTarget;
  const kpiSummary: Record<
    string,
    { target: number; actual: number; status: string; unit: string }
  > = {
    completion_rate: {
      target: 100,
      actual: statusCounts.total > 0 ? (statusCounts.done / statusCounts.total) * 100 : 0,
      status: completionRateStatus,
      unit: 'percent',
    },
    tasks_completed: {
      target: statusCounts.total,
      actual: statusCounts.done,
      status: statusCounts.done === statusCounts.total ? 'MET' : 'MEASURING',
      unit: 'count',
    },
  };

  // Get completed tasks list
  const completedTasks = sprintTasks
    .filter((t) => {
      const status = normalizeStatus(t.Status || '');
      return STATUS_GROUPS.completed.includes(status);
    })
    .map((t) => ({
      task_id: t['Task ID'],
      completed_at: new Date().toISOString(),
      duration_minutes: 30, // Default estimate
    }));

  return {
    sprint: `sprint-${sprintNumber}`,
    name: `Sprint ${sprintNumber}`,
    target_date: new Date().toISOString(),
    started_at:
      statusCounts.done > 0 || statusCounts.in_progress > 0 ? new Date().toISOString() : null,
    completed_at:
      statusCounts.done === statusCounts.total && statusCounts.total > 0
        ? new Date().toISOString()
        : null,
    task_summary: statusCounts,
    kpi_summary: kpiSummary,
    blockers: [],
    completed_tasks: completedTasks,
    sections: Object.entries(sections).map(([name, data]) => ({
      name,
      total: data.total,
      done: data.done,
      progress: data.total > 0 ? (data.done / data.total) * 100 : 0,
    })),
  };
}

const CSV_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' };

const CSV_PARSE_OPTIONS = { columns: true as const, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true };

async function tryLoadJsonMetadata(metricsPath: string): Promise<Record<string, unknown> | null> {
  try {
    await access(metricsPath);
    const content = await readFile(metricsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function handleSprintNumber(sprintNumber: string): Promise<NextResponse> {
  const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
  const metricsPath = getSprintSummaryPath(sprintNumber);

  try {
    const csvContent = await readFile(csvPath, 'utf-8');
    const tasks = parse(csvContent, CSV_PARSE_OPTIONS) as CsvTask[];
    const csvData = getSprintDataFromCsv(tasks, sprintNumber);
    const jsonData = await tryLoadJsonMetadata(metricsPath);

    const mergedData = {
      sprint: csvData.sprint,
      name: jsonData?.name || csvData.name,
      target_date: jsonData?.target_date || csvData.target_date,
      started_at: csvData.started_at,
      completed_at: csvData.completed_at,
      task_summary: csvData.task_summary,
      kpi_summary: csvData.kpi_summary,
      blockers: jsonData?.blockers || csvData.blockers,
      completed_tasks: csvData.completed_tasks,
      sections: csvData.sections,
    };

    if (csvData.task_summary.total === 0) {
      return NextResponse.json({ ...mergedData, message: `No tasks found for Sprint ${sprintNumber}.` }, { headers: CSV_HEADERS });
    }
    return NextResponse.json(mergedData, { headers: CSV_HEADERS });
  } catch (csvError) {
    console.error('Error reading CSV:', csvError);
    return NextResponse.json({
      sprint: `sprint-${sprintNumber}`,
      name: `Sprint ${sprintNumber}`,
      target_date: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      task_summary: { total: 0, done: 0, in_progress: 0, blocked: 0, not_started: 0, failed: 0 },
      kpi_summary: {},
      blockers: [],
      completed_tasks: [],
      message: `No metrics data available for Sprint ${sprintNumber}.`,
    }, { headers: CSV_HEADERS });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint') || '0';

    // Handle 'all' case - aggregate all sprints
    if (sprintParam === 'all') {
      const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
      const csvContent = await readFile(csvPath, 'utf-8');
      const tasks = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        bom: true,
      }) as CsvTask[];

      // Count all tasks using shared normalizeStatus
      const statusCounts = countTaskStatus(tasks);

      return NextResponse.json(
        {
          sprint: 'all',
          name: 'All Sprints',
          target_date: new Date().toISOString(),
          started_at: new Date().toISOString(),
          completed_at: null,
          task_summary: statusCounts,
          kpi_summary: {
            completion_rate: {
              target: 100,
              actual: (statusCounts.done / statusCounts.total) * 100,
              status: 'MEASURING',
              unit: 'percent',
            },
          },
          blockers: [],
          completed_tasks: [],
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    // Handle 'continuous' - filter continuous tasks
    if (sprintParam === 'continuous') {
      const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
      const csvContent = await readFile(csvPath, 'utf-8');
      const tasks = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        bom: true,
      }) as CsvTask[];

      const data = getSprintDataFromCsv(tasks, 'Continuous');
      data.name = 'Continuous Tasks';

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    const sprintNumber = sprintParam;
    return handleSprintNumber(sprintNumber);
  } catch (error) {
    console.error('Error reading sprint summary:', error);
    return NextResponse.json({ error: 'Failed to load sprint summary' }, { status: 500 });
  }
}
