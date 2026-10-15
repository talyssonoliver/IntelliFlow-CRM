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
 * Light ceremony tier (issue #579): a task whose tier, RE-DERIVED here from
 * Sprint_plan.csv + .specify/memory/task-tiers.yaml (never trusted from the
 * attestation or plan), is `light` may omit plan_reviewer_verdict and the
 * plan-reviewer marker if its plan records `ceremony_tier: light` and creates
 * no apps/web/src/app/**\/page.tsx. Any other combination still BLOCKs.
 *
 * Provenance is REQUIRED (absence BLOCKs) for PG-* / IFC-* tasks; for other
 * prefixes (AUTOMATION-*, INFRA-*, EXC-*, ...) absence WARNs (exit 0). Present-
 * but-invalid provenance BLOCKs for ANY task type.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

// ── Ceremony tier (issue #579) ──────────────────────────────────────────────
// A light-tier task legitimately skips the Plan-Reviewer subagent, so it has no
// affirmative verdict and no marker. The attestation and the plan are both
// authored by the executing agent, so neither may be trusted to CLAIM `light`:
// the tier is RE-DERIVED here from Sprint_plan.csv + .specify/memory/task-tiers.yaml
// by the same classifier /full-pipeline Phase 0.3 uses. Any failure to derive
// (tool error, task not found, unparseable output) is treated as `full`.
const AUDIT_SCRIPT = fileURLToPath(new URL('../ceremony-tier-audit.ts', import.meta.url));
const AUDIT_CWD = fileURLToPath(new URL('../../..', import.meta.url));
const PLAN_LIGHT_LINE_RE = /ceremony_tier\s*:\s*light/i;
// A plan that creates a page.tsx always keeps the Plan-Reviewer (same carve-out
// as /plan-session Light Tier Mode and check-plan-reviewer-subagent.mjs).
const PLAN_CREATES_PAGE_RE = /apps\/web\/src\/app\/[^\s`'")]*page\.tsx/i;

function deriveTier(taskId) {
  try {
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', AUDIT_SCRIPT, '--task', taskId, '--json', '--repo-root', REPO_ROOT],
      { encoding: 'utf8', cwd: AUDIT_CWD, timeout: 120000 }
    );
    if (res.status !== 0) return 'full';
    const parsed = JSON.parse(res.stdout);
    return parsed && parsed.tier === 'light' ? 'light' : 'full';
  } catch {
    return 'full';
  }
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

  // The Plan-Reviewer waiver: ONLY when no verdict was claimed (a REJECTED or
  // junk verdict still BLOCKs), the tier re-derived from the CSV is light, and
  // the plan itself records the skip and creates no page.tsx.
  let lightWaiver = false;
  let lightWaiverNote = '';
  if (verdict == null && typeof planPath === 'string' && isRepoRelative(planPath)) {
    const planAbs = join(REPO_ROOT, planPath);
    if (existsSync(planAbs)) {
      const planText = readFileSync(planAbs, 'utf8');
      if (PLAN_LIGHT_LINE_RE.test(planText) && !hasPlanReviewerSubagentMarker(planText)) {
        if (PLAN_CREATES_PAGE_RE.test(planText)) {
          lightWaiverNote = 'plan creates a page.tsx — the Plan-Reviewer is mandatory even on the light tier.';
        } else if (deriveTier(taskId) === 'light') {
          lightWaiver = true;
        } else {
          lightWaiverNote =
            'plan claims ceremony_tier: light but Sprint_plan.csv + task-tiers.yaml classify ' + taskId + ' as full.';
        }
      }
    }
  }

  if (!lightWaiver) {
    if (typeof verdict !== 'string' || !AFFIRMATIVE_VERDICTS.has(verdict)) {
      reasons.push(
        'plan_reviewer_verdict is "' + String(verdict) + '" — must be APPROVED or APPROVED_WITH_CHANGES.' +
          (lightWaiverNote ? ' ' + lightWaiverNote : '')
      );
    }
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
    } else if (!lightWaiver && !hasPlanReviewerSubagentMarker(readFileSync(abs, 'utf8'))) {
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
  if (lightWaiver) {
    info('           ✓ ceremony_tier: light (re-derived from Sprint_plan.csv) — Plan-Reviewer legitimately skipped');
  } else {
    info('           ✓ plan_reviewer_verdict: ' + verdict);
    info('           ✓ plan_path carries the plan-reviewer subagent marker');
  }
  info('           ✓ spec_path + plan_path exist (repo-relative)');
  process.exit(0);
}

main();
