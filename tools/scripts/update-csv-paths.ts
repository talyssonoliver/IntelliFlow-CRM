#!/usr/bin/env npx tsx
/**
 * Update Sprint_plan.csv to use new unified .specify/{TASK_ID}/ paths
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const csvPath = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

console.log('Reading Sprint_plan.csv...');
let content = readFileSync(csvPath, 'utf-8');

// Count original occurrences
const oldCount = (content.match(/EVIDENCE:artifacts\/attestations\//g) || []).length;
console.log(`Found ${oldCount} EVIDENCE:artifacts/attestations/ references to update`);

// Replace EVIDENCE:artifacts/attestations/{TASK_ID}/file with EVIDENCE:.specify/{TASK_ID}/attestations/file
content = content.replace(
  /EVIDENCE:artifacts\/attestations\/([^\/]+)\/([^;\"]+)/g,
  'EVIDENCE:.specify/$1/attestations/$2'
);

// Verify the replacement
const newCount = (content.match(/EVIDENCE:\.specify\//g) || []).length;
console.log(`After replacement: ${newCount} EVIDENCE:.specify/ references`);

// Write updated content
writeFileSync(csvPath, content, 'utf-8');
console.log('Sprint_plan.csv updated successfully');
