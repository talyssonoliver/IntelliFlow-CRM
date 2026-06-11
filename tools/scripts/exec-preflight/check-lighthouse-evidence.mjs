#!/usr/bin/env node
/**
 * Guard 9 — Lighthouse evidence artifact check.
 *
 * Unlike Guards 4, 6, 8 (which scan attestation text), this gate checks
 * that a real report JSON exists on disk, has real category scores, is
 * fresh relative to the attestation timestamp, and is hash-matched to the
 * attestation's artifact_hashes block.
 *
 * Agents cannot route around this by rewriting notes. The only legitimate
 * completion paths are:
 *   A) Produce a real artifacts/lighthouse/TASK_ID/*.json with passing
 *      scores and commit it (hash goes into artifact_hashes).
 *   B) Record lighthouse_waiver_approved_by with a real human identity
 *      (email or @handle, 3+ chars, not CI/bot/Claude/self/none/etc.).
 *
 * See docs/claude-refs/lighthouse-playbook.md for the recipe.
 *
 * Exit codes:
 *   0 - PASS (no Lighthouse KPI, or KPI met:true with valid evidence, or
 *       KPI met:false with legitimate human-approved waiver)
 *   1 - BLOCK (Lighthouse KPI met:true with missing/stale/mismatched
 *       evidence, OR met:false without legitimate approval)
 *   2 - Usage error
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const FRESHNESS_HOURS = 72;

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

function sha256OfFile(path) {
  try {
    const buf = readFileSync(path);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Humans only. Rejects common agent / system tokens that look plausible
 * but aren't a real person accepting the risk.
 */
const REJECTED_APPROVERS = new Set([
  'ci',
  'cicd',
  'ci-cd',
  'cd',
  'agent',
  'bot',
  'claude',
  'automation',
  'autoapprove',
  'auto',
  'self',
  'none',
  'na',
  'n/a',
  'pending',
  'tbd',
  'todo',
  'later',
  'deferred',
  'system',
  'lhci',
]);

function isHumanApprover(token) {
  if (typeof token !== 'string') return false;
  const s = token.trim();
  if (s.length < 3) return false;
  const low = s.toLowerCase();
  if (REJECTED_APPROVERS.has(low)) return false;
  // Accept emails: x@y.z
  if (/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/.test(s)) return true;
  // Accept @handle with at least 3 chars
  if (/^@[A-Za-z0-9][A-Za-z0-9_.-]{2,}$/.test(s)) return true;
  // Accept plain name with at least 3 chars and a letter, excluding blocked list
  if (/^[A-Za-z][A-Za-z0-9._-]{2,}$/.test(s)) return true;
  return false;
}

function getApprover(attestation) {
  if (!attestation) return null;
  const top = attestation.lighthouse_waiver_approved_by;
  if (isHumanApprover(top)) return top.trim();
  const notes = String(attestation.notes ?? '');
  const m = notes.match(/lighthouse_waiver_approved_by\s*:\s*([^\s,;]+)/i);
  if (m && isHumanApprover(m[1])) return m[1];
  return null;
}

function getLighthouseKpis(attestation) {
  if (!attestation || !Array.isArray(attestation.kpi_results)) return [];
  return attestation.kpi_results.filter((k) => {
    if (!k || typeof k !== 'object') return false;
    return /lighthouse/i.test(String(k.kpi ?? ''));
  });
}

/**
 * Walk artifacts/lighthouse/<TASK_ID>/ and return any JSON file that
 * looks like a Lighthouse report (has categories + fetchTime fields).
 */
function findReportFiles(taskId) {
  const dir = join(REPO_ROOT, 'artifacts', 'lighthouse', taskId);
  if (!existsSync(dir)) return [];
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    if (e.name === 'manifest.json') continue;
    const abs = join(dir, e.name);
    const data = readJsonSafe(abs);
    if (!data) continue;
    if (!data.categories || !data.fetchTime) continue;
    out.push({ path: abs, data });
  }
  return out;
}

function reportFreshnessOk(report, attestationTimestamp) {
  const attMs = Date.parse(attestationTimestamp);
  const repMs = Date.parse(report.data.fetchTime);
  if (!Number.isFinite(attMs) || !Number.isFinite(repMs)) return false;
  const diffHours = Math.abs(attMs - repMs) / (1000 * 60 * 60);
  return diffHours <= FRESHNESS_HOURS;
}

function reportScoresMeetThresholds(report, threshold = 0.9) {
  const cats = report.data.categories ?? {};
  const keys = ['performance', 'accessibility', 'best-practices', 'seo'];
  const measured = keys.filter((k) => cats[k] && typeof cats[k].score === 'number');
  if (measured.length === 0) return { passed: false, reason: 'no category scores present' };
  const failing = measured.filter((k) => cats[k].score < threshold);
  if (failing.length === 0) {
    return {
      passed: true,
      summary: measured.map((k) => `${k}:${cats[k].score}`).join(' '),
    };
  }
  return {
    passed: false,
    reason: `below ${threshold}: ${failing.map((k) => `${k}=${cats[k].score}`).join(', ')}`,
  };
}

function reportHashMatchesArtifacts(reportPath, attestation) {
  const hashes = attestation?.artifact_hashes;
  if (!hashes || typeof hashes !== 'object') return false;
  const rel = relative(REPO_ROOT, reportPath).replace(/\\/g, '/');
  const declared = hashes[rel];
  if (typeof declared !== 'string') return false;
  const actual = sha256OfFile(reportPath);
  return actual !== null && actual === declared;
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) die(2, 'Usage: check-lighthouse-evidence.mjs <TASK_ID> <SPRINT>');
  if (!sprintArg) die(2, 'Sprint argument required.');

  const attPath = join(
    REPO_ROOT,
    '.specify',
    'sprints',
    'sprint-' + sprintArg,
    'attestations',
    taskId,
    'attestation.json'
  );

  if (!existsSync(attPath)) {
    info('[lighthouse-evidence] No attestation yet at ' + attPath + ' — gate will re-run after write.');
    process.exit(0);
  }

  const att = readJsonSafe(attPath);
  if (!att) die(1, '[lighthouse-evidence] BLOCK — attestation.json could not be parsed: ' + attPath);

  const kpis = getLighthouseKpis(att);
  if (kpis.length === 0) {
    info('[lighthouse-evidence] OK — no Lighthouse KPI in attestation. N/A.');
    process.exit(0);
  }

  info('[lighthouse-evidence] Found ' + kpis.length + ' Lighthouse KPI(s). Verifying evidence…');

  const reports = findReportFiles(taskId);
  const approver = getApprover(att);
  const findings = [];

  for (const k of kpis) {
    const metClaim = k.met === true;
    const kpiLabel = String(k.kpi ?? 'Lighthouse');

    if (metClaim) {
      // Claim is PASS — must be backed by a real report.
      if (reports.length === 0) {
        findings.push(
          `KPI "${kpiLabel}" is met:true but no Lighthouse report JSON found under ` +
            `artifacts/lighthouse/${taskId}/. Commit the real *.report.json or change met:false.`
        );
        continue;
      }
      // Pick the freshest report.
      const sorted = [...reports].sort(
        (a, b) => Date.parse(b.data.fetchTime) - Date.parse(a.data.fetchTime)
      );
      const best = sorted[0];

      if (!reportFreshnessOk(best, att.attestation_timestamp)) {
        findings.push(
          `KPI "${kpiLabel}" is met:true but the newest report ` +
            relative(REPO_ROOT, best.path).replace(/\\/g, '/') +
            ` (fetchTime ${best.data.fetchTime}) is older than ${FRESHNESS_HOURS}h ` +
            `from the attestation (${att.attestation_timestamp}). Re-run or update timestamps.`
        );
        continue;
      }

      const rtErr = best.data.runtimeError?.code;
      if (rtErr) {
        findings.push(
          `KPI "${kpiLabel}" is met:true but report ` +
            relative(REPO_ROOT, best.path).replace(/\\/g, '/') +
            ` has runtimeError.code=${rtErr}. A failed run is not a passing run.`
        );
        continue;
      }

      const threshold = /\b([0-9]{0,10}\.?[0-9]{1,10})\b/.exec(String(k.target ?? ''));
      const thr = threshold ? Math.min(1, parseFloat(threshold[1]) / (parseFloat(threshold[1]) > 1 ? 100 : 1)) : 0.9;
      const scoreCheck = reportScoresMeetThresholds(best, thr);
      if (!scoreCheck.passed) {
        findings.push(
          `KPI "${kpiLabel}" is met:true but report ` +
            relative(REPO_ROOT, best.path).replace(/\\/g, '/') +
            ` scores ${scoreCheck.reason}.`
        );
        continue;
      }

      if (!reportHashMatchesArtifacts(best.path, att)) {
        findings.push(
          `KPI "${kpiLabel}" is met:true but the report file ` +
            relative(REPO_ROOT, best.path).replace(/\\/g, '/') +
            ` is not listed in attestation.artifact_hashes with a matching sha256. ` +
            `Add the file hash so the evidence is tamper-evident.`
        );
        continue;
      }

      info('[lighthouse-evidence] ✓ "' + kpiLabel + '" backed by ' +
        relative(REPO_ROOT, best.path).replace(/\\/g, '/') + ' (' + scoreCheck.summary + ')');
    } else {
      // Claim is met:false — a legitimate waiver requires human approver.
      if (!approver) {
        findings.push(
          `KPI "${kpiLabel}" is met:false but attestation has no ` +
            `lighthouse_waiver_approved_by with a real human identity. ` +
            `Either run Lighthouse and update met:true, or set ` +
            `lighthouse_waiver_approved_by to an email or @handle (not CI / bot / Claude / self).`
        );
        continue;
      }
      info('[lighthouse-evidence] ✓ "' + kpiLabel + '" waived with approval by: ' + approver);
    }
  }

  if (findings.length === 0) {
    info('[lighthouse-evidence] PASS — all Lighthouse KPIs backed by real evidence or legitimate approval.');
    process.exit(0);
  }

  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '  BLOCK: Lighthouse evidence artifact check (Guard 9)\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '\n' +
      '  Task: ' + taskId + '  Sprint: sprint-' + sprintArg + '\n' +
      '  Attestation: ' + relative(REPO_ROOT, attPath).replace(/\\/g, '/') + '\n' +
      '\n'
  );
  for (const f of findings) {
    process.stderr.write('    - ' + f + '\n\n');
  }
  process.stderr.write(
    '  Run the playbook recipe before waiving:\n' +
      '    docs/claude-refs/lighthouse-playbook.md\n' +
      '\n' +
      '  Prior successful runs on THIS host (cite by name when challenging):\n' +
      '    artifacts/lighthouse/pg-195-post-subset-404.json  (perf 0.96, 2026-04-15)\n' +
      '    artifacts/lighthouse/PG-054/404-ctrl.json         (perf 0.96, 2026-04-19)\n' +
      '    artifacts/lighthouse/pg-056-500-r{1,2,3}.json\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  process.exit(1);
}

main();
