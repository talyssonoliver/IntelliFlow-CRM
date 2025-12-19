import { NextResponse } from 'next/server';
import { unlink } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getLockFilePath } from '@/lib/paths';

const execAsync = promisify(exec);

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const lockFile = getLockFilePath(taskId);

    // Read PID from lock file and kill the process
    try {
      const { readFile } = await import('node:fs/promises');
      const pid = await readFile(lockFile, 'utf-8');

      // Kill process on Windows
      await execAsync(`taskkill /F /PID ${pid.trim()}`);

      // Remove lock file
      await unlink(lockFile);

      return NextResponse.json({ success: true, message: `Task ${taskId} killed` });
    } catch (error) {
      console.error(`Failed to kill task ${taskId}:`, error);
      return NextResponse.json({ success: false, error: 'Failed to kill task' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
