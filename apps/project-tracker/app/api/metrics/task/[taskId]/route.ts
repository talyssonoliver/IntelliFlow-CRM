import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const { taskId } = resolvedParams;
  try {
    // Map task IDs to their phase locations
    const taskLocations: Record<string, string> = {
      'ENV-004-AI': 'phase-3-dependencies',
      'EXC-SEC-001': 'phase-2-parallel/parallel-c',
    };

    const location = taskLocations[taskId];
    if (!location) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const taskPath = join(process.cwd(), 'docs', 'metrics', 'sprint-0', location, `${taskId}.json`);

    const content = await readFile(taskPath, 'utf-8');
    const data = JSON.parse(content);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error reading task metrics:', error);
    return NextResponse.json({ error: 'Failed to load task metrics' }, { status: 500 });
  }
}
