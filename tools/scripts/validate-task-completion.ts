#!/usr/bin/env npx tsx
/**
 * Task Completion Validator
 * Scans the codebase to determine which tasks are actually completed
 * based on the presence of their tracked artifacts.
 *
 * Usage: npx tsx tools/scripts/validate-task-completion.ts [--fix]
 *   --fix: Update Sprint_plan.csv with correct statuses
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import Papa from 'papaparse';

// Find repo root
function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const CSV_PATH = join(REPO_ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

interface TaskInfo {
  taskId: string;
  section: string;
  description: string;
  status: string;
  targetSprint: string;
  artifacts: string[];
  foundArtifacts: string[];
  missingArtifacts: string[];
  completionPercent: number;
  suggestedStatus: string;
}

// Parse artifact paths from the "Artifacts To Track" column
function parseArtifacts(artifactsStr: string): string[] {
  if (!artifactsStr) return [];

  const artifacts: string[] = [];
  const parts = artifactsStr.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    // Extract path after prefix (ARTIFACT:, EVIDENCE:, SPEC:, PLAN:, etc.)
    const match = trimmed.match(/^(?:ARTIFACT|EVIDENCE|SPEC|PLAN):(.+)$/);
    if (match) {
      artifacts.push(match[1].trim());
    }
  }

  return artifacts;
}

// Check if a path exists (handles glob patterns loosely)
function checkArtifactExists(artifactPath: string): boolean {
  // Handle glob patterns by checking if parent dir has matching files
  if (artifactPath.includes('*')) {
    const parts = artifactPath.split('*');
    const baseDir = parts[0].replace(/\/$/, '');
    const fullBasePath = join(REPO_ROOT, baseDir);
    return existsSync(fullBasePath);
  }

  const fullPath = join(REPO_ROOT, artifactPath);
  return existsSync(fullPath);
}

// Determine suggested status based on artifact completion and sprint
// Conservative approach: only auto-complete for sprints 0-10, be cautious with 11+
function suggestStatus(completionPercent: number, currentStatus: string, sprintNum: number): string {
  const currentNorm = currentStatus.toLowerCase().trim();

  // Sprint 0-10: These are mostly complete, auto-suggest based on artifacts
  if (sprintNum <= 10) {
    if (completionPercent >= 80) {
      return 'Completed';
    } else if (completionPercent >= 30) {
      return 'In Progress';
    } else if (completionPercent > 0) {
      return 'In Progress';
    } else {
      // No artifacts but was marked completed - flag for review
      if (currentNorm === 'completed' || currentNorm === 'done') {
        return 'In Review';
      }
      return currentStatus; // Keep current status
    }
  }

  // Sprint 11-14: Active sprints - be more conservative
  if (sprintNum >= 11 && sprintNum <= 14) {
    if (completionPercent >= 80) {
      // Only suggest Completed if current status indicates work started
      if (currentNorm === 'in progress' || currentNorm === 'validating' || currentNorm === 'completed' || currentNorm === 'done') {
        return 'Completed';
      }
      return 'In Progress'; // Has artifacts but not officially started
    } else if (completionPercent >= 30) {
      // Some artifacts exist
      if (currentNorm === 'backlog' || currentNorm === 'planned') {
        return 'In Progress';
      }
      return currentStatus;
    } else {
      // Keep current status for tasks with minimal artifacts
      return currentStatus;
    }
  }

  // Sprint 15+: Future sprints - don't change status, keep as Backlog/Planned
  return currentStatus;
}

// Analyze all tasks
function analyzeTaskCompletion(): TaskInfo[] {
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  const results: TaskInfo[] = [];

  for (const row of data as Record<string, string>[]) {
    const taskId = row['Task ID'];
    if (!taskId) continue;

    const artifacts = parseArtifacts(row['Artifacts To Track'] || '');
    const foundArtifacts: string[] = [];
    const missingArtifacts: string[] = [];

    for (const artifact of artifacts) {
      if (checkArtifactExists(artifact)) {
        foundArtifacts.push(artifact);
      } else {
        missingArtifacts.push(artifact);
      }
    }

    const completionPercent = artifacts.length > 0
      ? Math.round((foundArtifacts.length / artifacts.length) * 100)
      : 0;

    const currentStatus = row['Status'] || 'Planned';
    const targetSprint = row['Target Sprint'] || '99';
    const sprintNum = targetSprint === 'Continuous' ? -1 : parseInt(targetSprint, 10) || 99;
    const suggestedStatus = suggestStatus(completionPercent, currentStatus, sprintNum);

    results.push({
      taskId,
      section: row['Section'] || '',
      description: row['Description'] || '',
      status: currentStatus,
      targetSprint: row['Target Sprint'] || '',
      artifacts,
      foundArtifacts,
      missingArtifacts,
      completionPercent,
      suggestedStatus,
    });
  }

  return results;
}

// Generate summary report
function generateReport(tasks: TaskInfo[]): void {
  console.log('=' .repeat(80));
  console.log('TASK COMPLETION VALIDATION REPORT');
  console.log('=' .repeat(80));
  console.log(`\nScanned: ${CSV_PATH}`);
  console.log(`Repository: ${REPO_ROOT}\n`);

  // Summary by sprint
  const sprintStats: Record<string, { total: number; completed: number; inProgress: number; planned: number }> = {};

  for (const task of tasks) {
    const sprint = task.targetSprint || 'Continuous';
    if (!sprintStats[sprint]) {
      sprintStats[sprint] = { total: 0, completed: 0, inProgress: 0, planned: 0 };
    }
    sprintStats[sprint].total++;

    if (task.suggestedStatus === 'Completed') {
      sprintStats[sprint].completed++;
    } else if (task.suggestedStatus === 'In Progress' || task.suggestedStatus === 'In Review') {
      sprintStats[sprint].inProgress++;
    } else {
      sprintStats[sprint].planned++;
    }
  }

  console.log('SPRINT SUMMARY (Based on artifact presence):');
  console.log('-'.repeat(80));

  const sortedSprints = Object.keys(sprintStats).sort((a, b) => {
    if (a === 'Continuous') return 1;
    if (b === 'Continuous') return -1;
    return parseInt(a) - parseInt(b);
  });

  for (const sprint of sortedSprints) {
    const stats = sprintStats[sprint];
    const pct = Math.round((stats.completed / stats.total) * 100);
    console.log(`Sprint ${sprint.padEnd(12)} | Total: ${stats.total.toString().padStart(3)} | Completed: ${stats.completed.toString().padStart(3)} (${pct.toString().padStart(3)}%) | In Progress: ${stats.inProgress.toString().padStart(3)} | Planned: ${stats.planned.toString().padStart(3)}`);
  }

  // Status mismatches
  const mismatches = tasks.filter(t => {
    const currentNorm = t.status.toLowerCase().replace(/\s+/g, '');
    const suggestedNorm = t.suggestedStatus.toLowerCase().replace(/\s+/g, '');
    return currentNorm !== suggestedNorm &&
           !(currentNorm === 'done' && suggestedNorm === 'completed') &&
           !(currentNorm === 'completed' && suggestedNorm === 'completed');
  });

  if (mismatches.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('STATUS MISMATCHES (Current vs Suggested based on artifacts):');
    console.log('-'.repeat(80));

    for (const task of mismatches.slice(0, 50)) {
      console.log(`\n${task.taskId} (Sprint ${task.targetSprint}):`);
      console.log(`  Current: ${task.status} -> Suggested: ${task.suggestedStatus}`);
      console.log(`  Artifacts: ${task.completionPercent}% found (${task.foundArtifacts.length}/${task.artifacts.length})`);
      if (task.missingArtifacts.length > 0 && task.missingArtifacts.length <= 5) {
        console.log(`  Missing: ${task.missingArtifacts.join(', ')}`);
      } else if (task.missingArtifacts.length > 5) {
        console.log(`  Missing: ${task.missingArtifacts.slice(0, 5).join(', ')} ... and ${task.missingArtifacts.length - 5} more`);
      }
    }

    if (mismatches.length > 50) {
      console.log(`\n... and ${mismatches.length - 50} more mismatches`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('TOTALS:');
  console.log('-'.repeat(80));

  const totalCompleted = tasks.filter(t => t.suggestedStatus === 'Completed').length;
  const totalInProgress = tasks.filter(t => t.suggestedStatus === 'In Progress' || t.suggestedStatus === 'In Review').length;
  const totalPlanned = tasks.filter(t => t.suggestedStatus === 'Planned').length;

  console.log(`Total Tasks: ${tasks.length}`);
  console.log(`Actually Completed (>=80% artifacts): ${totalCompleted}`);
  console.log(`In Progress (>0% artifacts): ${totalInProgress}`);
  console.log(`Not Started (0% artifacts): ${totalPlanned}`);
  console.log(`Status Mismatches: ${mismatches.length}`);

  console.log('\n' + '='.repeat(80));
}

// Update CSV with correct statuses
function updateCSV(tasks: TaskInfo[]): void {
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const { data, meta } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  const rows = data as Record<string, string>[];
  let updated = 0;

  for (const row of rows) {
    const task = tasks.find(t => t.taskId === row['Task ID']);
    if (task && task.status !== task.suggestedStatus) {
      // Only update if there's a significant change
      const currentNorm = task.status.toLowerCase().replace(/\s+/g, '');
      const suggestedNorm = task.suggestedStatus.toLowerCase().replace(/\s+/g, '');

      if (currentNorm !== suggestedNorm &&
          !(currentNorm === 'done' && suggestedNorm === 'completed')) {
        row['Status'] = task.suggestedStatus;
        updated++;
      }
    }
  }

  if (updated > 0) {
    const newCsv = Papa.unparse(rows, { columns: meta.fields });
    writeFileSync(CSV_PATH, newCsv + '\n', 'utf-8');
    console.log(`\n✅ Updated ${updated} task statuses in Sprint_plan.csv`);
  } else {
    console.log(`\n✅ No status updates needed`);
  }
}

// Main
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

console.log('\n🔍 Validating task completion from artifacts...\n');

const tasks = analyzeTaskCompletion();
generateReport(tasks);

if (shouldFix) {
  console.log('\n📝 Updating Sprint_plan.csv with corrected statuses...');
  updateCSV(tasks);
} else {
  console.log('\n💡 Run with --fix to update Sprint_plan.csv with corrected statuses');
}
