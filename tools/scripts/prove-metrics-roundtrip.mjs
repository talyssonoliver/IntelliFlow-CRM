#!/usr/bin/env node
/**
 * ADR-067 Phase 2 — Step 3 verification: prove the per-task metrics JSON can be
 * REGENERATED from CSV + task-tracking.json with ZERO loss of operational/evidence
 * content.
 *
 * For each committed per-task metrics JSON, rebuild it from:
 *   - Sprint_plan.csv          (CSV-derived projection: section/description/owner/
 *                               sprint/status/dependencies.required+all_satisfied/
 *                               dependencies_resolved)
 *   - task-tracking.json       (everything operational/evidence, verbatim)
 * then compare to the committed file and CLASSIFY every difference:
 *
 *   - OPERATIONAL drift  -> a relocated field changed/dropped. THIS IS A BUG and
 *                           BLOCKS Phase 2 (the no-loss guarantee is violated).
 *   - CSV-derived drift  -> a field the generator re-derives from the CSV source of
 *                           truth differs from the (stale) committed value. EXPECTED
 *                           and benign: regeneration CORRECTS stale read-model data
 *                           (e.g. a per-task JSON still says BACKLOG while the CSV row
 *                           says Completed). Reported, not blocking.
 *
 * Usage:  node tools/scripts/prove-metrics-roundtrip.mjs [--show-csv-drift]
 * Exit 0 = no operational drift (no-loss holds). Exit 1 = operational drift found.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { createRequire } from 'node:module';

const SHOW_CSV = process.argv.includes('--show-csv-drift');
const METRICS_ROOT = 'apps/project-tracker/docs/metrics';
const SPECIFY_ROOT = '.specify/sprints';
const CSV_PATH = join(METRICS_ROOT, '_global', 'Sprint_plan.csv');

const req = createRequire(join(process.cwd(), 'noop.js'));
function loadPapa() {
  const pnpm = join(process.cwd(), 'node_modules', '.pnpm');
  const hit = readdirSync(pnpm).filter((d) => /^papaparse@/.test(d)).sort().pop();
  return req(join(pnpm, hit, 'node_modules', 'papaparse'));
}
const Papa = loadPapa();

// ---- CSV-derived projection -----------------------------------------------------------
// buildTaskJson below MIRRORS apps/project-tracker/lib/data-sync/task-json-builder.ts (the
// production generator). Kept as a standalone copy so this proof has no build/tsx dependency;
// the two are kept in lock-step and the Step-5 CI runs `generate:metrics` (the lib) THEN this
// proof, so any divergence surfaces as operational drift.
function mapStatus(s) {
  s = (s || '').trim();
  const m = {
    Done: 'DONE', Completed: 'DONE', 'In Progress': 'IN_PROGRESS', Validating: 'VALIDATING',
    Blocked: 'BLOCKED', Planned: 'PLANNED', Backlog: 'BACKLOG', Failed: 'FAILED',
    'Needs Human': 'NEEDS_HUMAN', 'In Review': 'IN_REVIEW',
  };
  return m[s] || 'PLANNED';
}
function parseDeps(str) {
  return (str || '')
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && !/^(?:none|n\/a|-)$/i.test(d));
}

/** The per-task JSON fields the generator re-derives from CSV (NOT taken from task-tracking). */
const CSV_DERIVED_KEYS = new Set([
  '$schema', 'section', 'description', 'owner', 'sprint', 'status',
  'dependencies', 'dependencies_resolved',
]);

function buildTaskJson(task, tt, sprintNum, csvById) {
  const required = parseDeps(task.Dependencies);
  const allSatisfied = required.every((d) => {
    const dt = csvById[d];
    return dt && (dt.Status === 'Done' || dt.Status === 'Completed');
  });
  const out = {
    $schema: '../schemas/task-status.schema.json',
    task_id: task['Task ID'],
    section: task.Section,
    description: task.Description,
    owner: task.Owner,
    sprint: `sprint-${sprintNum}`,
    status: mapStatus(task.Status),
    dependencies: { required, all_satisfied: allSatisfied },
  };
  if (tt.dependencies_meta && tt.dependencies_meta.verified_at !== undefined)
    out.dependencies.verified_at = tt.dependencies_meta.verified_at;
  if (tt.dependencies_meta && tt.dependencies_meta.notes !== undefined)
    out.dependencies.notes = tt.dependencies_meta.notes;
  out.dependencies_resolved = allSatisfied && required.length > 0 ? required : [];
  // overlay all operational/evidence content verbatim
  for (const [k, v] of Object.entries(tt)) {
    if (k === 'task_id' || k === 'dependencies_meta' || k === '$schema') continue;
    out[k] = v;
  }
  return out;
}

// ---- helpers ---------------------------------------------------------------------------
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

function walkJson(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (/_global|schemas/.test(p)) continue;
      walkJson(p, out);
    } else if (e.name.endsWith('.json') && /sprint-/.test(p) && !/_global|schemas|_summary|attestation/.test(p)) {
      out.push(p);
    }
  }
  return out;
}
const sprintOf = (p) => p.split(sep).find((s) => /^sprint-\d+$/.test(s));

// ---- run -------------------------------------------------------------------------------
const csv = readFileSync(CSV_PATH, 'utf8');
const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });
const csvById = {};
for (const r of data) csvById[r['Task ID']] = r;

const files = walkJson(METRICS_ROOT, []);
const opDrift = [];
const csvDrift = [];
let proven = 0;
let missingTT = 0;

// Group by (sprint, task_id) and pick the CANONICAL committed file (mirrors the migration's
// canonical-wins merge). A task duplicated across the tree (IFC-300 lives at both
// sprint-17/IFC-300.json and sprint-17/phase-support/IFC-300.json) is represented by ONE merged
// task-tracking.json; we compare regen against the canonical copy (the legacy duplicate is slated
// for removal in Step 6 and its superseded stub values are not "loss").
function canonicalScore(file, obj) {
  const hasSchema = typeof obj.$schema === 'string' && /task-status/.test(obj.$schema) ? 1 : 0;
  return hasSchema * 1000 - file.split(sep).length;
}
const groups = new Map();
for (const file of files) {
  const obj = JSON.parse(readFileSync(file, 'utf8'));
  const taskId = obj.task_id || obj.taskId;
  const sprint = sprintOf(file);
  const key = `${sprint}/${taskId}`;
  const cur = groups.get(key);
  if (!cur || canonicalScore(file, obj) > cur.score) {
    groups.set(key, { file, committed: obj, taskId, sprint, score: canonicalScore(file, obj) });
  }
}

for (const { committed, taskId, sprint } of groups.values()) {
  const sprintNum = Number(sprint.replace('sprint-', ''));
  const task = csvById[taskId];
  if (!task) {
    opDrift.push(`${taskId}: not in CSV (cannot regenerate)`);
    continue;
  }
  const ttPath = join(SPECIFY_ROOT, sprint, 'attestations', taskId, 'task-tracking.json');
  if (!existsSync(ttPath)) {
    missingTT++;
    opDrift.push(`${taskId}: task-tracking.json missing at ${ttPath}`);
    continue;
  }
  const tt = JSON.parse(readFileSync(ttPath, 'utf8'));
  const regen = buildTaskJson(task, tt, sprintNum, csvById);

  // Every committed key must be reproduced. Classify each that differs.
  // (Collision tasks legitimately have regen ⊇ committed — extra keys are fine.)
  for (const k of Object.keys(committed)) {
    if (k === '$schema' || k === 'taskId') continue;
    if (eq(committed[k], regen[k])) continue;
    const entry = `${taskId}.${k}: committed=${short(committed[k])} regen=${short(regen[k])}`;
    if (CSV_DERIVED_KEYS.has(k)) csvDrift.push(entry);
    else opDrift.push(entry);
  }
  proven++;
}

function short(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s == null ? String(s) : s.length > 60 ? s.slice(0, 57) + '...' : s;
}

console.log(`Per-task JSONs: ${files.length} files / ${groups.size} distinct tasks | regenerated: ${proven} | missing task-tracking: ${missingTT}`);
console.log(`CSV-derived drift (stale read-model corrected by regen): ${csvDrift.length}`);
const byField = {};
for (const d of csvDrift) {
  // entries look like "IFC-255.status: committed=... regen=..." — field = between first '.' and ':'.
  // indexOf-based (not regex) to avoid sonarjs/slow-regex backtracking on the id prefix.
  const afterDot = d.slice(d.indexOf('.') + 1);
  const colon = afterDot.indexOf(':');
  const f = colon >= 0 ? afterDot.slice(0, colon) : afterDot;
  byField[f] = (byField[f] || 0) + 1;
}
console.log(
  '  by field: ' +
    Object.entries(byField)
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${f}=${n}`)
      .join(', '),
);
console.log(`OPERATIONAL drift (BLOCKING — relocated field lost/changed): ${opDrift.length}`);

if (SHOW_CSV && csvDrift.length) {
  console.log('\n--- CSV-derived drift sample (benign corrections) ---');
  csvDrift.slice(0, 30).forEach((d) => console.log('  ' + d));
}
if (opDrift.length) {
  console.log('\n❌ OPERATIONAL DRIFT — these break the no-loss guarantee:');
  opDrift.slice(0, 40).forEach((d) => console.log('  ' + d));
  if (opDrift.length > 40) console.log(`  ... +${opDrift.length - 40} more`);
}
console.log(opDrift.length ? '\nRESULT: BLOCKED — operational drift must be fixed.' : '\nRESULT: OK — no-loss round-trip holds.');
process.exit(opDrift.length ? 1 : 0);
