#!/usr/bin/env npx tsx
/**
 * 3-Way Artifact Reconciliation Script
 *
 * Cross-validates artifacts across three sources:
 *   1. Sprint_plan.csv "Artifacts To Track" column
 *   2. Plan file "Files to Create/Modify" sections
 *   3. Actual files on disk
 *
 * Usage:
 *   npx tsx tools/scripts/validate-artifacts.ts <TASK_ID>
 *   npx tsx tools/scripts/validate-artifacts.ts --audit
 *   npx tsx tools/scripts/validate-artifacts.ts <TASK_ID> --fix
 *
 * Exit codes:
 *   0 = all sources aligned (or --audit completed)
 *   1 = mismatches found
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRepoRoot(): string {
  // Try common locations
  const candidates = [
    process.cwd(),
    join(process.cwd(), '../..'),
    join(__dirname, '../..'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'pnpm-lock.yaml')) || existsSync(join(c, 'package.json'))) {
      return c;
    }
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
);

// ---------------------------------------------------------------------------
// CSV Parsing (lightweight — no external dependency)
// ---------------------------------------------------------------------------

interface CsvRow {
  [key: string]: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  // Parse header — handle quoted fields
  const header = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  let i = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    // Handle multi-line quoted fields
    let fullLine = lines[i];
    while (countQuotes(fullLine) % 2 !== 0 && i + 1 < lines.length) {
      i++;
      fullLine += '\n' + lines[i];
    }

    const values = parseCsvLine(fullLine);
    const row: CsvRow = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = (values[j] ?? '').trim();
    }
    rows.push(row);
    i++;
  }

  return rows;
}

function countQuotes(s: string): number {
  let count = 0;
  for (const ch of s) { if (ch === '"') count++; }
  return count;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else if (ch === '\r') {
      // skip CR
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// CSV Artifact Extraction
// ---------------------------------------------------------------------------

function getTaskRow(taskId: string, rows: CsvRow[]): CsvRow | undefined {
  return rows.find((r) => r['Task ID'] === taskId);
}

/**
 * Parse "Artifacts To Track" column.
 * Handles prefixes: ARTIFACT:, EVIDENCE:, plain paths, and semicolons/newlines as separators.
 */
function parseCsvArtifacts(artifactsField: string): string[] {
  if (!artifactsField) return [];

  const paths: string[] = [];
  // Split by semicolons, newlines, and comma-space outside quotes
  const raw = artifactsField
    .split(/[;\n]/)
    .flatMap((s) => s.split(/,\s+/))
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of raw) {
    // Strip known prefixes
    let path = entry
      .replace(/^ARTIFACT:\s*/i, '')
      .replace(/^EVIDENCE:\s*/i, '')
      .replace(/^FILE:\s*/i, '')
      .replace(/^SPEC:\s*/i, '')
      .replace(/^PLAN:\s*/i, '')
      .replace(/^DESIGN:\s*/i, '')
      .replace(/^CONTEXT:\s*/i, '')
      .trim();

    // Remove backticks and surrounding quotes
    path = path.replace(/^[`"']+|[`"']+$/g, '');

    // Skip non-path entries (plain text descriptions, etc.)
    if (!path || path.includes(' ') && !path.includes('/')) continue;
    // Skip wildcard-only or glob patterns that aren't specific files
    if (path === '*' || path === '**') continue;

    paths.push(path);
  }

  return [...new Set(paths)];
}

// ---------------------------------------------------------------------------
// Plan File Parsing
// ---------------------------------------------------------------------------

function findPlanFile(taskId: string): string | null {
  // Read sprint number from CSV
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csvContent);
  const taskRow = getTaskRow(taskId, rows);
  const sprint = parseInt(taskRow?.['Target Sprint'] ?? '0', 10);

  const candidates = [
    join(REPO_ROOT, '.specify', 'sprints', `sprint-${sprint}`, 'planning', `${taskId}-plan.md`),
    join(REPO_ROOT, '.specify', 'sprints', `sprint-${sprint}`, 'planning', `${taskId}.md`),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Extract file paths from plan "Files to Create:" and "Files to Modify:" sections.
 * Uses same regex patterns as validation-summary API.
 */
function parsePlanArtifacts(planContent: string): string[] {
  const paths: string[] = [];

  // Match "**Files to Create:**" and "**Files to Modify:**" block sections
  const filePatterns = [
    /\*\*Files to Create:\*\*\s*\n((?:- `[^`]+`.*\n?)+)/g,
    /\*\*Files to Modify:\*\*\s*\n((?:- `[^`]+`.*\n?)+)/g,
  ];

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(planContent)) !== null) {
      const block = match[1];
      const fileMatches = block.matchAll(/- `([^`]+)`/g);
      for (const fm of fileMatches) {
        if (fm[1] && !paths.includes(fm[1])) {
          paths.push(fm[1]);
        }
      }
    }
  }

  // Also catch inline file references in step headings: **File to Create:** `path`
  const inlinePattern = /\*\*File(?:s)? to (?:Create|Modify):\*\*\s*`([^`]+)`/g;
  let inlineMatch;
  while ((inlineMatch = inlinePattern.exec(planContent)) !== null) {
    if (inlineMatch[1] && !paths.includes(inlineMatch[1])) {
      paths.push(inlineMatch[1]);
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Reconciliation Logic
// ---------------------------------------------------------------------------

interface ArtifactStatus {
  path: string;
  inCsv: boolean;
  inPlan: boolean;
  onDisk: boolean;
}

interface ReconciliationResult {
  taskId: string;
  csvArtifacts: string[];
  planArtifacts: string[];
  planPath: string | null;
  statuses: ArtifactStatus[];
  csvOnlyPaths: string[];      // In CSV but not in plan
  planOnlyPaths: string[];     // In plan but not in CSV
  missingOnDisk: string[];     // Referenced but not on disk
  fullyAligned: string[];      // In all three sources
  hasMismatches: boolean;
}

function reconcile(taskId: string): ReconciliationResult {
  // 1. Load CSV artifacts
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csvContent);
  const taskRow = getTaskRow(taskId, rows);
  const csvArtifacts = parseCsvArtifacts(taskRow?.['Artifacts To Track'] ?? '');

  // 2. Load plan artifacts
  const planPath = findPlanFile(taskId);
  let planArtifacts: string[] = [];
  if (planPath) {
    const planContent = readFileSync(planPath, 'utf-8');
    planArtifacts = parsePlanArtifacts(planContent);
  }

  // 3. Merge all unique paths
  const allPaths = [...new Set([...csvArtifacts, ...planArtifacts])];

  // 4. Check each path
  const statuses: ArtifactStatus[] = allPaths.map((path) => {
    const normalizedPath = path.replace(/\\/g, '/');
    const fullPath = resolve(REPO_ROOT, normalizedPath);
    // Check with glob-like matching for wildcards
    const diskExists = normalizedPath.includes('*')
      ? false // Can't check glob patterns directly
      : existsSync(fullPath);

    return {
      path: normalizedPath,
      inCsv: csvArtifacts.some((c) => c.replace(/\\/g, '/') === normalizedPath),
      inPlan: planArtifacts.some((p) => p.replace(/\\/g, '/') === normalizedPath),
      onDisk: diskExists,
    };
  });

  const csvOnlyPaths = statuses
    .filter((s) => s.inCsv && !s.inPlan)
    .map((s) => s.path);

  const planOnlyPaths = statuses
    .filter((s) => s.inPlan && !s.inCsv)
    .map((s) => s.path);

  const missingOnDisk = statuses
    .filter((s) => !s.onDisk && !s.path.includes('*'))
    .map((s) => s.path);

  const fullyAligned = statuses
    .filter((s) => s.inCsv && s.inPlan && s.onDisk)
    .map((s) => s.path);

  const hasMismatches = csvOnlyPaths.length > 0
    || planOnlyPaths.length > 0
    || missingOnDisk.length > 0;

  return {
    taskId,
    csvArtifacts,
    planArtifacts,
    planPath,
    statuses,
    csvOnlyPaths,
    planOnlyPaths,
    missingOnDisk,
    fullyAligned,
    hasMismatches,
  };
}

// ---------------------------------------------------------------------------
// Batch Audit
// ---------------------------------------------------------------------------

interface AuditSummary {
  totalTasks: number;
  tasksChecked: number;
  tasksWithMismatches: number;
  totalMissingOnDisk: number;
  totalCsvOnly: number;
  totalPlanOnly: number;
  details: ReconciliationResult[];
}

function runAudit(): AuditSummary {
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csvContent);

  // Filter to completed tasks only
  const completedTasks = rows.filter((r) => {
    const status = (r['Status'] ?? '').toLowerCase();
    return status === 'completed' || status === 'done';
  });

  const details: ReconciliationResult[] = [];
  let totalMissingOnDisk = 0;
  let totalCsvOnly = 0;
  let totalPlanOnly = 0;

  for (const task of completedTasks) {
    const taskId = task['Task ID'];
    if (!taskId) continue;

    try {
      const result = reconcile(taskId);
      if (result.hasMismatches) {
        details.push(result);
        totalMissingOnDisk += result.missingOnDisk.length;
        totalCsvOnly += result.csvOnlyPaths.length;
        totalPlanOnly += result.planOnlyPaths.length;
      }
    } catch {
      // Skip tasks that can't be reconciled (no CSV row, etc.)
    }
  }

  return {
    totalTasks: rows.length,
    tasksChecked: completedTasks.length,
    tasksWithMismatches: details.length,
    totalMissingOnDisk,
    totalCsvOnly,
    totalPlanOnly,
    details,
  };
}

// ---------------------------------------------------------------------------
// Display Helpers
// ---------------------------------------------------------------------------

function printResult(result: ReconciliationResult): void {
  console.log('');
  console.log('='.repeat(70));
  console.log(`  ARTIFACT RECONCILIATION — Task: ${result.taskId}`);
  console.log('='.repeat(70));
  console.log('');
  console.log(`  CSV Artifacts:  ${result.csvArtifacts.length}`);
  console.log(`  Plan Artifacts: ${result.planArtifacts.length}`);
  console.log(`  Plan File:      ${result.planPath ?? '(not found)'}`);
  console.log('');

  if (result.statuses.length === 0) {
    console.log('  No artifacts found in either source.');
    console.log('');
    return;
  }

  // Full table
  console.log('  | Source | Path | On Disk | In Plan | In CSV |');
  console.log('  |--------|------|---------|---------|--------|');
  for (const s of result.statuses) {
    const source = s.inCsv && s.inPlan ? 'Both'
      : s.inCsv ? 'CSV'
      : 'Plan';
    const disk = s.path.includes('*') ? 'N/A' : s.onDisk ? 'YES' : 'NO';
    console.log(
      `  | ${source.padEnd(6)} | ${s.path} | ${disk.padEnd(7)} | ${(s.inPlan ? 'YES' : 'NO').padEnd(7)} | ${(s.inCsv ? 'YES' : 'NO').padEnd(6)} |`,
    );
  }
  console.log('');

  // Discrepancies
  if (result.csvOnlyPaths.length > 0) {
    console.log('  CSV-only (in CSV but not in plan):');
    for (const p of result.csvOnlyPaths) {
      console.log(`    - ${p}`);
    }
    console.log('');
  }

  if (result.planOnlyPaths.length > 0) {
    console.log('  Plan-only (in plan but not in CSV):');
    for (const p of result.planOnlyPaths) {
      console.log(`    - ${p}`);
    }
    console.log('');
  }

  if (result.missingOnDisk.length > 0) {
    console.log('  MISSING ON DISK:');
    for (const p of result.missingOnDisk) {
      console.log(`    - ${p}`);
    }
    console.log('');
  }

  if (result.fullyAligned.length > 0) {
    console.log(`  Fully aligned: ${result.fullyAligned.length} artifact(s)`);
    console.log('');
  }

  // Verdict
  if (result.hasMismatches) {
    console.log('  STATUS: MISMATCH — artifacts are not fully reconciled');
  } else {
    console.log('  STATUS: PASS — all artifacts aligned across CSV, plan, and disk');
  }
  console.log('='.repeat(70));
  console.log('');
}

function printAudit(summary: AuditSummary): void {
  console.log('');
  console.log('='.repeat(70));
  console.log('  ARTIFACT AUDIT — All Completed Tasks');
  console.log('='.repeat(70));
  console.log('');
  console.log(`  Total tasks in CSV:       ${summary.totalTasks}`);
  console.log(`  Completed tasks checked:  ${summary.tasksChecked}`);
  console.log(`  Tasks with mismatches:    ${summary.tasksWithMismatches}`);
  console.log(`  Total missing on disk:    ${summary.totalMissingOnDisk}`);
  console.log(`  Total CSV-only paths:     ${summary.totalCsvOnly}`);
  console.log(`  Total plan-only paths:    ${summary.totalPlanOnly}`);
  console.log('');

  if (summary.details.length === 0) {
    console.log('  All completed tasks have fully aligned artifacts.');
  } else {
    console.log('  Tasks with mismatches:');
    console.log('  ' + '-'.repeat(66));
    for (const result of summary.details) {
      const issues: string[] = [];
      if (result.missingOnDisk.length > 0) issues.push(`${result.missingOnDisk.length} missing`);
      if (result.csvOnlyPaths.length > 0) issues.push(`${result.csvOnlyPaths.length} CSV-only`);
      if (result.planOnlyPaths.length > 0) issues.push(`${result.planOnlyPaths.length} plan-only`);
      console.log(`  ${result.taskId.padEnd(20)} ${issues.join(', ')}`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  npx tsx tools/scripts/validate-artifacts.ts <TASK_ID>');
    console.error('  npx tsx tools/scripts/validate-artifacts.ts <TASK_ID> --fix');
    console.error('  npx tsx tools/scripts/validate-artifacts.ts --audit');
    process.exit(1);
  }

  // --audit mode
  if (args.includes('--audit')) {
    const summary = runAudit();
    printAudit(summary);
    // Always exit 0 for audit (informational)
    process.exit(0);
  }

  // Single task mode
  const taskId = args[0];
  const fix = args.includes('--fix');

  if (!existsSync(CSV_PATH)) {
    console.error(`Sprint_plan.csv not found at: ${CSV_PATH}`);
    process.exit(1);
  }

  const result = reconcile(taskId);
  printResult(result);

  if (fix && result.hasMismatches) {
    console.log('  --fix mode: Auto-update not yet implemented.');
    console.log('  Manual steps to reconcile:');
    if (result.planOnlyPaths.length > 0) {
      console.log('  1. Add plan-only paths to Sprint_plan.csv "Artifacts To Track"');
    }
    if (result.csvOnlyPaths.length > 0) {
      console.log('  2. Review CSV-only paths — update or remove stale entries from CSV');
    }
    if (result.missingOnDisk.length > 0) {
      console.log('  3. Create missing files or remove stale references');
    }
  }

  process.exit(result.hasMismatches ? 1 : 0);
}

main();
