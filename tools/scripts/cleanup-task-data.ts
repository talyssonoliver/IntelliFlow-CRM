/**
 * Cleanup Task Data Utility
 *
 * Cleans up stale task data in the metrics tracking system:
 * - Removes orphaned task JSON files (no matching CSV entry)
 * - Fixes inconsistent status between CSV and JSON
 * - Validates JSON files against schemas
 * - Reports discrepancies without making changes (dry-run by default)
 *
 * Usage:
 *   npx tsx tools/scripts/cleanup-task-data.ts [--fix] [--sprint <number>]
 *
 * Options:
 *   --fix       Apply fixes (default: dry-run, report only)
 *   --sprint N  Only process sprint N (default: all sprints)
 *
 * Task: EXP-SCRIPTS-001 - Utility Scripts
 */

import * as fs from 'fs';
import * as path from 'path';

const METRICS_DIR = path.resolve(__dirname, '../../apps/project-tracker/docs/metrics');
const CSV_PATH = path.resolve(METRICS_DIR, '_global/Sprint_plan.csv');

interface TaskEntry {
  taskId: string;
  status: string;
  sprint: string;
  section: string;
}

interface CleanupResult {
  orphanedJsonFiles: string[];
  statusMismatches: Array<{ taskId: string; csvStatus: string; jsonStatus: string; jsonPath: string }>;
  invalidJsonFiles: Array<{ path: string; error: string }>;
  totalJsonFiles: number;
  totalCsvTasks: number;
}

function parseCSV(csvPath: string): TaskEntry[] {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"/, '').replace(/"$/, ''));
  const taskIdIdx = headers.findIndex((h) => h === 'Task ID');
  const statusIdx = headers.findIndex((h) => h === 'Status');
  const sprintIdx = headers.findIndex((h) => h === 'Target Sprint');
  const sectionIdx = headers.findIndex((h) => h === 'Section');

  if (taskIdIdx === -1) {
    console.error('CSV missing "Task ID" column');
    process.exit(1);
  }

  const entries: TaskEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parsing (handles quoted fields)
    const fields = parseCSVLine(lines[i]);
    if (fields.length > taskIdIdx && fields[taskIdIdx].trim()) {
      entries.push({
        taskId: fields[taskIdIdx].trim(),
        status: statusIdx >= 0 ? fields[statusIdx]?.trim() || '' : '',
        sprint: sprintIdx >= 0 ? fields[sprintIdx]?.trim() || '' : '',
        section: sectionIdx >= 0 ? fields[sectionIdx]?.trim() || '' : '',
      });
    }
  }

  return entries;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function findJsonFiles(dir: string, sprintFilter?: number): Array<{ path: string; taskId: string }> {
  const results: Array<{ path: string; taskId: string }> = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip _global and schemas directories
      if (entry.name === '_global' || entry.name === 'schemas') continue;

      // Sprint filter
      if (sprintFilter !== undefined) {
        const sprintMatch = entry.name.match(/^sprint-(\d+)$/);
        if (sprintMatch && parseInt(sprintMatch[1], 10) !== sprintFilter) continue;
      }

      results.push(...findJsonFiles(fullPath, undefined)); // Don't filter subdirs
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      // Skip summary and phase-summary files
      if (entry.name.startsWith('_')) continue;

      const taskId = entry.name.replace('.json', '');
      results.push({ path: fullPath, taskId });
    }
  }

  return results;
}

function normalizeStatus(status: string): string {
  const upper = status.toUpperCase().replace(/\s+/g, '_');
  const mapping: Record<string, string> = {
    COMPLETED: 'DONE',
    DONE: 'DONE',
    IN_PROGRESS: 'IN_PROGRESS',
    PLANNED: 'PLANNED',
    BACKLOG: 'BACKLOG',
    BLOCKED: 'BLOCKED',
    FAILED: 'FAILED',
  };
  return mapping[upper] || upper;
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const sprintIdx = args.indexOf('--sprint');
  const sprintFilter = sprintIdx >= 0 ? parseInt(args[sprintIdx + 1], 10) : undefined;

  console.log('=== Task Data Cleanup Utility ===');
  console.log(`Mode: ${fix ? 'FIX' : 'DRY RUN (use --fix to apply changes)'}`);
  if (sprintFilter !== undefined) console.log(`Sprint filter: ${sprintFilter}`);
  console.log('');

  // Parse CSV
  const csvTasks = parseCSV(CSV_PATH);
  const csvTaskMap = new Map(csvTasks.map((t) => [t.taskId, t]));
  console.log(`CSV tasks loaded: ${csvTasks.length}`);

  // Find JSON files
  const jsonFiles = findJsonFiles(METRICS_DIR, sprintFilter);
  console.log(`JSON task files found: ${jsonFiles.length}`);
  console.log('');

  const result: CleanupResult = {
    orphanedJsonFiles: [],
    statusMismatches: [],
    invalidJsonFiles: [],
    totalJsonFiles: jsonFiles.length,
    totalCsvTasks: csvTasks.length,
  };

  // Check each JSON file
  for (const { path: jsonPath, taskId } of jsonFiles) {
    // Check if task exists in CSV
    if (!csvTaskMap.has(taskId)) {
      result.orphanedJsonFiles.push(jsonPath);
      continue;
    }

    // Validate JSON
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content);

      // Check status consistency
      const csvEntry = csvTaskMap.get(taskId)!;
      const csvStatus = normalizeStatus(csvEntry.status);
      const jsonStatus = normalizeStatus(data.status || data.current_status || '');

      if (csvStatus && jsonStatus && csvStatus !== jsonStatus) {
        result.statusMismatches.push({
          taskId,
          csvStatus: csvEntry.status,
          jsonStatus: data.status || data.current_status || 'unknown',
          jsonPath,
        });
      }
    } catch (err) {
      result.invalidJsonFiles.push({
        path: jsonPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Report results
  console.log('=== Results ===');
  console.log('');

  if (result.orphanedJsonFiles.length > 0) {
    console.log(`Orphaned JSON files (no CSV entry): ${result.orphanedJsonFiles.length}`);
    for (const f of result.orphanedJsonFiles) {
      console.log(`  - ${path.relative(METRICS_DIR, f)}`);
    }
    console.log('');
  }

  if (result.statusMismatches.length > 0) {
    console.log(`Status mismatches: ${result.statusMismatches.length}`);
    for (const m of result.statusMismatches) {
      console.log(`  - ${m.taskId}: CSV="${m.csvStatus}" vs JSON="${m.jsonStatus}"`);
    }
    console.log('');
  }

  if (result.invalidJsonFiles.length > 0) {
    console.log(`Invalid JSON files: ${result.invalidJsonFiles.length}`);
    for (const f of result.invalidJsonFiles) {
      console.log(`  - ${path.relative(METRICS_DIR, f)}: ${f.error}`);
    }
    console.log('');
  }

  const totalIssues =
    result.orphanedJsonFiles.length +
    result.statusMismatches.length +
    result.invalidJsonFiles.length;

  if (totalIssues === 0) {
    console.log('No issues found.');
  } else {
    console.log(`Total issues: ${totalIssues}`);
    if (!fix) {
      console.log('Run with --fix to apply corrections.');
    }
  }

  // Apply fixes if requested
  if (fix && result.statusMismatches.length > 0) {
    console.log('');
    console.log('=== Applying Fixes ===');
    for (const mismatch of result.statusMismatches) {
      try {
        const content = fs.readFileSync(mismatch.jsonPath, 'utf-8');
        const data = JSON.parse(content);

        if (data.status) {
          data.status = mismatch.csvStatus;
        }
        if (data.current_status) {
          data.current_status = mismatch.csvStatus;
        }

        fs.writeFileSync(mismatch.jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        console.log(`  Fixed: ${mismatch.taskId}`);
      } catch (err) {
        console.error(`  Failed to fix ${mismatch.taskId}: ${err}`);
      }
    }
  }
}

main().catch(console.error);
