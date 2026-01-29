/**
 * POST /api/claude-session/kill
 *
 * Kill a running Claude Code session.
 */

import { NextResponse } from 'next/server';
import { killSession, getSessionStatus } from '../../../../lib/claude-session-spawner';
import { updateTaskStatus } from '../../../../lib/csv-status';

export const dynamic = 'force-dynamic';

interface KillSessionRequest {
  sessionId: string;
  revertStatus?: boolean; // If true, revert task status to previous state
}

export async function POST(request: Request) {
  try {
    const body: KillSessionRequest = await request.json();
    const { sessionId, revertStatus = true } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Get session info before killing
    const sessionInfo = await getSessionStatus(sessionId);
    if (!sessionInfo) {
      return NextResponse.json(
        { error: `Session ${sessionId} not found` },
        { status: 404 }
      );
    }

    if (sessionInfo.status !== 'running') {
      return NextResponse.json(
        {
          error: `Session ${sessionId} is not running (status: ${sessionInfo.status})`,
          session: sessionInfo,
        },
        { status: 400 }
      );
    }

    // Kill the session
    const killed = killSession(sessionId);

    if (!killed) {
      return NextResponse.json(
        { error: `Failed to kill session ${sessionId} - process may have already exited` },
        { status: 500 }
      );
    }

    // Revert task status if requested
    if (revertStatus && sessionInfo.taskId) {
      const revertStatusMap: Record<string, string> = {
        spec: 'Backlog',
        plan: 'Spec Complete',
        hydrate: 'Backlog',
      };
      const newStatus = revertStatusMap[sessionInfo.session] || 'Backlog';
      await updateTaskStatus(sessionInfo.taskId, newStatus as 'Backlog' | 'Spec Complete');
    }

    return NextResponse.json({
      success: true,
      sessionId,
      taskId: sessionInfo.taskId,
      session: sessionInfo.session,
      message: `Session ${sessionId} terminated`,
      statusReverted: revertStatus,
    });
  } catch (error) {
    console.error('[claude-session/kill] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to kill session',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
