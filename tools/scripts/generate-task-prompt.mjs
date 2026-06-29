#!/usr/bin/env node
/**
 * generate-task-prompt.mjs — deterministic per-task agent-dispatch prompt generator.
 *
 * Replaces hand-writing a full worktree-agent prompt for every Sprint-18 task. The
 * orchestrator (or the /dispatch-task skill) runs this; stdout IS the prompt to hand to a
 * fresh `task-executor` agent/session. Deterministic input → identical output, so the
 * "mistakes and mismatches" of hand-editing (wrong max-iter, missing gotcha, stale persona,
 * forgotten DB-target warning) cannot creep in.
 *
 * Usage:
 *   node tools/scripts/generate-task-prompt.mjs <TASK-ID> [--main-sha <sha>] [--slot <n>] [--total <n>]
 *
 * Sources:
 *   - apps/project-tracker/docs/metrics/_global/Sprint_plan.csv  (sprint, description, deps, status)
 *   - docs/operations/task-assignment-matrix.json                (persona, STOA, skills, max-iter)
 *   - docs/operations/sprint-18-orchestrator-prompt.md           (the full plan, referenced)
 *
 * Exit codes:
 *   0 — prompt emitted on stdout
 *   1 — task not found / matrix unreadable (message on stderr)
 *   3 — task is already DONE on main (refusal + reconcile guidance on stdout; NOT a dispatchable build)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Papa from 'papaparse';

// Resolve the MAIN repo root (the primary worktree), NOT the current dir — so a prompt generated
// from a linked worktree still names the canonical control-plane path the agent runs from. (PG-058
// baked the temporary iflow-fleet worktree path into the prompt because this used process.cwd().)
function resolveMainRepoRoot() {
  try {
    const out = execSync('git worktree list --porcelain', { encoding: 'utf8' });
    const m = out.match(/^worktree (.+)$/m); // the first entry is always the main worktree
    if (m) return m[1].trim().replace(/\\/g, '/');
  } catch {
    /* not a git repo / git unavailable — fall back to cwd */
  }
  return process.cwd().replace(/\\/g, '/');
}
const REPO_ROOT = resolveMainRepoRoot();
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TASK_ID = (args.find((a) => !a.startsWith('--')) || '').trim().toUpperCase();
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!TASK_ID) {
  process.stderr.write('Usage: generate-task-prompt.mjs <TASK-ID> [--main-sha <sha>] [--slot n] [--total n]\n');
  process.exit(1);
}
const SLOT = flag('slot');
const TOTAL = flag('total') || '3';
const CLI = args.includes('--cli'); // emit a standalone-CLI-session prompt (manual worktree) vs harness-managed

// ── resolve main SHA (caller may override; else read origin/main) ──────────
let MAIN_SHA = flag('main-sha');
if (!MAIN_SHA) {
  try {
    MAIN_SHA = execSync('git rev-parse --short origin/main', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    MAIN_SHA = '<run: git rev-parse --short origin/main>';
  }
}

// ── load matrix ─────────────────────────────────────────────────────────────
const matrixPath = join(REPO_ROOT, 'docs', 'operations', 'task-assignment-matrix.json');
if (!existsSync(matrixPath)) {
  process.stderr.write(`Assignment matrix not found: ${matrixPath}\n`);
  process.exit(1);
}
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));

// ── load CSV row ────────────────────────────────────────────────────────────
const csvPath = join(REPO_ROOT, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
if (!existsSync(csvPath)) {
  process.stderr.write(`Sprint_plan.csv not found: ${csvPath}\n`);
  process.exit(1);
}
const { data: rows } = Papa.parse(readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true });
const row = rows.find((r) => (r['Task ID'] || '').trim().toUpperCase() === TASK_ID);
if (!row) {
  process.stderr.write(`Task ${TASK_ID} not found in Sprint_plan.csv\n`);
  process.exit(1);
}

const rawSprint = (row['Target Sprint'] || '').trim();
const SPRINT = rawSprint === 'Continuous' ? '0' : (String(parseInt(rawSprint, 10) || '18'));
const DESCRIPTION = (row['Description'] || '').trim();
const DEPS = (row['Dependencies'] || '').trim() || 'none';
const CSV_STATUS = (row['Status'] || '').trim();

// ── artifact precheck: warn if the task's required source artifacts ALREADY exist on origin/main ──
// (PG-058 wasted discovery time learning dashboard/page.tsx was already shipped by PG-129.) Strip the
// ARTIFACT:/FILE:/EVIDENCE: prefixes, keep real source files, and git-check each against origin/main.
const artifactPaths = (row['Artifacts To Track'] || '')
  .split(';')
  .map((s) => s.trim().replace(/^[A-Z]+:/, '').trim())
  .filter((s) => /\.(tsx?|jsx?|mjs|cjs|prisma|css|scss)$/i.test(s) && !s.startsWith('.specify/'));
const existingArtifacts = artifactPaths.filter((p) => {
  try {
    execFileSync('git', ['cat-file', '-e', `origin/main:${p}`], { cwd: REPO_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
const artifactPrecheck = existingArtifacts.length
  ? `\n⚠ ARTIFACT PRECHECK — ${existingArtifacts.length} required artifact(s) ALREADY exist on origin/main:\n${existingArtifacts
      .map((p) => '   - ' + p)
      .join(
        '\n'
      )}\nThis task is a DELTA / refactor of existing code, NOT a from-scratch build. Read those files FIRST and scope to the gap (spec-session Phase 0 will confirm). Do not re-create what exists.`
  : '';

// ── resolve assignment (explicit → prefix-infer → defaults) ─────────────────
const d = matrix.defaults;
let a = matrix.tasks[TASK_ID];
if (!a) {
  const prefixRule = Object.entries(d.inferByPrefix || {}).find(([p]) => TASK_ID.startsWith(p));
  a = prefixRule ? { ...prefixRule[1] } : {};
}
const persona = a.persona || d.persona;
const secondary = a.secondary ? ` (+ ${a.secondary} for the secondary surface)` : '';
const stoa = a.stoa || d.stoa;
const skills = (a.skills && a.skills.length) ? a.skills.join(', ') : 'none beyond the pipeline defaults';
const maxIter = a.maxIter || d.maxIterByType.crm;
const lane = a.lane ? `Lane ${a.lane}` : '(unassigned lane)';
const note = a.note ? `\nTASK NOTE (from the plan): ${a.note}` : '';
const blockedBy = a.blockedBy ? `\n⚠ HARD DEP: ${a.blockedBy} must be merged on main first — verify before provisioning.` : '';

const idLower = TASK_ID.toLowerCase();

// ── DONE detection: git is AUTHORITATIVE, not the CSV ───────────────────────
// The CSV Status column is "badly stale" (per the orchestrator prompt) in BOTH directions —
// tasks shipped-but-not-flipped AND tasks flipped-but-never-shipped (e.g. IFC-214). So resolve
// real status from a feature commit on origin/main, filtering out chore/metrics/orchestrator noise.
function featureCommitOnMain(id) {
  try {
    const raw = execSync(`git log origin/main --grep=${id} --oneline`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .find((l) => !/chore\(metrics|orchestrator|attest |chore\(deps|bump /i.test(l)) || null;
  } catch {
    return null; // offline / no git — fall through to matrix flag
  }
}
const onMain = a.done ? '(matrix: verified merged)' : featureCommitOnMain(TASK_ID);

if (a.done || onMain) {
  process.stdout.write(
`REFUSE TO DISPATCH — ${TASK_ID} already has code on main. Building it would duplicate merged work.
  Evidence: ${typeof onMain === 'string' ? onMain : '(matrix done flag)'}

This is NOT a build. Do a RECONCILE-AND-ATTEST instead (no /full-pipeline loop):
  1. ${persona} runs /task-code-audit ${TASK_ID} — does the merged code satisfy the full DoD?
  2. If yes: /compliance-check → /exec-attestation → flip Sprint_plan.csv to Completed → sync.
  3. If a real gap remains: dispatch /full-pipeline ${TASK_ID} for THAT GAP ONLY (it resumes at the right phase).
${note}
`);
  process.exit(3);
}

// CSV says Completed but NO feature commit on main = stale CSV. Dispatch, but warn loudly.
const staleCsvWarning = /^(completed|done)$/i.test(CSV_STATUS)
  ? `\n⚠ STALE CSV: Sprint_plan.csv marks ${TASK_ID} "${CSV_STATUS}" but there is NO feature commit on origin/main. The CSV is wrong — this task is NOT built. Proceed to build it, and the CSV will be corrected on merge.`
  : '';

// ── emit dispatch prompt ────────────────────────────────────────────────────
const slotLine = CLI
  ? `You are a standalone CLI agent session implementing ONE task — ${TASK_ID} — in your OWN git worktree`
  : SLOT
    ? `You are agent session ${SLOT} of ${TOTAL} in a parallel Sprint-${SPRINT} run`
    : `You are one agent session in a ${TOTAL}-agent parallel Sprint-${SPRINT} run`;

const provisionBlock = CLI
  ? `PROVISION — you create your OWN worktree (standalone CLI session, NOT harness-managed). Do NOT
touch the main working dir, local main, or any sibling worktree.
1. From the main repo (${REPO_ROOT}):
   git fetch origin main
   git worktree add -b feat/${idLower} ../iflow-${idLower} origin/main
2. cd ../iflow-${idLower} && pnpm install
3. pnpm exec turbo build --filter='./packages/*'   (turbo is NOT on PATH; use pnpm exec. Libs must be
   built or imports fail.)
4. The committed .env.test points DATABASE_URL at the LOCAL test DB
   (postgresql://postgres:postgres@localhost:5433/intelliflow_test). Verify: docker ps --filter
   name=postgres-test (expect "healthy"). NEVER use .env.local's DATABASE_URL — it is PRODUCTION
   Supabase. Copy other dev vars from .env.local but NOT DATABASE_URL/DIRECT_URL. The local test DB +
   dev ports are SHARED across parallel sessions — cap is 3.
5. export NODE_OPTIONS=--max-old-space-size=8192
When fully merged, from the main repo: git worktree remove --force ../iflow-${idLower} && git worktree
prune (a locked empty dir may remain on Windows — cosmetic).`
  : `PROVISION — you are ALREADY inside a harness-provisioned isolated git worktree, forked from the
control plane which the orchestrator keeps even with origin/main. Do NOT run \`git worktree add\`,
and do NOT \`git worktree remove\` when done — the harness reclaims it. Do NOT touch the main working
dir or any sibling worktree.
1. Create your branch:  git checkout -b feat/${idLower}
2. pnpm install
3. turbo build --filter='./packages/*'   (libs must be built or imports fail)
4. The committed .env.test already points DATABASE_URL at the LOCAL test DB
   (postgresql://postgres:postgres@localhost:5433/intelliflow_test). Verify it's up:
   docker ps --filter name=postgres-test  (expect "healthy"). The test DB and dev ports are
   SHARED across all worktrees — that is why the orchestrator caps concurrency at 3. NEVER use
   .env.local's DATABASE_URL — it is PRODUCTION Supabase. Copy other dev vars from .env.local if
   needed, but NOT DATABASE_URL/DIRECT_URL.
5. export NODE_OPTIONS=--max-old-space-size=8192`;

process.stdout.write(
`${slotLine} for IntelliFlow CRM (${REPO_ROOT}).
main was green at ${MAIN_SHA} when this was generated (a SNAPSHOT — always branch from the LIVE
origin/main, which may be newer). You own ONE task — ${TASK_ID} — in your OWN git worktree.
Do not touch the main working dir or other agents' worktrees.
Full plan: docs/operations/sprint-18-orchestrator-prompt.md (read its "Lessons"/State sections).
You are the \`task-executor\` agent; ADOPT the ${persona} persona (.claude/agents/${persona}.md) as your
load-bearing lens${secondary}. The persona agents are Tier-A reviewers convened inside /spec-session —
you are the Tier-C implementer that actually writes code, runs tests, and ships the PR.

#1 RULE — DO NOT BUILD BEFORE YOU SPEC. This single mistake cost PG-181 ~5 HOURS.
Your FIRST real action is the /loop below. Do NOT write, edit, or design feature code, and NEVER
hand-author the spec or plan files, before /spec-session and /plan-session have run INSIDE the loop
and produced their artifacts. /full-pipeline detects the phase by FILE EXISTENCE, so hand-authoring
spec/plan makes it SKIP the multi-persona spec debate and the real plan-reviewer subagent — the exact
rigor that catches regressions before you build them (on PG-181 the plan-reviewer caught a page-count
break the author had missed and marked "N/A"). Building first also forces error-prone back-filling of
session-start metrics, before-coverage, and the plan-reviewer row — and the gates force a full re-run
anyway, so build-first only wastes hours. Let the pipeline run in order: spec -> plan -> exec. The only
thing you do before the loop is PROVISION (below).

${provisionBlock}

TRACK AS YOU GO (owner-required — this is the feedback loop that turns each run's mistakes into the
next agent's prevention; PG-181's + IFC-302's logs are exactly what was mined to harden this system):
A. TIME. Stamp each milestone: worktree provisioned, spec done, plan done, exec/attestation done, PR
   opened, PR merged. At the end report TOTAL wall-clock split into build/compute vs WAITING on
   pre-ship + CI. Use real timestamps from your own work (commit times, gh pr view --json events) —
   do not guess. For tokens/cost point to /cost; never invent a number.
B. ISSUES LOG. Maintain, as you go, docs/operations/sprint-18-${idLower}-session-issues-log.md — a
   CANDID, severity-ordered record of EVERY issue, mistake, workaround, protocol mismatch, and gate
   failure, each with what happened / why it matters / fix-or-prevention, ending with a "Net
   assessment" naming the single avoidable root cause (if any). Commit it WITH your feature PR.

GATE = node scripts/pre-ship.mjs (mirrors CI). Run it WITHOUT piping to tail/head — a pipe
reports the PIPE's exit code, not pre-ship's. Read the summary; it must end "pre-ship: PASS".
No SKIP_PRESHIP exists. --no-verify needs explicit owner approval. PRESHIP_ALLOW_MISSING=1
only if infra is genuinely down, never to hide a failure.

PRE-SHIP READINESS — a FULL pre-ship is ~20 min; it is your FINAL gate, NEVER your inner loop.
PG-181 AND IFC-302 each burned ~6 full runs (~2 h) discovering failures one 20-min cycle at a time.
Converge everything in the CHEAP loops first, then spend ONE full pre-ship.

1. CHEAP GATES — \`node scripts/pre-ship.mjs --only=format-check,lint,typecheck,governance-schema,lint-artifacts,lint-runtime-paths,material-symbols-audit,a11y-routes,architecture,validate-sprint-data\`
   (seconds-to-minutes; \`typecheck\` includes lint:sonar:guard; \`a11y-routes\`+doc/runtime-path steps
   catch the page-count/WCAG cascade). Iterate until green. Run \`npx prettier --write\` on edited docs.

2. CODEX CONVERGENCE — this is what actually burned the runs. \`codex-review.mjs\` only sees the
   COMMITTED diff and is NON-DETERMINISTIC even at a FIXED SHA: it can pass once, then surface a NEW
   finding on the SAME code. So flush it in the CHEAP loop, not via full pre-ships:
     commit your impl → \`node scripts/codex-review.mjs\` (~2 min) → for each finding confirm against
     the real code (grep / git show HEAD:<file>), then fix minimally OR waive with source-anchored
     evidence in tools/audit/codex-review-waivers.yaml → re-commit → repeat until you get 2-3
     CONSECUTIVE CLEAN standalone runs. (A waiver-only commit doesn't touch source, so re-running is
     cheap.) Only then does the full pre-ship's codex step reliably pass on the 1st try.

3. WINDOWS BUILD FLAKE — if a pre-ship step dies with an esbuild / Next "build worker" crash (not a
   real test/lint failure), that's host-level flakiness under load, not your code: re-run the step;
   if it recurs, lower load (e.g. drop NODE_OPTIONS max-old-space or TURBO concurrency). Don't "fix"
   code for it.

ONLY when the cheap gates are green AND codex is 2-3-clean do you spend the one FULL pre-ship. It
should then pass on the 1st-2nd try, not the 6th.

HARD-WON GOTCHAS (these cost real days — encoded so you don't repeat them):
1. MAKE THE MINIMAL CHANGE — do NOT refactor beyond the task. Drive-by complexity refactors
   introduced regressions the codex gate caught (health 503-not-200, dead code, ||→?? empty-string
   leak). If touching a file trips a sonar-guard, fix it narrowly.
2. TEST your changed lines — NEVER use /* istanbul ignore next */. Diff-coverage (Sonar
   new_coverage ≥80% on changed lines) counts istanbul-ignored lines as UNCOVERED. If a line is
   only reachable via a DB-gated integration test (not run under coverage), add a unit test (IFC-282).
3. CODEX GATE (pre-ship codex-review step) is non-deterministic, surfaces ONE finding per run, and
   sometimes hallucinates about removed code. On a finding: grep / git show HEAD:<file> to confirm
   the cited code still exists. Real bug → fix minimally. True false-positive → waive in
   tools/audit/codex-review-waivers.yaml with evidence. Iterate \`node scripts/codex-review.mjs\`
   STANDALONE (~2 min each) to CONVERGENCE before the full ~20-min pre-ship — never discover codex
   findings one full-gate cycle at a time.
4. CACHED-PASS PUSH: get ONE clean full pre-ship PASS at the FINAL committed SHA, then push
   immediately (pre-push reuses the cache — no codex re-run). Any new commit forces a fresh run.
5. If pre-ship unit-tests fails ONLY on apps/workers/shared/health-server.test.ts
   ("GET /metrics"/EADDRINUSE), that's pre-existing flake #400 — re-run pre-ship.
6. NEVER add a Co-Authored-By: Claude trailer (commitlint + CI hard-fail it). Subject ≤100 chars,
   body lines ≤100 chars (em-dashes inflate byte length — prefer ASCII).
7. NEVER bypass the git-destructive-guard: no git stash / reset --hard / checkout -- <path> /
   restore <path> / clean -f / branch -D / push --force (use --force-with-lease). To discard a
   file, ask the user.
8. If CI "Security Scanning / npm/pnpm Audit" fails but you changed no dependency, it may be a
   NEWLY-PUBLISHED advisory (pnpm audit hits the live DB) — check the advisory ID and bump the
   pnpm override in package.json; don't assume it's your code.
9. ANY new apps/web/**/page.tsx is a DOC-CO-CHANGE EVENT — it raises the filesystem page count,
   which a wide set of guards enforce. Adding one forces updates to ~8 design docs
   (PAGE_MAP_AND_FLOWS.md, page-registry.md, sitemap.md, ui-flow-mapping.md,
   navigation-reachability-audit.md, information-architecture.md, content-audit.md +
   content-audit-results.json), the WCAG conformance statement + VPAT (route + totals), and a
   HARD-CODED count in apps/web/src/app/__tests__/sitemap-reconciliation.test.ts. NEVER mark
   page-doc-cochange "N/A". The plan-reviewer Category Y gate exists for exactly this.
10. LIGHTHOUSE (only if this task has a lighthouse KPI): follow the DECISION TREE in
   docs/claude-refs/lighthouse-playbook.md. PUBLIC route -> Path A (local unauth recipe: \`pnpm
   --filter @intelliflow/web start -p 3400\` + the lighthouse cli with --headless=new; it WORKS on
   this host, don't assume it's broken). AUTH-GATED route (/dashboard, /settings/**, anything behind
   client-side auth) -> Path C (the authenticated lighthouse:auth harness, PG-166/ADR-027). An
   UNAUTHENTICATED run of an auth-gated route measures the LOGIN REDIRECT, not your page (the LCP is
   the login hero) — a sub-90 there is a REDIRECT ARTIFACT: do NOT waive it, run Path C instead
   (PG-058 lost ~1h and nearly mis-waived a 74 that was really 97 authenticated). NEVER stop or
   reconfigure another project's containers (e.g. leangency-portal) to measure — escalate for an
   owner-authorized authenticated measurement instead (PG-181 + PG-058 lessons).
11. After editing ANY .md/.json/.yml/.yaml file, immediately run \`npx prettier --write <file>\` —
   pre-ship format-check fails on hand-edited markdown/JSON otherwise.
12. SCOPED test runs are the fast inner loop, NOT the gate. Only a FULL pre-ship reveals repo-wide
   failures (a11y-routes, doc-consistency, current-state invariant, sonar-guard whole-file
   cognitive-complexity >15 and role->semantic-tag). Don't believe green until pre-ship passes.
13. Deep tRPC mutation TS2589 ("type instantiation excessively deep"): narrow the mutateAsync
   reference to the result slice you actually use (e.g. {id}); keep the cast at component scope, not
   inside the callback.
14. PLACE NEW TESTS INSIDE THE PACKAGE'S vitest \`include\` GLOB. For apps/web that is \`src/**\` — a
   test at apps/web/tests/** or any path outside src/ is SILENTLY SKIPPED by vitest (FAKE GREEN: the
   per-package test command runs the include, so an out-of-include test never executes, and coverage
   never sees it). Colocate as <feature>/__tests__/<name>.test.tsx next to the code. (PG-058's draft
   plan placed a11y tests outside src/; the plan-reviewer caught it — author it right the first time.)
15. GATE-LOCK — the full pre-ship/coverage gate is SERIALIZED across the fleet. Running two coverage
   runs at once on this single host COLLIDES on artifacts/coverage-parts (ENOTEMPTY) and OOMs (web
   Istanbul write SIGKILL), and triples wall-clock (coverage 43min contended vs 18min solo). So: do
   all the parallel-safe work freely (spec, plan, exec-build, scoped tests, the CHEAP gates, codex
   standalone), but BEFORE you run the ONE full \`node scripts/pre-ship.mjs\` or \`git push\` (the
   pre-push hook runs the full gate), tell the orchestrator "ready for the gate-lock" and WAIT for it.
   Only one executor holds the lock at a time.
16. COMMIT ALL EVIDENCE BEFORE THE ONE FULL PRE-SHIP. Stage + commit your code AND the 4 .specify
   artifacts (spec, plan, attestation, task-tracking) AND the issues-log as your FINAL commit, THEN run
   the single full pre-ship at that SHA, THEN push immediately (pre-push reuses the cache). If you
   commit evidence AFTER a passing pre-ship, the new SHA makes the pre-push hook re-run the whole
   ~20-45min gate (a sub-fleet lost ~45min each to exactly this). The clean path = one commit, one gate,
   one push.
17. CLEAN COVERAGE DIRS before every pre-ship: remove artifacts/coverage-parts and artifacts/coverage-vitest
   first (a stale/locked parts dir from a prior or concurrent run throws "ENOTEMPTY: directory not empty").
18. YOU ARE A SUB-AGENT — the /loop does NOT self-iterate inside you the way a CLI session does: it
   runs ONE phase (or one nested subagent, e.g. the plan-reviewer) then YIELDS. After each phase report
   your state and let the orchestrator pump you to the next; do not sit waiting for a background
   notification (a backgrounded pre-ship will NOT auto-wake you — report its tail when asked).

RUN (the build engine — spec → plan → exec → attestation, one phase per iteration):
/loop "/full-pipeline ${TASK_ID}" --max-iterations ${maxIter} --completion-promise "PIPELINE COMPLETE: Ensure all steps from /spec-session, /plan-session and /exec are all completed."

The loop's promise fires on LOCAL artifacts + attestation — that means "build done", NOT "task
shipped". After the promise, you still owe the ship steps below.

VALIDATE BEFORE CLAIMING DONE ("PIPELINE COMPLETE" is a claim, not proof):
- TypeScript + Tests + Lint + BUILD all pass; full suite for every touched package
  (pnpm --filter <pkg> test, not a guessed subset).
- COMMIT THE FULL EVIDENCE TRAIL to your PR — all FOUR of these, not just the attestation
  (a sub-fleet shipped with ONLY attestation.json, leaving NO durable proof the ceremony ran;
  the orchestrator now REJECTS that):
    1. .specify/sprints/sprint-${SPRINT}/specifications/${TASK_ID}-spec.md  (the multi-persona spec)
    2. .specify/sprints/sprint-${SPRINT}/planning/${TASK_ID}-plan.md        (the plan-reviewer-signed plan)
    3. .specify/sprints/sprint-${SPRINT}/attestations/${TASK_ID}/attestation.json   (all gates PASS, binary)
    4. .specify/sprints/sprint-${SPRINT}/attestations/${TASK_ID}/task-tracking.json (status_history etc.)
  /spec-session and /plan-session WRITE files 1+2 — you must git-add and commit them, or the proof
  is lost. task-tracking status_history timestamps MUST be the REAL wall-clock times each phase finished
  (commit times / your own clock) — NEVER synthetic round placeholders like 00:00/01:00/02:00 (that is
  fabricated evidence and a process violation, even if the phases really ran).
- Run /code-review on the diff and /sonarqube-fix for any new Sonar findings BEFORE opening the PR.
- UI tasks: an a11y-expert review pass (WCAG) before merge.

OPEN THE PR AND REPORT — YOU DO NOT MERGE (this is where the PR # is born — the loop never opens a PR):
- gh pr create, then wait for ALL workflows to COMPLETE green (CI Pipeline + Security Scanning +
  Release; zero fail, zero pending) — never judge green from a subset or while jobs run.
- Then STOP and REPORT to the orchestrator: PR #, the 4 evidence-artifact paths, \`gh pr checks\`
  summary, TIME breakdown, issues-log pointer. The ORCHESTRATOR holds the merge token and merges
  strictly serially — you do NOT merge, do NOT --admin, do NOT flip the CSV. (An executor that
  self-merges or touches the control plane DIVERGES it — the IFC-302 hand-off mess.)
- RE-SYNC ON REQUEST: the instant a sibling merges, origin/main moves and your PR will likely CONFLICT
  on the shared files (Sprint_plan.csv + artifacts/reports/a11y-route-reconcile.json + the context
  snapshot). When the orchestrator says "re-sync": \`git merge --no-edit origin/main\` (keep ALL CSV
  rows + re-run split-sprint-plan.ts; a11y-route-reconcile.json is regenerated by pre-ship), then if
  pnpm-lock.yaml or packages/** changed re-run \`pnpm install\` + \`pnpm exec turbo build
  --filter='./packages/*'\` and clear apps/web/.next/types, then take the gate-lock, re-run the full
  pre-ship SOLO, and re-push. Renamed exports break semantically with NO textual conflict — a clean
  cherry-merge is not enough.
- The CSV flip is the ORCHESTRATOR's job, NOT yours. You NEVER commit to local main or touch the
  control plane.

RED FLAGS mid-task (disabled security, TODO, stub, prod mock) → fix-or-track in ALL THREE:
a gh issue (file:line + proposed fix), artifacts/metrics/debt-ledger.yaml, the sprint findings doc.

ESCALATE TO THE USER (stop) on: any prod terraform apply, any --no-verify push, any destructive
git op, anything needing production credentials / live prod verification, or the loop exhausting its
--max-iterations without a green attestation. NEVER stop/start/reconfigure another project's services
or containers (e.g. leangency-portal's Supabase) — escalate instead (that detour cost PG-181 hours).

YOUR TASK: ${TASK_ID} — ${DESCRIPTION || '(see Sprint_plan.csv Description)'}
${lane}.  Persona/lens: ${persona}${secondary}.  STOA /exec must pass: ${stoa}.  Skills: ${skills}.
Dependencies: ${DEPS}.${blockedBy}${note}${staleCsvWarning}${artifactPrecheck}

REPORT WHEN DONE: the OPEN PR # (green, NOT merged — the orchestrator merges) + all 4 committed
evidence paths under .specify/sprints/sprint-${SPRINT}/ (specifications/${TASK_ID}-spec.md,
planning/${TASK_ID}-plan.md, attestations/${TASK_ID}/attestation.json + task-tracking.json) + your
TIME breakdown (build vs waiting) + a pointer to the committed issues log. Do NOT merge, do NOT flip the CSV.
`);
process.exit(0);
