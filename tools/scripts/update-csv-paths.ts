#!/usr/bin/env npx tsx
/**
 * Update Sprint_plan.csv to use new unified sprint-based .specify/ paths
 *
 * New structure:
 *   .specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md
 *   .specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md
 *   .specify/sprints/sprint-{N}/attestations/{TASK_ID}/
 *   .specify/sprints/sprint-{N}/context/{TASK_ID}/
 *
 * Note: This script requires task's "Target Sprint" to determine {N}.
 * For manual updates, use the pattern: .specify/sprints/sprint-{TARGET_SPRINT}/
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

const csvPath = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

console.log('Reading Sprint_plan.csv...');
let content = readFileSync(csvPath, 'utf-8');

// Parse CSV to get task -> sprint mapping
const records = parse(content, { columns: true, skip_empty_lines: true });
const taskSprintMap = new Map<string, string>();
for (const record of records) {
  const taskId = record['Task ID'];
  const sprint = record['Target Sprint'];
  if (taskId && sprint) {
    taskSprintMap.set(taskId, sprint);
  }
}

console.log(`Loaded ${taskSprintMap.size} task -> sprint mappings`);

// Count original occurrences of old-style paths
const oldFlatCount = (content.match(/EVIDENCE:\.specify\/[A-Z]+-\d+(?:-AI)?\/attestations\//g) || []).length;
const oldArtifactCount = (content.match(/EVIDENCE:artifacts\/attestations\//g) || []).length;
console.log(`Found ${oldFlatCount} EVIDENCE:.specify/{TASK_ID}/attestations/ references`);
console.log(`Found ${oldArtifactCount} EVIDENCE:artifacts/attestations/ references`);

// Replace old flat structure with sprint-based structure
// EVIDENCE:.specify/{TASK_ID}/attestations/file -> EVIDENCE:.specify/sprints/sprint-{N}/attestations/{TASK_ID}/file
for (const [taskId, sprint] of taskSprintMap) {
  const oldPattern = new RegExp(
    `EVIDENCE:\\.specify/${taskId}/attestations/([^;\"]+)`,
    'g'
  );
  content = content.replace(
    oldPattern,
    `EVIDENCE:.specify/sprints/sprint-${sprint}/attestations/${taskId}/$1`
  );
}

// Also replace artifacts/attestations/ paths
content = content.replace(
  /EVIDENCE:artifacts\/attestations\/([^\/]+)\/([^;\"]+)/g,
  (_, taskId, file) => {
    const sprint = taskSprintMap.get(taskId) || '0';
    return `EVIDENCE:.specify/sprints/sprint-${sprint}/attestations/${taskId}/${file}`;
  }
);

// Verify the replacement
const newCount = (content.match(/EVIDENCE:\.specify\/sprints\/sprint-/g) || []).length;
console.log(`After replacement: ${newCount} EVIDENCE:.specify/sprints/sprint-{N}/ references`);

// Write updated content
writeFileSync(csvPath, content, 'utf-8');
console.log('Sprint_plan.csv updated successfully');
