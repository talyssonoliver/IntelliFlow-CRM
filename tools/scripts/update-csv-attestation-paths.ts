/**
 * Updates Sprint_plan.csv to use new sprint-based paths
 *
 * Converts:
 * - EVIDENCE:artifacts/attestations/{TASK-ID}/... -> EVIDENCE:.specify/sprints/sprint-{N}/attestations/{TASK-ID}/...
 * - SPEC:.specify/specifications/{TASK-ID}.md -> SPEC:.specify/sprints/sprint-{N}/specifications/{TASK-ID}-spec.md
 * - PLAN:.specify/planning/{TASK-ID}.md -> PLAN:.specify/sprints/sprint-{N}/planning/{TASK-ID}-plan.md
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const projectRoot = join(__dirname, '..', '..');
const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

interface CsvRow {
  'Task ID': string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  [key: string]: string;
}

function getSprintNumber(sprint: string): number {
  if (!sprint || sprint === 'Continuous' || sprint === '-' || sprint === '') {
    return 0; // Default to sprint 0 for continuous/unassigned tasks
  }
  const num = parseInt(sprint, 10);
  return isNaN(num) ? 0 : num;
}

function updateArtifactPaths(artifacts: string, taskId: string, sprintNumber: number): string {
  if (!artifacts) return artifacts;

  let result = artifacts;

  // Replace old attestation paths with new sprint-based paths
  // Pattern: artifacts/attestations/{TASK-ID}/... -> .specify/sprints/sprint-{N}/attestations/{TASK-ID}/...
  result = result.replace(
    /artifacts\/attestations\/([^/;,]+)\//g,
    (match, capturedTaskId) => {
      return `.specify/sprints/sprint-${sprintNumber}/attestations/${capturedTaskId}/`;
    }
  );

  // Replace old SPEC paths with new sprint-based paths
  // Pattern: SPEC:.specify/specifications/{TASK-ID}.md -> SPEC:.specify/sprints/sprint-{N}/specifications/{TASK-ID}-spec.md
  result = result.replace(
    /SPEC:\.specify\/specifications\/([^;,\s]+)\.md/g,
    (match, capturedTaskId) => {
      return `SPEC:.specify/sprints/sprint-${sprintNumber}/specifications/${capturedTaskId}-spec.md`;
    }
  );

  // Replace old PLAN paths with new sprint-based paths
  // Pattern: PLAN:.specify/planning/{TASK-ID}.md -> PLAN:.specify/sprints/sprint-{N}/planning/{TASK-ID}-plan.md
  result = result.replace(
    /PLAN:\.specify\/planning\/([^;,\s]+)\.md/g,
    (match, capturedTaskId) => {
      return `PLAN:.specify/sprints/sprint-${sprintNumber}/planning/${capturedTaskId}-plan.md`;
    }
  );

  return result;
}

async function main() {
  console.log('Reading CSV from:', csvPath);
  const csvContent = readFileSync(csvPath, 'utf-8');

  const { data, meta } = Papa.parse<CsvRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`Found ${data.length} rows`);

  let updatedCount = 0;

  for (const row of data) {
    const taskId = row['Task ID'];
    const targetSprint = row['Target Sprint'];
    const artifacts = row['Artifacts To Track'];

    const needsUpdate = artifacts && (
      artifacts.includes('artifacts/attestations') ||
      artifacts.includes('SPEC:.specify/specifications/') ||
      artifacts.includes('PLAN:.specify/planning/')
    );

    if (needsUpdate) {
      const sprintNumber = getSprintNumber(targetSprint);
      const updatedArtifacts = updateArtifactPaths(artifacts, taskId, sprintNumber);

      if (updatedArtifacts !== artifacts) {
        row['Artifacts To Track'] = updatedArtifacts;
        updatedCount++;
        console.log(`Updated ${taskId} (sprint ${sprintNumber})`);
      }
    }
  }

  console.log(`\nUpdated ${updatedCount} rows`);

  // Write back to CSV
  const updatedCsv = Papa.unparse(data, {
    header: true,
    columns: meta.fields,
  });

  writeFileSync(csvPath, updatedCsv, 'utf-8');
  console.log('CSV updated successfully');
}

main().catch(console.error);
