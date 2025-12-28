#!/usr/bin/env npx tsx
/**
 * MATOP Unified Orchestrator
 *
 * ONE COMMAND to execute the complete MATOP workflow for any task.
 * Automatically determines STOAs, runs gates, generates evidence.
 *
 * Usage:
 *   npx tsx tools/stoa/matop-execute.ts <TASK_ID> [options]
 *   pnpm matop ENV-001-AI
 *   pnpm matop IFC-001 --strict
 *
 * This replaces the need to manually run individual STOA commands.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  StoaRole,
  GateExecutionResult,
  WaiverRecord,
  StoaVerdict,
  CsvPatchProposal,
} from '../scripts/lib/stoa/types.js';
import {
  loadAuditMatrix,
  getToolById,
  getBaselineGates,
} from '../scripts/lib/stoa/gate-selection.js';
import { assignStoas, getAllInvolvedStoas } from '../scripts/lib/stoa/stoa-assignment.js';
import { runGates, summarizeGateResults } from '../scripts/lib/stoa/gate-runner.js';
import {
  generateRunId,
  getEvidenceDir,
  ensureEvidenceDirs,
  writeGateSelection,
  writeEvidenceHashes,
  generateDirectoryHashes,
} from '../scripts/lib/stoa/evidence.js';
import { createWaiverRecord, saveWaivers, summarizeWaivers } from '../scripts/lib/stoa/waiver.js';
import {
  generateStoaVerdict,
  writeStoaVerdict,
  aggregateVerdicts,
} from '../scripts/lib/stoa/verdict.js';
import {
  createStatusChangeProposal,
  appendToPatchHistory,
  applyCsvPatch,
  type ApplyPatchResult,
} from '../scripts/lib/stoa/csv-governance.js';
import {
  processVerdictRemediation,
  generateRemediationReport,
  type RemediationResult,
} from '../scripts/lib/stoa/remediation.js';
import {
  isStrictMode,
  log,
  logHeader,
  logSection,
  findRepoRoot,
  resolveSprintPlanPath,
  parseSprintCsv,
} from '../scripts/lib/validation-utils.js';

// ============================================================================
// STOA Gate Profiles (Complete for each STOA)
// ============================================================================

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
  Quality: ['turbo-test-coverage'],
  Intelligence: [
    'turbo-test-coverage', // AI tests included
  ],
  Domain: ['turbo-test-coverage', 'dependency-cruiser-validate'],
  Automation: ['turbo-typecheck', 'turbo-test-coverage', 'eslint-max-warnings-0'],
};

// ============================================================================
// Task Loading
// ============================================================================

interface TaskRecord {
  taskId: string;
  section?: string;
  description?: string;
  status?: string;
  targetSprint?: string;
  dependencies?: string[];
  definitionOfDone?: string;
}

function loadTask(taskId: string, repoRoot: string): TaskRecord | null {
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
// Unified Gate Collection
// ============================================================================

function collectGatesForStoas(stoas: StoaRole[]): string[] {
  const gates = new Set<string>();

  for (const stoa of stoas) {
    const profile = STOA_GATE_PROFILES[stoa] || [];
    for (const gate of profile) {
      gates.add(gate);
    }
  }

  return Array.from(gates).sort();
}

// ============================================================================
// Main MATOP Execution
// ============================================================================

interface MatopResult {
  runId: string;
  taskId: string;
  success: boolean;
  finalVerdict: string;
  evidenceDir: string;
  stoaVerdicts: StoaVerdict[];
  csvPatchProposal?: CsvPatchProposal;
  csvPatchApplied?: ApplyPatchResult;
  remediation?: RemediationResult;
}

async function executeMatop(
  taskId: string,
  options: { dryRun: boolean; strictMode: boolean }
): Promise<MatopResult> {
  const { dryRun, strictMode } = options;
  const repoRoot = findRepoRoot();
  const runId = generateRunId();

  // =========================================================================
  // Header
  // =========================================================================
  logHeader(`MATOP Execute: ${taskId}`);
  log(`Run ID: ${runId}`);
  log(`Strict Mode: ${strictMode ? 'Yes' : 'No'}`);
  log(`Dry Run: ${dryRun ? 'Yes' : 'No'}`);

  // =========================================================================
  // Phase 1: Load Task
  // =========================================================================
  logSection('Phase 1: Load Task');

  const task = loadTask(taskId, repoRoot);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  log(`Task: ${task.description || taskId}`);
  log(`Section: ${task.section || 'Unknown'}`);
  log(`Status: ${task.status || 'Unknown'}`);

  // =========================================================================
  // Phase 2: STOA Assignment (Automatic)
  // =========================================================================
  logSection('Phase 2: STOA Assignment');

  const assignment = assignStoas({
    taskId: task.taskId,
    section: task.section,
    description: task.description,
    definitionOfDone: task.definitionOfDone,
    dependencies: task.dependencies,
  });

  log(`Lead STOA: ${assignment.leadStoa}`);
  log(`Supporting STOAs: ${assignment.supportingStoas.join(', ') || 'None'}`);

  const allStoas = getAllInvolvedStoas(assignment);
  log(`All STOAs: ${allStoas.join(', ')}`);

  // =========================================================================
  // Phase 3: Gate Collection
  // =========================================================================
  logSection('Phase 3: Gate Collection');

  const matrix = loadAuditMatrix(repoRoot);
  const allGates = collectGatesForStoas(allStoas);

  log(`Total unique gates from ${allStoas.length} STOAs: ${allGates.length}`);

  // Classify gates
  const execute: string[] = [];
  const waiverRequired: string[] = [];
  const skipped: string[] = [];

  for (const toolId of allGates) {
    const tool = getToolById(matrix, toolId);

    if (!tool) {
      skipped.push(toolId);
      continue;
    }

    if (!tool.enabled) {
      if (tool.required) {
        waiverRequired.push(toolId);
      } else {
        skipped.push(toolId);
      }
      continue;
    }

    // Check env vars
    if (tool.requires_env && tool.requires_env.length > 0) {
      const missing = tool.requires_env.filter((v) => !process.env[v]);
      if (missing.length > 0) {
        if (tool.required) {
          waiverRequired.push(toolId);
        } else {
          skipped.push(toolId);
        }
        continue;
      }
    }

    execute.push(toolId);
  }

  log(`Gates to execute: ${execute.length}`);
  log(`Gates requiring waiver: ${waiverRequired.length}`);
  log(`Gates skipped: ${skipped.length}`);

  // =========================================================================
  // Phase 4: Initialize Evidence Directory
  // =========================================================================
  logSection('Phase 4: Initialize Evidence');

  const evidenceDir = getEvidenceDir(repoRoot, runId);
  await ensureEvidenceDirs(evidenceDir);

  const gateSelection = { execute, waiverRequired, skipped };
  writeGateSelection(evidenceDir, gateSelection);

  // =========================================================================
  // Phase 5: Create Waivers
  // =========================================================================
  const waivers: WaiverRecord[] = [];

  if (waiverRequired.length > 0) {
    logSection('Phase 5: Create Waivers');

    for (const toolId of waiverRequired) {
      const tool = getToolById(matrix, toolId);
      if (tool) {
        const waiver = createWaiverRecord(toolId, tool, runId);
        waivers.push(waiver);
        log(`Waiver: ${toolId} (${waiver.reason})`);
      }
    }

    await saveWaivers(evidenceDir, waivers);
  }

  // =========================================================================
  // Phase 6: Execute Gates
  // =========================================================================
  logSection('Phase 6: Execute Gates');

  const gateResults = await runGates(execute, {
    repoRoot,
    evidenceDir,
    matrix,
    dryRun,
  });

  const summary = summarizeGateResults(gateResults);
  log(`\nGate Results: ${summary.passed}/${summary.total} passed`);

  if (summary.failedGates.length > 0) {
    log(`Failed: ${summary.failedGates.join(', ')}`);
  }

  // =========================================================================
  // Phase 7: Generate STOA Verdicts
  // =========================================================================
  logSection('Phase 7: STOA Verdicts');

  const stoaVerdicts: StoaVerdict[] = [];

  for (const stoa of allStoas) {
    // Filter results to gates relevant to this STOA
    const stoaGates = STOA_GATE_PROFILES[stoa] || [];
    const relevantResults = gateResults.filter((r) => stoaGates.includes(r.toolId));
    const relevantWaivers = waivers.filter((w) => stoaGates.includes(w.toolId));

    const verdict = generateStoaVerdict(
      stoa,
      taskId,
      {
        execute: stoaGates.filter((g) => execute.includes(g)),
        waiverRequired: stoaGates.filter((g) => waiverRequired.includes(g)),
        skipped: stoaGates.filter((g) => skipped.includes(g)),
      },
      relevantResults.length > 0 ? relevantResults : gateResults, // Use all if STOA has no specific gates
      relevantWaivers,
      strictMode
    );

    stoaVerdicts.push(verdict);
    writeStoaVerdict(evidenceDir, verdict);

    const icon = verdict.verdict === 'PASS' ? '✓' : verdict.verdict === 'WARN' ? '!' : '✗';
    log(`${icon} ${stoa}: ${verdict.verdict}`);
  }

  // =========================================================================
  // Phase 8: Aggregate Final Verdict
  // =========================================================================
  logSection('Phase 8: Final Verdict');

  const finalVerdict = aggregateVerdicts(stoaVerdicts);
  log(`Consensus: ${finalVerdict}`);

  // =========================================================================
  // Phase 9: CSV Patch Proposal & Auto-Apply
  // =========================================================================
  let csvPatchProposal: CsvPatchProposal | undefined;
  let csvPatchApplied: ApplyPatchResult | undefined;

  if (finalVerdict === 'PASS' && task.status !== 'Completed') {
    logSection('Phase 9: CSV Patch & Auto-Apply');

    csvPatchProposal = createStatusChangeProposal(
      runId,
      taskId,
      task.status || 'Unknown',
      finalVerdict,
      `MATOP consensus: ${allStoas.length} STOAs returned ${finalVerdict}`,
      [`${evidenceDir}/summary.json`]
    );

    writeFileSync(
      join(evidenceDir, 'csv-patch-proposal.json'),
      JSON.stringify(csvPatchProposal, null, 2)
    );

    log(`Proposed: ${task.status} → Completed`);

    // Auto-apply the patch (unless dry run)
    if (!dryRun) {
      csvPatchApplied = applyCsvPatch(repoRoot, csvPatchProposal, 'matop-auto');

      if (csvPatchApplied.success) {
        log(`Applied: Sprint_plan.csv updated`);
        log(`  Status: ${task.status} → Completed`);
        log(`  Applied by: ${csvPatchApplied.appliedBy}`);
        log(`  Applied at: ${csvPatchApplied.appliedAt}`);
      } else {
        log(`Failed to apply patch: ${csvPatchApplied.error}`);
        // Still record the proposal in history as unapplied
        appendToPatchHistory(repoRoot, {
          proposal: csvPatchProposal,
          appliedAt: null,
          appliedBy: null,
          rejected: false,
        });
      }

      writeFileSync(
        join(evidenceDir, 'csv-patch-applied.json'),
        JSON.stringify(csvPatchApplied, null, 2)
      );
    } else {
      log(`Dry run: patch NOT applied`);
      appendToPatchHistory(repoRoot, {
        proposal: csvPatchProposal,
        appliedAt: null,
        appliedBy: null,
        rejected: false,
      });
    }
  }

  // =========================================================================
  // Phase 10: Generate Evidence Hashes
  // =========================================================================
  logSection('Phase 10: Evidence Hashes');

  const hashes = generateDirectoryHashes(evidenceDir, evidenceDir);
  writeEvidenceHashes(evidenceDir, hashes);
  log(`Hashed ${hashes.length} evidence files`);

  // =========================================================================
  // Phase 11: Remediation Workflow
  // =========================================================================
  logSection('Phase 11: Remediation');

  // Process remediation for any STOA that has non-PASS verdict
  let remediation: RemediationResult | undefined;
  const nonPassVerdicts = stoaVerdicts.filter((v) => v.verdict !== 'PASS');

  if (nonPassVerdicts.length > 0) {
    // Process each non-PASS verdict
    const allRemediationReports: string[] = [];

    for (const verdict of nonPassVerdicts) {
      const stoaRemediation = processVerdictRemediation(
        verdict,
        runId,
        repoRoot,
        evidenceDir,
        gateResults.map((g) => ({
          toolId: g.toolId,
          exitCode: g.exitCode,
          logPath: g.logPath || '',
        }))
      );

      // Use the first one as the primary remediation result
      if (!remediation) {
        remediation = stoaRemediation;
      } else {
        // Merge additional actions and entries
        remediation.actions.push(...stoaRemediation.actions);
        remediation.debtEntries.push(...stoaRemediation.debtEntries);
      }

      for (const action of stoaRemediation.actions) {
        log(`  [${verdict.stoa}] ${action}`);
      }

      allRemediationReports.push(generateRemediationReport(stoaRemediation, verdict));
    }

    // Write combined remediation report
    const combinedReport = allRemediationReports.join('\n---\n\n');
    writeFileSync(join(evidenceDir, 'remediation.md'), combinedReport);
    log(`Remediation report: remediation.md`);
  } else {
    log(`No remediation needed (all STOAs passed)`);
  }

  // =========================================================================
  // Write Summary
  // =========================================================================
  const summaryData = {
    runId,
    taskId,
    timestamp: new Date().toISOString(),
    strictMode,
    stoaAssignment: assignment,
    gateSelection,
    gateResults: summary,
    waiverCount: waivers.length,
    stoaVerdicts: stoaVerdicts.map((v) => ({ stoa: v.stoa, verdict: v.verdict })),
    finalVerdict,
    csvPatchProposal: csvPatchProposal ? 'proposed' : 'none',
    csvPatchApplied: csvPatchApplied
      ? {
          success: csvPatchApplied.success,
          appliedAt: csvPatchApplied.appliedAt,
          appliedBy: csvPatchApplied.appliedBy,
          error: csvPatchApplied.error,
        }
      : null,
    remediation: remediation
      ? {
          reviewQueueItemId: remediation.reviewQueueItem?.id,
          blockerId: remediation.blocker?.taskId,
          humanPacketCreated: !!remediation.humanPacket,
          debtEntriesCount: remediation.debtEntries.length,
        }
      : null,
  };

  writeFileSync(join(evidenceDir, 'summary.json'), JSON.stringify(summaryData, null, 2));

  // Human-readable summary
  const summaryMd = `# MATOP Run Summary

**Task:** ${taskId}
**Run ID:** ${runId}
**Timestamp:** ${summaryData.timestamp}

## STOA Assignment
- **Lead:** ${assignment.leadStoa}
- **Supporting:** ${assignment.supportingStoas.join(', ') || 'None'}

## Gate Execution
- **Executed:** ${execute.length} gates
- **Passed:** ${summary.passed}
- **Failed:** ${summary.failed}
- **Waivers:** ${waivers.length}

## STOA Verdicts
${stoaVerdicts.map((v) => `- **${v.stoa}:** ${v.verdict}`).join('\n')}

## Final Verdict: **${finalVerdict}**

${csvPatchProposal ? `## CSV Patch\n- **Proposed:** ${task.status} → Completed\n- **Applied:** ${csvPatchApplied?.success ? 'Yes' : csvPatchApplied ? `No (${csvPatchApplied.error})` : 'Dry run'}` : ''}

${
  remediation
    ? `## Remediation
${remediation.actions.map((a) => `- ${a}`).join('\n')}
`
    : ''
}
`;

  writeFileSync(join(evidenceDir, 'summary.md'), summaryMd);

  // =========================================================================
  // Complete
  // =========================================================================
  logSection('MATOP Complete');

  const success = finalVerdict === 'PASS' || (finalVerdict === 'WARN' && !strictMode);
  log(`Success: ${success ? 'Yes' : 'No'}`);
  log(`Evidence: ${evidenceDir}`);

  return {
    runId,
    taskId,
    success,
    finalVerdict,
    evidenceDir,
    stoaVerdicts,
    csvPatchProposal,
    csvPatchApplied,
    remediation,
  };
}

// ============================================================================
// CLI
// ============================================================================

function showHelp(): void {
  console.log(`
MATOP Unified Orchestrator

Execute the complete MATOP workflow for any task with ONE command.
Automatically determines STOAs, runs gates, generates evidence.

Usage:
  npx tsx tools/stoa/matop-execute.ts <TASK_ID> [options]
  pnpm matop <TASK_ID> [options]

Arguments:
  TASK_ID     The task ID from Sprint_plan.csv (e.g., ENV-001-AI, IFC-001)

Options:
  --dry-run   Don't execute gates, just show what would happen
  --strict    Enable strict mode (WARN becomes FAIL)
  --help      Show this help message

Examples:
  pnpm matop ENV-001-AI
  pnpm matop IFC-001 --strict
  pnpm matop ENV-008-AI --dry-run

The orchestrator will:
  1. Load task from Sprint_plan.csv
  2. Automatically determine Lead + Supporting STOAs
  3. Collect all required gates from all STOAs
  4. Execute gates and capture transcripts
  5. Generate STOA verdicts
  6. Aggregate final verdict (PASS/WARN/FAIL/NEEDS_HUMAN)
  7. Create CSV patch proposal if PASS
  8. AUTO-APPLY patch to Sprint_plan.csv (unless --dry-run)
  9. Generate evidence bundle with SHA256 hashes
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const taskId = args.find((a) => !a.startsWith('--'));
  if (!taskId) {
    console.error('Error: TASK_ID required');
    showHelp();
    process.exit(1);
  }

  const options = {
    dryRun: args.includes('--dry-run'),
    strictMode: args.includes('--strict') || isStrictMode(),
  };

  try {
    const result = await executeMatop(taskId, options);

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('MATOP failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
