#!/usr/bin/env node
/**
 * Mirror the logic in `apps/project-tracker/app/api/metrics/executive/route.ts`
 * for extracting "Files to Create/Modify" paths from a plan file, then verify
 * each path exists on disk. Report per-task verified/missing counts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const TASKS = [
  ['IFC-062', 14], ['IFC-068', 14], ['IFC-070', 18], ['IFC-086', 14],
  ['PG-053', 17], ['IFC-150', 5], ['IFC-174', 14], ['PG-128', 14],
  ['PG-133', 5], ['PG-139', 7], ['IFC-191', 15], ['IFC-192', 15],
  ['IFC-196', 17], ['PG-166', 15], ['PG-178', 16], ['DOC-007', 14],
  ['IFC-238', 16], ['IFC-269', 16], ['IFC-297', 16], ['IFC-298', 17],
  ['IFC-299', 17],
];

function extractFilePaths(planContent) {
  const fileRegex = /\*\*Files to (?:Create|Modify):\*\*\s*\n((?:[ \t]*-[ \t]*`[^`]+`[^\n]{0,500}\n?){0,200})/gi;
  const linePathRegex = /^\s*-\s*`([^`]+)`/;
  const filePaths = [];
  let m;
  while ((m = fileRegex.exec(planContent)) !== null) {
    for (const line of m[1].split('\n')) {
      const lm = linePathRegex.exec(line);
      if (lm) filePaths.push(lm[1]);
    }
  }
  return filePaths;
}

for (const [tid, sprint] of TASKS) {
  const plan = join(REPO_ROOT, '.specify', 'sprints', `sprint-${sprint}`, 'planning', `${tid}-plan.md`);
  if (!existsSync(plan)) { console.log(`${tid}: PLAN MISSING`); continue; }
  const content = readFileSync(plan, 'utf8');
  const paths = extractFilePaths(content);
  const missing = paths.filter((p) => !existsSync(join(REPO_ROOT, p)));
  const status = missing.length === 0 ? 'OK ' : 'MISS';
  console.log(`${status} ${tid} sprint-${sprint}: ${paths.length - missing.length}/${paths.length}${missing.length ? ' — missing: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? ` +${missing.length - 5} more` : '') : ''}`);
}
