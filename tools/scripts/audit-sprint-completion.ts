#!/usr/bin/env npx tsx
/**
 * Sprint Completion Audit CLI
 *
 * Verifies that completed sprint tasks have real implementations
 * with no fake results or placeholders.
 *
 * Usage:
 *   npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10
 *   npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10 --strict
 *   npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10 --skip-validations
 *   npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10 --json
 *
 * @module tools/scripts/audit-sprint-completion
 */

import { parseArgs } from 'node:util';
import * as path from 'path';
import {
  auditSprintCompletion,
  getAuditOutputPaths,
  writeAllReports,
  createLatestLink,
  type SprintAuditConfig,
} from './lib/sprint-audit';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CliOptions {
  sprint: number;
  strict: boolean;
  skipValidations: boolean;
  json: boolean;
  help: boolean;
  repoRoot: string;
  parallelLimit: number;
  timeout: number;
  runId?: string;
}

function printHelp(): void {
  console.log(`
Sprint Completion Audit CLI

Verifies that completed sprint tasks have real implementations
with no fake results or placeholders.

USAGE:
  npx tsx tools/scripts/audit-sprint-completion.ts [OPTIONS]

OPTIONS:
  --sprint, -s <number>      Sprint number to audit (required)
  --strict                   Strict mode - fail on placeholders and missed KPIs
  --skip-validations         Skip running validation commands (faster)
  --json                     Output JSON report to stdout instead of files
  --parallel <number>        Max parallel operations (default: 4)
  --timeout <ms>             Validation command timeout (default: 60000)
  --repo-root <path>         Repository root (default: cwd)
  --run-id <string>          Custom run ID (default: auto-generated)
  --help, -h                 Show this help message

EXAMPLES:
  # Audit sprint 10
  npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10

  # Strict audit with all checks
  npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10 --strict

  # Quick audit without running validations
  npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10 --skip-validations

  # Output JSON to stdout (for piping)
  npx tsx tools/scripts/audit-sprint-completion.ts --sprint 10 --json

EXIT CODES:
  0   Audit passed (all tasks verified)
  1   Audit failed (blocking issues found)
  2   Invalid arguments or error

REPORTS:
  Reports are written to:
    artifacts/reports/sprint-audit/sprint{N}-audit-{timestamp}/
      ├── audit.json           # Full machine-readable report
      ├── audit.md             # Human-readable summary
      ├── verdict.json         # Simple pass/fail for CI
      └── evidence/
          ├── artifact-hashes.txt
          ├── validation-logs/
          └── placeholder-scan.json
`);
}

function parseCliArgs(): CliOptions {
  try {
    const { values } = parseArgs({
      options: {
        sprint: { type: 'string', short: 's' },
        strict: { type: 'boolean', default: false },
        'skip-validations': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        parallel: { type: 'string', default: '4' },
        timeout: { type: 'string', default: '60000' },
        'repo-root': { type: 'string' },
        'run-id': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });

    if (values.help) {
      printHelp();
      process.exit(0);
    }

    if (!values.sprint) {
      console.error('Error: --sprint is required\n');
      printHelp();
      process.exit(2);
    }

    const sprintNumber = parseInt(values.sprint, 10);
    if (isNaN(sprintNumber) || sprintNumber < 0) {
      console.error('Error: --sprint must be a valid non-negative number\n');
      process.exit(2);
    }

    return {
      sprint: sprintNumber,
      strict: values.strict ?? false,
      skipValidations: values['skip-validations'] ?? false,
      json: values.json ?? false,
      help: false,
      repoRoot: values['repo-root'] || process.cwd(),
      parallelLimit: parseInt(values.parallel || '4', 10),
      timeout: parseInt(values.timeout || '60000', 10),
      runId: values['run-id'],
    };
  } catch (error) {
    console.error(`Error parsing arguments: ${error}`);
    printHelp();
    process.exit(2);
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const options = parseCliArgs();

  const config: Partial<SprintAuditConfig> = {
    sprintNumber: options.sprint,
    repoRoot: path.resolve(options.repoRoot),
    strictMode: options.strict,
    skipValidations: options.skipValidations,
    parallelLimit: options.parallelLimit,
    validationTimeout: options.timeout,
    runId: options.runId,
  };

  try {
    // Run the audit
    const report = await auditSprintCompletion(config);

    if (options.json) {
      // Output JSON to stdout
      console.log(JSON.stringify(report, null, 2));
    } else {
      // Write report files
      const paths = getAuditOutputPaths(
        config.repoRoot!,
        config.sprintNumber!,
        report.run_id
      );

      await writeAllReports(report, paths);
      await createLatestLink(paths, config.sprintNumber!, config.repoRoot!);

      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('AUDIT SUMMARY');
      console.log('='.repeat(60));
      console.log(`Sprint: ${report.sprint}`);
      console.log(`Verdict: ${report.verdict}`);
      console.log(`Total Tasks: ${report.summary.totalTasks}`);
      console.log(`Audited: ${report.summary.auditedTasks}`);
      console.log(`  ✅ Passed: ${report.summary.passedTasks}`);
      console.log(`  ❌ Failed: ${report.summary.failedTasks}`);
      console.log(`  ⚠️  Needs Human: ${report.summary.needsHumanTasks}`);
      console.log(`Blocking Issues: ${report.blocking_issues.length}`);
      console.log('='.repeat(60));

      if (report.blocking_issues.length > 0) {
        console.log('\nBLOCKING ISSUES:');
        for (const issue of report.blocking_issues.slice(0, 5)) {
          console.log(`  [${issue.severity.toUpperCase()}] ${issue.taskId}: ${issue.issue}`);
        }
        if (report.blocking_issues.length > 5) {
          console.log(`  ... and ${report.blocking_issues.length - 5} more`);
        }
      }

      console.log(`\nFull report: ${paths.mdPath}`);
    }

    // Exit with appropriate code
    if (report.verdict === 'PASS') {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('Audit failed with error:', error);
    process.exit(2);
  }
}

// Run main
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});
