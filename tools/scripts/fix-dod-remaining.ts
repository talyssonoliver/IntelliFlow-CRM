/**
 * Fix remaining DOD issues in specific tasks
 *
 * Issues identified:
 * - IFC-003, IFC-005: No artifact reference in DOD
 * - IFC-008: Has artifacts but no testable assertion
 * - IFC-073, IFC-079: No artifact reference, no measurable criteria
 * - GTM-001, GTM-002: No explicit artifact reference
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// Targeted fixes for specific tasks
const TASK_FIXES: Record<string, { dodSuffix?: string; dodPrefix?: string }> = {
  'IFC-003': {
    dodSuffix: '; output: trpc.ts, router.ts validated',
  },
  'IFC-005': {
    dodSuffix: '; output: scoring.chain.ts, output-schema.zod.ts validated',
  },
  'IFC-008': {
    dodSuffix: '; 0 critical vulnerabilities, all controls verified',
  },
  'IFC-073': {
    dodSuffix: '; output: dpia.md, risk-matrix.md; all risks documented and mitigated',
  },
  'IFC-079': {
    dodSuffix: '; output: docusaurus.config.js, sidebars.js; site deployed and functional',
  },
  'GTM-001': {
    dodSuffix: '; output: icp.md, personas.md, objections.md validated',
  },
  'GTM-002': {
    dodSuffix: '; output: positioning.md, value-props.md, copy-blocks.md validated',
  },
};

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes =
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';');
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stringifyCsv(tasks: Record<string, string>[], headers: string[]): string {
  const headerRow = headers.map(escapeField).join(',');
  const dataRows = tasks.map((task) => headers.map((h) => escapeField(task[h] || '')).join(','));
  return [headerRow, ...dataRows].join('\n');
}

async function main() {
  console.log('=== Fix Remaining DOD Issues ===\n');

  // Read CSV
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];

  console.log(`Found ${tasks.length} tasks\n`);

  let fixed = 0;

  for (const task of tasks) {
    const taskId = task['Task ID'];
    const fix = TASK_FIXES[taskId];

    if (fix) {
      const oldDod = task['Definition of Done'] || '';
      let newDod = oldDod;

      if (fix.dodPrefix) {
        newDod = fix.dodPrefix + newDod;
      }
      if (fix.dodSuffix) {
        newDod = newDod + fix.dodSuffix;
      }

      if (newDod !== oldDod) {
        task['Definition of Done'] = newDod;
        console.log(`Fixed ${taskId}:`);
        console.log(`  Before: ${oldDod.substring(0, 80)}...`);
        console.log(`  After:  ${newDod.substring(0, 80)}...`);
        console.log('');
        fixed++;
      }
    }
  }

  console.log(`Fixed ${fixed} tasks\n`);

  // Write back
  const headers = Object.keys(tasks[0]);
  const output = stringifyCsv(tasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`Written to: ${CSV_PATH}`);
}

main().catch(console.error);
