/**
 * One-shot migration: Add Cadence column (col 18) to Sprint_plan.csv
 *
 * - Adds "Cadence" header after "Dependency Types"
 * - Sets cadence values for EXP-REPORTS tasks only
 * - All other rows get empty string
 * - Idempotent — exits cleanly if Cadence column already exists
 * - Regenerates split files (A-E) after modification
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { splitSprintPlan } from './split-sprint-plan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(
  __dirname,
  '../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);

/** Cadence values for the 5 continuous EXP-REPORTS tasks */
const CADENCE_MAP: Record<string, string> = {
  'EXP-REPORTS-001': 'daily:1d',
  'EXP-REPORTS-002': 'weekly:7d',
  'EXP-REPORTS-003': 'quarterly:90d',
  'EXP-REPORTS-004': 'per-sprint:14d',
  'EXP-REPORTS-005': 'per-build:1d',
};

function main(): void {
  console.log('=== Add Cadence Column Migration ===\n');

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  // Idempotency check
  if (parsed.meta.fields?.includes('Cadence')) {
    console.log('Cadence column already exists — nothing to do.');
    return;
  }

  console.log(`Rows parsed: ${parsed.data.length}`);
  console.log(`Current columns: ${parsed.meta.fields?.length}`);

  // Add Cadence to each row
  let cadenceAssigned = 0;
  for (const row of parsed.data) {
    const taskId = row['Task ID'] || '';
    const cadence = CADENCE_MAP[taskId] || '';
    row['Cadence'] = cadence;
    if (cadence) cadenceAssigned++;
  }

  console.log(`Cadence values assigned: ${cadenceAssigned}`);

  // Re-serialize with Cadence as column 18
  const fields = [...(parsed.meta.fields || []), 'Cadence'];
  const output = Papa.unparse(parsed.data, {
    columns: fields,
    newline: '\n',
  });

  // Write back with trailing newline
  writeFileSync(CSV_PATH, output + '\n', 'utf-8');
  console.log(`\nCSV updated: ${CSV_PATH}`);
  console.log(`New column count: ${fields.length}`);

  // Regenerate split files
  console.log('\nRegenerating split files...');
  const result = splitSprintPlan();
  if (result.success) {
    console.log(
      `Split files regenerated: ${result.parts.length} parts, ${result.sourceRows} rows`
    );
  } else {
    console.error(`Split failed: ${result.error}`);
  }

  console.log('\nDone.');
}

main();
