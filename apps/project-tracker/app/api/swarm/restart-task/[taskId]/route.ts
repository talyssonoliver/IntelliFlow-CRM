import { NextResponse } from 'next/server';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { PATHS } from '@/lib/paths';

const execAsync = promisify(exec);

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const locksPath = PATHS.artifacts.locks;
    const lockFile = join(locksPath, `${taskId}.lock`);

    // Kill existing process
    try {
      const { readFile } = await import('node:fs/promises');
      const pid = await readFile(lockFile, 'utf-8');
      await execAsync(`taskkill /F /PID ${pid.trim()}`);
      await unlink(lockFile);
    } catch {
      // Process might already be dead
    }

    // Restart task by running orchestrator
    const metricsPath = PATHS.scripts.root;
    execAsync(`cd "${metricsPath}" && bash orchestrator.sh run-quick ${taskId}`).catch((err) =>
      console.error('Failed to restart task:', err)
    );

    return NextResponse.json({ success: true, message: `Task ${taskId} will restart` });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
