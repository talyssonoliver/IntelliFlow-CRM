/**
 * GET /api/swarm/task-log?taskId=TASK_ID&lines=100
 *
 * Get the log output for a swarm task with optional line limiting.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getSwarmLogPath, isValidTaskId, sanitizeTaskId } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawTaskId = searchParams.get('taskId');
    const lines = parseInt(searchParams.get('lines') || '100', 10);

    if (!rawTaskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // Validate and sanitize taskId to prevent path traversal
    if (!isValidTaskId(rawTaskId)) {
      return NextResponse.json(
        { error: 'Invalid taskId format' },
        { status: 400 }
      );
    }

    const taskId = sanitizeTaskId(rawTaskId);
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID sanitization failed' }, { status: 400 });
    }

    const logPath = getSwarmLogPath(taskId);

    if (!existsSync(logPath)) {
      return NextResponse.json({
        success: true,
        taskId,
        output: '',
        outputLines: 0,
        exists: false,
        message: 'No log file exists yet for this task',
      });
    }

    const fullOutput = await readFile(logPath, 'utf-8');
    const allLines = fullOutput.split('\n');

    // Return last N lines
    const outputLines = allLines.slice(-lines);
    const output = outputLines.join('\n');

    return NextResponse.json({
      success: true,
      taskId,
      output,
      outputLines: outputLines.length,
      totalLines: allLines.length,
      exists: true,
      truncated: allLines.length > lines,
    });
  } catch (error) {
    console.error('[swarm/task-log] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get task log',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
