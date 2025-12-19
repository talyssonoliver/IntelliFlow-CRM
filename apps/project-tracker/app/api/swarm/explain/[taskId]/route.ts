import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PATHS } from '@/lib/paths';

// Convert Windows path to Unix-style for Git Bash
function toUnixPath(windowsPath: string): string {
  let unixPath = windowsPath.replace(/\\/g, '/');
  unixPath = unixPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
  return unixPath;
}

// Get bash executable path (works on Windows and Unix)
function getBashPath(): string {
  if (process.platform === 'win32') {
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\bin\\bash.exe` : '',
    ].filter(Boolean);

    for (const p of gitBashPaths) {
      if (existsSync(p)) {
        return p;
      }
    }
    return 'C:\\Program Files\\Git\\bin\\bash.exe';
  }
  return 'bash';
}

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const orchestratorPath = PATHS.scripts.orchestrator;
    const metricsDir = PATHS.scripts.root;
    const unixOrchestratorPath = toUnixPath(orchestratorPath);
    const bashPath = getBashPath();

    return new Promise<Response>((resolve) => {
      let resolved = false;

      const child = spawn(bashPath, [unixOrchestratorPath, 'explain', taskId], {
        cwd: metricsDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (resolved) return;
        resolved = true;

        // Clean up output
        const cleanStdout = stdout
          .trim()
          .replace(/\r/g, '')
          .replace(/\x1b\[[0-9;]*m/g, '');

        resolve(
          NextResponse.json({
            taskId,
            explanation: cleanStdout,
            success: code === 0,
            exitCode: code,
          })
        );
      });

      child.on('error', (error) => {
        if (resolved) return;
        resolved = true;
        resolve(
          NextResponse.json(
            { error: `Failed to execute explain: ${error.message}` },
            { status: 500 }
          )
        );
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        child.kill();
        resolve(NextResponse.json({ error: 'Command timed out' }, { status: 504 }));
      }, 30000);
    });
  } catch (error) {
    console.error('Explain command error:', error);
    return NextResponse.json({ error: 'Failed to execute explain command' }, { status: 500 });
  }
}
