import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { getSwarmLogPath, getAggregateSwarmLogPath } from '@/lib/paths';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const lines = parseInt(searchParams.get('lines') || '100', 10);

  try {
    let logPath: string;

    if (taskId && taskId !== 'swarm') {
      // Individual task log
      logPath = getSwarmLogPath(taskId);
    } else {
      // Aggregate swarm log
      logPath = getAggregateSwarmLogPath();
    }

    // Check if file exists
    try {
      await stat(logPath);
    } catch {
      return NextResponse.json({
        content: '',
        lines: 0,
        error: 'Log file not found',
      });
    }

    const content = await readFile(logPath, 'utf-8');
    const allLines = content.split('\n').filter((line) => line.trim());
    const lastLines = allLines.slice(-lines);

    return NextResponse.json({
      content: lastLines.join('\n'),
      lines: lastLines.length,
      totalLines: allLines.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error reading log:', error);
    return NextResponse.json(
      {
        content: '',
        lines: 0,
        error: 'Failed to read log',
      },
      { status: 500 }
    );
  }
}
