#!/usr/bin/env npx tsx
/**
 * Individual STOA Runner
 *
 * Executes a specific STOA's gate profile for a task.
 * Called by STOA sub-agent commands (/stoa-foundation, /stoa-security, etc.)
 *
 * Usage:
 *   npx tsx tools/stoa/run-stoa.ts <STOA> <TASK_ID> [RUN_ID]
 *
 * Examples:
 *   npx tsx tools/stoa/run-stoa.ts foundation ENV-001-AI
 *   npx tsx tools/stoa/run-stoa.ts security ENV-001-AI abc123
 *   npx tsx tools/stoa/run-stoa.ts quality IFC-001 --dry-run
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  StoaRole,
  GateExecutionResult,
  WaiverRecord,
  AuditMatrix,
  VerdictType,
} from '../scripts/lib/stoa/types.js';
import { loadAuditMatrix, getToolById, selectGates } from '../scripts/lib/stoa/gate-selection.js';
import { loadTaskFromCsv } from '../scripts/lib/stoa/orchestrator.js';
import { assignStoas } from '../scripts/lib/stoa/stoa-assignment.js';
import { runGates, summarizeGateResults } from '../scripts/lib/stoa/gate-runner.js';
import { generateRunId, getEvidenceDir, ensureEvidenceDirs } from '../scripts/lib/stoa/evidence.js';
import { createWaiverRecord, saveWaivers } from '../scripts/lib/stoa/waiver.js';
import { generateStoaVerdict, writeStoaVerdict } from '../scripts/lib/stoa/verdict.js';
import {
  isStrictMode,
  log,
  logHeader,
  logSection,
  findRepoRoot,
} from '../scripts/lib/validation-utils.js';

// ============================================================================
// STOA Gate Profiles
// ============================================================================

/**
 * Gate profiles for each STOA.
 * These are the tool IDs from audit-matrix.yml that each STOA runs.
 */
export const STOA_GATE_PROFILES: Record<StoaRole, string[]> = {
  Foundation: [
    'turbo-typecheck',
    'turbo-build',
    'turbo-test-coverage', // TDD enforcement - all foundation code must be tested
    'eslint-max-warnings-0',
    'prettier-check',
    'commitlint',
    'dependency-cruiser-validate',
  ],
  Security: ['gitleaks', 'pnpm-audit-high', 'snyk', 'semgrep-security-audit', 'trivy-image'],
  Quality: ['turbo-test-coverage', 'stryker', 'lighthouse-ci', 'sonarqube-scanner'],
  Intelligence: [
    'turbo-test-coverage', // AI worker tests included in coverage
  ],
  Domain: ['turbo-typecheck', 'turbo-test-coverage', 'dependency-cruiser-validate'],
  Automation: ['turbo-typecheck', 'turbo-build', 'turbo-test-coverage', 'eslint-max-warnings-0'],
};

/**
 * Additional validation scripts per STOA (not in audit-matrix).
 */
export const STOA_VALIDATION_SCRIPTS: Record<StoaRole, Array<{ name: string; command: string }>> = {
  Foundation: [{ name: 'artifact-paths-lint', command: 'tsx tools/lint/artifact-paths.ts' }],
  Security: [],
  Quality: [],
  Intelligence: [],
  Domain: [],
  Automation: [
    { name: 'sprint-validation', command: 'tsx tools/scripts/sprint-validation.ts' },
    { name: 'sprint-data-validation', command: 'tsx tools/scripts/validate-sprint-data.ts' },
  ],
};

// ============================================================================
// CLI Parsing
// ============================================================================

export interface CliArgs {
  stoa: StoaRole;
  taskId: string;
  runId: string;
  dryRun: boolean;
  strictMode: boolean;
}

export function parseArgs(args: string[]): CliArgs | null {
  const stoaArg = args.find((a) => !a.startsWith('--'));
  const taskIdArg = args.find((a, i) => i > 0 && !a.startsWith('--') && args[i - 1] === stoaArg);
  const runIdArg = args.find((a, i) => i > 1 && !a.startsWith('--'));

  if (!stoaArg || !taskIdArg) {
    return null;
  }

  // Normalize STOA name
  const stoaMap: Record<string, StoaRole> = {
    foundation: 'Foundation',
    security: 'Security',
    quality: 'Quality',
    intelligence: 'Intelligence',
    domain: 'Domain',
    automation: 'Automation',
  };

  const stoa = stoaMap[stoaArg.toLowerCase()];
  if (!stoa) {
    console.error(`Unknown STOA: ${stoaArg}`);
    console.error(`Valid STOAs: ${Object.keys(stoaMap).join(', ')}`);
    return null;
  }

  return {
    stoa,
    taskId: taskIdArg,
    runId: runIdArg || generateRunId(),
    dryRun: args.includes('--dry-run'),
    strictMode: args.includes('--strict') || isStrictMode(),
  };
}

export function showHelp(): void {
  console.log(`
Individual STOA Runner

Usage: npx tsx tools/stoa/run-stoa.ts <STOA> <TASK_ID> [RUN_ID] [options]

Arguments:
  STOA       The STOA to run (foundation, security, quality, intelligence, domain, automation)
  TASK_ID    The task ID from Sprint_plan.csv
  RUN_ID     Optional run ID (generated if not provided)

Options:
  --dry-run  Don't execute gates, just log what would happen
  --strict   Enable strict mode (WARN becomes FAIL)
  --help     Show this help message

Examples:
  npx tsx tools/stoa/run-stoa.ts foundation ENV-001-AI
  npx tsx tools/stoa/run-stoa.ts security ENV-001-AI abc123
  npx tsx tools/stoa/run-stoa.ts quality IFC-001 --dry-run
`);
}

// ============================================================================
// Main Execution — helpers
//
// Extracted from runStoa (ADR sonar-guard: Cognitive Complexity <= 15 per
// function). Each helper owns one phase of the run; runStoa just sequences
// them. No behavior change — same logs, same side effects, same exit codes.
// ============================================================================

/** Logs the four header lines every STOA run starts with. */
function logRunHeader(
  stoa: StoaRole,
  taskId: string,
  runId: string,
  dryRun: boolean,
  strictMode: boolean
): void {
  logHeader(`${stoa} STOA Sub-Agent`);
  log(`Task: ${taskId}`);
  log(`Run ID: ${runId}`);
  log(`Strict Mode: ${strictMode ? 'Yes' : 'No'}`);
  log(`Dry Run: ${dryRun ? 'Yes' : 'No'}`);
}

type GateClassification =
  | { action: 'run' }
  | { action: 'skip'; reason: string }
  | { action: 'waiver'; reason: string };

/**
 * Decides what to do with a single gate tool: run it, skip it, or require a
 * waiver for it. Pure decision logic, no logging or mutation — kept separate
 * from selectGatesForStoa so each stays small.
 */
function classifyGateTool(toolId: string, matrix: AuditMatrix): GateClassification {
  const tool = getToolById(matrix, toolId);

  if (!tool) {
    return { action: 'skip', reason: 'Not in audit-matrix' };
  }

  if (!tool.enabled) {
    return tool.required
      ? { action: 'waiver', reason: 'Required but disabled' }
      : { action: 'skip', reason: 'Disabled' };
  }

  const missingEnv = (tool.requires_env ?? []).filter((v) => !process.env[v]);
  if (missingEnv.length > 0) {
    const reason = `Missing env vars (${missingEnv.join(', ')})`;
    return tool.required ? { action: 'waiver', reason } : { action: 'skip', reason };
  }

  return { action: 'run' };
}

/**
 * Walks a STOA's gate profile, classifying and logging each tool, and
 * returns the gates to execute vs. the ones that need a waiver.
 */
function selectGatesForStoa(
  gateProfile: string[],
  matrix: AuditMatrix
): { availableGates: string[]; waiverRequired: string[] } {
  const availableGates: string[] = [];
  const waiverRequired: string[] = [];

  for (const toolId of gateProfile) {
    const classification = classifyGateTool(toolId, matrix);

    if (classification.action === 'run') {
      availableGates.push(toolId);
      log(`  [RUN] ${toolId}`);
      continue;
    }

    if (classification.action === 'waiver') {
      waiverRequired.push(toolId);
      log(`  [WAIVER] ${toolId}: ${classification.reason}`);
      continue;
    }

    log(`  [SKIP] ${toolId}: ${classification.reason}`, 'gray');
  }

  return { availableGates, waiverRequired };
}

/** Creates and persists waiver records for the tools that need one. */
async function createWaiversForTools(
  waiverRequired: string[],
  matrix: AuditMatrix,
  runId: string,
  evidenceDir: string
): Promise<WaiverRecord[]> {
  const waivers: WaiverRecord[] = [];

  if (waiverRequired.length === 0) {
    return waivers;
  }

  logSection('Waiver Creation');

  for (const toolId of waiverRequired) {
    const tool = getToolById(matrix, toolId);
    if (tool) {
      const waiver = createWaiverRecord(toolId, tool, runId);
      waivers.push(waiver);
      log(`Created waiver: ${toolId} (${waiver.reason})`);
    }
  }

  await saveWaivers(evidenceDir, waivers);
  return waivers;
}

/** Runs the selected gates and logs the pass/fail summary. */
async function executeGates(
  availableGates: string[],
  options: { repoRoot: string; evidenceDir: string; matrix: AuditMatrix; dryRun: boolean }
): Promise<GateExecutionResult[]> {
  logSection('Gate Execution');

  const gateResults = await runGates(availableGates, options);

  const summary = summarizeGateResults(gateResults);
  log(`\nResults: ${summary.passed}/${summary.total} passed`);

  if (summary.failedGates.length > 0) {
    log(`Failed: ${summary.failedGates.join(', ')}`);
  }

  return gateResults;
}

/**
 * Logs the STOA's additional (non-audit-matrix) validation scripts — the
 * real run or dry-run line per script. These are informational only; they
 * are never executed here or counted as formal gates.
 */
function logAdditionalValidations(stoa: StoaRole, dryRun: boolean): void {
  const additionalScripts = STOA_VALIDATION_SCRIPTS[stoa];

  if (additionalScripts.length === 0) {
    return;
  }

  logSection('Additional Validations');

  for (const script of additionalScripts) {
    if (dryRun) {
      log(`[DRY RUN] Would execute: ${script.command}`);
    } else {
      log(`Running ${script.name}...`);
    }
  }
}

/** Gates in the profile that were neither run nor waived. */
function computeSkippedGates(
  gateProfile: string[],
  availableGates: string[],
  waiverRequired: string[]
): string[] {
  return gateProfile.filter((g) => !availableGates.includes(g) && !waiverRequired.includes(g));
}

/** Exits the process with the code matching a terminal verdict, if any. */
function exitForVerdict(verdict: VerdictType): void {
  if (verdict === 'FAIL') {
    process.exit(1);
  } else if (verdict === 'NEEDS_HUMAN') {
    process.exit(2);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

export async function runStoa(args: CliArgs): Promise<void> {
  const { stoa, taskId, runId, dryRun, strictMode } = args;
  const repoRoot = findRepoRoot();

  logRunHeader(stoa, taskId, runId, dryRun, strictMode);

  // -------------------------------------------------------------------------
  // Initialize - Load task and setup evidence directory
  // -------------------------------------------------------------------------
  const task = loadTaskFromCsv(taskId, repoRoot);
  if (!task) {
    throw new Error(`Task ${taskId} not found in Sprint_plan.csv`);
  }

  // Parse sprint number from task's targetSprint
  const sprintNumber = task.targetSprint ? Number.parseInt(task.targetSprint, 10) : 0; // Default to sprint 0 if not specified

  log(`Sprint: ${sprintNumber}`);

  const evidenceDir = getEvidenceDir(repoRoot, sprintNumber, taskId, runId);
  await ensureEvidenceDirs(evidenceDir);

  const matrix = loadAuditMatrix(repoRoot);

  // -------------------------------------------------------------------------
  // Determine gates to run
  // -------------------------------------------------------------------------
  logSection('Gate Selection');

  const gateProfile = STOA_GATE_PROFILES[stoa];
  log(`Gate profile for ${stoa}: ${gateProfile.length} gates`);

  const { availableGates, waiverRequired } = selectGatesForStoa(gateProfile, matrix);

  // -------------------------------------------------------------------------
  // Create waivers
  // -------------------------------------------------------------------------
  const waivers = await createWaiversForTools(waiverRequired, matrix, runId, evidenceDir);

  // -------------------------------------------------------------------------
  // Execute gates
  // -------------------------------------------------------------------------
  const gateResults = await executeGates(availableGates, {
    repoRoot,
    evidenceDir,
    matrix,
    dryRun,
  });

  // -------------------------------------------------------------------------
  // Run additional validation scripts
  // -------------------------------------------------------------------------
  logAdditionalValidations(stoa, dryRun);

  // -------------------------------------------------------------------------
  // Generate verdict
  // -------------------------------------------------------------------------
  logSection('Verdict Generation');

  const verdict = generateStoaVerdict(
    stoa,
    taskId,
    {
      execute: availableGates,
      waiverRequired,
      skipped: computeSkippedGates(gateProfile, availableGates, waiverRequired),
    },
    gateResults,
    waivers,
    strictMode
  );

  const verdictPath = writeStoaVerdict(evidenceDir, verdict);

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------
  logSection('Complete');

  log(`${stoa} STOA: ${verdict.verdict}`);
  log(`Rationale: ${verdict.rationale}`);
  log(`Verdict file: ${verdictPath}`);

  exitForVerdict(verdict.verdict);
}

// ============================================================================
// Entry Point
// ============================================================================

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const parsed = parseArgs(args);

  if (!parsed) {
    console.error('Error: STOA and TASK_ID are required');
    console.error('Usage: npx tsx tools/stoa/run-stoa.ts <STOA> <TASK_ID> [RUN_ID]');
    process.exit(1);
  }

  try {
    await runStoa(parsed);
  } catch (error) {
    console.error('STOA execution failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('run-stoa.ts')) {
  main();
}
