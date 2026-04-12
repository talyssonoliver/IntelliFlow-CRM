import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const STATUS_SNAPSHOT_PATH = path.join(ARTIFACTS_DIR, 'reports', 'status-snapshot.json');
const COMPLETED_TASKS_PATH = path.join(ARTIFACTS_DIR, 'reports', 'completed-task-ids.txt');
const HISTORY_JSONL_PATH = path.join(ARTIFACTS_DIR, 'reports', 'status-history.jsonl');
const HISTORY_CAP = 500;

export const dynamic = 'force-dynamic';

// Internal type for parsed CSV rows
type TaskRecord = {
  taskId: string;
  status: string;
  section: string;
  sprint: string;
  description: string;
  plannedFinish: string;
};

interface StatusSnapshot {
  generated_at: string;
  total: number;
  completed: number;
  in_progress: number;
  planned: number;
  blocked: number;
  backlog: number;
  tasks: Record<
    string,
    {
      status: string;
      section: string;
      sprint: string;
      description: string;
      planned_finish: string;
    }
  >;
}

interface HistoryEntry {
  timestamp: string;
  summary: {
    total: number;
    completed: number;
    in_progress: number;
    planned: number;
    backlog: number;
    blocked: number;
  };
  delta?: {
    completed: number;
    in_progress: number;
    planned: number;
    blocked: number;
    backlog: number;
  };
}

/**
 * Shared CSV parser using PapaParse. Extracts task records from CSV content.
 * Used by both GET and POST handlers (NF-007: deduplication).
 */
function parseTasks(csvContent: string): TaskRecord[] {
  // Strip BOM before parsing (NF-006)
  const cleaned = csvContent.replace(/^\uFEFF/, '');

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .filter((row) => row['Task ID']?.trim())
    .map((row) => ({
      taskId: row['Task ID']?.trim() ?? '',
      status: row['Status']?.trim() || 'Backlog',
      section: row['Section']?.trim() || '',
      sprint: row['Target Sprint']?.trim() || '',
      description: row['Description']?.trim() || '',
      plannedFinish: row['Planned Finish']?.trim() || '',
    }));
}

/**
 * Counts tasks by status category using all 9+ canonical statuses.
 */
function countStatuses(tasks: TaskRecord[]): {
  completed: number;
  inProgress: number;
  planned: number;
  blocked: number;
  backlog: number;
} {
  let completed = 0;
  let inProgress = 0;
  let planned = 0;
  let blocked = 0;
  let backlog = 0;

  for (const task of tasks) {
    const s = task.status.trim();
    switch (s) {
      case 'Completed':
      case 'Done':
        completed++;
        break;
      case 'In Progress':
      case 'Specifying':
      case 'Planning':
      case 'Validating':
      case 'In Review':
      case 'Plan Complete':
      case 'Spec Complete':
        inProgress++;
        break;
      case 'Planned':
        planned++;
        break;
      case 'Blocked':
      case 'Failed':
      case 'Needs Human':
        blocked++;
        break;
      default:
        backlog++;
        break;
    }
  }

  return { completed, inProgress, planned, blocked, backlog };
}

function buildTasksMap(tasks: TaskRecord[]): StatusSnapshot['tasks'] {
  const map: StatusSnapshot['tasks'] = {};
  for (const t of tasks) {
    map[t.taskId] = {
      status: t.status,
      section: t.section,
      sprint: t.sprint,
      description: t.description,
      planned_finish: t.plannedFinish,
    };
  }
  return map;
}

function parseCSVToSnapshot(csvContent: string): StatusSnapshot {
  const tasks = parseTasks(csvContent);

  if (tasks.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      total: 0,
      completed: 0,
      in_progress: 0,
      planned: 0,
      blocked: 0,
      backlog: 0,
      tasks: {},
    };
  }

  const counts = countStatuses(tasks);

  return {
    generated_at: new Date().toISOString(),
    total: tasks.length,
    completed: counts.completed,
    in_progress: counts.inProgress,
    planned: counts.planned,
    blocked: counts.blocked,
    backlog: counts.backlog,
    tasks: buildTasksMap(tasks),
  };
}

function calculateBySprint(
  tasks: StatusSnapshot['tasks']
): Record<string, { total: number; completed: number }> {
  const result: Record<string, { total: number; completed: number }> = {};
  for (const [, task] of Object.entries(tasks)) {
    const sprint = task.sprint || 'Unknown';
    if (!result[sprint]) result[sprint] = { total: 0, completed: 0 };
    result[sprint].total++;
    const s = task.status.trim();
    if (s === 'Completed' || s === 'Done') {
      result[sprint].completed++;
    }
  }
  return result;
}

function calculateBySection(
  tasks: StatusSnapshot['tasks']
): Record<string, { total: number; completed: number }> {
  const result: Record<string, { total: number; completed: number }> = {};
  for (const [, task] of Object.entries(tasks)) {
    const section = task.section || 'Unknown';
    if (!result[section]) result[section] = { total: 0, completed: 0 };
    result[section].total++;
    const s = task.status.trim();
    if (s === 'Completed' || s === 'Done') {
      result[section].completed++;
    }
  }
  return result;
}

function getRecentCompletions(
  tasks: StatusSnapshot['tasks']
): Array<{ task_id: string; description: string; completed_at: string }> {
  return (
    Object.entries(tasks)
      .filter(([, task]) => {
        const s = task.status.trim();
        return s === 'Completed' || s === 'Done';
      })
      .map(([taskId, task]) => ({
        task_id: taskId,
        // G8 fix: use Description column, fallback to section
        description: task.description || task.section,
        // G7 fix: use Planned Finish, fallback to now()
        completed_at: task.planned_finish
          ? new Date(task.planned_finish + 'T00:00:00').toISOString()
          : new Date().toISOString(),
      }))
      // G10 fix: sort by completed_at descending
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 10)
  );
}

/**
 * Reads history JSONL, parses entries, computes deltas.
 */
async function readHistory(): Promise<HistoryEntry[]> {
  let content: string;
  try {
    content = await fs.readFile(HISTORY_JSONL_PATH, 'utf-8');
  } catch {
    return [];
  }

  const lines = content
    .trim()
    .split('\n')
    .filter((line) => line.trim());

  if (lines.length === 0) return [];

  const entries: HistoryEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // NF-005: skip malformed lines
      console.warn('Skipping malformed JSONL line:', line.substring(0, 80));
    }
  }

  // Compute deltas between consecutive entries
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].summary;
    const curr = entries[i].summary;
    entries[i].delta = {
      completed: curr.completed - prev.completed,
      in_progress: curr.in_progress - prev.in_progress,
      planned: (curr.planned ?? 0) - (prev.planned ?? 0),
      blocked: curr.blocked - prev.blocked,
      backlog: curr.backlog - prev.backlog,
    };
  }

  return entries;
}

/**
 * Appends a history entry and enforces FIFO cap.
 */
async function appendHistory(entry: HistoryEntry): Promise<void> {
  await fs.mkdir(path.dirname(HISTORY_JSONL_PATH), { recursive: true });
  await fs.appendFile(HISTORY_JSONL_PATH, JSON.stringify(entry) + '\n');

  // NF-002: FIFO cap at 500 entries
  try {
    const content = await fs.readFile(HISTORY_JSONL_PATH, 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .filter((l) => l.trim());
    if (lines.length > HISTORY_CAP) {
      const trimmed = lines.slice(lines.length - HISTORY_CAP);
      await fs.writeFile(HISTORY_JSONL_PATH, trimmed.join('\n') + '\n');
    }
  } catch {
    // Cap enforcement is best-effort
  }
}

function buildSnapshotResponse(statusData: StatusSnapshot) {
  return {
    summary: {
      total: statusData.total ?? 0,
      completed: statusData.completed ?? 0,
      in_progress: statusData.in_progress ?? 0,
      planned: statusData.planned ?? 0,
      backlog: statusData.backlog ?? 0,
      blocked: statusData.blocked ?? 0,
    },
    by_sprint: calculateBySprint(statusData.tasks ?? {}),
    by_section: calculateBySection(statusData.tasks ?? {}),
    recent_completions: getRecentCompletions(statusData.tasks ?? {}),
  };
}

export async function GET(request?: NextRequest) {
  try {
    // Check for history mode
    if (request?.nextUrl?.searchParams?.get('history') === 'true') {
      const entries = await readHistory();
      return NextResponse.json({ status: 'ok', entries });
    }

    const csvPath = path.join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    let statusData: StatusSnapshot | null = null;
    let lastUpdated: string | null = null;

    try {
      const csvContent = await fs.readFile(csvPath, 'utf-8');
      statusData = parseCSVToSnapshot(csvContent);
      lastUpdated = new Date().toISOString();
    } catch (csvError) {
      console.error('Failed to read CSV:', csvError);
      // Fallback to cached snapshot (G5/AC-002: handle both schemas)
      try {
        const content = await fs.readFile(STATUS_SNAPSHOT_PATH, 'utf-8');
        const data = JSON.parse(content);
        // Handle Python format (data.counts) vs TypeScript format (data.total)
        if (data.counts) {
          // Python-generated snapshot
          statusData = {
            generated_at: data.generated_at || new Date().toISOString(),
            total: data.counts.total ?? 0,
            completed: data.counts.by_status?.completed ?? 0,
            in_progress: data.counts.by_status?.in_progress ?? 0,
            planned: data.counts.by_status?.planned ?? 0,
            blocked: data.counts.by_status?.blocked ?? 0,
            backlog: data.counts.by_status?.backlog ?? 0,
            tasks: data.tasks ?? {},
          };
        } else {
          statusData = data;
        }
        const stats = await fs.stat(STATUS_SNAPSHOT_PATH);
        lastUpdated = stats.mtime.toISOString();
      } catch {
        // No data available
      }
    }

    const snapshot = statusData ? buildSnapshotResponse(statusData) : null;

    return NextResponse.json({
      status: 'ok',
      snapshot,
      lastUpdated,
    });
  } catch (error) {
    console.error('Error reading status snapshot:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}

export async function POST(_request?: NextRequest) {
  try {
    return await generateStatusFromCSV();
  } catch (error) {
    console.error('Error regenerating status snapshot:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}

async function generateStatusFromCSV(): Promise<NextResponse> {
  try {
    const csvPath = path.join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const csvContent = await fs.readFile(csvPath, 'utf-8');

    const tasks = parseTasks(csvContent);

    if (tasks.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const counts = countStatuses(tasks);
    const tasksMap = buildTasksMap(tasks);
    const completedIds = tasks
      .filter((t) => t.status.trim() === 'Completed' || t.status.trim() === 'Done')
      .map((t) => t.taskId);

    const statusData: StatusSnapshot = {
      generated_at: new Date().toISOString(),
      total: tasks.length,
      completed: counts.completed,
      in_progress: counts.inProgress,
      planned: counts.planned,
      blocked: counts.blocked,
      backlog: counts.backlog,
      tasks: tasksMap,
    };

    // Save the snapshot
    await fs.mkdir(path.dirname(STATUS_SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(STATUS_SNAPSHOT_PATH, JSON.stringify(statusData, null, 2));

    // Append history entry (G1/G2 fix)
    const historyEntry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      summary: {
        total: statusData.total,
        completed: statusData.completed,
        in_progress: statusData.in_progress,
        planned: statusData.planned,
        backlog: statusData.backlog,
        blocked: statusData.blocked,
      },
    };
    await appendHistory(historyEntry);

    const snapshot = buildSnapshotResponse(statusData);

    // Save completed task IDs
    await fs.writeFile(COMPLETED_TASKS_PATH, completedIds.join('\n'));

    return NextResponse.json({
      status: 'ok',
      message: 'Status snapshot generated from CSV',
      snapshot,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: `Failed to generate from CSV: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
