/**
 * One-shot script: update PG-166 Status from "In Progress" to "Completed"
 * in both Sprint_plan.csv and Sprint_plan_G.csv using PapaParse.
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const Papa = require('papaparse');

const ROOT = 'C:/Users/talys/projects/intelliFlow-CRM';
const TASK_ID = 'PG-166';
const OLD_STATUS = 'In Progress';
const NEW_STATUS = 'Completed';

const files = [
  `${ROOT}/apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`,
  `${ROOT}/apps/project-tracker/docs/metrics/_global/Sprint_plan_G.csv`,
];

for (const filePath of files) {
  const raw = readFileSync(filePath, 'utf8');
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true });

  if (result.errors.length > 0) {
    console.error(`Parse errors in ${path.basename(filePath)}:`, result.errors);
    process.exit(1);
  }

  const statusField = result.meta.fields.find(
    (f) => f.toLowerCase() === 'status'
  );
  const idField = result.meta.fields.find(
    (f) => f.toLowerCase() === 'task id' || f === 'Task ID' || f === 'ID' || f.toLowerCase() === 'id'
  );

  console.log(`\nFile: ${path.basename(filePath)}`);
  console.log(`  Fields detected: ${result.meta.fields.join(', ')}`);
  console.log(`  Status field: "${statusField}"  |  ID field: "${idField}"`);

  const row = result.data.find((r) => r[idField] === TASK_ID);
  if (!row) {
    console.log(`  WARNING: ${TASK_ID} not found in this file.`);
    continue;
  }

  const before = row[statusField];
  row[statusField] = NEW_STATUS;
  const after = row[statusField];

  console.log(`  BEFORE: ${TASK_ID} Status = "${before}"`);
  console.log(`  AFTER:  ${TASK_ID} Status = "${after}"`);

  const updated = Papa.unparse(result.data, { header: true, newline: '\n' });
  writeFileSync(filePath, updated, 'utf8');
  console.log(`  Written successfully.`);
}

console.log('\nDone.');
