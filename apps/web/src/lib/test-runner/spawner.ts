/**
 * Test Process Spawner
 *
 * Spawns vitest processes with real-time output streaming.
 * Handles Windows/Unix compatibility and process lifecycle.
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { platform } from 'os';
import { testRunnerEvents } from './events';
import { parseVitestLine, parseCoverageSummary } from './parser';
import type { TestRunConfig, TestRunState, TestRunProgress, TestScope } from './types';

interface ActiveProcess {
  process: ChildProcess;
  state: TestRunState;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// Track active test runs
const activeRuns = new Map<string, ActiveProcess>();

/**
 * Get the project root directory
 * Navigates from apps/web to project root
 */
function getProjectRoot(): string {
  // In Next.js, process.cwd() is typically the app root
  // We need to navigate up to the monorepo root
  const cwd = process.cwd();

  // If we're in apps/web, go up two levels
  if (cwd.includes('apps') && cwd.includes('web')) {
    return join(cwd, '..', '..');
  }

  // If we're already at project root (has turbo.json), return as-is
  return cwd;
}

/**
 * Check if running on Windows
 */
function isWindows(): boolean {
  return platform() === 'win32';
}

/**
 * Build vitest command arguments based on scope
 */
function buildVitestArgs(config: TestRunConfig): string[] {
  const { scope, patterns, coverage } = config;

  const args = ['vitest', 'run', '--reporter=verbose'];

  if (coverage) {
    args.push('--coverage');
  }

  // Add passWithNoTests for non-comprehensive scopes
  if (scope !== 'comprehensive') {
    args.push('--passWithNoTests');
  }

  // Scope-specific patterns
  switch (scope) {
    case 'quick':
      // Only validators and domain packages (fastest)
      args.push('packages/validators', 'packages/domain');
      break;
    case 'standard':
      // All unit tests (default)
      // No additional patterns - runs all matching test files
      break;
    case 'comprehensive':
      // Full suite including integration
      // No patterns needed - runs everything
      break;
  }

  // Add custom patterns if specified
  if (patterns && patterns.length > 0) {
    args.push(...patterns);
  }

  return args;
}

/**
 * Get a list of all active test runs
 */
export function getActiveRuns(): Map<string, TestRunState> {
  const states = new Map<string, TestRunState>();
  for (const [id, run] of activeRuns) {
    states.set(id, run.state);
  }
  return states;
}

/**
 * Get the state of a specific test run
 */
export function getRunState(runId: string): TestRunState | undefined {
  return activeRuns.get(runId)?.state;
}

/**
 * Start a new test run
 */
export async function startTestRun(config: TestRunConfig): Promise<TestRunState> {
  const { runId, timeout = 5 * 60 * 1000 } = config;

  // Check if run already exists
  if (activeRuns.has(runId)) {
    throw new Error(`Test run ${runId} is already active`);
  }

  const projectRoot = getProjectRoot();
  const args = buildVitestArgs(config);

  // Initialize state
  const state: TestRunState = {
    runId,
    config,
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: {
      testsTotal: 0,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0,
    },
    results: [],
    stdout: '',
    stderr: '',
  };

  // Emit start event
  testRunnerEvents.emitProgress({
    runId,
    type: 'start',
    timestamp: new Date().toISOString(),
    data: {
      message: `Starting test run with scope: ${config.scope}`,
    },
  });

  return new Promise((resolve) => {
    try {
      // Use npx.cmd on Windows, npx on Unix
      const command = isWindows() ? 'npx.cmd' : 'npx';

      const proc = spawn(command, args, {
        cwd: projectRoot,
        shell: isWindows(), // Use shell on Windows for better compatibility
        env: {
          ...process.env,
          FORCE_COLOR: '0', // Disable ANSI colors for cleaner parsing
          CI: 'true', // Enable CI mode for consistent output
        },
      });

      const activeProcess: ActiveProcess = {
        process: proc,
        state,
      };

      // Set up timeout
      if (timeout > 0) {
        activeProcess.timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
          state.status = 'failed';
          state.error = `Test run timed out after ${timeout / 1000}s`;
          state.completedAt = new Date().toISOString();

          testRunnerEvents.emitProgress({
            runId,
            type: 'error',
            timestamp: new Date().toISOString(),
            data: {
              error: state.error,
            },
          });

          // Force kill after 5 seconds
          setTimeout(() => {
            if (activeRuns.has(runId)) {
              proc.kill('SIGKILL');
              activeRuns.delete(runId);
            }
          }, 5000);
        }, timeout);
      }

      activeRuns.set(runId, activeProcess);

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        state.stdout += text;

        // Parse each line for progress events
        const lines = text.split('\n');
        for (const line of lines) {
          const progress = parseVitestLine(line, runId);
          if (progress) {
            updateStateFromProgress(state, progress);
            testRunnerEvents.emitProgress(progress);
          }
        }

        // Also emit raw stdout for log display
        testRunnerEvents.emitProgress({
          runId,
          type: 'stdout',
          timestamp: new Date().toISOString(),
          data: {
            message: text,
          },
        });
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        state.stderr += text;

        testRunnerEvents.emitProgress({
          runId,
          type: 'stderr',
          timestamp: new Date().toISOString(),
          data: {
            message: text,
          },
        });
      });

      // Handle process error
      proc.on('error', (error) => {
        state.status = 'failed';
        state.error = error.message;
        state.completedAt = new Date().toISOString();

        testRunnerEvents.emitProgress({
          runId,
          type: 'error',
          timestamp: new Date().toISOString(),
          data: {
            error: error.message,
          },
        });

        cleanupRun(runId);
        resolve(state);
      });

      // Handle process close
      proc.on('close', (code) => {
        // Clear timeout
        if (activeProcess.timeoutId) {
          clearTimeout(activeProcess.timeoutId);
        }

        state.completedAt = new Date().toISOString();
        state.status = code === 0 ? 'completed' : 'failed';

        // Parse final coverage if enabled
        if (config.coverage) {
          const coverage = parseCoverageSummary(projectRoot);
          if (coverage) {
            state.coverage = coverage;
          }
        }

        // Emit completion event
        testRunnerEvents.emitProgress({
          runId,
          type: 'complete',
          timestamp: new Date().toISOString(),
          data: {
            testsRun: state.progress.testsRun,
            testsPassed: state.progress.testsPassed,
            testsFailed: state.progress.testsFailed,
            testsSkipped: state.progress.testsSkipped,
            coverage: state.coverage,
          },
        });

        // Keep in memory for 10 minutes for status queries
        setTimeout(() => {
          activeRuns.delete(runId);
        }, 10 * 60 * 1000);

        resolve(state);
      });

      // Resolve immediately with initial state (non-blocking)
      resolve(state);
    } catch (error) {
      state.status = 'failed';
      state.error = error instanceof Error ? error.message : String(error);
      state.completedAt = new Date().toISOString();

      testRunnerEvents.emitProgress({
        runId,
        type: 'error',
        timestamp: new Date().toISOString(),
        data: {
          error: state.error,
        },
      });

      resolve(state);
    }
  });
}

/**
 * Cancel a running test
 */
export function cancelTestRun(runId: string): boolean {
  const run = activeRuns.get(runId);
  if (!run) {
    return false;
  }

  run.state.status = 'cancelled';
  run.state.completedAt = new Date().toISOString();

  run.process.kill('SIGTERM');

  testRunnerEvents.emitProgress({
    runId,
    type: 'complete',
    timestamp: new Date().toISOString(),
    data: {
      message: 'Test run cancelled by user',
    },
  });

  // Force kill after 5 seconds
  setTimeout(() => {
    if (activeRuns.has(runId)) {
      run.process.kill('SIGKILL');
      activeRuns.delete(runId);
    }
  }, 5000);

  return true;
}

/**
 * Update state from a progress event
 */
function updateStateFromProgress(state: TestRunState, progress: TestRunProgress): void {
  switch (progress.type) {
    case 'test_pass':
      state.progress.testsRun++;
      state.progress.testsPassed++;
      state.progress.currentTest = progress.data?.testName;
      break;
    case 'test_fail':
      state.progress.testsRun++;
      state.progress.testsFailed++;
      state.progress.currentTest = progress.data?.testName;
      break;
    case 'test_skip':
      state.progress.testsRun++;
      state.progress.testsSkipped++;
      state.progress.currentTest = progress.data?.testName;
      break;
    case 'suite_start':
      state.progress.currentFile = progress.data?.file;
      break;
    case 'coverage_complete':
      if (progress.data?.coverage) {
        state.coverage = progress.data.coverage;
      }
      break;
    case 'complete':
      if (progress.data?.testsRun !== undefined) {
        state.progress.testsRun = progress.data.testsRun;
      }
      if (progress.data?.testsPassed !== undefined) {
        state.progress.testsPassed = progress.data.testsPassed;
      }
      if (progress.data?.testsFailed !== undefined) {
        state.progress.testsFailed = progress.data.testsFailed;
      }
      if (progress.data?.testsSkipped !== undefined) {
        state.progress.testsSkipped = progress.data.testsSkipped;
      }
      break;
  }
}

/**
 * Cleanup a finished run
 */
function cleanupRun(runId: string): void {
  const run = activeRuns.get(runId);
  if (run?.timeoutId) {
    clearTimeout(run.timeoutId);
  }
  // Keep for status queries, will be auto-deleted after 10 minutes
}

/**
 * Get scope description for UI display
 */
export function getScopeDescription(scope: TestScope): {
  label: string;
  description: string;
  estimatedTime: string;
} {
  switch (scope) {
    case 'quick':
      return {
        label: 'Quick',
        description: 'Validators + Domain packages only',
        estimatedTime: '~15s',
      };
    case 'standard':
      return {
        label: 'Standard',
        description: 'All unit tests',
        estimatedTime: '~1min',
      };
    case 'comprehensive':
      return {
        label: 'Comprehensive',
        description: 'Unit + Integration tests',
        estimatedTime: '~3min',
      };
  }
}
