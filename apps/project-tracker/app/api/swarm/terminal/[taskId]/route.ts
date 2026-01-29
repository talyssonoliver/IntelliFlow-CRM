import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getSwarmLogPath, getInputFilePath } from '@/lib/paths';

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const logPath = getSwarmLogPath(taskId);

    // Read last 100 lines of log
    const logContent = await readFile(logPath, 'utf-8');
    const lines = logContent.split('\n');
    const recentLines = lines.slice(-100).join('\n');

    // Detect if waiting for input
    const waitingForInput =
      recentLines.includes('Press any key') ||
      recentLines.includes('Continue?') ||
      recentLines.includes('[y/n]') ||
      recentLines.includes('Enter') ||
      recentLines.includes('Prompt') ||
      recentLines.includes('waiting') ||
      !lines
        .at(-1)
        ?.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return NextResponse.json({
      fullLog: logContent,
      recentOutput: recentLines,
      waitingForInput,
      totalLines: lines.length,
    });
  } catch (error) {
    console.error('Error reading terminal output:', error);
    return NextResponse.json({ error: 'Failed to read terminal output' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { input } = await request.json();

    // Write input to a file that the orchestrator can read
    const { writeFile } = await import('node:fs/promises');
    const inputPath = getInputFilePath(taskId);

    await writeFile(inputPath, input + '\n');

    return NextResponse.json({ success: true, message: 'Input sent' });
  } catch (error) {
    console.error('Error sending input:', error);
    return NextResponse.json({ error: 'Failed to send input' }, { status: 500 });
  }
}
