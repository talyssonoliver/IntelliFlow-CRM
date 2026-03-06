import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { normalizeStatus, TASK_STATUSES, STATUS_GROUPS } from '@/lib/csv-parser';
import { PATHS } from '@/lib/paths';

export const dynamic = 'force-dynamic';

interface PhaseMetrics {
  phase: string;
  description: string;
  status: string;
  aggregated_metrics: {
    total_tasks: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
  };
  started_at: string | null;
  completed_at: string | null;
}

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  KPIs: string;
}

function getPhasesFromCsv(tasks: CsvTask[], sprintNumber: string): PhaseMetrics[] {
  // Filter tasks for this sprint
  const sprintTasks = tasks.filter((task) => task['Target Sprint'] === sprintNumber);

  // Group by section
  const sections: Record<string, CsvTask[]> = {};
  for (const task of sprintTasks) {
    const section = task.Section || 'Other';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(task);
  }

  // Convert sections to phase metrics
  const phases: PhaseMetrics[] = [];
  for (const [section, sectionTasks] of Object.entries(sections)) {
    const metrics = {
      total_tasks: sectionTasks.length,
      done: 0,
      in_progress: 0,
      blocked: 0,
      not_started: 0,
    };

    for (const task of sectionTasks) {
      const status = normalizeStatus(task.Status || '');
      if (STATUS_GROUPS.completed.includes(status)) {
        metrics.done++;
      } else if (STATUS_GROUPS.active.includes(status)) {
        metrics.in_progress++;
      } else if (status === TASK_STATUSES.BLOCKED || status === TASK_STATUSES.NEEDS_HUMAN) {
        metrics.blocked++;
      } else {
        metrics.not_started++;
      }
    }

    const allDone = metrics.done === metrics.total_tasks;
    const hasProgress = metrics.done > 0 || metrics.in_progress > 0;

    phases.push({
      phase: section,
      description: `${section} tasks for Sprint ${sprintNumber}`,
      status: allDone ? 'completed' : hasProgress ? 'in_progress' : 'not_started',
      aggregated_metrics: metrics,
      started_at: hasProgress ? new Date().toISOString() : null,
      completed_at: allDone ? new Date().toISOString() : null,
    });
  }

  return phases;
}

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

async function loadCsvTasks(): Promise<CsvTask[]> {
  const csvContent = await readFile(PATHS.sprintTracking.SPRINT_PLAN_CSV, 'utf-8');
  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  }) as CsvTask[];
}

function groupTasksBySection(tasks: CsvTask[]): Record<string, CsvTask[]> {
  const sections: Record<string, CsvTask[]> = {};
  for (const task of tasks) {
    const section = task.Section || 'Other';
    if (!sections[section]) sections[section] = [];
    sections[section].push(task);
  }
  return sections;
}

function buildPhaseMetricsForSection(
  section: string,
  sectionTasks: CsvTask[],
  descriptionSuffix: string
): PhaseMetrics {
  const metrics = {
    total_tasks: sectionTasks.length,
    done: 0,
    in_progress: 0,
    blocked: 0,
    not_started: 0,
  };

  for (const task of sectionTasks) {
    const status = normalizeStatus(task.Status || '');
    if (STATUS_GROUPS.completed.includes(status)) {
      metrics.done++;
    } else if (STATUS_GROUPS.active.includes(status)) {
      metrics.in_progress++;
    } else if (status === TASK_STATUSES.BLOCKED || status === TASK_STATUSES.NEEDS_HUMAN) {
      metrics.blocked++;
    } else {
      metrics.not_started++;
    }
  }

  const allDone = metrics.done === metrics.total_tasks;
  const hasProgress = metrics.done > 0 || metrics.in_progress > 0;
  const now = new Date().toISOString();

  return {
    phase: section,
    description: `${section} ${descriptionSuffix}`,
    status: allDone ? 'completed' : hasProgress ? 'in_progress' : 'not_started',
    aggregated_metrics: metrics,
    started_at: hasProgress ? now : null,
    completed_at: allDone ? now : null,
  };
}

async function handleAllPhases(): Promise<NextResponse> {
  try {
    const tasks = await loadCsvTasks();
    const sections = groupTasksBySection(tasks);
    const allPhases = Object.entries(sections).map(([section, sectionTasks]) =>
      buildPhaseMetricsForSection(section, sectionTasks, 'tasks across all sprints')
    );
    return NextResponse.json(allPhases, { headers: NO_CACHE });
  } catch (csvError) {
    console.error('Error reading CSV for all phases:', csvError);
    return NextResponse.json([], { headers: NO_CACHE });
  }
}

async function handleContinuousPhases(): Promise<NextResponse> {
  try {
    const tasks = await loadCsvTasks();
    const phases = getPhasesFromCsv(tasks, 'Continuous');
    return NextResponse.json(phases, { headers: NO_CACHE });
  } catch (csvError) {
    console.error('Error reading CSV for continuous phases:', csvError);
    return NextResponse.json([], { headers: NO_CACHE });
  }
}

async function handleSprintPhases(sprintNumber: string): Promise<NextResponse> {
  try {
    const tasks = await loadCsvTasks();
    const phases = getPhasesFromCsv(tasks, sprintNumber);
    return NextResponse.json(phases, { headers: NO_CACHE });
  } catch (csvError) {
    console.error('Error reading CSV for phases:', csvError);
    return NextResponse.json([], { headers: NO_CACHE });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint') || '0';

    if (sprintParam === 'all') return handleAllPhases();
    if (sprintParam === 'continuous') return handleContinuousPhases();
    return handleSprintPhases(sprintParam);
  } catch (error) {
    console.error('Error reading phase metrics:', error);
    return NextResponse.json({ error: 'Failed to load phase metrics' }, { status: 500 });
  }
}
