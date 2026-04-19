#!/usr/bin/env node
/**
 * Workflow Execution Audit
 *
 * Reads every artifact a task is expected to leave on disk at each phase of
 * /spec-session → /plan-session → /exec and reports PASS / WARN / BLOCK /
 * MISSING per phase. Designed so "did the agent skip step X?" becomes a
 * single command.
 *
 * Inventory sources (all mapped by the three skill agents on 2026-04-16):
 *   - .claude/skills/spec-session/**
 *   - .claude/skills/plan-session/**
 *   - .claude/skills/exec/**
 *   - Sub-skills: spec-exploration, spec-consensus, hydrate-context,
 *     exec-metrics, exec-coverage, exec-gates, exec-attestation,
 *     compliance-check
 *   - .claude/agents/plan-reviewer.md
 *
 * Phases whose outputs are transient (in-flight agent messages, CSV edits
 * that get overwritten, log files inside /matop) are marked "NOT AUDITABLE
 * POST-HOC" with a reason — better honest than a false green.
 *
 * Usage:
 *   node tools/scripts/audit-workflow-execution.mjs <TASK_ID> [--json]
 *
 * Exit codes:
 *   0 — every MANDATORY phase PASS (WARN and N/A ok)
 *   1 — one or more MANDATORY phases BLOCK or MISSING
 *   2 — usage / IO error
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);
const METRICS_ROOT = join(REPO_ROOT, 'apps/project-tracker/docs/metrics');
const SPECIFY_ROOT = join(REPO_ROOT, '.specify/sprints');

const args = process.argv.slice(2);
const TASK_ID = args.find((a) => !a.startsWith('--'));
const JSON_MODE = args.includes('--json');

if (!TASK_ID) {
  process.stderr.write('Usage: audit-workflow-execution.mjs <TASK_ID> [--json]\n');
  process.exit(2);
}

// ─── CSV helpers ────────────────────────────────────────────────────────────

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

function getTaskMeta(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const csv = readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = (name) => header.findIndex((h) => h.trim() === name);
  for (const line of lines.slice(1)) {
    if (!line.startsWith(`${taskId},`)) continue;
    const cells = parseCsvLine(line);
    return {
      sprint: cells[col('Target Sprint')]?.trim(),
      status: cells[col('Status')]?.trim(),
      section: cells[col('Section')]?.trim(),
      description: cells[col('Description')]?.trim(),
      deps: (cells[col('Dependencies')] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      prereqs: cells[col('Pre-requisites')] ?? '',
      artifactsToTrack: cells[col('Artifacts To Track')] ?? '',
    };
  }
  return null;
}

const meta = getTaskMeta(TASK_ID);
if (!meta || !meta.sprint) {
  process.stderr.write(`Task ${TASK_ID} not found or missing Target Sprint in CSV.\n`);
  process.exit(2);
}

const SPRINT_ROOT = join(SPECIFY_ROOT, `sprint-${meta.sprint}`);
const CTX_DIR = join(SPRINT_ROOT, 'context', TASK_ID);
const SPEC_PATH = join(SPRINT_ROOT, 'specifications', `${TASK_ID}-spec.md`);
const DISCUSSION_PATH = join(SPRINT_ROOT, 'specifications', `${TASK_ID}-discussion.md`);
const PLAN_PATH = join(SPRINT_ROOT, 'planning', `${TASK_ID}-plan.md`);
const ATTEST_DIR = join(SPRINT_ROOT, 'attestations', TASK_ID);
const EXEC_DIR = join(SPRINT_ROOT, 'execution', TASK_ID);

// ─── Utility: read optional JSON/text ───────────────────────────────────────

function readTextSafe(path) { return existsSync(path) ? readFileSync(path, 'utf8') : null; }
function readJsonSafe(path) {
  const t = readTextSafe(path); if (t === null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

// ─── Task JSON lookup ───────────────────────────────────────────────────────

function findTaskJson() {
  const sprintDir = join(METRICS_ROOT, `sprint-${meta.sprint}`);
  if (!existsSync(sprintDir)) return null;
  const direct = join(sprintDir, `${TASK_ID}.json`);
  if (existsSync(direct)) return direct;
  for (const entry of readdirSync(sprintDir)) {
    const full = join(sprintDir, entry);
    try {
      const list = readdirSync(full);
      if (list.includes(`${TASK_ID}.json`)) return join(full, `${TASK_ID}.json`);
      for (const sub of list) {
        const subFull = join(full, sub);
        try {
          const subList = readdirSync(subFull);
          if (subList.includes(`${TASK_ID}.json`)) return join(subFull, `${TASK_ID}.json`);
        } catch { /* not a dir */ }
      }
    } catch { /* not a dir */ }
  }
  return null;
}

const taskJsonPath = findTaskJson();
const taskJson = taskJsonPath ? readJsonSafe(taskJsonPath) : null;

// ─── Helper: dep attestation lookup ─────────────────────────────────────────

function depAttestationExists(depId) {
  if (!existsSync(SPECIFY_ROOT)) return false;
  for (const sprintDir of readdirSync(SPECIFY_ROOT)) {
    if (existsSync(join(SPECIFY_ROOT, sprintDir, 'attestations', depId, 'attestation.json'))) return true;
  }
  return false;
}

// ─── Signals for each phase ─────────────────────────────────────────────────

// Detect if this is a UI task (needs phases 0.76 / 0.77 / Gate 2d / etc.)
function isUITask() {
  if (TASK_ID.startsWith('PG-')) return true;
  if (/page\.tsx|components\/|apps\/web/i.test(meta.artifactsToTrack)) return true;
  const plan = readTextSafe(PLAN_PATH);
  if (plan && /page\.tsx/i.test(plan)) return true;
  return false;
}

function hasBackendFiles() {
  const plan = readTextSafe(PLAN_PATH) ?? '';
  return /\.router\.ts|\.service\.ts|\.repository\.ts|container\.ts/i.test(plan);
}

const UI = isUITask();
const BACKEND = hasBackendFiles();

// ─── Phase checkers ─────────────────────────────────────────────────────────

const phases = [];

function push(section, id, name, verdict, detail, mandatory = true) {
  phases.push({ section, id, name, verdict, detail, mandatory });
}

// ── Spec session ────────────────────────────────────────────────────────────

// Phase 0 Context Hydration
{
  const jsonPath = join(CTX_DIR, `${TASK_ID}-hydrated-context.json`);
  const mdPath = join(CTX_DIR, `${TASK_ID}-hydrated-context.md`);
  const hasBoth = existsSync(jsonPath) && existsSync(mdPath);
  push('SPEC', '0', 'Context Hydration',
    hasBoth ? 'PASS' : 'MISSING',
    hasBoth ? `${jsonPath.replace(REPO_ROOT + '\\', '')} + .md` : 'Missing hydrated-context .json or .md');
}

// Phase 0.5 Agent Selection
{
  const path = join(CTX_DIR, `${TASK_ID}-agent-selection.json`);
  const json = readJsonSafe(path);
  const agentCount = Array.isArray(json?.agents) ? json.agents.length : 0;
  const hasCore = json?.agents?.some((a) => a.name === 'Domain-Expert')
    && json?.agents?.some((a) => a.name === 'Test-Engineer');
  if (!existsSync(path)) push('SPEC', '0.5', 'Agent Selection', 'MISSING', 'agent-selection.json missing');
  else if (agentCount < 3 || agentCount > 5)
    push('SPEC', '0.5', 'Agent Selection', 'WARN', `expected 3-5 agents, found ${agentCount}`);
  else if (!hasCore)
    push('SPEC', '0.5', 'Agent Selection', 'WARN', 'missing mandatory Domain-Expert or Test-Engineer');
  else push('SPEC', '0.5', 'Agent Selection', 'PASS',
    `${agentCount} agents; lead=${json?.lead_agent ?? 'unspecified'}`);
}

// Phase 0.75 Codebase Exploration — evidence is file:line citations in discussion ANALYSIS
{
  const disc = readTextSafe(DISCUSSION_PATH);
  if (!disc) push('SPEC', '0.75', 'Codebase Exploration', 'MISSING', 'no discussion file');
  else {
    const hasCites = /[a-zA-Z_/\-]+\.(ts|tsx|prisma|md)(:\d+|\b)/i.test(disc);
    const hasAnalysis = /ANALYSIS|Round\s*1|Phase\s*1/i.test(disc);
    if (hasCites && hasAnalysis)
      push('SPEC', '0.75', 'Codebase Exploration', 'PASS', 'file citations present in discussion');
    else push('SPEC', '0.75', 'Codebase Exploration', 'WARN',
      'discussion missing file:line citations or ANALYSIS section — may have been condensed');
  }
}

// Phase 0.76 Shared Component Audit (UI only)
{
  const json = readJsonSafe(join(CTX_DIR, `${TASK_ID}-hydrated-context.json`));
  const hasAudit = json?.shared_component_audit != null;
  if (!UI) push('SPEC', '0.76', 'Shared Component Audit', 'N/A', 'non-UI task', false);
  else if (hasAudit)
    push('SPEC', '0.76', 'Shared Component Audit', 'PASS',
      `${json.shared_component_audit.reuse_decisions?.length ?? 0} reuse decisions`);
  else push('SPEC', '0.76', 'Shared Component Audit', 'MISSING',
    'hydrated-context.json has no shared_component_audit key (UI task)');
}

// Phase 0.77 Route Conflict Audit (UI only)
{
  const json = readJsonSafe(join(CTX_DIR, `${TASK_ID}-hydrated-context.json`));
  const hasAudit = json?.route_conflict_audit != null;
  if (!UI) push('SPEC', '0.77', 'Route Conflict Audit', 'N/A', 'non-UI task', false);
  else if (hasAudit)
    push('SPEC', '0.77', 'Route Conflict Audit', 'PASS',
      `${json.route_conflict_audit.conflicts_found?.length ?? 0} conflicts examined`);
  else push('SPEC', '0.77', 'Route Conflict Audit', 'MISSING',
    'hydrated-context.json has no route_conflict_audit key (UI task)');
}

// Phase 0.9 Dependency Chain Verification — section in spec
{
  const spec = readTextSafe(SPEC_PATH);
  if (!spec) push('SPEC', '0.9', 'Dependency Chain Verification', 'MISSING', 'no spec file');
  else {
    const has = /##+\s+(Dependency Chain|Dependencies Used|Dependencies Verified|Integration Points)|Dependencies\s+Used\s*\(Completed/i.test(spec);
    push('SPEC', '0.9', 'Dependency Chain Verification',
      has ? 'PASS' : 'WARN',
      has ? 'section present in spec' : 'spec missing Dependency Chain / Verified section');
  }
}

// Phase 0.95 Dependency Deep Verification — all dep attestations on disk
{
  if (meta.deps.length === 0)
    push('SPEC', '0.95', 'Dependency Deep Verification', 'N/A', 'no declared dependencies', false);
  else {
    const missing = meta.deps.filter((d) => !depAttestationExists(d));
    if (missing.length === 0)
      push('SPEC', '0.95', 'Dependency Deep Verification', 'PASS',
        `${meta.deps.length}/${meta.deps.length} dep attestations located`);
    else push('SPEC', '0.95', 'Dependency Deep Verification', 'BLOCK',
      `missing attestations for: ${missing.join(', ')}`);
  }
}

// Phase 0.97 PRD/ADR Resolution
{
  const spec = readTextSafe(SPEC_PATH);
  if (!spec) push('SPEC', '0.97', 'PRD/ADR Resolution', 'MISSING', 'no spec file');
  else {
    const hasRelated = /##+\s+Related Documents/i.test(spec);
    const prdRefs = [...spec.matchAll(/docs\/planning\/prd-[^\s)'"`|]+\.md/g)].map((m) => m[0]);
    const adrRefs = [...spec.matchAll(/docs\/architecture\/adr\/(ADR-\d+[^\s)'"`|]*\.md)/g)].map((m) => m[0]);
    const unresolved = [...prdRefs, ...adrRefs].filter((p) => !existsSync(join(REPO_ROOT, p)));
    if (!hasRelated) push('SPEC', '0.97', 'PRD/ADR Resolution', 'BLOCK', 'spec missing ## Related Documents');
    else if (unresolved.length > 0)
      push('SPEC', '0.97', 'PRD/ADR Resolution', 'BLOCK',
        `referenced but missing: ${unresolved.slice(0, 3).join(', ')}`);
    else
      push('SPEC', '0.97', 'PRD/ADR Resolution', 'PASS',
        `Related Documents; ${prdRefs.length} PRD / ${adrRefs.length} ADR refs resolve`);
  }
}

// Phase 1-4 Rounds (ANALYSIS / PROPOSAL / CHALLENGE / CONSENSUS)
{
  const disc = readTextSafe(DISCUSSION_PATH);
  if (!disc) push('SPEC', '1-4', 'Round headings', 'MISSING', 'no discussion file');
  else {
    const rounds = ['ANALYSIS', 'PROPOSAL', 'CHALLENGE', 'CONSENSUS'];
    const found = rounds.filter((r) => new RegExp(`##+.*\\b${r}\\b`, 'i').test(disc)
      || new RegExp(`Round\\s*[1-4].*${r}`, 'i').test(disc));
    if (found.length === 4)
      push('SPEC', '1-4', 'Round headings', 'PASS', `${found.length}/4 rounds logged`);
    else
      push('SPEC', '1-4', 'Round headings', 'WARN',
        `only ${found.length}/4 rounds found in discussion — may be condensed (${found.join(', ')})`);
  }
}

// Phase 5 Spec Output
{
  const bothExist = existsSync(SPEC_PATH) && existsSync(DISCUSSION_PATH);
  push('SPEC', '5', 'Spec Output',
    bothExist ? 'PASS' : 'MISSING',
    bothExist ? `spec + discussion present` : 'spec or discussion missing');
}

// ── Plan session ────────────────────────────────────────────────────────────

const plan = readTextSafe(PLAN_PATH);

push('PLAN', '0', 'Load Spec + Prereqs',
  existsSync(SPEC_PATH) ? 'PASS' : 'MISSING',
  existsSync(SPEC_PATH) ? 'spec exists' : 'spec missing');

// Phase 1 Dependency chain + deep verification
push('PLAN', '1', 'Dependency Deep Verify',
  plan && /##+\s+Dependencies Verified/i.test(plan) ? 'PASS' : 'WARN',
  plan ? (plan.match(/Dependencies Verified/i) ? 'section present' : 'missing Dependencies Verified section') : 'no plan');

// Phase 2 TDD decomposition
if (!plan) push('PLAN', '2', 'TDD Decomposition', 'MISSING', 'no plan file');
else {
  const hasRed = /Phase\s*1\s*[—-]\s*RED|###+\s*Red\b/i.test(plan);
  const hasGreen = /Phase\s*2\s*[—-]\s*GREEN|###+\s*Green\b/i.test(plan);
  const hasRef = /Phase\s*3\s*[—-]\s*REFACTOR/i.test(plan);
  const hasVal = /Phase\s*4\s*[—-]\s*VALIDATION|##+\s+Validation Matrix/i.test(plan);
  const count = [hasRed, hasGreen, hasRef, hasVal].filter(Boolean).length;
  push('PLAN', '2', 'TDD Decomposition',
    count === 4 ? 'PASS' : 'WARN',
    `RED/GREEN/REFACTOR/VALIDATION headings: ${count}/4`);
}

// Phase 3 CSV artifact alignment — not reliably auditable post-hoc
push('PLAN', '3', 'CSV Artifact Alignment', 'N/A',
  'NOT AUDITABLE POST-HOC (dynamic check; run validate-artifacts.ts manually)', false);

// Phase 4 Plan-Reviewer subagent
if (!plan) push('PLAN', '4', 'Plan-Reviewer Subagent', 'MISSING', 'no plan file');
else {
  const marker = /<!--\s*plan-reviewer\s*:\s*subagent\s*-->|reviewer_subagent\s*:\s*\S+|Subagent\s+transcript\s*:/i.test(plan);
  const selfReview = /\bself[\s-]?review\b/i.test(plan);
  if (marker) push('PLAN', '4', 'Plan-Reviewer Subagent', 'PASS', 'subagent marker present');
  else if (selfReview) push('PLAN', '4', 'Plan-Reviewer Subagent', 'BLOCK',
    'self-review language with no subagent marker');
  else push('PLAN', '4', 'Plan-Reviewer Subagent', 'WARN',
    'no Plan-Reviewer Sign-off section — ok only for trivial tasks');
}

// Phase 5 Plan Output
push('PLAN', '5', 'Plan Output',
  plan ? 'PASS' : 'MISSING',
  plan ? `${PLAN_PATH.replace(REPO_ROOT + '\\', '')} exists` : 'plan file missing');

// ── Exec preflights (call out the four scripts; don't re-run them here) ────

const preflights = [
  { name: 'Page Doc Co-Change', script: 'tools/scripts/exec-preflight/check-page-doc-cochange.mjs' },
  { name: 'Plan-Reviewer Subagent', script: 'tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs' },
  { name: 'Exec Readiness bundle', script: 'tools/scripts/exec-preflight/check-exec-readiness.mjs' },
  { name: 'Task JSON schema sweep', script: 'tools/scripts/validate-task-json-schemas.mjs' },
];
for (const p of preflights) {
  const ok = existsSync(join(REPO_ROOT, p.script));
  push('PREFLIGHT', '—', p.name,
    ok ? 'INFO' : 'MISSING',
    ok ? `script exists: ${p.script}` : `SCRIPT MISSING: ${p.script}`,
    false);
}

// ── Exec session ────────────────────────────────────────────────────────────

// Phase 0 session-start metrics
if (!taskJson) push('EXEC', '0', 'Session-start Metrics', 'MISSING', 'task JSON not found');
else {
  const ok = typeof taskJson.started_at === 'string'
    && Array.isArray(taskJson.status_history)
    && taskJson.status_history.length > 0;
  push('EXEC', '0', 'Session-start Metrics',
    ok ? 'PASS' : 'MISSING',
    ok ? `started_at=${taskJson.started_at}; ${taskJson.status_history.length} transitions` : 'missing started_at or status_history');
}

// Phase 1 Context load — implicit if Phase 1.5 ran; check context_ack
push('EXEC', '1', 'Context Load', plan && existsSync(SPEC_PATH) ? 'PASS' : 'MISSING',
  'spec + plan present (context was loaded if subsequent phases ran)');

// Phase 1.3 PRD/ADR verification — already covered by Phase 0.97 above
push('EXEC', '1.3', 'PRD/ADR Verification',
  phases.find((p) => p.id === '0.97')?.verdict ?? 'MISSING',
  'mirrors spec phase 0.97', false);

// Phase 1.4 Preflight Checkbox Enforcement
if (!plan) push('EXEC', '1.4', 'Preflight Checkboxes', 'MISSING', 'no plan');
else {
  const preflightSection = plan.match(/##+\s+Preflight Checks[\s\S]*?(?=\n##+\s|$)/i)?.[0] ?? '';
  if (!preflightSection) push('EXEC', '1.4', 'Preflight Checkboxes', 'WARN',
    'plan has no "## Preflight Checks" section');
  else {
    const unchecked = (preflightSection.match(/^-\s+\[ \]/gm) ?? []).length;
    const checked = (preflightSection.match(/^-\s+\[x\]/gim) ?? []).length;
    push('EXEC', '1.4', 'Preflight Checkboxes',
      unchecked === 0 && checked > 0 ? 'PASS' : (unchecked > 0 ? 'BLOCK' : 'WARN'),
      `${checked} checked / ${unchecked} unchecked in Preflight section`);
  }
}

// Phase 1.5 Context Ack (conditional on CSV EVIDENCE:context_ack.json)
{
  const required = /EVIDENCE:context_ack\.json/i.test(meta.artifactsToTrack);
  const ack = readJsonSafe(join(ATTEST_DIR, 'context_ack.json'));
  if (!required) push('EXEC', '1.5', 'Context Acknowledgement Gate', 'N/A',
    'CSV Artifacts To Track does not require context_ack.json', false);
  else if (!ack) push('EXEC', '1.5', 'Context Acknowledgement Gate', 'BLOCK',
    'context_ack.json missing — required by CSV EVIDENCE:context_ack.json');
  else {
    const files = Array.isArray(ack.files_read) ? ack.files_read.length : 0;
    const validHashes = ack.files_read?.every((f) => typeof f.sha256 === 'string' && f.sha256.length === 64 && !/^0+$/.test(f.sha256)) ?? false;
    if (!validHashes) push('EXEC', '1.5', 'Context Acknowledgement Gate', 'BLOCK',
      'context_ack.json has zero-hash or malformed sha256 entries');
    else push('EXEC', '1.5', 'Context Acknowledgement Gate', 'PASS',
      `${files} files with valid sha256 hashes`);
  }
}

// Phase 2 TDD Implementation — measured by plan checkbox ratio
if (!plan) push('EXEC', '2', 'TDD Implementation', 'MISSING', 'no plan');
else {
  const unchecked = (plan.match(/^-\s+\[ \]/gm) ?? []).length;
  const checked = (plan.match(/^-\s+\[x\]/gim) ?? []).length;
  const total = unchecked + checked;
  const pct = total === 0 ? 0 : Math.round(checked / total * 100);
  if (total === 0) push('EXEC', '2', 'TDD Implementation', 'WARN', 'plan has no checkboxes');
  else if (unchecked === 0) push('EXEC', '2', 'TDD Implementation', 'PASS', `100% (${checked}/${total})`);
  else push('EXEC', '2', 'TDD Implementation',
    pct >= 50 ? 'PARTIAL' : 'IN_PROGRESS',
    `${pct}% complete (${checked}/${total} checkboxes)`);
}

// Phase 2.5 Container Registration
{
  if (!BACKEND) push('EXEC', '2.5', 'Container Registration', 'N/A',
    'no backend files detected in plan', false);
  else {
    const routerTxt = readTextSafe(join(REPO_ROOT, 'apps/api/src/router.ts'));
    // Only count routers introduced in plan's "Files to Create" section —
    // reference citations in the Related Documents / header would otherwise
    // trigger false BLOCKs for contact-settings.router.ts etc.
    const createSection = plan?.match(/###+\s+CREATE[\s\S]*?(?=\n###+\s+(MODIFY|DELETE|$))/i)?.[0] ?? '';
    const routerMatches = [...new Set((createSection.match(/([a-zA-Z-]+\.router\.ts)/g) ?? []))]
      .map((m) => {
        // e.g. "deal-settings.router.ts" → "dealSettingsRouter"
        const stem = m.replace('.router.ts', '');
        return stem.split('-').map((seg, i) => i === 0 ? seg : seg[0].toUpperCase() + seg.slice(1)).join('') + 'Router';
      });
    const registered = routerMatches.filter((r) => routerTxt?.includes(r));
    push('EXEC', '2.5', 'Container Registration',
      routerMatches.length === 0 ? 'WARN'
        : registered.length === routerMatches.length ? 'PASS' : 'BLOCK',
      `${registered.length}/${routerMatches.length} routers found in apps/api/src/router.ts`);
  }
}

// Phase 3 MATOP Validation — evidence is execution/{run_id}/matop/stoa-verdicts/*.json
{
  if (!existsSync(EXEC_DIR)) push('EXEC', '3', 'MATOP Validation', 'MISSING', 'no execution/ directory');
  else {
    const runs = readdirSync(EXEC_DIR).filter((r) => existsSync(join(EXEC_DIR, r, 'matop', 'stoa-verdicts')));
    if (runs.length === 0) push('EXEC', '3', 'MATOP Validation', 'MISSING',
      `${EXEC_DIR} has no matop/stoa-verdicts/ yet`);
    else {
      const latest = runs[runs.length - 1];
      const verdictFiles = readdirSync(join(EXEC_DIR, latest, 'matop', 'stoa-verdicts'));
      const verdicts = verdictFiles.map((f) => readJsonSafe(join(EXEC_DIR, latest, 'matop', 'stoa-verdicts', f)));
      const fails = verdicts.filter((v) => v?.verdict === 'FAIL').length;
      push('EXEC', '3', 'MATOP Validation',
        fails === 0 && verdicts.length > 0 ? 'PASS' : 'BLOCK',
        `${verdicts.length} STOA verdicts in run ${latest}; fails=${fails}`);
    }
  }
}

// Phase 4 Delivery Report
{
  if (!existsSync(EXEC_DIR)) push('EXEC', '4', 'Delivery Report', 'MISSING', 'no execution/ directory');
  else {
    const runs = readdirSync(EXEC_DIR);
    const delivery = runs.map((r) => join(EXEC_DIR, r, `${TASK_ID}-delivery.md`)).find(existsSync);
    push('EXEC', '4', 'Delivery Report',
      delivery ? 'PASS' : 'MISSING',
      delivery ? delivery.replace(REPO_ROOT + '\\', '') : 'no {TASK_ID}-delivery.md in any run dir');
  }
}

// Phase 4.5 Completion Gates — evidence in attestation.json gate_results
{
  const att = readJsonSafe(join(ATTEST_DIR, 'attestation.json'));
  if (!att) push('EXEC', '4.5', 'Completion Gates', 'MISSING', 'attestation.json missing');
  else {
    const gates = Array.isArray(att.gate_results) ? att.gate_results : [];
    const fails = gates.filter((g) => g.passed === false).length;
    push('EXEC', '4.5', 'Completion Gates',
      gates.length === 0 ? 'BLOCK' : fails === 0 ? 'PASS' : 'BLOCK',
      `${gates.length} gates recorded; ${fails} failed`);
  }
}

// Phase 4.6 Compliance Check
{
  const att = readJsonSafe(join(ATTEST_DIR, 'attestation.json'));
  if (!att) push('EXEC', '4.6', 'Compliance Check', 'MISSING', 'no attestation.json');
  else {
    const notes = att.notes ?? '';
    const has = /compliance(-check)?.*(PASS|passed)/i.test(notes);
    push('EXEC', '4.6', 'Compliance Check',
      has ? 'PASS' : 'WARN',
      has ? 'attestation notes cite compliance PASS' : 'attestation notes do not mention compliance — WARN');
  }
}

// Phase 5 Attestation
{
  const att = readJsonSafe(join(ATTEST_DIR, 'attestation.json'));
  if (!att) push('EXEC', '5', 'Attestation', 'MISSING', 'attestation.json missing');
  else {
    const vr = Array.isArray(att.validation_results) ? att.validation_results : [];
    const names = vr.map((r) => r.name).sort().join(',');
    const expected = 'Build,Lint,Tests,TypeScript';
    const verdictOk = att.verdict === 'COMPLETE';
    if (!verdictOk) push('EXEC', '5', 'Attestation', 'BLOCK',
      `verdict="${att.verdict ?? '<unset>'}" (expected "COMPLETE"); or task not yet complete`);
    else if (names !== expected) push('EXEC', '5', 'Attestation', 'BLOCK',
      `validation_results names are [${names}] not [${expected}]`);
    else push('EXEC', '5', 'Attestation', 'PASS', 'verdict=COMPLETE; 4/4 validation_results');
  }
}

// Phase 6+ Session-end metrics
{
  if (!taskJson) push('EXEC', '6+', 'Session-end Metrics', 'MISSING', 'no task JSON');
  else {
    const hasEnd = !!taskJson.completed_at;
    const validations = Array.isArray(taskJson.validations) ? taskJson.validations.length : 0;
    push('EXEC', '6+', 'Session-end Metrics',
      hasEnd && validations >= 4 ? 'PASS' : hasEnd ? 'WARN' : 'MISSING',
      hasEnd ? `completed_at=${taskJson.completed_at}; ${validations} validations logged` : 'completed_at not set');
  }
}

// ─── Emit ──────────────────────────────────────────────────────────────────

function verdictSymbol(v) {
  return {
    PASS: '✓', WARN: '⚠', BLOCK: '✗', MISSING: '✗',
    'N/A': '—', PARTIAL: '⋯', IN_PROGRESS: '⋯', INFO: 'ℹ',
  }[v] ?? '?';
}

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({
    task_id: TASK_ID, sprint: meta.sprint, status: meta.status,
    ui_task: UI, has_backend: BACKEND,
    phases,
    summary: {
      total: phases.length,
      mandatory: phases.filter((p) => p.mandatory).length,
      pass: phases.filter((p) => p.verdict === 'PASS').length,
      warn: phases.filter((p) => p.verdict === 'WARN').length,
      block: phases.filter((p) => p.verdict === 'BLOCK' || p.verdict === 'MISSING').length,
      partial: phases.filter((p) => p.verdict === 'PARTIAL' || p.verdict === 'IN_PROGRESS').length,
    },
  }, null, 2) + '\n');
} else {
  const header = `WORKFLOW AUDIT: ${TASK_ID}  —  sprint-${meta.sprint}  —  CSV status: ${meta.status}`;
  process.stdout.write('\n' + header + '\n' + '═'.repeat(header.length) + '\n');
  process.stdout.write(`task type: ${UI ? 'UI' : 'non-UI'} / ${BACKEND ? 'has backend' : 'no backend'}\n\n`);

  const sections = ['SPEC', 'PLAN', 'PREFLIGHT', 'EXEC'];
  for (const section of sections) {
    const rows = phases.filter((p) => p.section === section);
    if (rows.length === 0) continue;
    process.stdout.write(`${section} SESSION\n`);
    for (const r of rows) {
      const sym = verdictSymbol(r.verdict);
      const idCol = String(r.id).padEnd(5);
      const nameCol = r.name.padEnd(36);
      const verCol = r.verdict.padEnd(12);
      process.stdout.write(`  ${sym} ${idCol} ${nameCol} ${verCol} ${r.detail}\n`);
    }
    process.stdout.write('\n');
  }

  const blocks = phases.filter((p) => p.mandatory && (p.verdict === 'BLOCK' || p.verdict === 'MISSING'));
  const pass = phases.filter((p) => p.verdict === 'PASS').length;
  const total = phases.length;
  process.stdout.write(`OVERALL: ${pass}/${total} PASS, ${blocks.length} mandatory BLOCK/MISSING\n`);
  if (blocks.length > 0) {
    process.stdout.write('\nBLOCKERS:\n');
    for (const b of blocks) process.stdout.write(`  - ${b.section} ${b.id} ${b.name}: ${b.detail}\n`);
  }
  process.stdout.write('\n');
}

process.exit(phases.filter((p) => p.mandatory && (p.verdict === 'BLOCK' || p.verdict === 'MISSING')).length > 0 ? 1 : 0);
