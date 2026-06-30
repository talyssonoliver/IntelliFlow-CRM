#!/usr/bin/env node
/**
 * Final Ralph-iteration report generator.
 *
 * Runs every enforcement check for a task and emits a single consolidated
 * report. Only prints the completion-promise XML tag when every mandatory
 * gate is green — turning "the agent could lie to escape the loop" into
 * "the script decides, not the agent."
 *
 * Invocation (typically from exec Phase 5 after attestation lands):
 *   node tools/scripts/generate-final-report.mjs <TASK_ID>
 *   node tools/scripts/generate-final-report.mjs <TASK_ID> --promise "PIPELINE COMPLETE: …"
 *
 * Promise text is the completion_promise from `.claude/ralph-loops/<TASK_ID>.local.md`
 * — passed explicitly via --promise to avoid re-parsing YAML. If omitted,
 * a generic "PIPELINE COMPLETE" is used.
 *
 * Exit codes:
 *   0 — every gate green; promise emitted
 *   1 — at least one gate not green; NO promise emitted (report still prints)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const args = process.argv.slice(2);
const TASK_ID = args.find((a) => !a.startsWith('--'));
const PROMISE_IDX = args.indexOf('--promise');
const PROMISE_TEXT = PROMISE_IDX >= 0 ? args[PROMISE_IDX + 1] : 'PIPELINE COMPLETE';

if (!TASK_ID) {
  process.stderr.write('Usage: generate-final-report.mjs <TASK_ID> [--promise "<text>"]\n');
  process.exit(2);
}

function runCheck(name, cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, { encoding: 'utf8', cwd: REPO_ROOT });
  return {
    name,
    exit: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

// ─── 1. Four preflights (already exist) ───────────────────────────────────

const preflights = [
  runCheck('Page Doc Co-Change', 'node',
    ['tools/scripts/exec-preflight/check-page-doc-cochange.mjs', TASK_ID]),
  runCheck('Plan-Reviewer Subagent', 'node',
    ['tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs', TASK_ID]),
  runCheck('Exec Readiness (5-check bundle)', 'node',
    ['tools/scripts/exec-preflight/check-exec-readiness.mjs', TASK_ID]),
  runCheck('Task JSON schema sweep', 'node',
    ['tools/scripts/validate-task-json-schemas.mjs', '--quiet']),
  // Post-attestation: the provenance block on attestation.json must be present
  // (on PG-/IFC- tasks), affirmative, and cross-validated against the on-disk
  // plan/spec files (AUTOMATION-003). Safe to run here — this report fires after
  // the attestation lands, unlike the pre-exec preflight table.
  runCheck('Attestation Provenance', 'node',
    ['tools/scripts/exec-preflight/check-attestation-provenance.mjs', TASK_ID]),
];

// ─── 2. Workflow audit (the 30+ phase check) ──────────────────────────────

const auditJson = runCheck('Workflow audit', 'node',
  ['tools/scripts/audit-workflow-execution.mjs', TASK_ID, '--json']);

let audit = null;
try { audit = JSON.parse(auditJson.stdout); } catch { /* leave as null */ }

// ─── 3. Attestation verification ──────────────────────────────────────────

function inferSprint(taskId) {
  const csvPath = join(REPO_ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
  if (!existsSync(csvPath)) return null;
  const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(`${taskId},`)) continue;
    // naive field 10 (Target Sprint) after splitting ignores quoting nuances;
    // close enough for sprint-number extraction.
    const match = line.match(/,(\d+),ARTIFACT:/);
    if (match) return match[1];
  }
  return null;
}

const sprint = inferSprint(TASK_ID);
const attestPath = sprint
  ? join(REPO_ROOT, '.specify/sprints', `sprint-${sprint}`, 'attestations', TASK_ID, 'attestation.json')
  : null;

let attest = null;
if (attestPath && existsSync(attestPath)) {
  try { attest = JSON.parse(readFileSync(attestPath, 'utf8')); } catch { /* leave null */ }
}

// ─── 4. Compose report ────────────────────────────────────────────────────

const out = [];
const push = (s) => out.push(s);

push('');
const header = `PIPELINE REPORT — ${TASK_ID}` + (sprint ? `  —  sprint-${sprint}` : '');
push(header);
push('═'.repeat(header.length));
push('');

// Preflights
push('Preflights (deterministic gates that must exit 0):');
let preflightGreen = true;
for (const p of preflights) {
  const sym = p.exit === 0 ? '✓' : '✗';
  push(`  ${sym} ${p.name.padEnd(38)} exit ${p.exit}`);
  if (p.exit !== 0) preflightGreen = false;
}
push('');

// Workflow audit
push('Workflow audit (every phase across spec/plan/exec + sub-skills):');
let auditGreen = true;
if (!audit) {
  push('  ✗ audit command did not produce valid JSON');
  auditGreen = false;
} else {
  const bySection = { SPEC: [], PLAN: [], PREFLIGHT: [], EXEC: [] };
  for (const p of audit.phases) bySection[p.section]?.push(p);
  for (const section of ['SPEC', 'PLAN', 'EXEC']) {
    const rows = bySection[section];
    const pass = rows.filter((r) => r.verdict === 'PASS').length;
    const na = rows.filter((r) => r.verdict === 'N/A').length;
    const warn = rows.filter((r) => r.verdict === 'WARN').length;
    const blocked = rows.filter((r) => r.mandatory && (r.verdict === 'BLOCK' || r.verdict === 'MISSING')).length;
    const partial = rows.filter((r) => r.verdict === 'PARTIAL' || r.verdict === 'IN_PROGRESS').length;
    const sym = blocked === 0 && partial === 0 ? '✓' : '✗';
    push(`  ${sym} ${section.padEnd(5)}  ${pass} PASS / ${warn} WARN / ${blocked} BLOCK+MISSING / ${partial} PARTIAL / ${na} N/A`);
    if (blocked > 0 || partial > 0) auditGreen = false;
  }
}
push('');

// Attestation
push('Attestation:');
let attestGreen = false;
if (!attest) {
  push(`  ✗ ${attestPath ?? 'unknown'} not found or not parseable`);
} else {
  const verdict = attest.verdict ?? '<unset>';
  const vr = Array.isArray(attest.validation_results) ? attest.validation_results : [];
  const names = vr.map((r) => r.name).sort().join(',');
  const expected = 'Build,Lint,Tests,TypeScript';
  const allPassed = vr.length === 4 && vr.every((r) => r.passed === true);
  const gates = Array.isArray(attest.gate_results) ? attest.gate_results : [];
  const gateFails = gates.filter((g) => g.passed === false).length;
  const kpis = Array.isArray(attest.kpi_results) ? attest.kpi_results : [];

  push(`  verdict:      ${verdict}`);
  push(`  validations:  ${vr.length}/4  (${allPassed ? 'all exit 0' : 'some failed or missing'})`);
  if (names !== expected) push(`                names=[${names}] (expected [${expected}])`);
  push(`  gates:        ${gates.length}  —  ${gates.length - gateFails} PASS / ${gateFails} FAIL`);
  if (kpis.length > 0) {
    const s = kpis.find((k) => /statements/i.test(k.name ?? ''));
    const b = kpis.find((k) => /branches/i.test(k.name ?? ''));
    const f = kpis.find((k) => /functions/i.test(k.name ?? ''));
    const l = kpis.find((k) => /lines/i.test(k.name ?? ''));
    if (s || b || f || l) {
      push(`  coverage:     S ${s?.actual ?? '?'}  B ${b?.actual ?? '?'}  F ${f?.actual ?? '?'}  L ${l?.actual ?? '?'}`);
    }
  }
  attestGreen = verdict === 'COMPLETE' && allPassed && names === expected && gateFails === 0;
}
push('');

// Summary
const overallGreen = preflightGreen && auditGreen && attestGreen;
push('─'.repeat(60));
push(`OVERALL: ${overallGreen ? 'GREEN — every gate PASS' : 'NOT READY — see blockers above'}`);
push('');

process.stdout.write(out.join('\n') + '\n');

// Only emit the completion-promise tag when everything is green. The agent
// may NOT paste this tag into a response unless the script emits it.
if (overallGreen) {
  process.stdout.write(`<promise>${PROMISE_TEXT}</promise>\n`);
  process.exit(0);
} else {
  process.stdout.write(
    '\nNo <promise> tag emitted. Not all gates are green.\n' +
    'Fix the BLOCKers above, then re-run this script.\n'
  );
  process.exit(1);
}
