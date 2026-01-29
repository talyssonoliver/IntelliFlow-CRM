import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getSwarmLogPath } from '@/lib/paths';

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const logPath = getSwarmLogPath(taskId);

    const logContent = await readFile(logPath, 'utf-8');

    return new NextResponse(logContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error reading log:', error);
    return new NextResponse('Log file not found', { status: 404 });
  }
}
