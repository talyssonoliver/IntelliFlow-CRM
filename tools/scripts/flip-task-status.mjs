#!/usr/bin/env node
/**
 * flip-task-status.mjs — surgically set the Status of one or more tasks in
 * Sprint_plan.csv WITHOUT reformatting the file.
 *
 * Why this exists: the CSV has multi-line quoted cells (a single row spans
 * several physical lines) and embedded task-IDs in dependency columns, so naive
 * `sed`/regex match the wrong cell; `,In Progress,` is NOT unique (tasks share
 * statuses); and PowerShell `[System.IO.File]` uses the .NET process cwd (the
 * main repo) not Set-Location, silently writing the control plane. This script
 * parses with Papa (correct multi-line handling), anchors each edit on the
 * task's UNIQUE Description, replaces only that row's status cell in the raw
 * bytes, and re-parses to VERIFY. Run from the repo root (cwd = the worktree).
 *
 * Usage:
 *   node tools/scripts/flip-task-status.mjs IFC-309=Completed PG-200=Completed
 *
 * After this, run split-sprint-plan.ts + generate-context.ts as usual.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

const CSV = join(process.cwd(), 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
if (!existsSync(CSV)) {
  process.stderr.write(`Sprint_plan.csv not found at ${CSV} (run from the repo/worktree root)\n`);
  process.exit(1);
}

const args = process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return { id: (i < 0 ? a : a.slice(0, i)).trim().toUpperCase(), status: i < 0 ? '' : a.slice(i + 1).trim() };
});
if (!args.length || args.some((a) => !a.id || !a.status)) {
  process.stderr.write('Usage: flip-task-status.mjs <TASK-ID>=<Status> [<TASK-ID>=<Status> ...]\n');
  process.exit(1);
}

let raw = readFileSync(CSV, 'utf8');
const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true });

for (const { id, status } of args) {
  const row = data.find((r) => (r['Task ID'] || '').trim().toUpperCase() === id);
  if (!row) {
    process.stderr.write(`Task ${id} not found in Sprint_plan.csv\n`);
    process.exit(1);
  }
  const oldStatus = (row['Status'] || '').trim();
  if (oldStatus === status) {
    process.stdout.write(`  ${id} already "${status}" — skipped\n`);
    continue;
  }
  // Locate the row by its UNIQUE Description (string ops only — NO dynamic RegExp,
  // to avoid regex-injection on file data), then the FIRST ,oldStatus, after it.
  const descAnchor = (row['Description'] || '').slice(0, 60);
  if (!descAnchor) {
    process.stderr.write(`${id} has no Description to anchor on — refuse\n`);
    process.exit(1);
  }
  const anchorIdx = raw.indexOf(descAnchor);
  if (anchorIdx < 0) {
    process.stderr.write(`Could not find ${id}'s Description anchor in the CSV — refuse\n`);
    process.exit(1);
  }
  if (raw.indexOf(descAnchor, anchorIdx + 1) >= 0) {
    process.stderr.write(`${id}'s Description anchor is not unique — refuse (ambiguous)\n`);
    process.exit(1);
  }
  const needle = `,${oldStatus},`;
  const statusIdx = raw.indexOf(needle, anchorIdx);
  if (statusIdx < 0) {
    process.stderr.write(`Could not locate ${id}'s ",${oldStatus}," status cell after its anchor — refuse (no change written)\n`);
    process.exit(1);
  }
  raw = raw.slice(0, statusIdx) + `,${status},` + raw.slice(statusIdx + needle.length);
  process.stdout.write(`  ${id}: "${oldStatus}" -> "${status}"\n`);
}

writeFileSync(CSV, raw, 'utf8');

// Re-parse and VERIFY every requested change actually took (and nothing silently drifted).
const after = Papa.parse(readFileSync(CSV, 'utf8'), { header: true, skipEmptyLines: true }).data;
for (const { id, status } of args) {
  const r = after.find((x) => (x['Task ID'] || '').trim().toUpperCase() === id);
  if ((r?.Status || '').trim() !== status) {
    process.stderr.write(`VERIFY FAILED: ${id} = "${r?.Status}" (expected "${status}")\n`);
    process.exit(1);
  }
}
process.stdout.write('flip-task-status: OK (verified). Next: split-sprint-plan.ts + generate-context.ts\n');
// CSV status flip is string-op based (no dynamic RegExp) by design.
