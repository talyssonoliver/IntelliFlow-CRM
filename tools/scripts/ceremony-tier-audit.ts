#!/usr/bin/env npx tsx
/**
 * Ceremony Tier Audit CLI — issue #579.
 *
 * Classifies Sprint_plan.csv tasks into ceremony_tier `light` | `full`
 * using the deterministic heuristic in `tools/scripts/lib/ceremony-tier.ts`,
 * honoring manual overrides from `.specify/memory/task-tiers.yaml`
 * (`tools/scripts/lib/ceremony-tier-config.ts`).
 *
 * Usage:
 *   npx tsx tools/scripts/ceremony-tier-audit.ts
 *     Classify every backlog task (Status != Completed/Done), print a
 *     table, and write artifacts/reports/ceremony-tier-audit.json.
 *
 *   npx tsx tools/scripts/ceremony-tier-audit.ts --include-completed
 *     Also classify already-Completed/Done tasks (useful for auditing the
 *     heuristic against known-good history, e.g. PG-178/182/183/184/185).
 *
 *   npx tsx tools/scripts/ceremony-tier-audit.ts --task PG-999
 *     Classify a single task (any status) and print its result. Used by
 *     /full-pipeline's Phase 0.3 Tier Detection — see
 *     .agents/skills/full-pipeline/references/ceremony-tier.md.
 *
 *   npx tsx tools/scripts/ceremony-tier-audit.ts --task PG-999 --json
 *     Same, but print ONLY the machine-readable JSON object (no table, no
 *     file write) — for a caller that parses stdout.
 *
 *   npx tsx tools/scripts/ceremony-tier-audit.ts --json
 *     Full-audit JSON to stdout instead of writing the report file.
 *
 * Exit codes:
 *   0 — audit ran (this is a reporting tool, not a gate: it exits 0
 *       whatever the classifications turn out to be)
 *   2 — usage error, or Sprint_plan.csv / the requested --task not found
 *
 * @module tools/scripts/ceremony-tier-audit
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  findRepoRoot,
  resolveSprintPlanPath,
  parseSprintCsv,
  type SprintTask,
} from './lib/validation-utils';
import {
  resolveCeremonyTier,
  isCompletedStatus,
  type CeremonyTierResult,
} from './lib/ceremony-tier';
import { loadTierOverrides } from './lib/ceremony-tier-config';

const REPORT_PATH = 'artifacts/reports/ceremony-tier-audit.json';

interface CliOptions {
  task?: string;
  includeCompleted: boolean;
  json: boolean;
  repoRoot: string;
  help: boolean;
}

function printHelp(): void {
  console.log(`
Ceremony Tier Audit CLI (issue #579)

USAGE:
  npx tsx tools/scripts/ceremony-tier-audit.ts [OPTIONS]

OPTIONS:
  --task <TASK_ID>        Classify only this task (any status), print its result.
  --include-completed     Also classify tasks already Completed/Done.
  --json                  Print JSON to stdout instead of a table (+ skip the report file).
  --repo-root <path>      Repository root (default: detected via git worktree list).
  --help, -h              Show this help message.

Full-audit (no --task) writes ${REPORT_PATH} unless --json is given.
`);
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    options: {
      task: { type: 'string' },
      'include-completed': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      'repo-root': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    task: values.task?.trim().toUpperCase(),
    includeCompleted: values['include-completed'] ?? false,
    json: values.json ?? false,
    repoRoot: resolve(values['repo-root'] || findRepoRoot(process.cwd())),
    help: false,
  };
}

interface AuditEntry {
  taskId: string;
  tier: CeremonyTierResult['tier'];
  lane: CeremonyTierResult['lane'];
  source: CeremonyTierResult['source'];
  status: string;
  checks: CeremonyTierResult['checks'];
}

function loadTasks(repoRoot: string): SprintTask[] {
  const csvPath = resolveSprintPlanPath(repoRoot);
  if (!csvPath) {
    console.error('[ceremony-tier-audit] Could not find Sprint_plan.csv under ' + repoRoot);
    process.exit(2);
  }
  const csvContent = readFileSync(csvPath, 'utf8');
  const { tasks, errors } = parseSprintCsv(csvContent);
  if (errors.length > 0) {
    console.error('[ceremony-tier-audit] Failed to parse ' + csvPath + ':');
    for (const err of errors) console.error('  - ' + err);
    process.exit(2);
  }
  return tasks;
}

function buildStatusByTaskId(tasks: SprintTask[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const task of tasks) {
    map.set(task['Task ID'], task.Status);
  }
  return map;
}

function classifyAll(
  tasks: SprintTask[],
  statusByTaskId: Map<string, string>,
  overrides: Map<string, 'light' | 'full' | 'auto'>,
  includeCompleted: boolean
): AuditEntry[] {
  return tasks
    .filter((task) => includeCompleted || !isCompletedStatus(task.Status))
    .map((task) => {
      const result = resolveCeremonyTier(task, statusByTaskId, overrides);
      return {
        taskId: task['Task ID'],
        tier: result.tier,
        lane: result.lane,
        source: result.source,
        status: task.Status,
        checks: result.checks,
      };
    });
}

function printTable(entries: AuditEntry[]): void {
  const lightCount = entries.filter((e) => e.tier === 'light').length;
  const fullCount = entries.length - lightCount;
  console.log(`\nCeremony Tier Audit — ${entries.length} task(s) classified`);
  console.log(`  LIGHT: ${lightCount}   FULL: ${fullCount}\n`);

  const idWidth = Math.max(8, ...entries.map((e) => e.taskId.length));
  console.log(`${'Task ID'.padEnd(idWidth)}  Tier     Lane          Source      Status`);
  console.log('-'.repeat(idWidth + 46));
  for (const entry of entries) {
    console.log(
      `${entry.taskId.padEnd(idWidth)}  ${entry.tier.padEnd(7)}  ${entry.lane.padEnd(12)}  ${entry.source.padEnd(10)}  ${entry.status}`
    );
  }

  const lightEntries = entries.filter((e) => e.tier === 'light');
  if (lightEntries.length > 0) {
    console.log(`\n${lightEntries.length} task(s) qualify for the LIGHT ceremony:`);
    for (const entry of lightEntries) {
      console.log(`  - ${entry.taskId} (${entry.source})`);
    }
  }
}

function writeReport(repoRoot: string, entries: AuditEntry[]): string {
  const outPath = join(repoRoot, REPORT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    issue: '#579',
    total: entries.length,
    light: entries.filter((e) => e.tier === 'light').length,
    full: entries.filter((e) => e.tier === 'full').length,
    tasks: entries,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return outPath;
}

function main(): void {
  const options = parseCliArgs();
  const tasks = loadTasks(options.repoRoot);
  const statusByTaskId = buildStatusByTaskId(tasks);
  const overrides = loadTierOverrides(options.repoRoot);

  if (options.task) {
    const task = tasks.find((t) => t['Task ID'] === options.task);
    if (!task) {
      console.error(`[ceremony-tier-audit] Task "${options.task}" not found in Sprint_plan.csv`);
      process.exit(2);
    }
    const result = resolveCeremonyTier(task, statusByTaskId, overrides);
    const entry: AuditEntry = {
      taskId: task['Task ID'],
      tier: result.tier,
      lane: result.lane,
      source: result.source,
      status: task.Status,
      checks: result.checks,
    };
    if (options.json) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(
        `\n${entry.taskId}: ceremony_tier=${entry.tier} (lane=${entry.lane}, source=${entry.source})`
      );
      for (const check of entry.checks) {
        console.log(`  [${check.passed ? 'PASS' : 'FAIL'}] ${check.id}: ${check.detail}`);
      }
    }
    process.exit(0);
  }

  const entries = classifyAll(tasks, statusByTaskId, overrides, options.includeCompleted);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          total: entries.length,
          light: entries.filter((e) => e.tier === 'light').length,
          full: entries.filter((e) => e.tier === 'full').length,
          tasks: entries,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  printTable(entries);
  const outPath = writeReport(options.repoRoot, entries);
  console.log(`\nFull report: ${outPath}`);
  process.exit(0);
}

main();
