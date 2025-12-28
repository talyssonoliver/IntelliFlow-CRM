/**
 * Execution History Loader
 *
 * Loads and manages sprint execution history from artifacts/reports/sprint-runs/
 * Follows the existing MATOP persistence pattern.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export interface ExecutionRun {
  runId: string;
  sprintNumber: number;
  timestamp: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  totalTasks: number;
  results: {
    pass: number;
    warn: number;
    fail: number;
    error: number;
    skipped: number;
  };
  duration: number; // in milliseconds
  tasks?: TaskResult[];
}

export interface TaskResult {
  taskId: string;
  description: string;
  status: string;
  verdict: 'PASS' | 'WARN' | 'FAIL' | 'ERROR' | 'SKIPPED';
  duration: number;
  evidenceDir?: string;
  error?: string;
}

export interface ExecutionHistorySummary {
  totalRuns: number;
  latestRun: ExecutionRun | null;
  passRate: number;
  averageDuration: number;
  runs: ExecutionRun[];
}

/**
 * Load all execution runs from artifacts/reports/sprint-runs/ and artifacts/sprint-runs/
 */
export function loadExecutionHistory(
  projectRoot: string,
  options?: {
    sprintNumber?: number;
    limit?: number;
    includeDetails?: boolean;
  }
): ExecutionHistorySummary {
  // Load sprint map for task → sprint lookup
  const taskSprintMap = buildTaskSprintMap(projectRoot);

  // Check both directories for backwards compatibility
  const runsDirs = [
    join(projectRoot, 'artifacts', 'reports', 'sprint-runs'),
    join(projectRoot, 'artifacts', 'sprint-runs'),
  ];

  // Also check STOA evidence directories for MATOP runs
  const stoaRunsDir = join(projectRoot, 'artifacts', 'stoa-runs');
  const systemAuditDir = join(projectRoot, 'artifacts', 'reports', 'system-audit');

  // Collect files from all directories
  const allFiles: Array<{ name: string; path: string; mtime: number }> = [];

  for (const runsDir of runsDirs) {
    if (existsSync(runsDir)) {
      const files = readdirSync(runsDir)
        .filter((f) => f.endsWith('.json') && !f.endsWith('-results.json'))
        .map((f) => {
          const fullPath = join(runsDir, f);
          const stats = statSync(fullPath);
          return { name: f, path: fullPath, mtime: stats.mtimeMs };
        });
      allFiles.push(...files);
    }
  }

  // Also look for MATOP evidence summary files
  if (existsSync(stoaRunsDir)) {
    try {
      const stoaDirs = readdirSync(stoaRunsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const dir of stoaDirs) {
        const summaryPath = join(stoaRunsDir, dir, 'summary.json');
        if (existsSync(summaryPath)) {
          const stats = statSync(summaryPath);
          allFiles.push({ name: `${dir}-summary.json`, path: summaryPath, mtime: stats.mtimeMs });
        }
      }
    } catch {
      // Ignore errors reading STOA dirs
    }
  }

  // Also include system-audit (MATOP) summaries
  if (existsSync(systemAuditDir)) {
    try {
      const auditDirs = readdirSync(systemAuditDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const dir of auditDirs) {
        const summaryFinal = join(systemAuditDir, dir.name, 'summary-final.json');
        const summary = join(systemAuditDir, dir.name, 'summary.json');
        const target = existsSync(summaryFinal) ? summaryFinal : summary;
        if (existsSync(target)) {
          const stats = statSync(target);
          allFiles.push({ name: `${dir.name}-summary.json`, path: target, mtime: stats.mtimeMs });
        }
      }
    } catch {
      // Ignore errors reading system audit dirs
    }
  }

  if (allFiles.length === 0) {
    return {
      totalRuns: 0,
      latestRun: null,
      passRate: 0,
      averageDuration: 0,
      runs: [],
    };
  }

  // Sort by modification time, newest first
  const files = allFiles.sort((a, b) => b.mtime - a.mtime);

  let runs: ExecutionRun[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file.path, 'utf-8');
      const data = JSON.parse(content);

      // Parse the run data
      const run = parseExecutionRun(data, file.name, taskSprintMap);

      // Filter by sprint number if specified
      if (options?.sprintNumber !== undefined && run.sprintNumber !== options.sprintNumber) {
        continue;
      }

      // Strip task details if not requested
      if (!options?.includeDetails) {
        delete run.tasks;
      }

      runs.push(run);

      // Apply limit if specified
      if (options?.limit && runs.length >= options.limit) {
        break;
      }
    } catch (error) {
      console.error(`Error parsing execution run ${file.name}:`, error);
    }
  }

  // Calculate summary statistics
  const totalRuns = runs.length;
  const latestRun = runs[0] || null;

  const completedRuns = runs.filter((r) => r.status === 'completed');
  const passRate =
    completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => {
          const total = r.results.pass + r.results.fail + r.results.error;
          return total > 0 ? sum + r.results.pass / total : sum;
        }, 0) / completedRuns.length
      : 0;

  const averageDuration =
    runs.length > 0 ? runs.reduce((sum, r) => sum + r.duration, 0) / runs.length : 0;

  return {
    totalRuns,
    latestRun,
    passRate: Math.round(passRate * 100) / 100,
    averageDuration: Math.round(averageDuration),
    runs,
  };
}

/**
 * Parse raw execution run data into typed structure
 */
function parseExecutionRun(data: any, filename: string, taskSprintMap?: Map<string, number>): ExecutionRun {
  // Handle both MATOP format and Sprint Orchestrator format
  const isMATOPFormat = 'results' in data && typeof data.results === 'object';
  const isSystemAuditFormat = 'consensus' in data && 'aggregate_metrics' in data;

  if (isMATOPFormat) {
    // MATOP format (from matop-sprint.ts)
    return {
      runId: data.runId || filename.replace('.json', ''),
      sprintNumber: parseInt(data.sprint, 10) || 0,
      timestamp: data.timestamp || new Date().toISOString(),
      status: determineStatus(data),
      totalTasks: data.totalTasks || data.tasks?.length || 0,
      results: {
        pass: data.results?.pass || 0,
        warn: data.results?.warn || 0,
        fail: data.results?.fail || 0,
        error: data.results?.error || 0,
        skipped: data.results?.skipped || 0,
      },
      duration: data.duration || 0,
      tasks: data.tasks?.map((t: any) => ({
        taskId: t.taskId,
        description: t.description,
        status: t.status,
        verdict: t.verdict || 'SKIPPED',
        duration: t.duration || 0,
        evidenceDir: t.evidenceDir,
        error: t.error,
      })),
    };
  } else if (isSystemAuditFormat) {
    // MATOP system-audit evidence bundle summary
    const passCount = data.aggregate_metrics?.total_gates_passed || 0;
    const failCount = data.aggregate_metrics?.total_gates_failed || 0;
    const totalGates = data.aggregate_metrics?.total_gates_executed || passCount + failCount;
    const verdict = data.consensus?.verdict || 'FAILED';
    const status: ExecutionRun['status'] =
      verdict === 'PASS' || verdict === 'WARN' ? 'completed' : 'failed';
    const sprintNumber =
      (data.taskId && taskSprintMap?.get(data.taskId)) !== undefined
        ? (taskSprintMap?.get(data.taskId) as number)
        : 0;

    return {
      runId: data.runId || filename.replace('.json', ''),
      sprintNumber,
      timestamp: data.timestamp || new Date().toISOString(),
      status,
      totalTasks: Math.max(totalGates, 1),
      results: {
        pass: passCount,
        warn: verdict === 'WARN' ? 1 : 0,
        fail: failCount,
        error: 0,
        skipped: 0,
      },
      duration: 0,
      tasks: [
        {
          taskId: data.taskId || 'UNKNOWN',
          description: data.taskName || '',
          status,
          verdict: verdict === 'PASS' ? 'PASS' : verdict === 'WARN' ? 'WARN' : 'FAIL',
          duration: 0,
          evidenceDir: data.evidence_location,
          error: verdict === 'PASS' || verdict === 'WARN' ? undefined : data.consensus?.reason,
        },
      ],
    };
  } else {
    // Sprint Orchestrator format (from sprint/execute)
    return {
      runId: data.runId || filename.replace('.json', ''),
      sprintNumber: data.sprintNumber || 0,
      timestamp: data.startedAt || new Date().toISOString(),
      status: data.status || 'completed',
      totalTasks:
        data.phaseProgress?.reduce((sum: number, p: any) => sum + (p.totalTasks || 0), 0) || 0,
      results: {
        pass: data.completedTasks?.length || 0,
        warn: 0,
        fail: data.failedTasks?.length || 0,
        error: 0,
        skipped: data.needsHumanTasks?.length || 0,
      },
      duration: data.completedAt
        ? new Date(data.completedAt).getTime() - new Date(data.startedAt).getTime()
        : 0,
    };
  }
}

/**
 * Determine status from MATOP results
 */
function determineStatus(data: any): ExecutionRun['status'] {
  if (data.status) return data.status;

  const results = data.results || {};
  if (results.error > 0 || results.fail > 0) return 'failed';
  if (results.pass > 0) return 'completed';
  return 'completed';
}

function buildTaskSprintMap(projectRoot: string): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const csvPath = join(projectRoot, 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    if (!existsSync(csvPath)) return map;
    const content = readFileSync(csvPath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
    for (const row of records) {
      const id = row['Task ID'];
      if (id) {
        const sprintRaw = row['Target Sprint'];
        const sprint = sprintRaw === 'Continuous' ? -1 : parseInt(sprintRaw, 10) || 0;
        map.set(id, sprint);
      }
    }
  } catch (err) {
    console.warn('Could not build task sprint map:', err);
  }
  return map;
}

/**
 * Get a specific execution run by ID
 */
export function getExecutionRun(projectRoot: string, runId: string): ExecutionRun | null {
  const runsDir = join(projectRoot, 'artifacts', 'reports', 'sprint-runs');
  const runPath = join(runsDir, `${runId}.json`);

  if (!existsSync(runPath)) {
    return null;
  }

  try {
    const content = readFileSync(runPath, 'utf-8');
    const data = JSON.parse(content);
    const sprintMap = buildTaskSprintMap(projectRoot);
    return parseExecutionRun(data, `${runId}.json`, sprintMap);
  } catch (error) {
    console.error(`Error reading execution run ${runId}:`, error);
    return null;
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
}

/**
 * Get execution runs for a date range
 */
export function getRunsByDateRange(
  projectRoot: string,
  startDate: Date,
  endDate: Date
): ExecutionRun[] {
  const history = loadExecutionHistory(projectRoot, { includeDetails: false });

  return history.runs.filter((run) => {
    const runDate = new Date(run.timestamp);
    return runDate >= startDate && runDate <= endDate;
  });
}

/**
 * Get execution statistics for a sprint
 */
export function getSprintExecutionStats(
  projectRoot: string,
  sprintNumber: number
): {
  totalRuns: number;
  successRate: number;
  averagePassRate: number;
  lastRunAt: string | null;
  trend: 'improving' | 'stable' | 'declining';
} {
  const history = loadExecutionHistory(projectRoot, { sprintNumber });

  if (history.runs.length === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      averagePassRate: 0,
      lastRunAt: null,
      trend: 'stable',
    };
  }

  const successRate =
    history.runs.filter((r) => r.status === 'completed').length / history.runs.length;

  // Calculate trend from last 5 runs
  const recentRuns = history.runs.slice(0, 5);
  let trend: 'improving' | 'stable' | 'declining' = 'stable';

  if (recentRuns.length >= 3) {
    const firstHalf = recentRuns.slice(Math.floor(recentRuns.length / 2));
    const secondHalf = recentRuns.slice(0, Math.floor(recentRuns.length / 2));

    const firstAvg =
      firstHalf.reduce((sum, r) => sum + r.results.pass / Math.max(1, r.totalTasks), 0) /
      firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, r) => sum + r.results.pass / Math.max(1, r.totalTasks), 0) /
      secondHalf.length;

    if (secondAvg - firstAvg > 0.1) trend = 'improving';
    else if (firstAvg - secondAvg > 0.1) trend = 'declining';
  }

  return {
    totalRuns: history.totalRuns,
    successRate: Math.round(successRate * 100) / 100,
    averagePassRate: history.passRate,
    lastRunAt: history.latestRun?.timestamp || null,
    trend,
  };
}
