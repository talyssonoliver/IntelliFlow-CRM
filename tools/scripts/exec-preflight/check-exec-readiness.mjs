#!/usr/bin/env node
/**
 * Exec Readiness preflight — combined deterministic gate run before Phase 2
 * (implementation) of /exec.
 *
 * Bundles five cheap file/path checks into a single command so the exec
 * skill can block on any of them without forcing five separate invocations.
 * Each check reports PASS / WARN / BLOCK independently so one failure does
 * not hide the others.
 *
 *   (1) Task JSON $schema path resolves on disk
 *   (2) Exec session-start metrics recorded (task JSON has started_at + a
 *       "Specifying" or later entry in status_history)
 *   (3) Coverage before-capture exists (artifacts/coverage/{TASK_ID}-before.json)
 *   (4) Dependency deep verification (each required dep has an
 *       attestation.json somewhere under .specify/sprints/ *\/ attestations/)
 *   (5) Plan has a "## Preflight Checks" section OR declares N/A explicitly
 *
 * Exit codes:
 *   0 — every check PASS or WARN (WARN never blocks)
 *   1 — one or more BLOCKs; fix them before proceeding to Phase 2
 *   2 — usage or I/O error
 *
 * Usage:
 *   node tools/scripts/exec-preflight/check-exec-readiness.mjs <TASK_ID> [SPRINT]
 *
 * Source memory: feedback_exec_phase1_preflight.md (added 2026-04-15 after
 * PG-184 iteration-3 §3.2 bypass + iteration-4 audit that surfaced five
 * more skipped Phase-0/Phase-1 steps).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);
const METRICS_ROOT = join(REPO_ROOT, 'apps/project-tracker/docs/metrics');
const SPECIFY_ROOT = join(REPO_ROOT, '.specify/sprints');
const COVERAGE_ROOT = join(REPO_ROOT, 'artifacts/coverage');

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function inferTaskMetaFromCsv(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const csv = readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const sprintIdx = header.findIndex((h) => h.trim() === 'Target Sprint');
  const depsIdx = header.findIndex((h) => h.trim() === 'Dependencies');
  for (const line of lines.slice(1)) {
    if (!line.startsWith(`${taskId},`)) continue;
    const cells = parseCsvLine(line);
    const sprint = cells[sprintIdx]?.trim();
    const depsRaw = cells[depsIdx]?.trim() ?? '';
    const deps = depsRaw
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    return { sprint, deps };
  }
  return null;
}

function findTaskJsonPath(sprint, taskId) {
  const sprintRoot = join(METRICS_ROOT, `sprint-${sprint}`);
  if (!existsSync(sprintRoot)) return null;

  // Check sprint root first, then any phase-* subdir.
  const direct = join(sprintRoot, `${taskId}.json`);
  if (existsSync(direct)) return direct;

  for (const entry of readdirSync(sprintRoot)) {
    const full = join(sprintRoot, entry);
    try {
      const stat = readdirSync(full);
      const candidate = join(full, `${taskId}.json`);
      if (stat.includes(`${taskId}.json`)) return candidate;
      // One more level (parallel-a/b/c patterns).
      for (const sub of stat) {
        const subFull = join(full, sub);
        try {
          const subStat = readdirSync(subFull);
          if (subStat.includes(`${taskId}.json`)) {
            return join(subFull, `${taskId}.json`);
          }
        } catch {
          /* not a dir */
        }
      }
    } catch {
      /* not a dir */
    }
  }
  return null;
}

function findDepAttestation(depTaskId) {
  if (!existsSync(SPECIFY_ROOT)) return null;
  for (const sprintDir of readdirSync(SPECIFY_ROOT)) {
    const candidate = join(
      SPECIFY_ROOT,
      sprintDir,
      'attestations',
      depTaskId,
      'attestation.json'
    );
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function check1SchemaPath(taskJsonPath) {
  const content = readFileSync(taskJsonPath, 'utf8');
  let json;
  try {
    json = JSON.parse(content);
  } catch (err) {
    return { verdict: 'BLOCK', detail: `Task JSON is not valid JSON: ${err.message}` };
  }
  const schemaRef = json.$schema;
  if (!schemaRef) {
    return { verdict: 'WARN', detail: 'Task JSON has no $schema field (IDE validation will be skipped).' };
  }
  if (/^https?:\/\//i.test(schemaRef)) {
    return { verdict: 'PASS', detail: `URL-scheme $schema: ${schemaRef}` };
  }
  const resolved = resolve(taskJsonPath, '..', schemaRef);
  if (!existsSync(resolved)) {
    return {
      verdict: 'BLOCK',
      detail: `$schema "${schemaRef}" resolves to ${resolved} — file not found. Run: node tools/scripts/validate-task-json-schemas.mjs --fix`,
    };
  }
  return { verdict: 'PASS', detail: `$schema resolves (${schemaRef})` };
}

function check2SessionStartRecorded(taskJsonPath) {
  const json = JSON.parse(readFileSync(taskJsonPath, 'utf8'));

  if (!json.started_at) {
    return {
      verdict: 'BLOCK',
      detail: `Task JSON missing started_at. Invoke /exec-metrics session-start OR set this field directly.`,
    };
  }
  const history = Array.isArray(json.status_history) ? json.status_history : [];
  const hasStarted = history.some((h) =>
    ['Specifying', 'Planning', 'Plan Complete', 'In Progress'].includes(h.status)
  );
  if (!hasStarted) {
    return {
      verdict: 'BLOCK',
      detail: `Task JSON status_history has no entry showing session start (expected Specifying / Planning / Plan Complete / In Progress). Invoke /exec-metrics.`,
    };
  }
  return { verdict: 'PASS', detail: `started_at=${json.started_at}; ${history.length} status transitions recorded` };
}

function check3CoverageBeforeCapture(taskId) {
  const path = join(COVERAGE_ROOT, `${taskId}-before.json`);
  if (!existsSync(path)) {
    return {
      verdict: 'BLOCK',
      detail: `artifacts/coverage/${taskId}-before.json missing. Invoke /exec-coverage before-capture (plan step V-0b).`,
    };
  }
  return { verdict: 'PASS', detail: `before-capture exists at ${path}` };
}

function check4DepDeepVerification(deps) {
  if (deps.length === 0) {
    return { verdict: 'PASS', detail: 'Task has no declared dependencies.' };
  }
  const missing = [];
  const found = [];
  for (const dep of deps) {
    const att = findDepAttestation(dep);
    if (!att) missing.push(dep);
    else found.push({ dep, att });
  }
  if (missing.length > 0) {
    return {
      verdict: 'BLOCK',
      detail:
        `No attestation.json found under .specify/sprints/*/attestations/ for: ${missing.join(', ')}. ` +
        `These deps are either not complete or their attestations live elsewhere.`,
    };
  }
  return {
    verdict: 'PASS',
    detail: `${found.length}/${deps.length} dep attestations located: ${found.map((f) => f.dep).join(', ')}`,
  };
}

function check5PlanPreflightSection(planPath) {
  if (!existsSync(planPath)) {
    return { verdict: 'BLOCK', detail: `Plan file not found: ${planPath}` };
  }
  const content = readFileSync(planPath, 'utf8');

  // Accept any of: a heading "## Preflight Checks", an explicit N/A line,
  // or a heading that starts with "## Preflight" (flexible).
  const hasHeading = /^#{2,6}[ \t]+Preflight[ \t]+Checks/im.test(content);
  const hasNA = /#{2,6}[ \t]+Preflight[ \t]+Checks[^\n]*\n[\s\S]{0,200}N\/A/im.test(content) ||
    /Preflight Checks:[ \t]*N\/A/i.test(content) ||
    /No preflight checks required/i.test(content);

  if (hasHeading) {
    return { verdict: 'PASS', detail: '## Preflight Checks section present.' };
  }
  if (hasNA) {
    return { verdict: 'PASS', detail: 'Preflight Checks explicitly declared N/A.' };
  }
  return {
    verdict: 'WARN',
    detail:
      'Plan has no "## Preflight Checks" section and no explicit N/A declaration. If this task has no preflight items, add a line stating so; otherwise add the section.',
  };
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) {
    process.stderr.write('Usage: check-exec-readiness.mjs <TASK_ID> [SPRINT]\n');
    process.exit(2);
  }

  const meta = inferTaskMetaFromCsv(taskId);
  const sprint = sprintArg ?? meta?.sprint;
  const deps = meta?.deps ?? [];

  if (!sprint) {
    process.stderr.write(
      `[exec-readiness] Could not infer sprint for ${taskId}. Pass explicitly.\n`
    );
    process.exit(2);
  }

  const taskJsonPath = findTaskJsonPath(sprint, taskId);
  const planPath = join(
    SPECIFY_ROOT,
    `sprint-${sprint}`,
    'planning',
    `${taskId}-plan.md`
  );

  const results = [];
  results.push({
    id: 1,
    name: 'Task JSON $schema path resolves',
    ...(taskJsonPath
      ? check1SchemaPath(taskJsonPath)
      : { verdict: 'BLOCK', detail: `Task JSON not found for ${taskId} in sprint ${sprint}.` }),
  });
  results.push({
    id: 2,
    name: 'Exec session-start metrics recorded',
    ...(taskJsonPath
      ? check2SessionStartRecorded(taskJsonPath)
      : { verdict: 'BLOCK', detail: 'Task JSON missing — cannot check session start.' }),
  });
  results.push({
    id: 3,
    name: 'Coverage before-capture snapshot',
    ...check3CoverageBeforeCapture(taskId),
  });
  results.push({
    id: 4,
    name: 'Dependency attestations on disk',
    ...check4DepDeepVerification(deps),
  });
  results.push({
    id: 5,
    name: 'Plan has Preflight Checks section (or N/A)',
    ...check5PlanPreflightSection(planPath),
  });

  // Emit a compact table.
  process.stdout.write(`\n[exec-readiness] ${taskId} — sprint ${sprint}\n`);
  let blockCount = 0;
  for (const r of results) {
    const symbol = r.verdict === 'PASS' ? '✓' : r.verdict === 'WARN' ? '⚠' : '✗';
    process.stdout.write(
      `  ${symbol} (${r.id}) ${r.name.padEnd(50)} ${r.verdict}\n      ${r.detail}\n`
    );
    if (r.verdict === 'BLOCK') blockCount++;
  }

  if (blockCount === 0) {
    process.stdout.write(
      `\n[exec-readiness] OK — ${results.length} checks (${results.filter((r) => r.verdict === 'WARN').length} WARN, 0 BLOCK). Safe to proceed to Phase 2.\n`
    );
    process.exit(0);
  }

  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `  BLOCK: Exec Readiness preflight — ${blockCount} of 5 checks failed\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `  Fix each BLOCKed row above, then rerun:\n` +
      `    node tools/scripts/exec-preflight/check-exec-readiness.mjs ${taskId}\n` +
      `  Source memory: feedback_exec_phase1_preflight.md\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  process.exit(1);
}

main();
