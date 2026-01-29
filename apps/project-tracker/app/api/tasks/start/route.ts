import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';

interface StartTaskRequest {
  taskId: string;
  runMatop?: boolean;
  skipPlanCheck?: boolean; // For tasks that don't need specs
}

export async function POST(request: Request) {
  try {
    const body: StartTaskRequest = await request.json();
    const { taskId, runMatop, skipPlanCheck } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const projectRoot = join(process.cwd(), '..', '..');
    const specifyDir = join(projectRoot, '.specify');
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    // Read CSV first to get sprint number
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data, meta } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    const tasks = data as Record<string, string>[];

    // Find the task
    const taskIndex = tasks.findIndex((t) => t['Task ID'] === taskId);

    if (taskIndex === -1) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const task = tasks[taskIndex];
    const currentStatus = task.Status;
    const sprintNumber = parseInt(task['Target Sprint'] || '0', 10);
    const sprintDir = join(specifyDir, 'sprints', `sprint-${sprintNumber}`);

    // Sprint-based paths
    const specFile = join(sprintDir, 'specifications', `${taskId}-spec.md`);
    const planFile = join(sprintDir, 'planning', `${taskId}-plan.md`);
    const contextAckFile = join(sprintDir, 'attestations', taskId, 'attestation.json');

    const hasSpec = existsSync(specFile);
    const hasPlan = existsSync(planFile);
    const hasContextAck = existsSync(contextAckFile);

    const specPath = hasSpec
      ? `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`
      : null;
    const planPath = hasPlan
      ? `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`
      : null;

    // Check if task has spec/plan (unless skipped)
    if (!skipPlanCheck) {
      if (!hasSpec || !hasPlan) {
        return NextResponse.json(
          {
            error: 'Task must be planned before starting',
            needsPlanning: true,
            hasSpec,
            hasPlan,
            suggestion: `Run planning first: POST /api/tasks/plan with {"taskId": "${taskId}"}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate status transition - must be Planned to start (or Backlog with skipPlanCheck)
    const validStartStatuses = skipPlanCheck ? ['Backlog', 'Planned', 'Not Started'] : ['Planned']; // Only Planned tasks can be started (they have specs)

    if (!validStartStatuses.includes(currentStatus)) {
      return NextResponse.json(
        {
          error: skipPlanCheck
            ? `Cannot start task with status '${currentStatus}'. Must be: ${validStartStatuses.join(', ')}`
            : `Task must be 'Planned' before starting. Current status: '${currentStatus}'. Run planning first.`,
          currentStatus,
          needsPlanning: currentStatus === 'Backlog',
        },
        { status: 400 }
      );
    }

    // Context Ack is required regardless of planning skip; ensures Gate 10 compliance
    if (!hasContextAck) {
      return NextResponse.json(
        {
          error: 'Context Ack is required before starting this task.',
          needsContextAck: true,
          contextAckPath: `.specify/sprints/sprint-${sprintNumber}/attestations/${taskId}/attestation.json`,
          suggestion:
            'Build a context pack and create an attestation.json acknowledging files and invariants before starting.',
        },
        { status: 400 }
      );
    }

    // Update status to In Progress
    tasks[taskIndex] = {
      ...task,
      Status: 'In Progress',
    };

    // Write back to CSV
    const updatedCsv = Papa.unparse(tasks, {
      header: true,
      quotes: true,
      columns: meta.fields,
    });

    await writeFile(csvPath, updatedCsv, 'utf-8');

    // Trigger sync to update all derived files
    try {
      await fetch(`${getBaseUrl(request)}/api/sync-metrics`, {
        method: 'POST',
      });
    } catch (syncError) {
      console.warn('Sync failed after task start:', syncError);
    }

    return NextResponse.json({
      success: true,
      taskId,
      previousStatus: currentStatus,
      newStatus: 'In Progress',
      specPath,
      planPath,
      runMatop: runMatop ?? false,
      matopCommand: runMatop ? `/matop-execute ${taskId}` : null,
      message: `Task ${taskId} started. Status changed from '${currentStatus}' to 'In Progress'.`,
    });
  } catch (error) {
    console.error('Error starting task:', error);
    return NextResponse.json(
      {
        error: 'Failed to start task',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
