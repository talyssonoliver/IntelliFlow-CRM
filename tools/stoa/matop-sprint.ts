#!/usr/bin/env npx tsx
/**
 * MATOP Sprint Runner
 *
 * Run MATOP for all tasks in a sprint with ONE command.
 *
 * Usage:
 *   pnpm matop:sprint 0        # All Sprint 0 tasks
 *   pnpm matop:sprint 1        # All Sprint 1 tasks
 *   pnpm matop:sprint all      # ALL tasks (careful!)
 *   pnpm matop:sprint 0 --dry-run
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  findRepoRoot,
  resolveSprintPlanPath,
  parseSprintCsv,
  isStrictMode,
  log,
  logHeader,
  logSection,
} from '../scripts/lib/validation-utils.js';
import { generateRunId, getEvidenceDir } from '../scripts/lib/stoa/evidence.js';

// Import the main MATOP executor
import { spawn } from 'node:child_process';

// ============================================================================
// Types
// ============================================================================

interface TaskSummary {
  taskId: string;
  description: string;
  status: string;
  verdict: string;
  duration: number;
  evidenceDir: string;
  error?: string;
}

interface SprintReport {
  sprint: string;
  runId: string;
  timestamp: string;
  totalTasks: number;
  results: {
    pass: number;
    warn: number;
    fail: number;
    error: number;
    skipped: number;
  };
  tasks: TaskSummary[];
  duration: number;
}

// ============================================================================
// Task Loading
// ============================================================================

function loadSprintTasks(
  sprint: string,
  repoRoot: string
): Array<{
  taskId: string;
  description: string;
  status: string;
  section: string;
}> {
  const csvPath = resolveSprintPlanPath(repoRoot);
  if (!csvPath || !existsSync(csvPath)) {
    throw new Error('Sprint_plan.csv not found');
  }

  const content = readFileSync(csvPath, 'utf-8');
  const { tasks } = parseSprintCsv(content);

  // Filter by sprint
  const filtered = sprint === 'all' ? tasks : tasks.filter((t) => t['Target Sprint'] === sprint);

  return filtered.map((t) => ({
    taskId: t['Task ID'],
    description: t.Description || '',
    status: t.Status || 'Unknown',
    section: t.Section || '',
  }));
}

// ============================================================================
// MATOP Execution
// ============================================================================

async function runMatopForTask(
  taskId: string,
  options: { dryRun: boolean; strictMode: boolean },
  repoRoot: string
): Promise<{ success: boolean; verdict: string; evidenceDir: string; error?: string }> {
  return new Promise((resolve) => {
    const args = ['tsx', 'tools/stoa/matop-execute.ts', taskId];
    if (options.dryRun) args.push('--dry-run');
    if (options.strictMode) args.push('--strict');

    const proc = spawn('npx', args, {
      cwd: repoRoot,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // Parse verdict from output
      const verdictMatch = stdout.match(/Consensus: (\w+)/);
      const verdict = verdictMatch ? verdictMatch[1] : 'ERROR';

      // Parse evidence dir from output
      const evidenceMatch = stdout.match(/Evidence: (.+)/);
      const evidenceDir = evidenceMatch ? evidenceMatch[1].trim() : '';

      resolve({
        success: code === 0,
        verdict,
        evidenceDir,
        error: code !== 0 ? stderr || `Exit code ${code}` : undefined,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        verdict: 'ERROR',
        evidenceDir: '',
        error: err.message,
      });
    });
  });
}

// ============================================================================
// Main
// ============================================================================

async function runSprint(
  sprint: string,
  options: { dryRun: boolean; strictMode: boolean; skipCompleted: boolean }
): Promise<SprintReport> {
  const repoRoot = findRepoRoot();
  const runId = `sprint-${sprint}-${generateRunId()}`;
  const startTime = Date.now();

  logHeader(`MATOP Sprint Runner: Sprint ${sprint}`);
  log(`Run ID: ${runId}`);
  log(`Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
  log(`Strict Mode: ${options.strictMode ? 'Yes' : 'No'}`);
  log(`Skip Completed: ${options.skipCompleted ? 'Yes' : 'No'}`);

  // Load tasks
  logSection('Loading Tasks');
  const allTasks = loadSprintTasks(sprint, repoRoot);
  log(`Found ${allTasks.length} tasks in Sprint ${sprint}`);

  // Filter if skipping completed
  const tasks = options.skipCompleted ? allTasks.filter((t) => t.status !== 'Completed') : allTasks;

  if (options.skipCompleted && tasks.length < allTasks.length) {
    log(`Skipping ${allTasks.length - tasks.length} completed tasks`);
  }

  log(`Running MATOP for ${tasks.length} tasks\n`);

  // Results
  const results: TaskSummary[] = [];
  const counts = { pass: 0, warn: 0, fail: 0, error: 0, skipped: 0 };

  // Execute each task
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const progress = `[${i + 1}/${tasks.length}]`;

    process.stdout.write(`${progress} ${task.taskId}... `);

    const taskStart = Date.now();
    const result = await runMatopForTask(task.taskId, options, repoRoot);
    const duration = Date.now() - taskStart;

    // Update counts
    if (result.error) {
      counts.error++;
      console.log(`ERROR (${duration}ms)`);
    } else {
      switch (result.verdict) {
        case 'PASS':
          counts.pass++;
          console.log(`PASS (${duration}ms)`);
          break;
        case 'WARN':
          counts.warn++;
          console.log(`WARN (${duration}ms)`);
          break;
        case 'FAIL':
          counts.fail++;
          console.log(`FAIL (${duration}ms)`);
          break;
        case 'NEEDS_HUMAN':
          counts.fail++;
          console.log(`NEEDS_HUMAN (${duration}ms)`);
          break;
        default:
          counts.error++;
          console.log(`${result.verdict} (${duration}ms)`);
      }
    }

    results.push({
      taskId: task.taskId,
      description: task.description,
      status: task.status,
      verdict: result.verdict,
      duration,
      evidenceDir: result.evidenceDir,
      error: result.error,
    });
  }

  const totalDuration = Date.now() - startTime;

  // Summary
  logSection('Sprint Summary');
  log(`Total: ${tasks.length} tasks`);
  log(`PASS: ${counts.pass}`);
  log(`WARN: ${counts.warn}`);
  log(`FAIL: ${counts.fail}`);
  log(`ERROR: ${counts.error}`);
  log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);

  // Create report
  const report: SprintReport = {
    sprint,
    runId,
    timestamp: new Date().toISOString(),
    totalTasks: tasks.length,
    results: counts,
    tasks: results,
    duration: totalDuration,
  };

  // Save report
  const reportDir = join(repoRoot, 'artifacts', 'reports', 'sprint-runs');
  mkdirSync(reportDir, { recursive: true });

  const reportPath = join(reportDir, `${runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\nReport: ${reportPath}`);

  // Generate markdown summary
  const mdPath = join(reportDir, `${runId}.md`);
  const md = generateMarkdownReport(report);
  writeFileSync(mdPath, md);
  log(`Summary: ${mdPath}`);

  return report;
}

function generateMarkdownReport(report: SprintReport): string {
  const passRate =
    report.totalTasks > 0 ? ((report.results.pass / report.totalTasks) * 100).toFixed(1) : '0';

  let md = `# Sprint ${report.sprint} MATOP Report

**Run ID:** ${report.runId}
**Timestamp:** ${report.timestamp}
**Duration:** ${(report.duration / 1000).toFixed(1)}s

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | ${report.totalTasks} |
| PASS | ${report.results.pass} |
| WARN | ${report.results.warn} |
| FAIL | ${report.results.fail} |
| ERROR | ${report.results.error} |
| **Pass Rate** | **${passRate}%** |

## Task Results

| Task ID | Verdict | Duration | Description |
|---------|---------|----------|-------------|
`;

  for (const task of report.tasks) {
    const icon =
      task.verdict === 'PASS'
        ? '✅'
        : task.verdict === 'WARN'
          ? '⚠️'
          : task.verdict === 'FAIL'
            ? '❌'
            : '💥';
    const desc =
      task.description.length > 50 ? task.description.slice(0, 47) + '...' : task.description;
    md += `| ${task.taskId} | ${icon} ${task.verdict} | ${task.duration}ms | ${desc} |\n`;
  }

  // Add failures section if any
  const failures = report.tasks.filter((t) => t.verdict === 'FAIL' || t.error);
  if (failures.length > 0) {
    md += `\n## Failures\n\n`;
    for (const task of failures) {
      md += `### ${task.taskId}\n`;
      md += `- **Verdict:** ${task.verdict}\n`;
      if (task.error) {
        md += `- **Error:** ${task.error}\n`;
      }
      md += `- **Evidence:** ${task.evidenceDir}\n\n`;
    }
  }

  return md;
}

// ============================================================================
// CLI
// ============================================================================

function showHelp(): void {
  console.log(`
MATOP Sprint Runner

Run MATOP for all tasks in a sprint with ONE command.

Usage:
  pnpm matop:sprint <SPRINT> [options]

Arguments:
  SPRINT    Sprint number (0, 1, 2, ...) or "all" for everything

Options:
  --dry-run         Don't execute gates, just preview
  --strict          Enable strict mode (WARN becomes FAIL)
  --skip-completed  Skip tasks with status "Completed"
  --help            Show this help

Examples:
  pnpm matop:sprint 0              # All Sprint 0 tasks
  pnpm matop:sprint 1              # All Sprint 1 tasks
  pnpm matop:sprint 0 --dry-run    # Preview Sprint 0
  pnpm matop:sprint 1 --skip-completed  # Only incomplete tasks
  pnpm matop:sprint all            # ALL 324 tasks (careful!)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const sprint = args.find((a) => !a.startsWith('--'));
  if (!sprint) {
    console.error('Error: Sprint number required');
    showHelp();
    process.exit(1);
  }

  const options = {
    dryRun: args.includes('--dry-run'),
    strictMode: args.includes('--strict') || isStrictMode(),
    skipCompleted: args.includes('--skip-completed'),
  };

  try {
    const report = await runSprint(sprint, options);

    // Exit with error if any failures
    if (report.results.fail > 0 || report.results.error > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Sprint run failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
