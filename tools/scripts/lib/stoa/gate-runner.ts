/**
 * Cross-Platform Gate Runner
 *
 * Implements gate execution from Framework.md Section 9.
 * Uses Node.js spawn for Windows PowerShell compatibility.
 *
 * @module tools/scripts/lib/stoa/gate-runner
 */

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { GateExecutionResult, AuditMatrixTool, AuditMatrix } from './types.js';
import { getToolById, orderGatesForExecution } from './gate-selection.js';
import { getGatesDir } from './evidence.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_TIMEOUT_MS = 600_000; // 10 minutes

// ============================================================================
// Command Template Substitution
// ============================================================================

export interface CommandContext {
  sprint?: number;
  taskId?: string;
  runId?: string;
  gatesDir?: string;
}

/**
 * Substitute placeholders in command templates.
 *
 * Supported placeholders:
 * - {sprint} - Sprint number (e.g., 0, 1, 2)
 * - {taskId} - Task ID (e.g., IFC-001)
 * - {runId} - Run ID (e.g., 20260125-143022-abc123)
 * - {gatesDir} - Full path to gates directory
 *
 * @param command - Command template with placeholders
 * @param context - Values to substitute
 * @returns Command with placeholders replaced
 */
export function substituteCommandTemplate(command: string, context: CommandContext): string {
  let result = command;

  if (context.sprint !== undefined) {
    result = result.replaceAll(/\{sprint\}/g, String(context.sprint));
  }
  if (context.taskId) {
    result = result.replaceAll(/\{taskId\}/g, context.taskId);
  }
  if (context.runId) {
    result = result.replaceAll(/\{runId\}/g, context.runId);
  }
  if (context.gatesDir) {
    result = result.replaceAll(/\{gatesDir\}/g, context.gatesDir);
  }

  return result;
}

// ============================================================================
// Path Normalization
// ============================================================================

/**
 * Normalize paths to forward slashes for cross-platform compatibility.
 */
export function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll(/\\/g, '/').trim();
}

// ============================================================================
// Gate Execution
// ============================================================================

/**
 * Run a single gate command and capture output.
 * Uses Node.js spawn for cross-platform (Windows/Unix) support.
 */
export async function runGate(
  toolId: string,
  command: string,
  logPath: string,
  repoRoot: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<GateExecutionResult> {
  const startTime = Date.now();

  // Ensure log directory exists
  await mkdir(dirname(logPath), { recursive: true });

  return new Promise((resolve) => {
    const logStream = createWriteStream(logPath);

    // Write header to log
    logStream.write(`=== Gate: ${toolId} ===\n`);
    logStream.write(`Command: ${command}\n`);
    logStream.write(`CWD: ${repoRoot}\n`);
    logStream.write(`Started: ${new Date().toISOString()}\n`);
    logStream.write(`${'='.repeat(60)}\n\n`);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(command, {
      shell: true,
      cwd: repoRoot,
      env: { ...process.env },
    });

    // Set timeout
    const timeoutHandle = setTimeout(
      () => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 5000);
      },
      Math.min(timeoutMs, MAX_TIMEOUT_MS)
    );

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      logStream.write(text);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      logStream.write(text);
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutHandle);

      const duration = Date.now() - startTime;
      const exitCode = timedOut ? -1 : (code ?? 1);
      const passed = exitCode === 0;

      // Write footer to log
      logStream.write(`\n${'='.repeat(60)}\n`);
      logStream.write(`Finished: ${new Date().toISOString()}\n`);
      logStream.write(`Duration: ${duration}ms\n`);
      logStream.write(`Exit Code: ${exitCode}${timedOut ? ' (timeout)' : ''}\n`);
      logStream.write(`Result: ${passed ? 'PASS' : 'FAIL'}\n`);

      logStream.end(() => {
        resolve({
          toolId,
          exitCode,
          logPath: normalizeRepoPath(logPath),
          passed,
          duration,
          stdout: stdout.slice(-10000), // Keep last 10KB
          stderr: stderr.slice(-10000),
        });
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);

      const duration = Date.now() - startTime;

      logStream.write(`\n${'='.repeat(60)}\n`);
      logStream.write(`Error: ${err.message}\n`);
      logStream.write(`Duration: ${duration}ms\n`);

      logStream.end(() => {
        resolve({
          toolId,
          exitCode: -1,
          logPath: normalizeRepoPath(logPath),
          passed: false,
          duration,
          stderr: err.message,
        });
      });
    });
  });
}

// ============================================================================
// Gate task builder
// ============================================================================

interface GatePrepareOptions {
  toolId: string;
  tool: AuditMatrixTool | undefined;
  context: CommandContext;
  gatesDir: string;
  repoRoot: string;
  dryRun: boolean;
}

/** Prepare a single gate — returns an immediate result for invalid/dry-run, or a task fn */
function prepareGateTask(
  opts: Readonly<GatePrepareOptions>,
  results: GateExecutionResult[]
): (() => Promise<GateExecutionResult>) | null {
  const { toolId, tool, context, gatesDir, repoRoot, dryRun } = opts;

  if (!tool || !tool.command) {
    results.push({ toolId, exitCode: -1, logPath: '', passed: false, duration: 0, stderr: 'No command defined' });
    return null;
  }

  const command = substituteCommandTemplate(tool.command, context);
  const logPath = join(gatesDir, `${toolId}.log`);

  if (dryRun) {
    console.log(`[DRY RUN] Would execute: ${command}`);
    results.push({ toolId, exitCode: 0, logPath: normalizeRepoPath(logPath), passed: true, duration: 0 });
    return null;
  }

  const timeoutMs = tool.timeout_seconds ? tool.timeout_seconds * 1000 : DEFAULT_TIMEOUT_MS;

  return async () => {
    console.log(`Running gate: ${toolId}...`);
    const result = await runGate(toolId, command, logPath, repoRoot, timeoutMs);
    const status = result.passed ? '✓' : '✗';
    console.log(`  ${status} ${toolId}: ${result.passed ? 'PASS' : 'FAIL'} (${result.duration}ms)`);
    return result;
  };
}

/** Execute a tier's task functions in parallel with bounded concurrency */
async function executeTierTasks(
  tasks: Array<() => Promise<GateExecutionResult>>,
  parallelLimit: number,
  results: GateExecutionResult[]
): Promise<void> {
  if (tasks.length === 1) {
    results.push(await tasks[0]());
    return;
  }
  for (let i = 0; i < tasks.length; i += parallelLimit) {
    const batch = tasks.slice(i, i + parallelLimit);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
}

// ============================================================================
// Batch Gate Execution
// ============================================================================

export interface GateRunnerOptions {
  repoRoot: string;
  evidenceDir: string;
  matrix: AuditMatrix;
  dryRun?: boolean;
  parallelLimit?: number;
  /** Context for command template substitution */
  commandContext?: CommandContext;
}

/**
 * Run all selected gates and collect results.
 *
 * Gates run in parallel (up to `parallelLimit` concurrency) when they share the
 * same `order` value in the audit matrix. Gates with different order values run
 * sequentially to respect declared dependencies between tiers.
 */
export async function runGates(
  gateIds: string[],
  options: GateRunnerOptions
): Promise<GateExecutionResult[]> {
  const { repoRoot, evidenceDir, matrix, dryRun, parallelLimit = 4, commandContext } = options;
  const gatesDir = getGatesDir(evidenceDir);

  // Order gates for execution
  const orderedGates = orderGatesForExecution(gateIds, matrix);

  // Build command context with gatesDir
  const context: CommandContext = {
    ...commandContext,
    gatesDir: normalizeRepoPath(gatesDir),
  };

  // Group gates by their order value — same order runs in parallel
  const orderGroups = new Map<number, string[]>();
  for (const toolId of orderedGates) {
    const tool = getToolById(matrix, toolId);
    const order = tool?.order ?? 999;
    const group = orderGroups.get(order) || [];
    group.push(toolId);
    orderGroups.set(order, group);
  }

  const sortedOrders = [...orderGroups.keys()].sort((a, b) => a - b);
  const results: GateExecutionResult[] = [];

  for (const order of sortedOrders) {
    const group = orderGroups.get(order) || [];
    const tasks: Array<() => Promise<GateExecutionResult>> = [];

    for (const toolId of group) {
      const tool = getToolById(matrix, toolId);
      const task = prepareGateTask(
        { toolId, tool, context, gatesDir, repoRoot, dryRun: dryRun ?? false },
        results
      );
      if (task) tasks.push(task);
    }

    await executeTierTasks(tasks, parallelLimit, results);
  }

  return results;
}

// ============================================================================
// Gate Result Analysis
// ============================================================================

export interface GateResultSummary {
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  passRate: number;
  failedGates: string[];
  timedOutGates: string[];
}

/**
 * Summarize gate execution results.
 */
export function summarizeGateResults(results: GateExecutionResult[]): GateResultSummary {
  const failedGates: string[] = [];
  const timedOutGates: string[] = [];
  let passed = 0;
  let failed = 0;
  let timedOut = 0;

  for (const result of results) {
    if (result.passed) {
      passed++;
    } else if (result.exitCode === -1) {
      timedOut++;
      timedOutGates.push(result.toolId);
    } else {
      failed++;
      failedGates.push(result.toolId);
    }
  }

  const total = results.length;

  return {
    total,
    passed,
    failed,
    timedOut,
    passRate: total > 0 ? (passed / total) * 100 : 0,
    failedGates,
    timedOutGates,
  };
}

/**
 * Check if all gates passed.
 */
export function allGatesPassed(results: GateExecutionResult[]): boolean {
  return results.every((r) => r.passed);
}

// ============================================================================
// Tool Verification
// ============================================================================

/**
 * Verify that a tool's command is available (basic check).
 */
export async function verifyToolAvailable(
  tool: AuditMatrixTool,
  repoRoot: string
): Promise<{ available: boolean; reason?: string }> {
  if (!tool.command) {
    return { available: false, reason: 'No command defined (CI workflow only)' };
  }

  // Check required environment variables
  if (tool.requires_env && tool.requires_env.length > 0) {
    const missing = tool.requires_env.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      return {
        available: false,
        reason: `Missing env vars: ${missing.join(', ')}`,
      };
    }
  }

  // Try running --version or similar to verify tool exists
  // For now, we assume the tool exists if command is defined and env vars are present
  return { available: true };
}

/**
 * Verify all tools in a list are available.
 */
export async function verifyToolsAvailable(
  toolIds: string[],
  matrix: AuditMatrix,
  repoRoot: string
): Promise<Array<{ toolId: string; available: boolean; reason?: string }>> {
  const results: Array<{ toolId: string; available: boolean; reason?: string }> = [];

  for (const toolId of toolIds) {
    const tool = getToolById(matrix, toolId);

    if (!tool) {
      results.push({
        toolId,
        available: false,
        reason: `Tool '${toolId}' not found in audit-matrix`,
      });
      continue;
    }

    const verification = await verifyToolAvailable(tool, repoRoot);
    results.push({
      toolId,
      ...verification,
    });
  }

  return results;
}
