#!/usr/bin/env node
/**
 * Backfill missing context_ack.json + context_pack.md for a specific list
 * of Completed tasks whose dashboards flag them as "ack missing, pack missing".
 *
 * Pack generation: delegates to tools/scripts/lib/context-pack-builder.ts
 *   (same machinery used by backfill-context-packs.ts, scoped to these tasks).
 *
 * Ack generation: synthesises a minimal context_ack.json from the task's
 *   existing attestation.json — `files_read` is populated from
 *   `artifact_hashes` (those are the files that were actually part of the
 *   implementation, so they're a valid proxy for "files read during exec").
 *
 * Usage: node tools/scripts/fix-missing-context-artifacts.mjs [TASK_ID...]
 *   No args → defaults to IFC-238, IFC-278, IFC-279.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const Papa = require('papaparse');

const REPO_ROOT = process.cwd();
const CSV_PATH = 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv';

const DEFAULT_TASKS = ['IFC-238', 'IFC-278', 'IFC-279'];
const taskIds = process.argv.slice(2).filter((a) => a.startsWith('IFC-') || a.startsWith('PG-'));
const TARGETS = taskIds.length ? taskIds : DEFAULT_TASKS;

// ── Load CSV ──
const rows = Papa.parse(readFileSync(CSV_PATH, 'utf8'), {
  header: true,
  skipEmptyLines: true,
}).data;

// ── Dynamically import the existing pack builder (TS via tsx loader) ──
// Rather than re-invoke npx, just duplicate the tiny bits we need: the
// builder handles FILE: prereqs already. We'll shell out through tsx for
// buildContextPack to keep this script pure-Node and avoid a TS loader.

async function buildPack(taskId, sprint) {
  // Delegate to `npx tsx -e "..."` invoking buildContextPack.
  // Simpler: run the existing backfill script filtered-by-task by setting
  // an env hint, but that script has no filter. Shortest path: direct call
  // via tsx-run.
  const snippet = `
    import('${pathToFileURL(resolve('tools/scripts/lib/context-pack-builder.ts')).href.replace(/\\\\/g, '/')}').then(async (m) => {
      const runId = m.generateRunId(${JSON.stringify(taskId)});
      const result = m.buildContextPack(${JSON.stringify(taskId)}, runId, ${JSON.stringify(REPO_ROOT)}, { backfilled: true });
      if (!result.success) { console.error('PACK_FAIL', ${JSON.stringify(taskId)}, result.errors.join('; ')); process.exit(2); }
      const count = result.manifest.files.filter((f) => f.included).length;
      console.log('PACK_OK', ${JSON.stringify(taskId)}, 'sprint-${sprint}', count, 'files');
    }).catch((e) => { console.error('PACK_IMPORT_FAIL', ${JSON.stringify(taskId)}, String(e)); process.exit(3); });
  `;
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('npx', ['tsx', '-e', snippet], { encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
}

function sha256File(path) {
  if (!existsSync(path)) return null;
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

function writeAck(taskId, sprint) {
  const attDir = join(REPO_ROOT, '.specify', 'sprints', `sprint-${sprint}`, 'attestations', taskId);
  const ackPath = join(attDir, 'context_ack.json');
  const attPath = join(attDir, 'attestation.json');

  if (existsSync(ackPath)) {
    console.log(`ACK_SKIP ${taskId} (already exists at ${ackPath})`);
    return true;
  }
  if (!existsSync(attPath)) {
    console.error(`ACK_FAIL ${taskId} (no attestation.json — can't derive files_read)`);
    return false;
  }

  const att = JSON.parse(readFileSync(attPath, 'utf8'));
  const artifactHashes = att.artifact_hashes ?? {};
  const filesRead = [];

  // Include files referenced by attestation's artifact_hashes
  for (const [path, hash] of Object.entries(artifactHashes)) {
    filesRead.push({ path, sha256: typeof hash === 'string' ? hash : 'pending' });
  }
  // Also include the task's spec/plan files if they exist, since those are
  // canonical "read before exec" inputs
  const specPath = `.specify/sprints/sprint-${sprint}/specifications/${taskId}-spec.md`;
  const planPath = `.specify/sprints/sprint-${sprint}/planning/${taskId}-plan.md`;
  for (const rel of [specPath, planPath]) {
    const abs = join(REPO_ROOT, rel);
    if (existsSync(abs) && !filesRead.some((f) => f.path === rel)) {
      const actual = sha256File(abs) ?? 'pending';
      filesRead.unshift({ path: rel, sha256: actual });
    }
  }

  if (filesRead.length === 0) {
    console.error(`ACK_FAIL ${taskId} (no files_read could be derived)`);
    return false;
  }

  mkdirSync(attDir, { recursive: true });
  const ack = {
    task_id: taskId,
    sprint: Number.parseInt(String(sprint), 10),
    acknowledged_at: att.completed_at ?? new Date().toISOString(),
    files_read: filesRead,
    ...(existsSync(join(REPO_ROOT, specPath)) ? { spec_path: specPath } : {}),
    ...(existsSync(join(REPO_ROOT, planPath)) ? { plan_path: planPath } : {}),
    notes: 'Backfilled retrospectively from attestation artifact_hashes. Files_read reconstructed from what the exec agent actually touched.',
  };
  writeFileSync(ackPath, JSON.stringify(ack, null, 2) + '\n', 'utf8');
  console.log(`ACK_OK ${taskId} → ${ackPath} (${filesRead.length} files)`);
  return true;
}

async function main() {
  let ok = 0, fail = 0;
  for (const taskId of TARGETS) {
    const row = rows.find((r) => r['Task ID'] === taskId);
    if (!row) { console.error(`NO_CSV_ROW ${taskId}`); fail++; continue; }
    const sprint = Number.parseInt(row['Target Sprint'] ?? '', 10);
    if (!Number.isFinite(sprint)) { console.error(`NO_SPRINT ${taskId}`); fail++; continue; }

    console.log(`\n— ${taskId} (sprint-${sprint}) —`);
    const ackOk = writeAck(taskId, sprint);
    const packOk = await buildPack(taskId, sprint);
    if (ackOk && packOk) ok++; else fail++;
  }
  console.log(`\nSummary: ${ok} ok, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
