import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';

interface TaskRecord {
  'Task ID': string;
  'Target Sprint': string;
}

interface BatchTaskStatus {
  sprintNumber: number;
  hasSpec: boolean;
  hasPlan: boolean;
  hasContext: boolean;
  isPlanned: boolean;
  specPath: string | null;
  planPath: string | null;
}

/**
 * GET /api/tasks/plan-batch?taskIds=X,Y,Z
 *
 * Batch endpoint that checks spec/plan/context status for multiple tasks
 * in a single request. Reads CSV once and does all filesystem checks in
 * one loop — eliminates the N+1 problem of calling /api/tasks/plan per task.
 *
 * If taskIds is omitted, returns status for all tasks in the CSV.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskIdsParam = searchParams.get('taskIds');

    const projectRoot = join(process.cwd(), '..', '..');
    const specifyDir = join(projectRoot, '.specify');
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    // Read CSV once
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    const allTasks = data as TaskRecord[];

    // Build taskId → sprintNumber map from CSV
    const sprintMap = new Map<string, number>();
    for (const task of allTasks) {
      const id = task['Task ID'];
      if (id) {
        sprintMap.set(id, parseInt(task['Target Sprint'] || '0', 10));
      }
    }

    // Determine which task IDs to check
    const requestedIds = taskIdsParam
      ? taskIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
      : Array.from(sprintMap.keys());

    // Batch check filesystem for all requested tasks
    const tasks: Record<string, BatchTaskStatus> = {};

    for (const taskId of requestedIds) {
      const sprintNumber = sprintMap.get(taskId) ?? 0;
      const sprintDir = join(specifyDir, 'sprints', `sprint-${sprintNumber}`);

      const specFile = join(sprintDir, 'specifications', `${taskId}-spec.md`);
      const planFile = join(sprintDir, 'planning', `${taskId}-plan.md`);
      const contextFile = join(sprintDir, 'context', taskId, 'hydrated-context.md');

      const hasSpec = existsSync(specFile);
      const hasPlan = existsSync(planFile);
      const hasContext = existsSync(contextFile);

      tasks[taskId] = {
        sprintNumber,
        hasSpec,
        hasPlan,
        hasContext,
        isPlanned: hasSpec && hasPlan,
        specPath: hasSpec
          ? `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`
          : null,
        planPath: hasPlan
          ? `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`
          : null,
      };
    }

    return NextResponse.json(
      { tasks },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Error in plan-batch:', error);
    return NextResponse.json(
      {
        error: 'Failed to batch check plan status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
