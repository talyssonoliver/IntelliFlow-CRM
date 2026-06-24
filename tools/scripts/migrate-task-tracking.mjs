#!/usr/bin/env node
/**
 * ADR-067 Phase 2 — Step 2: migrate per-task OPERATIONAL + EVIDENCE content out of the
 * derived metrics tree into its canonical home under `.specify`.
 *
 * For each per-task metrics JSON (apps/project-tracker/docs/metrics/sprint-N/<TASK>.json)
 * we write .specify/sprints/sprint-{N}/attestations/{TASK_ID}/task-tracking.json containing
 * the FULL original object MINUS the small set of fields the generator re-derives from
 * `Sprint_plan.csv` (CSV_OWNED below). `dependencies` is transformed to `dependencies_meta`
 * keeping only its sole-copy parts (verified_at, notes); `required` + `all_satisfied` are
 * CSV-derivable and dropped.
 *
 * WHY full-copy-minus-CSV-owned (not an allowlist): the tree carries a long tail of
 * idiosyncratic keys (gate_results, prerequisites, definition_of_done, technical_decisions,
 * coverage_metrics, taskId, ...). An allowlist would silently drop them. Stripping only the
 * known-derivable set guarantees no sole-copy field is ever lost.
 *
 * Step-2 guarantees (asserted per task, BLOCKING):
 *   (1) Field-completeness: every top-level key of the original is either in CSV_OWNED
 *       (re-derivable) or present in the written task-tracking.json. Nothing falls through.
 *   (2) Verbatim preservation: every preserved value is deep-equal to the original (no
 *       reformatting — timestamps, arrays, nested objects byte-identical).
 *   (3) Schema-valid: the written file validates against task-tracking.schema.json (best
 *       effort — skipped with a warning if ajv can't be resolved from the workspace).
 * The FULL round-trip proof (regenerate the per-task JSON from CSV+attestation+task-tracking
 * and compare to the committed original) belongs to Step 3 (the generator).
 *
 * Usage:
 *   node tools/scripts/migrate-task-tracking.mjs            # dry-run report (default)
 *   node tools/scripts/migrate-task-tracking.mjs --apply    # write the files
 *
 * Run from repo root. Exit 0 = all checks pass; 1 = a blocking check failed.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { createRequire } from 'node:module';

const APPLY = process.argv.includes('--apply');
const METRICS_ROOT = 'apps/project-tracker/docs/metrics';
const SPECIFY_ROOT = '.specify/sprints';

/**
 * Fields the generator re-derives from Sprint_plan.csv — NOT stored in task-tracking.json.
 * NOTE: `target_duration_minutes` is deliberately NOT here. The existing sync
 * (task-json-updater.ts) never writes it — it is sole-copy operational data (a planned
 * estimate set at task creation, not mechanically derivable from the CSV "Estimate (O/M/P)"
 * column), so it is preserved in task-tracking. The Step-3 round-trip proof flagged it as
 * operational drift when it was wrongly stripped — that is exactly the guard working.
 */
const CSV_OWNED = new Set([
  '$schema',
  'section',
  'description',
  'owner',
  'sprint',
  'status',
  'dependencies_resolved',
]);
/** Sole-copy parts of the `dependencies` block kept under `dependencies_meta`. */
const DEP_META_KEYS = ['verified_at', 'notes'];

// ---- ajv (best-effort; the no-loss guarantee does not depend on it) --------------------
function loadAjv() {
  const req = createRequire(join(process.cwd(), 'noop.js'));
  const candidates = ['ajv'];
  // pnpm virtual store fallback — ajv is a transitive dep, not hoisted to root node_modules.
  try {
    const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
    if (existsSync(pnpmDir)) {
      const hit = readdirSync(pnpmDir)
        .filter((d) => /^ajv@8\./.test(d))
        .sort()
        .pop();
      if (hit) candidates.push(join(pnpmDir, hit, 'node_modules', 'ajv'));
    }
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    try {
      const mod = req(c);
      return mod.default || mod;
    } catch {
      /* try next */
    }
  }
  return null;
}

function buildValidator() {
  const Ajv = loadAjv();
  if (!Ajv) return null;
  try {
    const schema = JSON.parse(
      readFileSync(join(METRICS_ROOT, 'schemas', 'task-tracking.schema.json'), 'utf8'),
    );
    const ajv = new Ajv({ allErrors: true, strict: false });
    return ajv.compile(schema);
  } catch (e) {
    console.warn(`  ⚠ ajv compile failed (${e.message}); skipping schema validation.`);
    return null;
  }
}

// ---- helpers ---------------------------------------------------------------------------
function walkJson(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (/_global|schemas/.test(p)) continue;
      walkJson(p, out);
    } else if (
      e.name.endsWith('.json') &&
      /sprint-/.test(p) &&
      !/_global|schemas|_summary|attestation/.test(p)
    ) {
      out.push(p);
    }
  }
  return out;
}

function sprintFromPath(p) {
  const m = p.split(sep).find((seg) => /^sprint-\d+$/.test(seg));
  return m || null;
}

/** Deterministic, key-sorted JSON for deep-equality + stable file output. */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}
const eq = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function extractTaskTracking(obj) {
  const tt = {};
  for (const [k, val] of Object.entries(obj)) {
    if (CSV_OWNED.has(k)) continue;
    if (k === 'dependencies') {
      const meta = {};
      for (const mk of DEP_META_KEYS) if (val && val[mk] !== undefined) meta[mk] = val[mk];
      if (Object.keys(meta).length) tt.dependencies_meta = meta;
      continue;
    }
    tt[k] = val;
  }
  // Identity key — normalize camelCase taskId → task_id if that's the only form present.
  if (tt.task_id === undefined && obj.taskId !== undefined) tt.task_id = obj.taskId;
  return tt;
}

// ---- run -------------------------------------------------------------------------------
const validate = buildValidator();
console.log(`Migration mode: ${APPLY ? 'APPLY (writing files)' : 'DRY-RUN (no writes)'}`);
console.log(`Schema validation: ${validate ? 'enabled' : 'DISABLED (ajv unresolved)'}\n`);

const files = walkJson(METRICS_ROOT, []);
const report = {
  total: files.length,
  groups: 0,
  written: 0,
  withAttestation: 0,
  withoutAttestation: 0,
  emptyTracking: [],
  collisions: [],
  fieldCompletenessFails: [],
  verbatimFails: [],
  schemaFails: [],
  parseFails: [],
  pathFails: [],
};

// Group sources by (sprint, task_id). A task duplicated across the tree (e.g. IFC-300 lives
// at both sprint-17/IFC-300.json and sprint-17/phase-support/IFC-300.json) must NOT have one
// copy silently overwrite the other — we merge them canonical-wins (union of keys) so no
// sole-copy field of either is lost, and report the collision for source cleanup (Step 6).
const groups = new Map();
for (const file of files) {
  let obj;
  try {
    obj = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    report.parseFails.push(`${file}: ${e.message}`);
    continue;
  }
  const taskId = obj.task_id || obj.taskId;
  const sprint = sprintFromPath(file);
  if (!taskId || !sprint) {
    report.pathFails.push(`${file}: taskId=${taskId} sprint=${sprint}`);
    continue;
  }
  const key = `${sprint}/${taskId}`;
  if (!groups.has(key)) groups.set(key, { sprint, taskId, members: [] });
  groups.get(key).members.push({ file, obj });
}
report.groups = groups.size;

/** Higher = more canonical (the task-status read-model with $schema, shallower path). Wins on conflict. */
function canonicalScore(m) {
  const hasSchema = typeof m.obj.$schema === 'string' && /task-status/.test(m.obj.$schema) ? 1 : 0;
  return hasSchema * 1000 - m.file.split(sep).length;
}

for (const { sprint, taskId, members } of groups.values()) {
  // Merge members least-canonical-first so the canonical copy's values win, union of all keys.
  const ordered = [...members].sort((a, b) => canonicalScore(a) - canonicalScore(b));
  const obj = ordered.reduce((acc, m) => ({ ...acc, ...m.obj }), {});
  const file = ordered[ordered.length - 1].file; // canonical winner, for reporting/path
  if (members.length > 1) {
    report.collisions.push(`${taskId} (${sprint}): ${members.map((m) => m.file).join('  ||  ')}`);
  }

  const tt = extractTaskTracking(obj);

  // (1) field-completeness — every original key is CSV-owned, preserved, or the dependencies transform.
  for (const k of Object.keys(obj)) {
    const ok =
      CSV_OWNED.has(k) ||
      k in tt ||
      (k === 'dependencies' && (tt.dependencies_meta !== undefined || !hasDepMeta(obj.dependencies))) ||
      (k === 'taskId' && tt.task_id !== undefined);
    if (!ok) report.fieldCompletenessFails.push(`${taskId} (${file}): dropped key "${k}"`);
  }
  // (2) verbatim — every preserved (non-transformed) key is byte-identical.
  for (const [k, val] of Object.entries(tt)) {
    if (k === 'dependencies_meta') continue; // transformed, checked below
    if (!eq(val, obj[k])) report.verbatimFails.push(`${taskId}: value drift on "${k}"`);
  }
  if (tt.dependencies_meta && obj.dependencies) {
    for (const mk of DEP_META_KEYS) {
      if (obj.dependencies[mk] !== undefined && !eq(tt.dependencies_meta[mk], obj.dependencies[mk]))
        report.verbatimFails.push(`${taskId}: dependencies_meta.${mk} drift`);
    }
  }
  // (3) schema
  if (validate && !validate(tt)) {
    report.schemaFails.push(
      `${taskId}: ${(validate.errors || []).map((e) => `${e.instancePath} ${e.message}`).join('; ')}`,
    );
  }

  // cohort accounting
  const attPath = join(SPECIFY_ROOT, sprint, 'attestations', taskId, 'attestation.json');
  if (existsSync(attPath)) report.withAttestation++;
  else report.withoutAttestation++;

  // a task whose entire content is CSV-derived has nothing to relocate — record but still write
  // (task_id-only) so the .specify dir exists and the generator has a stable input.
  const operationalKeys = Object.keys(tt).filter((k) => k !== 'task_id');
  if (operationalKeys.length === 0) report.emptyTracking.push(taskId);

  if (APPLY) {
    const outDir = join(SPECIFY_ROOT, sprint, 'attestations', taskId);
    mkdirSync(outDir, { recursive: true });
    const withSchema = { $schema: '../../../../../apps/project-tracker/docs/metrics/schemas/task-tracking.schema.json', ...canonical(tt) };
    writeFileSync(join(outDir, 'task-tracking.json'), JSON.stringify(withSchema, null, 2) + '\n');
    report.written++;
  }
}

function hasDepMeta(dep) {
  return dep && DEP_META_KEYS.some((k) => dep[k] !== undefined);
}

// ---- summary ---------------------------------------------------------------------------
console.log(`Per-task metrics JSONs scanned: ${report.total} (distinct sprint/task groups: ${report.groups})`);
if (report.collisions.length) {
  console.log(`  ⚠ duplicate-source collisions merged (canonical-wins union): ${report.collisions.length}`);
  report.collisions.forEach((c) => console.log(`     - ${c}`));
}
console.log(`  cohort A (has .specify attestation): ${report.withAttestation}`);
console.log(`  cohort B (metrics-only, no attestation): ${report.withoutAttestation}`);
console.log(`  task-tracking with no operational content (CSV-only): ${report.emptyTracking.length}`);
if (APPLY) console.log(`  files written: ${report.written}`);

const blockers = [
  ['parse failures', report.parseFails],
  ['path/task-id failures', report.pathFails],
  ['FIELD-COMPLETENESS failures (DROPPED KEYS)', report.fieldCompletenessFails],
  ['verbatim drift', report.verbatimFails],
  ['schema validation failures', report.schemaFails],
];
let failed = false;
for (const [label, list] of blockers) {
  if (list.length) {
    failed = true;
    console.log(`\n❌ ${label}: ${list.length}`);
    list.slice(0, 25).forEach((x) => console.log(`   - ${x}`));
    if (list.length > 25) console.log(`   ... +${list.length - 25} more`);
  }
}
if (report.emptyTracking.length) {
  console.log(`\nℹ CSV-only tasks (no operational content): ${report.emptyTracking.join(', ')}`);
}

console.log(failed ? '\nRESULT: BLOCKED — fix the above before --apply.' : '\nRESULT: OK — all Step-2 checks pass.');
process.exit(failed ? 1 : 0);
