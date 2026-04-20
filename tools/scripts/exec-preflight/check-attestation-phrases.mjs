#!/usr/bin/env node
/**
 * Guards 6 + 8 - Attestation phrase auditor.
 *
 * Scans an attestation.json's `notes` field and the text of each
 * `kpi_results[].actual` for phrases that were used as camouflage in the
 * PG-180 waiver pattern:
 *
 *   Guard 6 ("runtime-ready" without proof): if notes contains
 *     "runtime-ready" or "real production caller" or "route is reachable"
 *     AND artifact_hashes contains any apps/web/src/app/<any>/page.tsx AND
 *     the top-level nav_wiring_confirmed field is not true AND notes does
 *     NOT cite an apps/web/src/components/sidebar/configs/<file>.ts path,
 *     BLOCK.
 *
 *   Guard 8 (deferred-to-CI): if notes or kpi_results[].actual contains
 *     "deferred to CI", "deferred to follow-up", "NOT_RUN", or
 *     "not measured", emit a FINDING. A single occurrence is a WARN (the
 *     attestation still completes). More than one distinct KPI with these
 *     phrases, or a combination of a nav-defer phrase and a Lighthouse
 *     defer phrase, becomes a BLOCK.
 *
 * Use this from /compliance-check section 6b (Attestation Forensics) AND
 * from the exec preflight bundle.
 *
 * Exit codes:
 *   0 - PASS (no findings, or WARN-level findings only)
 *   1 - BLOCK (Guard 6 runtime-ready claim unverified, OR multiple Guard 8
 *       defer phrases across KPIs)
 *   2 - Usage error
 */

import { readFileSync, existsSync } from 'node:fs';
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

const RUNTIME_READY_RE = /runtime[\s-]?ready|real production caller|route is reachable/i;
const DEFER_RES = [
  /deferred\s+to\s+CI/i,
  /deferred\s+to\s+follow[-\s]?up/i,
  /\bNOT_RUN\b/,
  /\bnot\s+measured\b/i,
  /deferred\s+to\s+(?:next|future|later)\s+sprint/i,
  /full\s+run\s+deferred/i,
];

function scanDefers(text) {
  const hits = [];
  if (!text) return hits;
  for (const re of DEFER_RES) {
    const m = re.exec(text);
    if (m) hits.push(m[0]);
  }
  return hits;
}

function citesSidebarConfig(notes) {
  return /apps\/web\/src\/components\/sidebar\/configs\/[\w.-]+/.test(notes);
}

function createsAppRouterPage(attestation) {
  const hashes = attestation?.artifact_hashes;
  if (!hashes || typeof hashes !== 'object') return false;
  return Object.keys(hashes).some((p) => /apps\/web\/src\/app\/\S+\/page\.tsx$/.test(p));
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) die(2, 'Usage: check-attestation-phrases.mjs <TASK_ID> <SPRINT>');
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
    info('[phrases] No attestation yet at ' + attPath + ' — gate will re-run after write.');
    process.exit(0);
  }

  const att = readJsonSafe(attPath);
  if (!att) {
    die(1, '[phrases] BLOCK — attestation.json could not be parsed as JSON: ' + attPath);
  }

  const notes = String(att.notes ?? '');
  const kpis = Array.isArray(att.kpi_results) ? att.kpi_results : [];

  const findings = [];

  // Guard 6: runtime-ready without proof.
  if (RUNTIME_READY_RE.test(notes) && createsAppRouterPage(att)) {
    const navOk = att.nav_wiring_confirmed === true;
    const citesSidebar = citesSidebarConfig(notes);
    if (!navOk && !citesSidebar) {
      findings.push({
        severity: 'BLOCK',
        guard: 'Guard 6',
        message:
          'Attestation notes claim "runtime-ready" / "real production caller" but ' +
          'the task creates a page.tsx, nav_wiring_confirmed is not true, and the ' +
          'notes do not cite a sidebar config path. PG-180 used exactly this phrase ' +
          'to make an unreachable page look reachable. Either set ' +
          'nav_wiring_confirmed: true (after Gate 12 passes) or cite the sidebar ' +
          'config file path inline in the notes.',
      });
    }
  }

  // Guard 8: deferred-to-CI phrase sweep.
  const defersInNotes = scanDefers(notes);
  const defersInKpis = [];
  for (const k of kpis) {
    const actual = String(k?.actual ?? '');
    const hits = scanDefers(actual);
    if (hits.length) defersInKpis.push({ kpi: k.kpi, hits });
  }
  const totalDefers = defersInNotes.length + defersInKpis.reduce((n, x) => n + x.hits.length, 0);

  if (totalDefers === 1) {
    findings.push({
      severity: 'WARN',
      guard: 'Guard 8',
      message:
        'Attestation contains one deferred-to-CI / NOT_RUN phrase: ' +
        (defersInNotes[0] ?? defersInKpis[0]?.hits[0]) +
        '. A single defer is allowed but must be tracked by the reviewer.',
    });
  } else if (totalDefers > 1) {
    const sample = [
      ...defersInNotes.slice(0, 2),
      ...defersInKpis.flatMap((x) => x.hits).slice(0, 2),
    ].join(' | ');
    findings.push({
      severity: 'BLOCK',
      guard: 'Guard 8',
      message:
        'Attestation contains ' + totalDefers + ' deferred-to-CI / NOT_RUN / ' +
        'not-measured phrases across notes and KPIs (e.g. ' + sample + '). This is ' +
        'the pattern that produced the PG-047 -> PG-180 Lighthouse waiver chain — ' +
        'each defer lowered the bar for the next. Run the deferred checks ' +
        'locally, OR reduce to a single justified defer with human approval.',
    });
  }

  if (findings.length === 0) {
    info('[phrases] OK — no suspicious phrases in ' + taskId + ' attestation.');
    process.exit(0);
  }

  const hasBlock = findings.some((f) => f.severity === 'BLOCK');

  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '  Attestation phrase audit: ' + taskId + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  for (const f of findings) {
    process.stderr.write('\n  [' + f.severity + '] ' + f.guard + '\n    ' + f.message + '\n');
  }
  process.stderr.write('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(hasBlock ? 1 : 0);
}

main();
