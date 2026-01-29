/**
 * POST /api/swarm/run-task/[taskId]
 *
 * Run a task via orchestrator.sh run (full pipeline with qualitative review).
 * This is the proper way to execute SESSION 3 (Exec) from the UI.
 *
 * Difference from restart-task:
 * - restart-task uses `run-quick` (skips review)
 * - run-task uses `run` (full pipeline including review step)
 */

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { PATHS, isValidTaskId, sanitizeTaskId, getSwarmLogPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

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
      'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\bin\\bash.exe` : '',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\usr\\bin\\bash.exe` : '',
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId: rawTaskId } = await params;

    if (!rawTaskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // Validate and sanitize taskId to prevent command injection
    if (!isValidTaskId(rawTaskId)) {
      return NextResponse.json(
        {
          error: 'Invalid taskId format',
          details: 'Task ID must match pattern like IFC-001, PG-015, ENV-001-AI, etc.',
        },
        { status: 400 }
      );
    }

    const taskId = sanitizeTaskId(rawTaskId);
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID sanitization failed' }, { status: 400 });
    }

    const orchestratorPath = PATHS.scripts.orchestrator;
    const metricsDir = PATHS.scripts.root;

    // Verify orchestrator exists
    if (!existsSync(orchestratorPath)) {
      return NextResponse.json(
        { error: 'orchestrator.sh not found', path: orchestratorPath },
        { status: 404 }
      );
    }

    // Convert paths for Git Bash on Windows
    const unixOrchestratorPath = toUnixPath(orchestratorPath);
    const bashPath = getBashPath();

    // Ensure log directory exists
    const logPath = getSwarmLogPath(taskId);
    const logDir = PATHS.artifacts.swarmLogs;
    mkdirSync(logDir, { recursive: true });

    // Convert log path to Unix style for Git Bash redirection
    const unixLogPath = toUnixPath(logPath);

    // Write startup header to log
    const startHeader = `\n${'='.repeat(60)}\n[API] Task ${taskId} started via /api/swarm/run-task\n[API] Time: ${new Date().toISOString()}\n[API] Command: ${bashPath} ${unixOrchestratorPath} run ${taskId}\n${'='.repeat(60)}\n\n`;
    appendFileSync(logPath, startHeader);

    // Build command with shell-level redirection (works reliably on Windows with Git Bash)
    // The -c flag runs a command string, and we redirect both stdout and stderr to the log file
    const shellCommand = `"${unixOrchestratorPath}" run "${taskId}" >> "${unixLogPath}" 2>&1`;

    // Spawn orchestrator.sh run <taskId> (full pipeline with review)
    // Using detached mode so it continues after the HTTP response
    // Use shell: true with bash -c to ensure proper output redirection on Windows
    const child = spawn(bashPath, ['-c', shellCommand], {
      cwd: metricsDir,
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
      shell: false, // We're already using bash -c, no need for shell wrapping
    });

    // Handle spawn errors (captured before detaching)
    let spawnError: Error | null = null;
    child.on('error', (err) => {
      spawnError = err;
      const errorMsg = `[API ERROR] Spawn failed: ${err.message}\n`;
      try {
        appendFileSync(logPath, errorMsg);
      } catch {
        // Ignore write errors during error handling
      }
      console.error(`[swarm/run-task] Spawn error for ${taskId}:`, err);
    });

    // Give a brief moment for spawn errors to surface
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (spawnError) {
      return NextResponse.json(
        {
          error: 'Failed to spawn orchestrator process',
          details: (spawnError as Error).message,
          logPath,
        },
        { status: 500 }
      );
    }

    // Detach the process so it continues running after this request ends
    child.unref();

    return NextResponse.json({
      success: true,
      taskId,
      pid: child.pid,
      command: `orchestrator.sh run ${taskId}`,
      message: `Task ${taskId} execution started (full pipeline with review)`,
      logPath,
    });
  } catch (error) {
    console.error('[swarm/run-task] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start task execution',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
