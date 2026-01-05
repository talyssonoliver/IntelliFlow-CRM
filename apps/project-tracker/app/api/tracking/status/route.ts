import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const STATUS_SNAPSHOT_PATH = path.join(ARTIFACTS_DIR, 'reports', 'status-snapshot.json');
const COMPLETED_TASKS_PATH = path.join(ARTIFACTS_DIR, 'reports', 'completed-task-ids.txt');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface StatusSnapshot {
  generated_at: string;
  total: number;
  completed: number;
  in_progress: number;
  blocked: number;
  backlog: number;
  tasks: Record<string, { status: string; section: string; sprint: string }>;
}

export async function GET() {
  try {
    // Always generate fresh data from CSV to ensure accuracy
    const csvPath = path.join(
      process.cwd(),
      'docs',
      'metrics',
      '_global',
      'Sprint_plan.csv'
    );

    let statusData: StatusSnapshot | null = null;
    let lastUpdated: string | null = null;

    try {
      const csvContent = await fs.readFile(csvPath, 'utf-8');
      statusData = parseCSVToSnapshot(csvContent);
      lastUpdated = new Date().toISOString();
    } catch (csvError) {
      console.error('Failed to read CSV:', csvError);
      // Try to read cached snapshot as fallback
      try {
        const content = await fs.readFile(STATUS_SNAPSHOT_PATH, 'utf-8');
        statusData = JSON.parse(content);
        const stats = await fs.stat(STATUS_SNAPSHOT_PATH);
        lastUpdated = stats.mtime.toISOString();
      } catch {
        // No data available
      }
    }

    // Transform to the format the component expects
    const snapshot = statusData ? {
      summary: {
        total: statusData.total ?? 0,
        completed: statusData.completed ?? 0,
        in_progress: statusData.in_progress ?? 0,
        planned: 0, // Not tracked separately
        backlog: statusData.backlog ?? 0,
        blocked: statusData.blocked ?? 0,
      },
      by_sprint: calculateBySprint(statusData.tasks ?? {}),
      by_section: calculateBySection(statusData.tasks ?? {}),
      recent_completions: getRecentCompletions(statusData.tasks ?? {}),
    } : null;

    return NextResponse.json({
      status: 'ok',
      snapshot,
      lastUpdated,
    });
  } catch (error) {
    console.error('Error reading status snapshot:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}

function parseCSVToSnapshot(csvContent: string): StatusSnapshot {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    return { generated_at: new Date().toISOString(), total: 0, completed: 0, in_progress: 0, blocked: 0, backlog: 0, tasks: {} };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const statusIndex = headers.findIndex(h => h === 'status');
  const taskIdIndex = headers.findIndex(h => h.includes('task'));
  const sectionIndex = headers.findIndex(h => h === 'section');
  const sprintIndex = headers.findIndex(h => h.includes('sprint'));

  const tasks: Record<string, { status: string; section: string; sprint: string }> = {};
  let completed = 0, inProgress = 0, blocked = 0, backlog = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const taskId = values[taskIdIndex]?.trim();
    const status = values[statusIndex]?.trim() || 'Backlog';
    const section = values[sectionIndex]?.trim() || '';
    const sprint = values[sprintIndex]?.trim() || '';

    if (taskId) {
      tasks[taskId] = { status, section, sprint };
      const normalizedStatus = status.toLowerCase();
      if (normalizedStatus === 'completed' || normalizedStatus === 'done') completed++;
      else if (normalizedStatus.includes('progress')) inProgress++;
      else if (normalizedStatus === 'blocked') blocked++;
      else backlog++;
    }
  }

  return { generated_at: new Date().toISOString(), total: Object.keys(tasks).length, completed, in_progress: inProgress, blocked, backlog, tasks };
}

function calculateBySprint(tasks: Record<string, { status: string; section: string; sprint: string }>): Record<string, { total: number; completed: number }> {
  const result: Record<string, { total: number; completed: number }> = {};
  for (const [, task] of Object.entries(tasks)) {
    const sprint = task.sprint || 'Unknown';
    if (!result[sprint]) result[sprint] = { total: 0, completed: 0 };
    result[sprint].total++;
    if (task.status.toLowerCase() === 'completed' || task.status.toLowerCase() === 'done') {
      result[sprint].completed++;
    }
  }
  return result;
}

function calculateBySection(tasks: Record<string, { status: string; section: string; sprint: string }>): Record<string, { total: number; completed: number }> {
  const result: Record<string, { total: number; completed: number }> = {};
  for (const [, task] of Object.entries(tasks)) {
    const section = task.section || 'Unknown';
    if (!result[section]) result[section] = { total: 0, completed: 0 };
    result[section].total++;
    if (task.status.toLowerCase() === 'completed' || task.status.toLowerCase() === 'done') {
      result[section].completed++;
    }
  }
  return result;
}

function getRecentCompletions(tasks: Record<string, { status: string; section: string; sprint: string }>): Array<{ task_id: string; description: string; completed_at: string }> {
  return Object.entries(tasks)
    .filter(([, task]) => task.status.toLowerCase() === 'completed' || task.status.toLowerCase() === 'done')
    .slice(0, 10)
    .map(([taskId, task]) => ({
      task_id: taskId,
      description: task.section,
      completed_at: new Date().toISOString(),
    }));
}

export async function POST() {
  try {
    // Generate status from CSV directly (most reliable approach)
    return await generateStatusFromCSV();
  } catch (error) {
    console.error('Error regenerating status snapshot:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}

async function generateStatusFromCSV(): Promise<NextResponse> {
  try {
    const csvPath = path.join(
      process.cwd(),
      'docs',
      'metrics',
      '_global',
      'Sprint_plan.csv'
    );
    const csvContent = await fs.readFile(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = lines[0].split(',');
    const statusIndex = headers.findIndex(h => h.toLowerCase() === 'status');
    const taskIdIndex = headers.findIndex(h => h.toLowerCase().includes('task'));
    const sectionIndex = headers.findIndex(h => h.toLowerCase() === 'section');
    const sprintIndex = headers.findIndex(h => h.toLowerCase().includes('sprint'));

    const tasks: Record<string, { status: string; section: string; sprint: string }> = {};
    let completed = 0;
    let inProgress = 0;
    let blocked = 0;
    let backlog = 0;
    const completedIds: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parsing (doesn't handle quoted fields with commas)
      const values = lines[i].split(',');
      const taskId = values[taskIdIndex]?.trim();
      const status = values[statusIndex]?.trim() || 'Backlog';
      const section = values[sectionIndex]?.trim() || '';
      const sprint = values[sprintIndex]?.trim() || '';

      if (taskId) {
        tasks[taskId] = { status, section, sprint };

        const normalizedStatus = status.toLowerCase();
        if (normalizedStatus === 'completed' || normalizedStatus === 'done') {
          completed++;
          completedIds.push(taskId);
        } else if (normalizedStatus.includes('progress')) {
          inProgress++;
        } else if (normalizedStatus === 'blocked') {
          blocked++;
        } else {
          backlog++;
        }
      }
    }

    const statusData: StatusSnapshot = {
      generated_at: new Date().toISOString(),
      total: Object.keys(tasks).length,
      completed,
      in_progress: inProgress,
      blocked,
      backlog,
      tasks,
    };

    // Save the snapshot
    await fs.mkdir(path.dirname(STATUS_SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(STATUS_SNAPSHOT_PATH, JSON.stringify(statusData, null, 2));

    // Transform to the format the component expects
    const snapshot = {
      summary: {
        total: statusData.total,
        completed: statusData.completed,
        in_progress: statusData.in_progress,
        planned: 0,
        backlog: statusData.backlog,
        blocked: statusData.blocked,
      },
      by_sprint: calculateBySprint(statusData.tasks),
      by_section: calculateBySection(statusData.tasks),
      recent_completions: getRecentCompletions(statusData.tasks),
    };

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
      { status: 'error', message: `Failed to generate from CSV: ${error}` },
      { status: 500 }
    );
  }
}
