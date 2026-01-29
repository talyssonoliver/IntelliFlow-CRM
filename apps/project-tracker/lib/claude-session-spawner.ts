/**
 * Claude Session Spawner
 *
 * Spawns Claude Code CLI sessions for spec and plan workflows.
 * For exec (SESSION 3), use the existing Swarm system instead.
 *
 * This module handles:
 * - Spawning `claude --print "/command taskId"` processes
 * - Tracking active sessions
 * - Capturing output to log files
 * - Managing session lifecycle (timeout, kill)
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdir, writeFile, appendFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

// Session types that this spawner handles
export type SessionType = 'spec' | 'plan' | 'hydrate';

export interface ClaudeSessionConfig {
  taskId: string;
  session: SessionType;
  timeout?: number; // Default: 30 minutes
  onOutput?: (data: string) => void;
  onComplete?: (result: ClaudeSessionResult) => void;
}

export interface ClaudeSessionResult {
  sessionId: string;
  taskId: string;
  session: SessionType;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  exitCode?: number;
  outputFile: string;
  statusFile: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  pid?: number;
}

// Map session type to Claude Code command
const SESSION_COMMANDS: Record<SessionType, string> = {
  hydrate: '/hydrate-context',
  spec: '/spec-session',
  plan: '/plan-session',
};

// Track active sessions in memory
const activeSessions = new Map<
  string,
  {
    child: ChildProcess;
    result: ClaudeSessionResult;
    timeoutId?: NodeJS.Timeout;
  }
>();

/**
 * Get the project root directory
 */
function getProjectRoot(): string {
  // From apps/project-tracker, go up two levels
  return join(process.cwd(), '..', '..');
}

/**
 * Get the logs directory for Claude sessions
 */
function getLogsDir(): string {
  return join(getProjectRoot(), 'artifacts', 'logs', 'claude-sessions');
}

/**
 * Get the status directory for Claude sessions
 */
function getStatusDir(): string {
  return join(getProjectRoot(), 'artifacts', 'misc', '.claude-sessions');
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const random = randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Spawn a Claude Code CLI session
 *
 * @param config Session configuration
 * @returns Session result with tracking info
 */
export async function spawnClaudeSession(
  config: ClaudeSessionConfig
): Promise<ClaudeSessionResult> {
  const sessionId = generateSessionId();
  const { taskId, session, timeout = 30 * 60 * 1000 } = config;

  // Create output directories
  const logsDir = getLogsDir();
  const statusDir = getStatusDir();
  await mkdir(logsDir, { recursive: true });
  await mkdir(statusDir, { recursive: true });

  const outputFile = join(logsDir, `${sessionId}.log`);
  const statusFile = join(statusDir, `${sessionId}.json`);

  // Build Claude command
  const command = SESSION_COMMANDS[session];
  const prompt = `${command} ${taskId}`;

  // Initial status
  const result: ClaudeSessionResult = {
    sessionId,
    taskId,
    session,
    status: 'running',
    outputFile,
    statusFile,
    startedAt: new Date().toISOString(),
  };

  // Write initial status
  await writeFile(statusFile, JSON.stringify(result, null, 2));

  // Write initial log header
  await writeFile(
    outputFile,
    `=== Claude Session: ${session} for ${taskId} ===\n` +
      `Session ID: ${sessionId}\n` +
      `Started: ${result.startedAt}\n` +
      `Command: claude --print "${prompt}"\n` +
      `${'='.repeat(50)}\n\n`
  );

  // Spawn Claude Code CLI
  // Use --print to run non-interactively
  const child = spawn('claude', ['--print', prompt], {
    cwd: getProjectRoot(),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      // Ensure Claude uses the correct working directory
      CLAUDE_CODE_CWD: getProjectRoot(),
    },
  });

  result.pid = child.pid;

  // Handle stdout
  child.stdout?.on('data', async (data) => {
    const text = data.toString();
    try {
      await appendFile(outputFile, text);
    } catch {
      // Ignore write errors
    }
    config.onOutput?.(text);
  });

  // Handle stderr
  child.stderr?.on('data', async (data) => {
    const text = `[STDERR] ${data.toString()}`;
    try {
      await appendFile(outputFile, text);
    } catch {
      // Ignore write errors
    }
    config.onOutput?.(text);
  });

  // Handle process exit
  child.on('close', async (code) => {
    // Clear timeout if set
    const sessionData = activeSessions.get(sessionId);
    if (sessionData?.timeoutId) {
      clearTimeout(sessionData.timeoutId);
    }

    // Update result
    result.status = code === 0 ? 'completed' : 'failed';
    result.exitCode = code ?? undefined;
    result.completedAt = new Date().toISOString();

    // Write final status
    try {
      await writeFile(statusFile, JSON.stringify(result, null, 2));
      await appendFile(
        outputFile,
        `\n${'='.repeat(50)}\n` +
          `Session ${result.status.toUpperCase()}\n` +
          `Exit Code: ${code}\n` +
          `Completed: ${result.completedAt}\n`
      );
    } catch {
      // Ignore write errors
    }

    // Remove from active sessions
    activeSessions.delete(sessionId);

    // Call completion callback
    config.onComplete?.(result);
  });

  // Handle errors
  child.on('error', async (err) => {
    result.status = 'failed';
    result.error = err.message;
    result.completedAt = new Date().toISOString();

    try {
      await writeFile(statusFile, JSON.stringify(result, null, 2));
      await appendFile(outputFile, `\n[ERROR] ${err.message}\n`);
    } catch {
      // Ignore write errors
    }

    activeSessions.delete(sessionId);
    config.onComplete?.(result);
  });

  // Set up timeout
  const timeoutId = setTimeout(async () => {
    if (activeSessions.has(sessionId)) {
      console.log(`[Claude Session] Timeout for session ${sessionId}`);

      // Try graceful termination first
      child.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (activeSessions.has(sessionId)) {
          child.kill('SIGKILL');
        }
      }, 5000);

      result.status = 'timeout';
      result.error = `Session timed out after ${timeout}ms`;
      result.completedAt = new Date().toISOString();

      try {
        await writeFile(statusFile, JSON.stringify(result, null, 2));
        await appendFile(outputFile, `\n[TIMEOUT] Session timed out after ${timeout}ms\n`);
      } catch {
        // Ignore write errors
      }
    }
  }, timeout);

  // Track session
  activeSessions.set(sessionId, { child, result, timeoutId });

  return result;
}

/**
 * Get an active session by ID
 */
export function getActiveSession(sessionId: string): ClaudeSessionResult | null {
  return activeSessions.get(sessionId)?.result ?? null;
}

/**
 * Get all active sessions
 */
export function getAllActiveSessions(): ClaudeSessionResult[] {
  return Array.from(activeSessions.values()).map((s) => s.result);
}

/**
 * Kill a running session
 */
export function killSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    // Clear timeout
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    // Kill process
    session.child.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (activeSessions.has(sessionId)) {
        session.child.kill('SIGKILL');
      }
    }, 5000);

    return true;
  }
  return false;
}

/**
 * Get session status from file (for completed sessions)
 */
export async function getSessionStatus(sessionId: string): Promise<ClaudeSessionResult | null> {
  // First check active sessions
  const active = getActiveSession(sessionId);
  if (active) {
    return active;
  }

  // Check status file
  const statusFile = join(getStatusDir(), `${sessionId}.json`);
  if (!existsSync(statusFile)) {
    return null;
  }

  try {
    const content = await readFile(statusFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get session output (last N lines)
 */
export async function getSessionOutput(
  sessionId: string,
  lines: number = 100
): Promise<string | null> {
  const outputFile = join(getLogsDir(), `${sessionId}.log`);
  if (!existsSync(outputFile)) {
    return null;
  }

  try {
    const content = await readFile(outputFile, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch {
    return null;
  }
}

/**
 * List all session files (for history)
 */
export async function listSessions(): Promise<string[]> {
  const statusDir = getStatusDir();
  if (!existsSync(statusDir)) {
    return [];
  }

  const { readdir } = await import('fs/promises');
  const files = await readdir(statusDir);
  return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
}
