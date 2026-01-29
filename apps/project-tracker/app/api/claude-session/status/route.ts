/**
 * GET /api/claude-session/status
 *
 * Get the status and output of a Claude Code session.
 */

import { NextResponse } from 'next/server';
import { getSessionStatus, getSessionOutput, getAllActiveSessions } from '../../../../lib/claude-session-spawner';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const lines = parseInt(searchParams.get('lines') || '100', 10);
    const listAll = searchParams.get('list') === 'true';

    // List all active sessions
    if (listAll) {
      const activeSessions = getAllActiveSessions();
      return NextResponse.json({
        success: true,
        activeSessions,
        count: activeSessions.length,
      });
    }

    // Get specific session
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required (or use ?list=true to list all)' },
        { status: 400 }
      );
    }

    // Get session status
    const status = await getSessionStatus(sessionId);
    if (!status) {
      return NextResponse.json(
        { error: `Session ${sessionId} not found` },
        { status: 404 }
      );
    }

    // Get session output
    const output = await getSessionOutput(sessionId, lines);

    return NextResponse.json({
      success: true,
      ...status,
      output: output || '',
      outputLines: output?.split('\n').length || 0,
      isActive: status.status === 'running',
    });
  } catch (error) {
    console.error('[claude-session/status] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get session status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
