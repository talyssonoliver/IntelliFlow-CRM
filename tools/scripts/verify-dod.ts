/**
 * Verify DOD enhancements on completed tasks
 */

import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
const csvContent = readFileSync(CSV_PATH, 'utf-8');
const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
  string,
  string
>[];

// Verification functions
function hasArtifactReference(dod: string): boolean {
  const artifactPatterns = [
    /\.md/i,
    /\.ts/i,
    /\.js/i,
    /\.json/i,
    /\.yaml/i,
    /\.yml/i,
    /\.prisma/i,
    /\.sql/i,
    /\.puml/i,
    /\.pdf/i,
    /\.xlsx/i,
    /\.csv/i,
    /artifact/i,
    /file/i,
    /document/i,
    /report/i,
    /schema/i,
    /config/i,
    /template/i,
    /checklist/i,
    /guide/i,
  ];
  return artifactPatterns.some((p) => p.test(dod));
}

function hasMeasurableCriteria(dod: string): boolean {
  const measurablePatterns = [
    /\d+%/, // percentages
    /<\d+/, // less than
    />\d+/, // greater than
    /\d+\s*(ms|s|min|hour|day)/i, // time units
    /100%/, // full coverage
    /zero|0\s+(error|issue|fail|bug)/i, // zero defects
    /all\s+\w+\s+(pass|complete|covered|tested)/i, // all X pass
    /no\s+\w+\s+(error|issue|fail|violation)/i, // no X errors
    />=|<=|≥|≤/, // comparison operators
  ];
  return measurablePatterns.some((p) => p.test(dod));
}

function hasTestableAssertion(dod: string): boolean {
  const testablePatterns = [
    /test.*pass/i,
    /coverage/i,
    /lint.*pass/i,
    /build.*success/i,
    /deploy.*success/i,
    /validated/i,
    /verified/i,
    /approved/i,
    /reviewed/i,
    /signed.?off/i,
    /working/i,
    /functional/i,
    /operational/i,
    /active/i,
    /enabled/i,
    /configured/i,
    /integrated/i,
    /implemented/i,
    /created/i,
    /generated/i,
    /published/i,
  ];
  return testablePatterns.some((p) => p.test(dod));
}

// Check completed tasks
const completed = tasks.filter((t) => t['Status']?.toLowerCase() === 'completed');
const issues: { taskId: string; issue: string }[] = [];

for (const task of completed) {
  const taskId = task['Task ID'];
  const dod = task['Definition of Done'] || '';

  const hasArtifact = hasArtifactReference(dod);
  const hasMeasurable = hasMeasurableCriteria(dod);
  const hasTestable = hasTestableAssertion(dod);

  if (!hasArtifact) {
    issues.push({ taskId, issue: 'No artifact reference' });
  }
  if (!hasMeasurable && !hasTestable) {
    issues.push({ taskId, issue: 'No measurable/testable criteria' });
  }
}

console.log('=== POST-ENHANCEMENT VERIFICATION ===');
console.log(`Completed tasks: ${completed.length}`);
console.log(`Issues remaining: ${issues.length}`);
console.log('');

if (issues.length > 0) {
  console.log('Remaining Issues:');
  for (const issue of issues.slice(0, 20)) {
    console.log(`  ${issue.taskId}: ${issue.issue}`);
  }
  if (issues.length > 20) {
    console.log(`  ... and ${issues.length - 20} more`);
  }
} else {
  console.log('All completed tasks now have verifiable DOD!');
}
