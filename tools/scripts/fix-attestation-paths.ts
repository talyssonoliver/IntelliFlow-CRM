/**
 * fix-attestation-paths.ts
 *
 * Fixes sprint path mismatches in Sprint_plan.csv where a task's
 * SPEC:/PLAN:/CONTEXT:/EVIDENCE: tokens reference `.specify/sprints/sprint-N/`
 * but N does not match the task's actual Target Sprint.
 *
 * Usage:
 *   npx tsx tools/scripts/fix-attestation-paths.ts
 *
 * Idempotent — running multiple times produces the same result.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CSV_PATH = join(__dirname, '../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// The tokens whose values may contain .specify/sprints/sprint-N/ paths
const TRACKED_PREFIXES = ['SPEC:', 'PLAN:', 'CONTEXT:', 'EVIDENCE:'];

// Regex to match a sprint directory segment in a path value
// Captures the sprint number so we can compare and replace it
const SPRINT_DIR_RE = /\.specify\/sprints\/sprint-(\d+)\//g;

interface CsvRow {
  'Task ID': string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  [key: string]: string;
}

interface ChangeRecord {
  taskId: string;
  actualSprint: number;
  oldValue: string;
  newValue: string;
}

/**
 * Returns the numeric sprint for a "Target Sprint" cell, or null for
 * non-numeric values like "Continuous", "-", or empty string.
 */
function parseSprintNumber(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === 'Continuous' || trimmed === '-') return null;
  const n = Number.parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

/**
 * Given a single semicolon-delimited token (e.g. "EVIDENCE:.specify/sprints/sprint-23/..."),
 * replace every `sprint-N` segment whose N doesn't match actualSprint with `sprint-{actualSprint}`.
 *
 * Only applies to tokens whose prefix is in TRACKED_PREFIXES and whose value starts
 * with `.specify/sprints/sprint-`.
 */
function fixToken(token: string, actualSprint: number): string {
  const prefix = TRACKED_PREFIXES.find((p) => token.startsWith(p));
  if (!prefix) return token; // Not a tracked token type — leave unchanged

  const value = token.slice(prefix.length);
  if (!value.startsWith('.specify/sprints/sprint-')) return token; // Not a sprint path

  // Replace all sprint-N occurrences that differ from actualSprint
  const fixed = value.replaceAll(SPRINT_DIR_RE, (_match, capturedN) => {
    const n = Number.parseInt(capturedN, 10);
    if (n === actualSprint) return _match; // Already correct
    return `.specify/sprints/sprint-${actualSprint}/`;
  });

  return prefix + fixed;
}

/**
 * Fix all sprint path mismatches in the `Artifacts To Track` field.
 * Tokens are semicolon-delimited.
 */
function fixArtifactsField(artifacts: string, actualSprint: number): string {
  if (!artifacts) return artifacts;

  return artifacts
    .split(';')
    .map((token) => fixToken(token.trim(), actualSprint))
    .join(';');
}

async function main(): Promise<void> {
  console.log(`Reading CSV from:\n  ${CSV_PATH}\n`);

  const raw = readFileSync(CSV_PATH, 'utf-8');

  const { data, meta } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`Parsed ${data.length} data rows.\n`);

  const changes: ChangeRecord[] = [];

  for (const row of data) {
    const taskId = (row['Task ID'] ?? '').trim();
    const targetSprintRaw = row['Target Sprint'] ?? '';
    const artifacts = row['Artifacts To Track'] ?? '';

    const actualSprint = parseSprintNumber(targetSprintRaw);
    if (actualSprint === null) continue; // Skip Continuous / non-numeric

    // Quick check: does this row even have a .specify/sprints/ path?
    if (!artifacts.includes('.specify/sprints/sprint-')) continue;

    const fixed = fixArtifactsField(artifacts, actualSprint);

    if (fixed !== artifacts) {
      row['Artifacts To Track'] = fixed;
      changes.push({ taskId, actualSprint, oldValue: artifacts, newValue: fixed });
    }
  }

  if (changes.length === 0) {
    console.log('No mismatches found — CSV is already correct.');
    return;
  }

  // Write the corrected CSV back
  const updatedCsv = Papa.unparse(data, {
    header: true,
    columns: meta.fields,
    newline: '\n',
  });

  writeFileSync(CSV_PATH, updatedCsv, 'utf-8');

  // Print summary
  console.log(`Fixed ${changes.length} row(s):\n`);
  for (const { taskId, actualSprint, oldValue, newValue } of changes) {
    // Find changed tokens for a concise diff
    const oldTokens = oldValue.split(';');
    const newTokens = newValue.split(';');
    const changedTokens: string[] = [];
    for (let i = 0; i < newTokens.length; i++) {
      if (newTokens[i] !== oldTokens[i]) {
        changedTokens.push(`    - ${oldTokens[i]}\n    + ${newTokens[i]}`);
      }
    }
    console.log(`  [${taskId}] => sprint-${actualSprint}`);
    changedTokens.forEach((t) => console.log(t));
    console.log();
  }

  console.log('CSV written successfully.\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
