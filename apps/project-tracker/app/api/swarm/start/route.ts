import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { PATHS, ensureArtifactDirs } from '@/lib/paths';

// Convert Windows path to Unix-style for Git Bash
function toUnixPath(windowsPath: string): string {
  let unixPath = windowsPath.replace(/\\/g, '/');
  unixPath = unixPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
  return unixPath;
}

// Get bash executable path (works on Windows and Unix)
function getBashPath(): string {
  if (process.platform === 'win32') {
    const { existsSync } = require('fs');
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\bin\\bash.exe` : '',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\usr\\bin\\bash.exe` : '',
    ].filter(Boolean);

    for (const p of gitBashPaths) {
      if (existsSync(p)) {
        return p;
      }
    }
    // Fallback
    return 'C:\\Program Files\\Git\\bin\\bash.exe';
  }
  return 'bash';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const maxConcurrent = body.maxConcurrent || 4;
    const watchdogThreshold = body.watchdogThreshold || 900;

    // Ensure artifact directories exist before starting
    await ensureArtifactDirs();

    const swarmManagerPath = PATHS.scripts.swarmManager;
    const metricsDir = PATHS.scripts.root;

    // Check if swarm-manager.sh exists
    try {
      await stat(swarmManagerPath);
    } catch {
      return NextResponse.json(
        { error: 'swarm-manager.sh not found', path: swarmManagerPath },
        { status: 404 }
      );
    }

    // Convert paths for Git Bash on Windows
    const unixMetricsDir = toUnixPath(metricsDir);
    const unixSwarmManagerPath = toUnixPath(swarmManagerPath);

    // Spawn the swarm manager process
    const env = {
      ...process.env,
      MAX_CONCURRENT: String(maxConcurrent),
      STUCK_AFTER_SECONDS: String(watchdogThreshold),
      STREAM_TO_CONSOLE: '1',
    };

    // Use bash to run the script (works on Windows with Git Bash/WSL)
    const bashPath = getBashPath();
    const child = spawn(bashPath, [unixSwarmManagerPath, 'run'], {
      cwd: metricsDir,
      env,
      detached: true,
      stdio: 'ignore',
    });

    // Detach the process so it continues running after this request ends
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Swarm manager started',
      pid: child.pid,
      config: {
        maxConcurrent,
        watchdogThreshold,
      },
    });
  } catch (error) {
    console.error('Failed to start swarm:', error);
    return NextResponse.json(
      { error: 'Failed to start swarm manager', details: String(error) },
      { status: 500 }
    );
  }
}
