#!/usr/bin/env node
/**
 * Attestation Provenance preflight (runs POST-attestation, NOT pre-exec).
 *
 * The orchestrator's definition-of-done proves the spec-session + plan-reviewer
 * ceremony ran by reading provenance fields from a task's attestation.json:
 * spec_session_consensus, plan_reviewer_verdict, plan_reviewer_agent,
 * plan_reviewer_marker, spec_path, plan_path. An agent authors its OWN
 * attestation, so a presence/affirmative check is cosmetic on its own — the
 * gate's integrity comes from CROSS-CHECKING the independently-authored
 * plan_path file on disk for the `<!-- plan-reviewer: subagent -->` marker
 * (the same marker the plan-side gate validates), reusing the SINGLE definition
 * in tools/scripts/lib/plan-reviewer-marker.mjs.
 *
 * Lifecycle: the attestation is written at exec Phase 5, so this gate is invoked
 * AFTER it exists — from /exec-attestation Phase 5 self-check and from
 * generate-final-report.mjs's post-attestation sweep. It is NOT in the pre-exec
 * preflight table (the attestation does not exist there).
 *
 * Exit codes:
 *   0 - PASS or WARN (provenance valid, or legitimately absent on a non-mandatory task,
 *       or attestation not yet written)
 *   1 - BLOCK (provenance present-but-invalid, or absent on a mandatory UI/IFC/PG task)
 *   2 - usage error
 *
 * Provenance is REQUIRED (absence BLOCKs) for PG-* / IFC-* tasks; for other
 * prefixes (AUTOMATION-*, INFRA-*, EXC-*, ...) absence WARNs (exit 0). Present-
 * but-invalid provenance BLOCKs for ANY task type.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { hasPlanReviewerSubagentMarker } from '../lib/plan-reviewer-marker.mjs';

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(REPO_ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

const AFFIRMATIVE_VERDICTS = new Set(['APPROVED', 'APPROVED_WITH_CHANGES']);
const NON_AFFIRMATIVE_CONSENSUS = /^(skipped|n\/a|none|tbd|pending)$/i;

function die(code, msg) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}
function info(msg) {
  process.stdout.write(msg + '\n');
}
function block(taskId, reasons) {
  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '  BLOCK: Attestation Provenance\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '\n' +
      '  Task: ' + taskId + '\n\n' +
      reasons.map((r) => '  - ' + r).join('\n') + '\n\n' +
      '  The provenance block must prove the ceremony actually ran:\n' +
      '  an affirmative plan_reviewer_verdict + a spec_session_consensus,\n' +
      '  with plan_path/spec_path that exist on disk (repo-relative) and a\n' +
      '  plan file carrying the `<!-- plan-reviewer: subagent -->` marker.\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  process.exit(1);
}

// CSV line parser (mirror of check-plan-reviewer-subagent.mjs — quoting-aware).
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}
function inferSprintFromCsv(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const lines = readFileSync(CSV_PATH, 'utf8').split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const sprintCol = header.findIndex((h) => h.trim() === 'Target Sprint');
  if (sprintCol < 0) return null;
  for (const line of lines.slice(1)) {
    if (!line.startsWith(taskId + ',')) continue;
    const sprint = parseCsvLine(line)[sprintCol]?.trim();
    if (sprint && /^\d+$/.test(sprint)) return sprint;
  }
  return null;
}

// A repo-relative path: not absolute, no drive letter, no leading slash, no '..' escape.
function isRepoRelative(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')) return false;
  if (p.split(/[\\/]/).includes('..')) return false;
  return true;
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) die(2, 'Usage: check-attestation-provenance.mjs <TASK_ID> [SPRINT]');

  const sprint = sprintArg ?? inferSprintFromCsv(taskId);
  if (!sprint) {
    die(2, '[preflight] Could not infer sprint for ' + taskId + ' from ' + CSV_PATH + '. Pass sprint explicitly.');
  }

  const attestPath = join(
    REPO_ROOT, '.specify', 'sprints', 'sprint-' + sprint, 'attestations', taskId, 'attestation.json'
  );

  info('[preflight] Provenance check ' + taskId + ' (sprint ' + sprint + ')');

  // The gate runs post-attestation; if it is not yet written, existence is
  // enforced by other gates (Gate 4b / final-report) — not this one.
  if (!existsSync(attestPath)) {
    info('[preflight] WARN — attestation.json not present yet at ' + attestPath + '; provenance not evaluated.');
    process.exit(0);
  }

  let att;
  try {
    att = JSON.parse(readFileSync(attestPath, 'utf8'));
  } catch (e) {
    block(taskId, ['attestation.json is not valid JSON: ' + String(e)]);
    return;
  }

  const verdict = att.plan_reviewer_verdict;
  const consensus = att.spec_session_consensus;
  const planPath = att.plan_path;
  const specPath = att.spec_path;

  const hasAnyProvenance =
    verdict != null || consensus != null || planPath != null ||
    specPath != null || att.plan_reviewer_marker != null || att.plan_reviewer_agent != null;

  const mandatory = /^(PG|IFC)-/.test(taskId);

  if (!hasAnyProvenance) {
    if (mandatory) {
      block(taskId, [
        'No provenance fields present, but ' + taskId + ' is a PG-/IFC- task where the',
        'spec-session + plan-reviewer ceremony is mandatory.',
      ]);
      return;
    }
    info('[preflight] OK (WARN) — no provenance block; ' + taskId + ' is not a PG-/IFC- task (ceremony not mandatory).');
    process.exit(0);
  }

  // Provenance is present → validate fully (BLOCK on any failure, any task type).
  const reasons = [];

  if (typeof verdict !== 'string' || !AFFIRMATIVE_VERDICTS.has(verdict)) {
    reasons.push(
      'plan_reviewer_verdict is "' + String(verdict) + '" — must be APPROVED or APPROVED_WITH_CHANGES.'
    );
  }

  if (typeof consensus !== 'string' || consensus.trim() === '' || NON_AFFIRMATIVE_CONSENSUS.test(consensus.trim())) {
    reasons.push('spec_session_consensus is empty or non-affirmative ("' + String(consensus) + '").');
  }

  // plan_path — required, repo-relative, file exists, carries the marker.
  if (typeof planPath !== 'string' || planPath.trim() === '') {
    reasons.push('plan_path is missing.');
  } else if (!isRepoRelative(planPath)) {
    reasons.push('plan_path is not repo-relative ("' + planPath + '") — absolute paths can leak machine prefixes.');
  } else {
    const abs = join(REPO_ROOT, planPath);
    if (!existsSync(abs)) {
      reasons.push('plan_path file does not exist on disk: ' + planPath);
    } else if (!hasPlanReviewerSubagentMarker(readFileSync(abs, 'utf8'))) {
      reasons.push(
        'plan_path file exists but lacks the `<!-- plan-reviewer: subagent -->` marker ' +
        '(self-review case — the plan was not produced by a real plan-reviewer subagent).'
      );
    }
  }

  // spec_path — required, repo-relative, file exists.
  if (typeof specPath !== 'string' || specPath.trim() === '') {
    reasons.push('spec_path is missing.');
  } else if (!isRepoRelative(specPath)) {
    reasons.push('spec_path is not repo-relative ("' + specPath + '").');
  } else if (!existsSync(join(REPO_ROOT, specPath))) {
    reasons.push('spec_path file does not exist on disk: ' + specPath);
  }

  if (reasons.length > 0) {
    block(taskId, reasons);
    return;
  }

  info('[preflight] OK — provenance affirmative and cross-validated against plan/spec on disk.');
  info('           ✓ plan_reviewer_verdict: ' + verdict);
  info('           ✓ plan_path carries the plan-reviewer subagent marker');
  info('           ✓ spec_path + plan_path exist (repo-relative)');
  process.exit(0);
}

main();
