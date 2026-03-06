/**
 * Validation Command Runner Module
 *
 * Executes VALIDATE: commands from Sprint_plan.csv and captures
 * results with exit codes, stdout hashes, and timing.
 *
 * @module tools/scripts/lib/sprint-audit/validation-runner
 */

import { spawn, SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { ValidationResult } from './types';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_TIMEOUT_MS = 1_000_000; // 1000 seconds
const MAX_STDOUT_SIZE = 1_000_000; // 1MB max stdout to capture

// =============================================================================
// Validation Command Parsing
// =============================================================================

/**
 * Parses validation method field to extract commands
 * Handles formats like:
 * - "VALIDATE: pnpm test"
 * - "VALIDATE: pnpm typecheck && pnpm lint"
 * - "Manual verification"
 * - "pnpm test:unit"
 */
export function parseValidationCommands(validationMethod: string): string[] {
  if (!validationMethod || validationMethod.trim() === '') {
    return [];
  }

  const commands: string[] = [];

  // Check for VALIDATE: prefix
  const validatePattern = /VALIDATE:\s*([^\n;]+)/gi;
  let match;

  while ((match = validatePattern.exec(validationMethod)) !== null) {
    const command = match[1].trim();
    if (command && !isManualValidation(command)) {
      commands.push(command);
    }
  }

  // If no VALIDATE: prefix, check if the whole thing looks like a command
  if (commands.length === 0) {
    const trimmed = validationMethod.trim();
    if (looksLikeCommand(trimmed)) {
      commands.push(trimmed);
    }
  }

  return commands;
}

/**
 * Checks if text represents manual validation
 */
function isManualValidation(text: string): boolean {
  const manualPatterns = [
    /^manual/i,
    /^human/i,
    /^review/i,
    /^visual/i,
    /^inspect/i,
    /^verify\s+manually/i,
    /^n\/a$/i,
    /^none$/i,
    /^-$/,
  ];

  return manualPatterns.some((p) => p.test(text.trim()));
}

/**
 * Checks if text looks like an executable command
 */
function looksLikeCommand(text: string): boolean {
  const commandPatterns = [
    /^pnpm\s+/,
    /^npm\s+/,
    /^npx\s+/,
    /^yarn\s+/,
    /^node\s+/,
    /^tsx\s+/,
    /^ts-node\s+/,
    /^vitest/,
    /^jest/,
    /^playwright/,
    /^curl\s+/,
    /^git\s+/,
    /^docker\s+/,
    /^make\s+/,
    /^\.\/\w+/,
    /^bash\s+/,
    /^sh\s+/,
  ];

  return commandPatterns.some((p) => p.test(text));
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Executes a single validation command
 */
export async function executeCommand(
  command: string,
  taskId: string,
  repoRoot: string,
  logsDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ValidationResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const logFileName = `${taskId}_${Date.now()}.log`;
  const logPath = path.join(logsDir, logFileName);

  // Ensure logs directory exists
  await fs.promises.mkdir(logsDir, { recursive: true });

  let stdout = '';
  let stderr = '';
  let exitCode = -1;
  let error: string | undefined;

  try {
    const result = await runWithTimeout(command, repoRoot, timeoutMs);
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('timeout')) {
        error = `Command timed out after ${timeoutMs}ms`;
        exitCode = 124; // Standard timeout exit code
      } else {
        error = err.message;
        exitCode = 1;
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // Write log file
  const logContent = [
    `Task ID: ${taskId}`,
    `Command: ${command}`,
    `Timestamp: ${timestamp}`,
    `Duration: ${durationMs}ms`,
    `Exit Code: ${exitCode}`,
    ``,
    `=== STDOUT ===`,
    stdout || '(empty)',
    ``,
    `=== STDERR ===`,
    stderr || '(empty)',
    ``,
    error ? `=== ERROR ===\n${error}` : '',
  ].join('\n');

  await fs.promises.writeFile(logPath, logContent, 'utf-8');

  // Calculate stdout hash for proof
  const stdoutHash = createHash('sha256').update(stdout).digest('hex');

  return {
    taskId,
    command,
    exitCode,
    passed: exitCode === 0,
    durationMs,
    stdoutHash,
    logPath: path.relative(repoRoot, logPath),
    timestamp,
    error,
  };
}

/**
 * Kills a process tree on Windows using taskkill
 */
function killProcessTree(pid: number): void {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    try {
      // Use taskkill to kill the entire process tree on Windows
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      });
    } catch {
      // Ignore errors - process may already be dead
    }
  }
}

/**
 * Runs a command with timeout using spawn
 */
function runWithTimeout(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let resolved = false;

    // Determine shell based on platform
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const options: SpawnOptions = {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    };

    const proc = spawn(shell, shellArgs, options);

    // Set timeout
    const timer = setTimeout(() => {
      if (resolved) return;
      killed = true;

      // On Windows, use taskkill to kill the process tree
      if (isWindows && proc.pid) {
        killProcessTree(proc.pid);
      } else {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }

      // Force resolve after a short delay if process doesn't close
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Command timeout after ${timeoutMs}ms`));
        }
      }, 2000);
    }, timeoutMs);

    // Capture stdout with size limit
    proc.stdout?.on('data', (data) => {
      if (stdout.length < MAX_STDOUT_SIZE) {
        stdout += data.toString();
      }
    });

    // Capture stderr with size limit
    proc.stderr?.on('data', (data) => {
      if (stderr.length < MAX_STDOUT_SIZE) {
        stderr += data.toString();
      }
    });

    proc.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`Command timeout after ${timeoutMs}ms`));
      } else {
        resolve({
          stdout: stdout.slice(0, MAX_STDOUT_SIZE),
          stderr: stderr.slice(0, MAX_STDOUT_SIZE),
          exitCode: code ?? 1,
        });
      }
    });

    proc.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

// =============================================================================
// Batch Validation
// =============================================================================

/**
 * Runs all validations for a task
 */
export async function runTaskValidations(
  taskId: string,
  validationMethod: string,
  repoRoot: string,
  logsDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ValidationResult[]> {
  const commands = parseValidationCommands(validationMethod);
  const results: ValidationResult[] = [];

  if (commands.length === 0) {
    return results;
  }

  for (const command of commands) {
    const result = await executeCommand(command, taskId, repoRoot, logsDir, timeoutMs);
    results.push(result);

    // Stop on first failure (fail-fast)
    if (!result.passed) {
      break;
    }
  }

  return results;
}

/**
 * Runs validations for multiple tasks
 */
export async function runMultipleTaskValidations(
  tasks: Array<{ taskId: string; validationMethod: string }>,
  repoRoot: string,
  logsDir: string,
  parallelLimit: number = 2,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Map<string, ValidationResult[]>> {
  const results = new Map<string, ValidationResult[]>();

  // Process in limited parallel batches (validations can be resource-intensive)
  for (let i = 0; i < tasks.length; i += parallelLimit) {
    const batch = tasks.slice(i, i + parallelLimit);
    const batchResults = await Promise.all(
      batch.map(async (task) => ({
        taskId: task.taskId,
        results: await runTaskValidations(
          task.taskId,
          task.validationMethod,
          repoRoot,
          logsDir,
          timeoutMs
        ),
      }))
    );

    for (const result of batchResults) {
      results.set(result.taskId, result.results);
    }
  }

  return results;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generates a summary of validation results
 */
export function generateValidationSummary(results: ValidationResult[]): {
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  totalDurationMs: number;
  failedCommands: string[];
} {
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    timedOut: 0,
    totalDurationMs: 0,
    failedCommands: [] as string[],
  };

  for (const r of results) {
    summary.totalDurationMs += r.durationMs;

    if (r.passed) {
      summary.passed++;
    } else {
      summary.failed++;
      summary.failedCommands.push(r.command);

      if (r.exitCode === 124 || r.error?.includes('timeout')) {
        summary.timedOut++;
      }
    }
  }

  return summary;
}

/**
 * Checks if all validations passed
 */
export function allValidationsPassed(results: ValidationResult[]): boolean {
  return results.length === 0 || results.every((r) => r.passed);
}

/**
 * Gets failed validation commands for reporting
 */
export function getFailedValidations(results: ValidationResult[]): ValidationResult[] {
  return results.filter((r) => !r.passed);
}

// =============================================================================
// Command Deduplication (Performance Optimization)
// =============================================================================

/**
 * Collects all unique validation commands across tasks.
 * Returns a map of command -> list of task IDs that need it.
 */
export function collectUniqueCommands(
  tasks: Array<{ taskId: string; validationMethod: string }>
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const task of tasks) {
    const commands = parseValidationCommands(task.validationMethod);
    for (const cmd of commands) {
      const list = groups.get(cmd) ?? [];
      list.push(task.taskId);
      groups.set(cmd, list);
    }
  }
  return groups;
}

/**
 * Runs each unique command exactly ONCE and returns a cache.
 * Instead of running `pnpm test` 98 times, runs it once and shares the result.
 */
export async function runUniqueCommands(
  commands: string[],
  repoRoot: string,
  logsDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Map<string, ValidationResult>> {
  const cache = new Map<string, ValidationResult>();

  for (const cmd of commands) {
    console.log(`  Running shared command: ${cmd}`);
    const result = await executeCommand(cmd, '_shared', repoRoot, logsDir, timeoutMs);
    console.log(`  ${result.passed ? '✓' : '✗'} ${cmd} (${result.durationMs}ms)`);
    cache.set(cmd, result);
  }

  return cache;
}

/**
 * Projects a shared command result onto a specific task ID.
 */
export function projectResultForTask(
  taskId: string,
  sharedResult: ValidationResult
): ValidationResult {
  return { ...sharedResult, taskId };
}

/**
 * Resolves validations for a task from the shared command cache.
 * Falls back to direct execution if a command is not in the cache.
 */
export async function resolveTaskValidations(
  taskId: string,
  validationMethod: string,
  commandCache: Map<string, ValidationResult>,
  repoRoot: string,
  logsDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ValidationResult[]> {
  const commands = parseValidationCommands(validationMethod);
  const results: ValidationResult[] = [];

  for (const cmd of commands) {
    const cached = commandCache.get(cmd);
    if (cached) {
      results.push(projectResultForTask(taskId, cached));
    } else {
      // Command not in cache (shouldn't happen) — execute directly
      const result = await executeCommand(cmd, taskId, repoRoot, logsDir, timeoutMs);
      results.push(result);
    }

    // Stop on first failure (fail-fast, matching runTaskValidations behavior)
    if (!results[results.length - 1].passed) {
      break;
    }
  }

  return results;
}

// =============================================================================
// File-Based Validation Cache
// =============================================================================

/**
 * Cached command result from validation-cache.json
 */
interface CachedCommandResult {
  exit_code: number;
  passed: boolean;
  duration_ms: number;
  stdout_hash: string;
  completed_at: string;
  error?: string;
}

/**
 * Structure of artifacts/coverage/validation-cache.json
 */
export interface ValidationCacheFile {
  generated_at: string;
  repo_root: string;
  git_sha: string;
  git_branch: string;
  ttl_hours: number;
  commands: Record<string, CachedCommandResult>;
}

/**
 * Loads the validation cache from disk.
 * Returns null if the file doesn't exist or is malformed.
 */
export function loadValidationCache(repoRoot: string): ValidationCacheFile | null {
  const cachePath = path.join(repoRoot, 'artifacts', 'coverage', 'validation-cache.json');
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Checks if the validation cache is fresh (within TTL).
 * @param ttlHours - Override TTL in hours (default: uses cache's own ttl_hours)
 */
export function isValidationCacheFresh(cache: ValidationCacheFile, ttlHours?: number): boolean {
  const ttl = ttlHours ?? cache.ttl_hours;
  const generatedAt = new Date(cache.generated_at).getTime();
  const ageHours = (Date.now() - generatedAt) / (1000 * 60 * 60);
  return ageHours < ttl;
}

/**
 * Converts file-based cache entries into a Map<command, ValidationResult>
 * compatible with the command deduplication system.
 */
export function cacheFileToCommandMap(cache: ValidationCacheFile): Map<string, ValidationResult> {
  const map = new Map<string, ValidationResult>();

  for (const [cmd, entry] of Object.entries(cache.commands)) {
    map.set(cmd, {
      taskId: '_cache',
      command: cmd,
      exitCode: entry.exit_code,
      passed: entry.passed,
      durationMs: entry.duration_ms,
      stdoutHash: entry.stdout_hash,
      logPath: 'artifacts/coverage/validation-logs',
      timestamp: entry.completed_at,
      error: entry.error,
    });
  }

  return map;
}

// =============================================================================
// Dry Run Support
// =============================================================================

/**
 * Creates a dry-run result (doesn't execute command)
 */
export function createDryRunResult(taskId: string, command: string): ValidationResult {
  return {
    taskId,
    command,
    exitCode: 0,
    passed: true,
    durationMs: 0,
    stdoutHash: createHash('sha256').update('DRY_RUN').digest('hex'),
    logPath: 'dry-run/no-log',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Dry-run all validations for a task
 */
export function dryRunTaskValidations(
  taskId: string,
  validationMethod: string
): ValidationResult[] {
  const commands = parseValidationCommands(validationMethod);
  return commands.map((cmd) => createDryRunResult(taskId, cmd));
}
