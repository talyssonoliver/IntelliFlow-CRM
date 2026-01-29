/**
 * POST /api/claude-session/start
 *
 * Start a Claude Code CLI session for spec or plan workflows.
 * For exec (SESSION 3), use /api/tasks/start instead (Swarm system).
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

    // Only allow spec, plan, hydrate - exec uses Swarm
    if (!['spec', 'plan', 'hydrate'].includes(session)) {
      return NextResponse.json(
        {
          error: `Invalid session type: ${session}. Use 'spec', 'plan', or 'hydrate'. For 'exec', use /api/tasks/start (Swarm system).`,
        },
        { status: 400 }
      );
    }

    // Get task from CSV
    const task = await getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: `Task ${taskId} not found in Sprint_plan.csv` }, { status: 404 });
    }

    // Check prerequisites (skip for hydrate as it's Phase 0)
    if (session !== 'hydrate') {
      const check = canProceedToSession(task, session as 'spec' | 'plan');
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
      onComplete: async (finalResult) => {
        // Update status on completion
        if (finalResult.status === 'completed') {
          const successStatus: Record<SessionType, WorkflowStatus> = {
            hydrate: 'Planned', // After hydration, task is planned
            spec: 'Spec Complete',
            plan: 'Plan Complete',
          };
          await updateTaskStatus(taskId, successStatus[session]);
        } else if (finalResult.status === 'failed' || finalResult.status === 'timeout') {
          // Revert to previous logical status on failure
          const failureStatus: Record<SessionType, WorkflowStatus> = {
            hydrate: 'Backlog',
            spec: 'Backlog',
            plan: 'Spec Complete', // Plan failed, still has spec
          };
          await updateTaskStatus(taskId, failureStatus[session]);
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
      message: `Claude Code session started: /${session === 'hydrate' ? 'hydrate-context' : `${session}-session`} ${taskId}`,
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
