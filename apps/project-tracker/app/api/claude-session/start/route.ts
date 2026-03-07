/**
 * POST /api/claude-session/start
 *
 * Start a Claude Code CLI session for spec, plan, or exec workflows.
 * All sessions use the same Claude Code 7-phase workflow.
 */

import { NextResponse } from 'next/server';
import { spawnClaudeSession, type SessionType } from '../../../../lib/claude-session-spawner';
import {
  canProceedToSession,
  getTask,
  updateTaskStatus,
  type WorkflowStatus,
} from '../../../../lib/csv-status';

export const dynamic = 'force-dynamic';

interface StartSessionRequest {
  taskId: string;
  session: SessionType;
  timeout?: number;
}

// Map session type to workflow status
const SESSION_START_STATUS: Record<SessionType, WorkflowStatus> = {
  hydrate: 'In Progress',
  spec: 'Specifying',
  plan: 'Planning',
  exec: 'In Progress',
};

export async function POST(request: Request) {
  try {
    const body: StartSessionRequest = await request.json();
    const { taskId, session, timeout } = body;

    // Validate inputs
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: 'session is required' }, { status: 400 });
    }

    if (!['spec', 'plan', 'hydrate', 'exec'].includes(session)) {
      return NextResponse.json(
        {
          error: `Invalid session type: ${session}. Use 'spec', 'plan', 'hydrate', or 'exec'.`,
        },
        { status: 400 }
      );
    }

    // Get task from CSV
    const task = await getTask(taskId);
    if (!task) {
      return NextResponse.json(
        { error: `Task ${taskId} not found in Sprint_plan.csv` },
        { status: 404 }
      );
    }

    // Check prerequisites (skip for hydrate as it's Phase 0)
    if (session !== 'hydrate') {
      const sessionCheck = session === 'exec' ? 'exec' : session;
      const check = canProceedToSession(task, sessionCheck);
      if (!check.canProceed) {
        return NextResponse.json(
          {
            error: check.reason || `Cannot proceed to ${session} session`,
            missingArtifacts: (check as { missingArtifacts?: string[] }).missingArtifacts,
          },
          { status: 400 }
        );
      }
    }

    // Update task status
    const startStatus = SESSION_START_STATUS[session];
    await updateTaskStatus(taskId, startStatus);

    // Spawn Claude Code session
    const result = await spawnClaudeSession({
      taskId,
      session,
      timeout,
      onComplete: (finalResult) => {
        // Update status on completion
        if (finalResult.status === 'completed') {
          const successStatus: Record<SessionType, WorkflowStatus> = {
            hydrate: 'Planned',
            spec: 'Spec Complete',
            plan: 'Plan Complete',
            exec: 'Completed',
          };
          updateTaskStatus(taskId, successStatus[session]).catch(() => {});
        } else if (finalResult.status === 'failed' || finalResult.status === 'timeout') {
          const failureStatus: Record<SessionType, WorkflowStatus> = {
            hydrate: 'Backlog',
            spec: 'Backlog',
            plan: 'Spec Complete',
            exec: 'Failed',
          };
          updateTaskStatus(taskId, failureStatus[session]).catch(() => {});
        }
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      taskId,
      session,
      status: result.status,
      outputFile: result.outputFile,
      statusFile: result.statusFile,
      startedAt: result.startedAt,
      pid: result.pid,
      message: (() => {
        let sessionPath: string;
        if (session === 'hydrate') {
          sessionPath = '/hydrate-context';
        } else if (session === 'exec') {
          sessionPath = '/exec';
        } else {
          sessionPath = `/${session}-session`;
        }
        return `Claude Code session started: ${sessionPath} ${taskId}`;
      })(),
    });
  } catch (error) {
    console.error('[claude-session/start] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start Claude session',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
