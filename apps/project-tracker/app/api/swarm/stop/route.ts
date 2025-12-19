import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
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

export async function POST() {
  try {
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

    // Run the stop command
    const bashPath = getBashPath();
    const child = spawn(bashPath, [unixSwarmManagerPath, 'stop'], {
      cwd: metricsDir,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Stop command exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });

    return NextResponse.json({
      success: true,
      message: 'Swarm manager stopped',
      output: stdout,
    });
  } catch (error) {
    console.error('Failed to stop swarm:', error);
    return NextResponse.json(
      { error: 'Failed to stop swarm manager', details: String(error) },
      { status: 500 }
    );
  }
}
