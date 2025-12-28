/**
 * Subprocess Spawner for SWARM and MATOP Execution
 *
 * Spawns and manages Claude Code subprocesses for task execution.
 * Handles Windows/Unix compatibility, timeouts, and output streaming.
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { platform } from 'os';
import { EventEmitter } from 'events';

export interface SubprocessResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
  error?: string;
}

export interface SubprocessOptions {
  taskId: string;
  runId: string;
  timeout?: number; // milliseconds, default 30 minutes
  cwd?: string;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onProgress?: (progress: SubprocessProgress) => void;
}

export interface SubprocessProgress {
  taskId: string;
  runId: string;
  type: 'stdout' | 'stderr' | 'spawn' | 'exit' | 'error' | 'timeout';
  data?: string;
  exitCode?: number;
  timestamp: string;
}

interface ActiveProcess {
  process: ChildProcess;
  taskId: string;
  runId: string;
  startTime: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// Track active processes for cleanup
const activeProcesses = new Map<string, ActiveProcess>();

// Event emitter for process events
export const processEvents = new EventEmitter();

/**
 * Get the project root directory
 */
function getProjectRoot(): string {
  // Navigate from apps/project-tracker to project root
  return join(process.cwd(), '..', '..');
}

/**
 * Determine if running on Windows
 */
function isWindows(): boolean {
  return platform() === 'win32';
}

/**
 * Spawn a SWARM agent subprocess
 *
 * SWARM handles implementation tasks through its 5-phase pipeline:
 * Phase 1: Architect - Spec/Plan via MCP
 * Phase 2: Enforcer - Codex TDD (generates tests)
 * Phase 3: Builder - Claude Code Loop (implementation)
 * Phase 3.5: Quality Gates - TypeCheck, Lint, Security
 * Phase 3.6: TDD Enforcer - Run Generated Tests
 * Phase 4: Gatekeeper - YAML Validation + KPI Checks
 * Phase 5: Auditor - Logic & Security Review
 *
 * CLI: ./orchestrator.sh run-quick <task-id>
 * (run-quick skips qualitative review for automated execution)
 */
export async function spawnSwarmAgent(options: SubprocessOptions): Promise<SubprocessResult> {
  const { taskId, runId, timeout = 30 * 60 * 1000, cwd, onStdout, onStderr, onProgress } = options;

  const projectRoot = cwd || getProjectRoot();
  const scriptPath = join(projectRoot, 'scripts', 'swarm', 'orchestrator.sh');

  // SWARM CLI: ./orchestrator.sh run-quick <task-id>
  // run-quick executes without qualitative review (for automated execution)
  const command = 'bash';
  const args = [scriptPath, 'run-quick', taskId];

  return spawnProcess({
    command,
    args,
    taskId,
    runId,
    timeout,
    cwd: projectRoot,
    onStdout,
    onStderr,
    onProgress,
    type: 'swarm',
  });
}

/**
 * Spawn a MATOP agent subprocess
 *
 * MATOP handles validation tasks through STOA gates:
 * foundation -> domain -> security -> quality -> intelligence -> automation
 */
export async function spawnMatopAgent(options: SubprocessOptions): Promise<SubprocessResult> {
  const { taskId, runId, timeout = 30 * 60 * 1000, cwd, onStdout, onStderr, onProgress } = options;

  const projectRoot = cwd || getProjectRoot();
  const scriptPath = join(projectRoot, 'tools', 'stoa', 'matop-execute.ts');

  let command: string;
  let args: string[];

  if (isWindows()) {
    // Use npx to run tsx
    command = 'npx.cmd';
    args = ['tsx', scriptPath, taskId];
  } else {
    command = 'npx';
    args = ['tsx', scriptPath, taskId];
  }

  return spawnProcess({
    command,
    args,
    taskId,
    runId,
    timeout,
    cwd: projectRoot,
    onStdout,
    onStderr,
    onProgress,
    type: 'matop',
  });
}

interface SpawnProcessOptions extends SubprocessOptions {
  command: string;
  args: string[];
  type: 'swarm' | 'matop';
}

/**
 * Core process spawning function
 */
async function spawnProcess(options: SpawnProcessOptions): Promise<SubprocessResult> {
  const {
    command,
    args,
    taskId,
    runId,
    timeout = 30 * 60 * 1000,
    cwd,
    onStdout,
    onStderr,
    onProgress,
    type,
  } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const emitProgress = (progress: SubprocessProgress) => {
      onProgress?.(progress);
      processEvents.emit('progress', progress);
    };

    try {
      const proc = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          FORCE_COLOR: '0', // Disable ANSI colors for cleaner output
          CI: 'true',
        },
        shell: isWindows(), // Use shell on Windows for better compatibility
      });

      const processKey = `${runId}-${taskId}`;

      // Track the process
      const activeProcess: ActiveProcess = {
        process: proc,
        taskId,
        runId,
        startTime,
      };

      // Set up timeout
      if (timeout > 0) {
        activeProcess.timeoutId = setTimeout(() => {
          killed = true;
          proc.kill('SIGTERM');

          emitProgress({
            taskId,
            runId,
            type: 'timeout',
            data: `Process timed out after ${timeout / 1000}s`,
            timestamp: new Date().toISOString(),
          });

          // Force kill after 5 seconds if not dead
          setTimeout(() => {
            if (activeProcesses.has(processKey)) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }, timeout);
      }

      activeProcesses.set(processKey, activeProcess);

      emitProgress({
        taskId,
        runId,
        type: 'spawn',
        data: `Spawned ${type} agent: ${command} ${args.join(' ')}`,
        timestamp: new Date().toISOString(),
      });

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onStdout?.(text);

        emitProgress({
          taskId,
          runId,
          type: 'stdout',
          data: text,
          timestamp: new Date().toISOString(),
        });
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onStderr?.(text);

        emitProgress({
          taskId,
          runId,
          type: 'stderr',
          data: text,
          timestamp: new Date().toISOString(),
        });
      });

      proc.on('error', (error) => {
        emitProgress({
          taskId,
          runId,
          type: 'error',
          data: error.message,
          timestamp: new Date().toISOString(),
        });

        cleanupProcess(processKey);

        resolve({
          success: false,
          exitCode: null,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          killed,
          error: error.message,
        });
      });

      proc.on('close', (code) => {
        emitProgress({
          taskId,
          runId,
          type: 'exit',
          exitCode: code ?? undefined,
          timestamp: new Date().toISOString(),
        });

        cleanupProcess(processKey);

        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          killed,
        });
      });
    } catch (error) {
      resolve({
        success: false,
        exitCode: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        killed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * Cleanup an active process
 */
function cleanupProcess(processKey: string): void {
  const active = activeProcesses.get(processKey);
  if (active) {
    if (active.timeoutId) {
      clearTimeout(active.timeoutId);
    }
    activeProcesses.delete(processKey);
  }
}

/**
 * Kill a running subprocess
 */
export function killSubprocess(runId: string, taskId: string): boolean {
  const processKey = `${runId}-${taskId}`;
  const active = activeProcesses.get(processKey);

  if (active) {
    active.process.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (activeProcesses.has(processKey)) {
        active.process.kill('SIGKILL');
      }
    }, 5000);

    return true;
  }

  return false;
}

/**
 * Kill all active subprocesses for a run
 */
export function killAllSubprocesses(runId: string): number {
  let killed = 0;

  for (const [key, active] of activeProcesses.entries()) {
    if (active.runId === runId) {
      active.process.kill('SIGTERM');
      killed++;
    }
  }

  // Force kill after 5 seconds
  setTimeout(() => {
    for (const [key, active] of activeProcesses.entries()) {
      if (active.runId === runId) {
        active.process.kill('SIGKILL');
      }
    }
  }, 5000);

  return killed;
}

/**
 * Get list of active subprocesses
 */
export function getActiveSubprocesses(): { taskId: string; runId: string; duration: number }[] {
  const now = Date.now();
  return Array.from(activeProcesses.values()).map((active) => ({
    taskId: active.taskId,
    runId: active.runId,
    duration: now - active.startTime,
  }));
}

/**
 * Spawn multiple agents in parallel with concurrency limit
 */
export async function spawnParallelAgents(
  tasks: Array<{
    taskId: string;
    executionMode: 'swarm' | 'matop' | 'manual';
  }>,
  runId: string,
  options: {
    maxConcurrency?: number;
    timeout?: number;
    onProgress?: (progress: SubprocessProgress) => void;
  } = {}
): Promise<Map<string, SubprocessResult>> {
  const { maxConcurrency = 4, timeout, onProgress } = options;
  const results = new Map<string, SubprocessResult>();

  // Filter out manual tasks
  const executableTasks = tasks.filter((t) => t.executionMode !== 'manual');

  // Process in batches
  for (let i = 0; i < executableTasks.length; i += maxConcurrency) {
    const batch = executableTasks.slice(i, i + maxConcurrency);

    const batchResults = await Promise.all(
      batch.map(async (task) => {
        const spawnFn = task.executionMode === 'swarm' ? spawnSwarmAgent : spawnMatopAgent;

        const result = await spawnFn({
          taskId: task.taskId,
          runId,
          timeout,
          onProgress,
        });

        return { taskId: task.taskId, result };
      })
    );

    for (const { taskId, result } of batchResults) {
      results.set(taskId, result);
    }
  }

  return results;
}

/**
 * Check if scripts exist and are executable
 */
export async function validateScripts(): Promise<{
  swarm: { exists: boolean; path: string };
  matop: { exists: boolean; path: string };
}> {
  const { existsSync } = await import('fs');
  const projectRoot = getProjectRoot();

  const swarmPath = join(projectRoot, 'scripts', 'swarm', 'orchestrator.sh');
  const matopPath = join(projectRoot, 'tools', 'stoa', 'matop-execute.ts');

  return {
    swarm: { exists: existsSync(swarmPath), path: swarmPath },
    matop: { exists: existsSync(matopPath), path: matopPath },
  };
}
