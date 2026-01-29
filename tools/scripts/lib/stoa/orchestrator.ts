/**
 * STOA Orchestrator
 *
 * Main entry point for STOA framework execution.
 * Implements the complete workflow from Framework.md Section 11.
 *
 * @module tools/scripts/lib/stoa/orchestrator
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Task,
  StoaConfig,
  PreflightResult,
  StoaAssignment,
  GateSelectionResult,
  GateExecutionResult,
  WaiverRecord,
  StoaVerdict,
  CsvPatchProposal,
  RunSummary,
  AuditMatrix,
} from './types.js';
import { loadAuditMatrix, selectGates, getToolById, canToolRun } from './gate-selection.js';
import { assignStoas, getAllInvolvedStoas } from './stoa-assignment.js';
import { createWaiverRecord, saveWaivers, getStrictModeBehavior } from './waiver.js';
import {
  generateRunId,
  getEvidenceDir,
  ensureEvidenceDirs,
  createEvidenceBundle,
  createRunSummary,
  writeRunSummary,
} from './evidence.js';
import { runGates, verifyToolsAvailable, summarizeGateResults } from './gate-runner.js';
import { generateStoaVerdict, writeStoaVerdict, aggregateVerdicts } from './verdict.js';
import { createStatusChangeProposal, appendToPatchHistory } from './csv-governance.js';
import {
  resolveSprintPlanPath,
  parseSprintCsv,
  isStrictMode,
  log,
  logHeader,
  logSection,
  listGitTrackedFiles,
} from '../validation-utils.js';

// ============================================================================
// Preflight Checks
// ============================================================================

/**
 * Run all preflight checks before gate execution.
 */
export async function runPreflightChecks(
  config: StoaConfig,
  gateSelection: GateSelectionResult,
  matrix: AuditMatrix
): Promise<PreflightResult> {
  const { repoRoot, strictMode } = config;

  // 1. Path resolution check
  const csvPath = resolveSprintPlanPath(repoRoot);
  const pathResolution = {
    path: csvPath,
    source: csvPath?.includes('_global') ? 'canonical' : csvPath ? 'fallback' : 'not_found',
    severity: 'PASS' as const,
    message: '',
  };

  if (!csvPath) {
    pathResolution.severity = 'FAIL';
    pathResolution.message = 'Sprint_plan.csv not found';
  } else if (!csvPath.includes('_global')) {
    pathResolution.severity = strictMode ? 'FAIL' : 'WARN';
    pathResolution.message = strictMode
      ? 'Using root fallback in strict mode (FAIL)'
      : 'Using root fallback (WARN)';
  } else {
    pathResolution.message = `Canonical path resolved: ${csvPath}`;
  }

  // 2. Uniqueness check
  const tracked = listGitTrackedFiles(repoRoot);
  const csvMatches = (tracked.files || []).filter(
    (f) => f.endsWith('/Sprint_plan.csv') || f === 'Sprint_plan.csv'
  );

  const uniquenessChecks = [
    {
      artifact: 'Sprint_plan.csv',
      matchCount: csvMatches.length,
      matches: csvMatches,
      severity: csvMatches.length === 1 ? ('PASS' as const) : ('FAIL' as const),
      message:
        csvMatches.length === 1
          ? 'Exactly one tracked copy found'
          : `Found ${csvMatches.length} tracked copies (expected 1)`,
    },
  ];

  // 3. Tool availability check
  const allToolIds = [...gateSelection.execute, ...gateSelection.waiverRequired];
  const toolAvailability = await verifyToolsAvailable(allToolIds, matrix, repoRoot);

  // 4. Environment variable checks
  const envVarChecks: Array<{
    toolId: string;
    variable: string;
    present: boolean;
  }> = [];

  for (const toolId of allToolIds) {
    const tool = getToolById(matrix, toolId);
    if (tool?.requires_env) {
      for (const envVar of tool.requires_env) {
        envVarChecks.push({
          toolId,
          variable: envVar,
          present: !!process.env[envVar],
        });
      }
    }
  }

  // Determine overall pass/fail
  const passed =
    pathResolution.severity !== 'FAIL' &&
    uniquenessChecks.every((c) => c.severity === 'PASS') &&
    toolAvailability
      .filter((t) => gateSelection.execute.includes(t.toolId))
      .every((t) => t.available);

  return {
    passed,
    pathResolution: pathResolution as PreflightResult['pathResolution'],
    uniquenessChecks,
    toolAvailability,
    envVarChecks,
  };
}

// ============================================================================
// Task Loading
// ============================================================================

/**
 * Load a task from the Sprint_plan.csv.
 */
export function loadTaskFromCsv(taskId: string, repoRoot: string): Task | null {
  const csvPath = resolveSprintPlanPath(repoRoot);

  if (!csvPath || !existsSync(csvPath)) {
    return null;
  }

  const content = readFileSync(csvPath, 'utf-8');
  const { tasks } = parseSprintCsv(content);

  const csvTask = tasks.find((t) => t['Task ID'] === taskId);

  if (!csvTask) {
    return null;
  }

  return {
    taskId: csvTask['Task ID'],
    section: csvTask.Section,
    description: csvTask.Description,
    status: csvTask.Status,
    targetSprint: csvTask['Target Sprint'],
    dependencies: csvTask.Dependencies?.split(',')
      .map((d) => d.trim())
      .filter(Boolean),
    definitionOfDone: csvTask['Definition of Done'],
  };
}

// ============================================================================
// Main Orchestration
// ============================================================================

export interface OrchestratorResult {
  runId: string;
  success: boolean;
  summary: RunSummary;
  evidenceDir: string;
  csvPatchProposal?: CsvPatchProposal;
}

/**
 * Run the complete STOA orchestration for a task.
 */
export async function runStoaOrchestration(
  taskId: string,
  config: StoaConfig
): Promise<OrchestratorResult> {
  const { repoRoot, strictMode, dryRun } = config;
  const startedAt = new Date().toISOString();
  const runId = generateRunId();

  logHeader(`STOA Orchestration: ${taskId}`);
  log(`Run ID: ${runId}`);
  log(`Strict Mode: ${strictMode ? 'Yes' : 'No'}`);
  log(`Dry Run: ${dryRun ? 'Yes' : 'No'}`);

  // -------------------------------------------------------------------------
  // Phase 1: Load task and assign STOAs
  // -------------------------------------------------------------------------
  logSection('Phase 1: Task Loading and STOA Assignment');

  const task = loadTaskFromCsv(taskId, repoRoot);

  if (!task) {
    throw new Error(`Task not found in CSV: ${taskId}`);
  }

  log(`Task: ${task.description || taskId}`);
  log(`Current Status: ${task.status || 'Unknown'}`);

  // Parse sprint number from task's targetSprint
  const sprintNumber = task.targetSprint
    ? parseInt(task.targetSprint, 10)
    : 0; // Default to sprint 0 if not specified

  log(`Sprint: ${sprintNumber}`);

  // Initialize evidence directory (requires sprint number and taskId)
  const evidenceDir = getEvidenceDir(repoRoot, sprintNumber, taskId, runId);
  await ensureEvidenceDirs(evidenceDir);

  const stoaAssignment = assignStoas(task);
  log(`Lead STOA: ${stoaAssignment.leadStoa}`);
  log(`Supporting STOAs: ${stoaAssignment.supportingStoas.join(', ') || 'None'}`);

  // -------------------------------------------------------------------------
  // Phase 2: Gate Selection
  // -------------------------------------------------------------------------
  logSection('Phase 2: Gate Selection');

  const matrix = loadAuditMatrix(repoRoot);
  const allStoas = getAllInvolvedStoas(stoaAssignment);
  const gateSelection = selectGates(task, matrix, allStoas);

  log(`Gates to Execute: ${gateSelection.execute.length}`);
  log(`Gates Requiring Waiver: ${gateSelection.waiverRequired.length}`);
  log(`Gates Skipped: ${gateSelection.skipped.length}`);

  // -------------------------------------------------------------------------
  // Phase 3: Preflight Checks
  // -------------------------------------------------------------------------
  logSection('Phase 3: Preflight Checks');

  const preflight = await runPreflightChecks(config, gateSelection, matrix);

  log(
    `Path Resolution: ${preflight.pathResolution.severity} - ${preflight.pathResolution.message}`
  );

  for (const check of preflight.uniquenessChecks) {
    log(`Uniqueness (${check.artifact}): ${check.severity} - ${check.message}`);
  }

  if (!preflight.passed && strictMode) {
    throw new Error('Preflight checks failed in strict mode');
  }

  // -------------------------------------------------------------------------
  // Phase 4: Create Waivers for Required-but-Unavailable Tools
  // -------------------------------------------------------------------------
  logSection('Phase 4: Waiver Creation');

  const waivers: WaiverRecord[] = [];

  for (const toolId of gateSelection.waiverRequired) {
    const tool = getToolById(matrix, toolId);

    if (tool) {
      const waiver = createWaiverRecord(toolId, tool, runId);
      waivers.push(waiver);
      log(`Created waiver for: ${toolId} (${waiver.reason})`);
    }
  }

  if (waivers.length > 0) {
    await saveWaivers(evidenceDir, waivers);
  }

  // -------------------------------------------------------------------------
  // Phase 5: Gate Execution
  // -------------------------------------------------------------------------
  logSection('Phase 5: Gate Execution');

  const gateResults = await runGates(gateSelection.execute, {
    repoRoot,
    evidenceDir,
    matrix,
    dryRun,
  });

  const gatesSummary = summarizeGateResults(gateResults);
  log(`\nGate Results: ${gatesSummary.passed}/${gatesSummary.total} passed`);

  if (gatesSummary.failedGates.length > 0) {
    log(`Failed: ${gatesSummary.failedGates.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // Phase 6: Generate STOA Verdicts
  // -------------------------------------------------------------------------
  logSection('Phase 6: STOA Verdicts');

  const stoaVerdicts: StoaVerdict[] = [];

  // Lead STOA verdict
  const leadVerdict = generateStoaVerdict(
    stoaAssignment.leadStoa,
    taskId,
    gateSelection,
    gateResults,
    waivers,
    strictMode
  );

  stoaVerdicts.push(leadVerdict);
  writeStoaVerdict(evidenceDir, leadVerdict);
  log(`${stoaAssignment.leadStoa} STOA: ${leadVerdict.verdict} - ${leadVerdict.rationale}`);

  // Supporting STOA verdicts (for now, they inherit the lead verdict)
  for (const supportingStoa of stoaAssignment.supportingStoas) {
    const verdict = generateStoaVerdict(
      supportingStoa,
      taskId,
      gateSelection,
      gateResults,
      waivers,
      strictMode
    );

    stoaVerdicts.push(verdict);
    writeStoaVerdict(evidenceDir, verdict);
    log(`${supportingStoa} STOA: ${verdict.verdict}`);
  }

  const finalVerdict = aggregateVerdicts(stoaVerdicts);
  log(`\nFinal Verdict: ${finalVerdict}`);

  // -------------------------------------------------------------------------
  // Phase 7: Create Evidence Bundle
  // -------------------------------------------------------------------------
  logSection('Phase 7: Evidence Bundle');

  // Create CSV patch proposal if status should change
  let csvPatchProposal: CsvPatchProposal | undefined;

  if (task.status !== 'Completed' && finalVerdict === 'PASS') {
    csvPatchProposal = createStatusChangeProposal(
      runId,
      taskId,
      task.status || 'Unknown',
      finalVerdict,
      `All gates passed. Lead STOA (${stoaAssignment.leadStoa}) verdict: PASS`,
      [`${evidenceDir}/summary.json`]
    );

    // Record proposal in history
    appendToPatchHistory(repoRoot, {
      proposal: csvPatchProposal,
      appliedAt: null,
      appliedBy: null,
      rejected: false,
    });

    log(`CSV patch proposal created for status change: ${task.status} → Completed`);
  }

  const evidenceBundle = await createEvidenceBundle(
    repoRoot,
    sprintNumber,
    taskId,
    runId,
    gateSelection,
    gateResults,
    waivers,
    stoaVerdicts,
    csvPatchProposal
  );

  const summary = createRunSummary(
    evidenceBundle,
    stoaAssignment,
    preflight.pathResolution.path || 'unknown',
    strictMode,
    startedAt
  );

  writeRunSummary(evidenceDir, summary);

  log(`Evidence bundle created at: ${evidenceDir}`);
  log(`Evidence files: ${evidenceBundle.hashes.length} hashed`);

  // -------------------------------------------------------------------------
  // Complete
  // -------------------------------------------------------------------------
  logSection('Orchestration Complete');

  const success = finalVerdict === 'PASS' || (finalVerdict === 'WARN' && !strictMode);

  log(`Success: ${success ? 'Yes' : 'No'}`);
  log(`Evidence: ${evidenceDir}`);

  return {
    runId,
    success,
    summary,
    evidenceDir,
    csvPatchProposal,
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * Parse CLI arguments for orchestrator.
 */
export function parseCliArgs(
  args: string[]
): { taskId: string; config: Partial<StoaConfig> } | null {
  const taskId = args.find((a) => !a.startsWith('--'));

  if (!taskId) {
    return null;
  }

  const config: Partial<StoaConfig> = {
    strictMode: args.includes('--strict') || isStrictMode(),
    dryRun: args.includes('--dry-run'),
  };

  return { taskId, config };
}

/**
 * CLI entry point.
 */
export async function cli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
STOA Orchestrator

Usage: tsx orchestrator.ts <task-id> [options]

Options:
  --strict     Enable strict mode (WARN becomes FAIL)
  --dry-run    Don't execute gates, just log what would happen
  --help, -h   Show this help message

Examples:
  tsx orchestrator.ts ENV-001-AI
  tsx orchestrator.ts ENV-001-AI --strict
  tsx orchestrator.ts ENV-001-AI --dry-run
`);
    process.exit(0);
  }

  const parsed = parseCliArgs(args);

  if (!parsed) {
    console.error('Error: Task ID required');
    console.error('Usage: tsx orchestrator.ts <task-id> [options]');
    process.exit(1);
  }

  const repoRoot = process.cwd();

  const config: StoaConfig = {
    repoRoot,
    strictMode: parsed.config.strictMode ?? false,
    auditMatrixPath: join(repoRoot, 'audit-matrix.yml'),
    evidenceOutputDir: join(repoRoot, 'artifacts', 'reports', 'system-audit'),
    dryRun: parsed.config.dryRun,
  };

  try {
    const result = await runStoaOrchestration(parsed.taskId, config);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Orchestration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
