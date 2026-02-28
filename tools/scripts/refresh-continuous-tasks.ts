/**
 * Unified Continuous Task Refresh Runner
 *
 * Runs all generators for the 5 EXP-REPORTS continuous tasks in one invocation.
 * Each generator is run independently — failures in one don't block others.
 *
 * Usage:
 *   npx tsx tools/scripts/refresh-continuous-tasks.ts
 *   npx tsx tools/scripts/refresh-continuous-tasks.ts --task EXP-REPORTS-001
 *   npx tsx tools/scripts/refresh-continuous-tasks.ts --check-only
 *
 * Exit code: always 0 (informational only).
 */

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// ============================================================================
// TASK GENERATORS
// ============================================================================

interface GeneratorConfig {
  taskId: string;
  description: string;
  cadence: string;
  generators: {
    command: string;
    output: string;
    description: string;
  }[];
}

const TASKS: GeneratorConfig[] = [
  {
    taskId: 'EXP-REPORTS-001',
    description: 'Project Status & Tracking Reports',
    cadence: 'daily:1d',
    generators: [
      {
        command: 'python tools/audit/status_snapshot.py',
        output: 'artifacts/reports/status-snapshot.json',
        description: 'Status snapshot + completed task IDs',
      },
    ],
  },
  {
    taskId: 'EXP-REPORTS-002',
    description: 'Technical Debt & Quality Tracking',
    cadence: 'weekly:7d',
    generators: [
      {
        command: 'npx tsx tools/scripts/detect-phantom-completions.ts',
        output: 'artifacts/reports/phantom-completion-audit.json',
        description: 'Phantom completion audit',
      },
    ],
  },
  {
    taskId: 'EXP-REPORTS-003',
    description: 'Risk Management & Compliance Tracking',
    cadence: 'quarterly:90d',
    generators: [],
    // All artifacts are manually maintained (risk-register.csv, gdpr-compliance.md)
  },
  {
    taskId: 'EXP-REPORTS-004',
    description: 'Sprint Audit System',
    cadence: 'per-sprint:14d',
    generators: [
      {
        command: 'npx tsx tools/scripts/audit-sprint-completion.ts --sprint 0',
        output: 'artifacts/reports/sprint-audit/',
        description: 'Sprint completion audit',
      },
    ],
  },
  {
    taskId: 'EXP-REPORTS-005',
    description: 'Build & Validation Reports',
    cadence: 'per-build:1d',
    generators: [
      {
        command: 'npx tsx tools/scripts/validate-turbo.ts',
        output: 'artifacts/reports/turbo-validation.json',
        description: 'Turbo validation report',
      },
      {
        command: 'node scripts/pnpm-audit-report.js',
        output: 'artifacts/reports/audit-report.json',
        description: 'pnpm audit report',
      },
    ],
  },
];

// ============================================================================
// RUNNER
// ============================================================================

interface RunResult {
  taskId: string;
  generator: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

function runGenerator(
  command: string,
  description: string,
  taskId: string
): RunResult {
  const start = Date.now();
  console.log(`  Running: ${description}...`);

  try {
    execSync(command, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });

    const duration = Date.now() - start;
    console.log(`  ✓ ${description} (${duration}ms)`);
    return { taskId, generator: description, success: true, duration_ms: duration };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const message =
      err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.log(`  ✗ ${description} (${duration}ms): ${message}`);
    return {
      taskId,
      generator: description,
      success: false,
      duration_ms: duration,
      error: message,
    };
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const taskFilter = args.includes('--task')
    ? args[args.indexOf('--task') + 1]
    : null;

  console.log('=== Continuous Task Refresh Runner ===\n');

  const tasksToRun = taskFilter
    ? TASKS.filter((t) => t.taskId === taskFilter)
    : TASKS;

  if (taskFilter && tasksToRun.length === 0) {
    console.log(`No task found matching: ${taskFilter}`);
    console.log(
      `Available tasks: ${TASKS.map((t) => t.taskId).join(', ')}`
    );
    return;
  }

  if (checkOnly) {
    console.log('Check-only mode — listing generators without running.\n');
    for (const task of tasksToRun) {
      console.log(`[${task.taskId}] ${task.description} (${task.cadence})`);
      if (task.generators.length === 0) {
        console.log('  (no generators — manually maintained artifacts)');
      } else {
        for (const gen of task.generators) {
          console.log(`  → ${gen.description}: ${gen.command}`);
        }
      }
    }
    return;
  }

  const results: RunResult[] = [];
  const startTime = Date.now();

  for (const task of tasksToRun) {
    console.log(
      `[${task.taskId}] ${task.description} (${task.cadence})`
    );

    if (task.generators.length === 0) {
      console.log('  (no generators — manually maintained artifacts)\n');
      continue;
    }

    for (const gen of task.generators) {
      const result = runGenerator(gen.command, gen.description, task.taskId);
      results.push(result);
    }
    console.log('');
  }

  // Summary
  const totalTime = Date.now() - startTime;
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('=== Summary ===');
  console.log(`Generators run: ${results.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalTime}ms`);

  if (failed > 0) {
    console.log('\nFailed generators:');
    for (const r of results.filter((rr) => !rr.success)) {
      console.log(`  [${r.taskId}] ${r.generator}: ${r.error}`);
    }
  }

  // Run freshness check after refresh
  console.log('\n--- Running freshness check ---\n');
  try {
    const output = execSync(
      'npx tsx tools/scripts/check-cadence-freshness.ts',
      { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 }
    );
    console.log(output);
  } catch {
    console.log('(freshness check failed — run manually)');
  }
}

main();
