#!/usr/bin/env node
/**
 * Guard 4 - Lighthouse waiver cap.
 *
 * Sprints 17 and 18 shipped six Lighthouse waivers in a row (PG-047, 053,
 * 054, 056, 180, 189), each `met: false` + `verdict: COMPLETE`, each citing
 * the previous one as precedent. This script puts a ceiling on that chain.
 *
 * Rules, enforced at attestation-write time:
 *
 *   1. Count the number of COMPLETE attestations in the task's sprint that
 *      have at least one Lighthouse KPI with `met: false`.
 *   2. If the count is 0 and the current attestation also has
 *      `met: false`, WARN but allow (the first waiver of the sprint is a
 *      ceiling starter; log it).
 *   3. If the count is >=1 and the current attestation also has
 *      `met: false`, BLOCK unless the attestation's `notes` field contains
 *      a `lighthouse_waiver_approved_by: <name>` token naming a human.
 *
 * The script reads the attestation JSON at
 *   .specify/sprints/sprint-<N>/attestations/<TASK_ID>/attestation.json
 * and scans sibling attestation files in the same sprint.
 *
 * Exit codes:
 *   0 - check passed (no Lighthouse waiver, or within cap, or approved)
 *   1 - BLOCK: second Lighthouse waiver in the sprint without approval
 *   2 - Usage error
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());

function die(code, msg) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function info(msg) {
  process.stdout.write(msg + '\n');
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// True if any KPI named "Lighthouse" (case-insensitive) has met === false.
function hasLighthouseWaiver(attestation) {
  if (!attestation || !Array.isArray(attestation.kpi_results)) return false;
  for (const k of attestation.kpi_results) {
    if (!k || typeof k !== 'object') continue;
    const kpi = String(k.kpi ?? '').toLowerCase();
    if (!kpi.includes('lighthouse')) continue;
    if (k.met === false) return true;
  }
  return false;
}

function hasHumanApproval(attestation) {
  if (!attestation) return null;
  // Preferred: explicit top-level field (schema-validated).
  const topLevel = attestation.lighthouse_waiver_approved_by;
  if (typeof topLevel === 'string' && topLevel.trim() && topLevel.toLowerCase() !== 'none') {
    return topLevel.trim();
  }
  // Fallback: inline token inside notes for older attestations that predate
  // the top-level field.
  const notes = String(attestation.notes ?? '');
  const m = notes.match(/lighthouse_waiver_approved_by\s*:\s*([^\s,;]+)/i);
  if (m && m[1] && m[1].toLowerCase() !== 'none' && m[1].toLowerCase() !== 'n/a') {
    return m[1];
  }
  return null;
}

function collectPriorWaivers(sprintDir, currentTaskId) {
  if (!existsSync(sprintDir)) return [];
  let entries;
  try {
    entries = readdirSync(sprintDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const waivers = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === currentTaskId) continue;
    const attPath = join(sprintDir, entry.name, 'attestation.json');
    const att = readJsonSafe(attPath);
    if (!att) continue;
    if (att.verdict !== 'COMPLETE') continue;
    if (hasLighthouseWaiver(att)) {
      waivers.push({
        task_id: entry.name,
        approved_by: hasHumanApproval(att),
      });
    }
  }
  return waivers;
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) die(2, 'Usage: check-lighthouse-waiver.mjs <TASK_ID> <SPRINT>');
  if (!sprintArg) die(2, 'Sprint argument is required for this gate.');

  const sprintDir = join(REPO_ROOT, '.specify', 'sprints', 'sprint-' + sprintArg, 'attestations');
  const currentAttPath = join(sprintDir, taskId, 'attestation.json');

  const current = readJsonSafe(currentAttPath);
  if (!current) {
    info('[lighthouse-waiver] Attestation not yet present at ' + currentAttPath + ' — gate will re-run after attestation write.');
    process.exit(0);
  }

  if (!hasLighthouseWaiver(current)) {
    info('[lighthouse-waiver] OK — no Lighthouse KPI with met:false in ' + taskId + ' attestation.');
    process.exit(0);
  }

  const prior = collectPriorWaivers(sprintDir, taskId);
  const approver = hasHumanApproval(current);

  info(
    '[lighthouse-waiver] Current task has a Lighthouse met:false KPI. ' +
      'Prior waivers in sprint-' + sprintArg + ': ' + prior.length +
      (approver ? '  (current waiver approved_by: ' + approver + ')' : '')
  );

  if (prior.length === 0) {
    info(
      '[lighthouse-waiver] WARN — this is the FIRST Lighthouse waiver in sprint-' +
        sprintArg + '. Allowed, but future tasks in this sprint MUST either run ' +
        'Lighthouse locally or include a lighthouse_waiver_approved_by: <name> token ' +
        'in the attestation notes.'
    );
    process.exit(0);
  }

  if (approver) {
    info(
      '[lighthouse-waiver] PASS — prior waivers exist (' + prior.length +
        ') but the current attestation is approved by: ' + approver
    );
    process.exit(0);
  }

  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '  BLOCK: Lighthouse waiver cap exceeded\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '\n' +
      '  Task: ' + taskId + '  Sprint: sprint-' + sprintArg + '\n' +
      '  Attestation: ' + currentAttPath + '\n' +
      '\n' +
      '  This sprint already has ' + prior.length + ' COMPLETE attestation(s) with a\n' +
      '  Lighthouse KPI marked met:false:\n'
  );
  for (const w of prior) {
    process.stderr.write('    - ' + w.task_id + (w.approved_by ? ' (approved_by: ' + w.approved_by + ')' : '') + '\n');
  }
  process.stderr.write(
    '\n' +
      '  Sprints 17 and 18 chained six such waivers (PG-047, 053, 054, 056,\n' +
      '  180, 189) — each citing the previous as precedent, each lowering the\n' +
      '  bar. The cap applies per-sprint to break that chain.\n' +
      '\n' +
      '  Fix options:\n' +
      '    (a) Run Lighthouse locally for this route. Commit the result to\n' +
      '        artifacts/lighthouse/' + taskId + '/ and update the KPI to met:true.\n' +
      '    (b) Get a human approval. Add to attestation.notes:\n' +
      '          lighthouse_waiver_approved_by: <name-or-email>\n' +
      '        and explain in the same notes WHY a local run was not possible\n' +
      '        (e.g., no Chrome binary on the exec host). The named human is\n' +
      '        accepting the risk that CI-only enforcement may drift.\n' +
      '\n' +
      '  Source: .claude/skills/exec/references/phase4-completion-gates.md Gate 13\n' +
      '  Memory: feedback_ui_reachability_waiver_loophole.md (2026-04-20)\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  process.exit(1);
}

main();
