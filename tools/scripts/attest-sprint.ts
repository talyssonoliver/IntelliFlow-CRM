#!/usr/bin/env npx tsx
/**
 * Sprint Attestation CLI
 *
 * Validates that tasks marked as "Completed" truly meet all criteria:
 * - Owner approval
 * - Dependencies not blocking
 * - Pre-requisites still valid
 * - Definition of Done verified
 * - KPIs passing
 * - Artifacts tracked and valid
 * - Validation method executed and passing
 *
 * This addresses the issue of CSV being too large for LLMs to read
 * by providing a focused attestation report for completed tasks.
 *
 * Usage:
 *   pnpm run attest:sprint                    # Sprint 0 (default)
 *   pnpm run attest:sprint -- --sprint 1      # Sprint 1
 *   pnpm run attest:sprint -- --task IFC-001  # Single task
 *   pnpm run attest:sprint -- --json          # JSON output
 *
 * @module tools/scripts/attest-sprint
 */

import {
  attestTask,
  attestSprint,
  extractTaskContext,
  saveAttestationReport,
  generateAttestationMarkdown,
  type TaskContext,
  type TaskAttestation,
  type SprintAttestationReport,
} from './lib/stoa/index.js';

import { findRepoRoot } from './lib/validation-utils.js';

// ============================================================================
// CLI
// ============================================================================

interface CliOptions {
  sprint: string;
  taskId?: string;
  json: boolean;
  quiet: boolean;
  context: boolean; // Output task context for LLM consumption
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    sprint: '0',
    json: false,
    quiet: false,
    context: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--sprint' && args[i + 1]) {
      options.sprint = args[++i];
    } else if (arg === '--task' && args[i + 1]) {
      options.taskId = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--context') {
      options.context = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Sprint Attestation CLI

Validates that completed tasks truly meet all validation criteria.
Provides LLM-friendly task context extraction.

Usage:
  pnpm run attest:sprint [options]

Options:
  --sprint <N>    Sprint number to attest (default: 0)
  --task <ID>     Attest a single task by ID
  --context       Output task context for LLM consumption
  --json          Output JSON format
  --quiet         Minimal output
  --help          Show this help

Examples:
  pnpm run attest:sprint                      # Attest Sprint 0
  pnpm run attest:sprint -- --sprint 1        # Attest Sprint 1
  pnpm run attest:sprint -- --task IFC-001    # Attest single task
  pnpm run attest:sprint -- --context         # Get LLM-friendly context

Output:
  - Console: Human-readable attestation matrix
  - JSON: artifacts/reports/attestation/sprint-{N}-latest.json
  - MD: artifacts/reports/attestation/sprint-{N}-latest.md

Criteria Checked:
  1. Owner Approval - Task has assigned owner
  2. Dependencies Clean - All dependencies completed
  3. Prerequisites Met - All prerequisites satisfied
  4. Definition of Done - DoD criteria verified
  5. KPIs Passing - All KPI targets met
  6. Artifacts Tracked - All artifacts exist
  7. Validation Passing - Validation method executed
`);
}

// ============================================================================
// Context Output (for LLM consumption)
// ============================================================================

function formatTaskContext(context: TaskContext): string {
  const lines: string[] = [];

  lines.push(`## Task: ${context.task.taskId}`);
  lines.push('');
  lines.push(`**Section:** ${context.task.section}`);
  lines.push(`**Description:** ${context.task.description}`);
  lines.push(`**Owner:** ${context.task.owner}`);
  lines.push(`**Status:** ${context.task.status}`);
  lines.push(`**Target Sprint:** ${context.task.targetSprint}`);
  lines.push('');

  if (context.task.dependencies.length > 0) {
    lines.push('### Dependencies');
    lines.push('');
    for (const dep of context.task.dependencies) {
      const depTask = context.dependencyTasks.find((t) => t.taskId === dep);
      if (depTask) {
        lines.push(`- **${dep}**: ${depTask.status} - ${depTask.description.slice(0, 60)}...`);
      } else {
        lines.push(`- **${dep}**: (not found)`);
      }
    }
    lines.push('');
  }

  if (context.dependentTasks.length > 0) {
    lines.push('### Dependent Tasks (blocked by this)');
    lines.push('');
    for (const dep of context.dependentTasks.slice(0, 5)) {
      lines.push(`- **${dep.taskId}**: ${dep.status} - ${dep.description.slice(0, 60)}...`);
    }
    if (context.dependentTasks.length > 5) {
      lines.push(`- ... and ${context.dependentTasks.length - 5} more`);
    }
    lines.push('');
  }

  if (context.task.prerequisites) {
    lines.push('### Prerequisites');
    lines.push('');
    lines.push(context.task.prerequisites);
    lines.push('');
  }

  if (context.task.definitionOfDone) {
    lines.push('### Definition of Done');
    lines.push('');
    lines.push(context.task.definitionOfDone);
    lines.push('');
  }

  if (context.task.kpis) {
    lines.push('### KPIs');
    lines.push('');
    lines.push(context.task.kpis);
    lines.push('');
  }

  if (context.task.artifactsToTrack.length > 0) {
    lines.push('### Artifacts');
    lines.push('');
    for (const artifact of context.task.artifactsToTrack) {
      const exists = context.relatedArtifacts.includes(artifact);
      lines.push(`- ${exists ? '✅' : '❌'} ${artifact}`);
    }
    lines.push('');
  }

  if (context.task.validationMethod) {
    lines.push('### Validation Method');
    lines.push('');
    lines.push(context.task.validationMethod);
    lines.push('');
  }

  if (context.matopEvidence) {
    lines.push('### MATOP Evidence');
    lines.push('');
    lines.push(`- **Run ID:** ${context.matopEvidence.runId}`);
    lines.push(`- **Verdict:** ${context.matopEvidence.verdict}`);
    lines.push(`- **Evidence:** ${context.matopEvidence.evidenceDir}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Attestation Output
// ============================================================================

function printAttestationSummary(attestation: TaskAttestation): void {
  const icon = (status: string) => {
    switch (status) {
      case 'pass':
        return '✅';
      case 'warn':
        return '⚠️';
      case 'fail':
        return '❌';
      case 'skip':
        return '⏭️';
      case 'pending':
        return '🕐';
      default:
        return '❓';
    }
  };

  console.log(`\n### ${attestation.taskId}`);
  console.log('');
  console.log(`| Criterion | Status |`);
  console.log(`|-----------|--------|`);

  const criteria = [
    ['Owner Approval', attestation.criteria.ownerApproval],
    ['Dependencies Clean', attestation.criteria.dependenciesClean],
    ['Prerequisites Met', attestation.criteria.prerequisitesMet],
    ['Definition of Done', attestation.criteria.definitionOfDoneMet],
    ['KPIs Passing', attestation.criteria.kpisPassing],
    ['Artifacts Tracked', attestation.criteria.artifactsTracked],
    ['Validation Passing', attestation.criteria.validationPassing],
  ];

  for (const [name, c] of criteria) {
    const criterion = c as { status: string; recommendation?: string };
    console.log(`| ${name} | ${icon(criterion.status)} ${criterion.status.toUpperCase()} |`);
  }

  console.log('');
  console.log(`**Overall:** ${attestation.overallStatus.toUpperCase()}`);
  console.log(
    `**Summary:** ${attestation.summary.passed} pass, ${attestation.summary.warned} warn, ${attestation.summary.failed} fail, ${attestation.summary.skipped} skip`
  );
}

function printReportSummary(report: SprintAttestationReport): void {
  console.log('======================================================================');
  console.log(`Sprint ${report.sprint} Completion Attestation`);
  console.log('======================================================================');
  console.log('');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Total Tasks: ${report.totalTasks}`);
  console.log(`Completed Tasks: ${report.completedTasks}`);
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`  Fully Valid: ${report.summary.fullyValid}`);
  console.log(`  Needs Review: ${report.summary.needsReview}`);
  console.log(`  Invalid: ${report.summary.invalid}`);
  console.log('');

  // Print the attestation matrix
  console.log('Attestation Matrix');
  console.log('------------------');
  console.log('');
  console.log('| Task ID | Owner | Deps | Prereq | DoD | KPIs | Artifacts | Valid | Overall |');
  console.log('|---------|-------|------|--------|-----|------|-----------|-------|---------|');

  const icon = (status: string) => {
    switch (status) {
      case 'pass':
        return '✅';
      case 'warn':
        return '⚠️';
      case 'fail':
        return '❌';
      case 'skip':
        return '⏭️';
      case 'pending':
        return '🕐';
      default:
        return '❓';
    }
  };

  for (const a of report.attestations) {
    const overall =
      a.overallStatus === 'valid' ? '✅' : a.overallStatus === 'needs_review' ? '⚠️' : '❌';

    console.log(
      `| ${a.taskId.padEnd(7)} | ${icon(a.criteria.ownerApproval.status)} | ${icon(a.criteria.dependenciesClean.status)} | ${icon(a.criteria.prerequisitesMet.status)} | ${icon(a.criteria.definitionOfDoneMet.status)} | ${icon(a.criteria.kpisPassing.status)} | ${icon(a.criteria.artifactsTracked.status)} | ${icon(a.criteria.validationPassing.status)} | ${overall} |`
    );
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const repoRoot = findRepoRoot();

  // Single task mode
  if (options.taskId) {
    // Context mode - output LLM-friendly task context
    if (options.context) {
      const context = extractTaskContext(options.taskId, repoRoot);
      if (!context) {
        console.error(`Task not found: ${options.taskId}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        console.log(formatTaskContext(context));
      }
      return;
    }

    // Attestation mode
    const attestation = attestTask(options.taskId, repoRoot);
    if (!attestation) {
      console.error(`Task not found: ${options.taskId}`);
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(attestation, null, 2));
    } else {
      printAttestationSummary(attestation);
    }

    // Exit with appropriate code
    process.exit(attestation.overallStatus === 'invalid' ? 1 : 0);
  }

  // Sprint mode
  const report = attestSprint(options.sprint, repoRoot);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!options.quiet) {
    printReportSummary(report);

    // Save report
    const { jsonPath, mdPath } = saveAttestationReport(report, repoRoot);
    console.log('');
    console.log('Reports saved:');
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  MD: ${mdPath}`);
  }

  // Exit with appropriate code
  const hasInvalid = report.summary.invalid > 0;
  process.exit(hasInvalid ? 1 : 0);
}

main().catch((error) => {
  console.error('Attestation failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
