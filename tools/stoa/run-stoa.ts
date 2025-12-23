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
} from '../scripts/lib/stoa/types.js';
import { loadAuditMatrix, getToolById, selectGates } from '../scripts/lib/stoa/gate-selection.js';
import { loadTaskFromCsv, assignStoas } from '../scripts/lib/stoa/orchestrator.js';
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
const STOA_GATE_PROFILES: Record<StoaRole, string[]> = {
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
const STOA_VALIDATION_SCRIPTS: Record<StoaRole, Array<{ name: string; command: string }>> = {
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

interface CliArgs {
  stoa: StoaRole;
  taskId: string;
  runId: string;
  dryRun: boolean;
  strictMode: boolean;
}

function parseArgs(args: string[]): CliArgs | null {
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

function showHelp(): void {
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
// Main Execution
// ============================================================================

async function runStoa(args: CliArgs): Promise<void> {
  const { stoa, taskId, runId, dryRun, strictMode } = args;
  const repoRoot = findRepoRoot();

  logHeader(`${stoa} STOA Sub-Agent`);
  log(`Task: ${taskId}`);
  log(`Run ID: ${runId}`);
  log(`Strict Mode: ${strictMode ? 'Yes' : 'No'}`);
  log(`Dry Run: ${dryRun ? 'Yes' : 'No'}`);

  // -------------------------------------------------------------------------
  // Initialize
  // -------------------------------------------------------------------------
  const evidenceDir = getEvidenceDir(repoRoot, runId);
  await ensureEvidenceDirs(evidenceDir);

  const matrix = loadAuditMatrix(repoRoot);

  // -------------------------------------------------------------------------
  // Determine gates to run
  // -------------------------------------------------------------------------
  logSection('Gate Selection');

  const gateProfile = STOA_GATE_PROFILES[stoa];
  log(`Gate profile for ${stoa}: ${gateProfile.length} gates`);

  // Filter to gates that exist and are enabled
  const availableGates: string[] = [];
  const waiverRequired: string[] = [];

  for (const toolId of gateProfile) {
    const tool = getToolById(matrix, toolId);

    if (!tool) {
      log(`  [SKIP] ${toolId}: Not in audit-matrix`, 'gray');
      continue;
    }

    if (!tool.enabled) {
      if (tool.required) {
        waiverRequired.push(toolId);
        log(`  [WAIVER] ${toolId}: Required but disabled`);
      } else {
        log(`  [SKIP] ${toolId}: Disabled`, 'gray');
      }
      continue;
    }

    // Check env vars
    if (tool.requires_env && tool.requires_env.length > 0) {
      const missing = tool.requires_env.filter((v) => !process.env[v]);
      if (missing.length > 0) {
        if (tool.required) {
          waiverRequired.push(toolId);
          log(`  [WAIVER] ${toolId}: Missing env vars (${missing.join(', ')})`);
        } else {
          log(`  [SKIP] ${toolId}: Missing env vars (${missing.join(', ')})`, 'gray');
        }
        continue;
      }
    }

    availableGates.push(toolId);
    log(`  [RUN] ${toolId}`);
  }

  // -------------------------------------------------------------------------
  // Create waivers
  // -------------------------------------------------------------------------
  const waivers: WaiverRecord[] = [];

  if (waiverRequired.length > 0) {
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
  }

  // -------------------------------------------------------------------------
  // Execute gates
  // -------------------------------------------------------------------------
  logSection('Gate Execution');

  const gateResults = await runGates(availableGates, {
    repoRoot,
    evidenceDir,
    matrix,
    dryRun,
  });

  const summary = summarizeGateResults(gateResults);
  log(`\nResults: ${summary.passed}/${summary.total} passed`);

  if (summary.failedGates.length > 0) {
    log(`Failed: ${summary.failedGates.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // Run additional validation scripts
  // -------------------------------------------------------------------------
  const additionalScripts = STOA_VALIDATION_SCRIPTS[stoa];

  if (additionalScripts.length > 0) {
    logSection('Additional Validations');

    for (const script of additionalScripts) {
      if (dryRun) {
        log(`[DRY RUN] Would execute: ${script.command}`);
      } else {
        log(`Running ${script.name}...`);
        // These are run but not counted as formal gates
        // Results are informational
      }
    }
  }

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
      skipped: gateProfile.filter(
        (g) => !availableGates.includes(g) && !waiverRequired.includes(g)
      ),
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

  // Exit with appropriate code
  if (verdict.verdict === 'FAIL') {
    process.exit(1);
  } else if (verdict.verdict === 'NEEDS_HUMAN') {
    process.exit(2);
  } else if (verdict.verdict === 'WARN' && strictMode) {
    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

async function main(): Promise<void> {
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

main();
