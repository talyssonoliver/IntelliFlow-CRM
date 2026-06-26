# Sprint 18 Orchestrator Prompt

> Hand this entire document to the orchestrating agent as its prompt. Originally
> generated 2026-06-10 from `Sprint_plan.csv`; **State section refreshed
> 2026-06-22, re-verified 2026-06-25 against `origin/main`.** The CSV `Status`
> column is badly stale (many tasks shipped but never flipped to Completed), so
> the authoritative remaining-work list is the **"Current State (2026-06-22)"**
> section below, derived from `git log origin/main` — trust it over the older
> lane graph further down. Verify any task's real status with
> `git log origin/main --grep=<ID>` (ignore metrics/chore-only commits) before
> dispatching.

## Current State (refreshed 2026-06-22 against origin/main)

**Just landed (verified merged on main 2026-06-25):** IFC-255 Contact audit
logging (#516, `199f2ab8d`) — completed the Lane E pair after its template
IFC-240 (#514, `c1c589fd8`). Earlier verticals already merged: leads
(PG-060/061/062/063, IFC-242, IFC-230), contacts (IFC-256/257/265/266), accounts
(IFC-270/271/273), deals (IFC-280/282/287), help (IFC-301), AI monitoring
**snapshot** bridge (IFC-212, #59 — reconcile-and-attest only), plus the
non-sprint-18 ValueObject fix #509. ⚠ CORRECTION: an earlier draft listed
"IFC-214 landed" — that was a conflation with IFC-212. **IFC-214** (Redis-backed
monitoring _state_ bridge) is NOT on main; it remains a Lane I pipeline task and
**IFC-215 is hard-blocked on it.**

**Verify-and-attest backlog (code on main, attestation/PR is the only gap — NOT
a build):**

- **IFC-032** OTel — ✅ **DONE** (attested + flipped via #515, `fb3bafe79`;
  attestation-only — prod wiring remains a HARD STOP, OTEL_ENABLED=false by
  design / #314). No further dispatch.
- **DOC-015** route-total reconcile — docs + consistency test on main; needs
  only `attestation.json` + CSV flip. **Must close before DOC-016.**
- **IFC-211** Goal Settings RBAC — `/exec` evidence exists but the feature PR (3
  tRPC procedures, `goal` ResourceType, `home-rbac.test.ts`) + attestation were
  never landed. Needs a real PR, not just an attestation.

**Genuinely remaining + unblocked (full pipelines):** (Lane E is now CLOSED —
IFC-240 + IFC-255 both merged; do not re-dispatch contact/lead audit logging.)

- **IFC-247** + **IFC-248** Lead page tests — test-engineer / 30 each (IFC-248
  first; IFC-247 = the 3,287-line detail page, aggressive 90% coverage gate).
- **IFC-214** AI monitoring _state_ bridge (Redis-backed) — ai-specialist +
  backend-architect / 40. **This is the unblocked AI-lane pick;** IFC-215
  follows it (hard dep).
- **IFC-215** AI monitoring payload fidelity — wire real tokenCost +
  hallucination flags into `chain-monitor.ts` (stubs `tokenCost:0`/`[]`).
  ai-specialist / 40. **BLOCKED on IFC-214 — not independently startable.**
- **PG-181** Help article editor → **IFC-302** Help article page → DB. frontend
  / 20.
- **Lane G module settings** (14 ready): batch ≤2 PRs, re-merge main between
  (all append to the shared `settings-search.ts` + root tRPC router). Batch 0:
  PG-191 + PG-188; then accounts (PG-196/197/205), analytics (PG-200/201/207),
  calendar/cases (PG-202/203/204/206). PG-208/209 are blocked on PG-191.
- **IFC-234** settings wiring (team + integrations pages are the real work),
  **PG-058** dashboard (needs `kpi-calculator.ts` + a Lighthouse run).

**Needs a human/product/architecture decision before dispatch:**

- **IFC-309** server-side terms acceptance — `termsVersion` format + immutable +
  tenantId rules + compliance/security sign-off.
- **PG-198 / PG-199** AI-governance settings — the `agent-approval` API module
  does not exist (create new vs extend `agent/`?) + the Never-Downgrade rule.
- **PG-204** — task-JSON path (`cases/case-types`) mismatches the actual stub
  (`cases/(list)/case-types`); reconcile first.

**Recommended next 3-slot dispatch (file-disjoint, safe in parallel; re-verified
2026-06-25):** Slot 1 IFC-248 then IFC-247 (lead-page tests, `apps/web` leads,
test-engineer / 30) · Slot 2 IFC-214 then IFC-215 (AI monitoring, ai-worker/api,
ai-specialist / 40) · Slot 3 PG-181 then IFC-302 (web help, frontend-lead / 20)
— backfill with Lane G batches, IFC-234, PG-058, and the IFC-212 / DOC-015 /
IFC-211 reconcile-and-attest closes. (IFC-255 dropped — merged via #516; IFC-032
dropped — attested via #515.)

---

## Mission

You are the **Sprint 18 orchestrator** for IntelliFlow CRM. You do not implement
tasks yourself. You launch, monitor, and validate **one agent session per
task**, where each session runs the full MATOP pipeline via:

```
/loop "/full-pipeline <TASK-ID>" --max-iterations 10 --completion-promise "PIPELINE COMPLETE: Ensure all steps from /spec-session, /plan-session and /exec are all completed."
```

`/full-pipeline` is a state machine that runs ONE phase per invocation
(spec-session → plan-session → exec); the `/loop` wrapper provides the
iteration. Your job is scheduling, dependency enforcement, validation, and
status reconciliation.

## Global Rules (non-negotiable)

1. **Concurrency cap: 3 agent sessions at once.** Pre-ship runs full
   builds/tests and the local test DB (port 5433) and dev ports are shared.
   Never exceed 3; drop to 2 if pre-ship runs start timing out.
2. **One git worktree per agent session, branched from fresh `main`.** The main
   working dir is shared and a concurrent agent can switch branches underneath
   you. Every session works in its own worktree (`git worktree add`), branch
   named `feat/<task-id-lowercase>` (CI branch-name gate requires
   `feat/*`/`fix/*`/`chore/*` prefixes). Verify `git branch --show-current`
   before any commit.
3. **Worktree provisioning recipe** (known-good, do this before starting the
   loop): `pnpm install` → `turbo build --filter='./packages/*'` → copy
   `.env.local` but replace `DATABASE_URL` with the **local test DB**
   (`DATABASE_TEST_URL`, compose `postgres-test` on 5433 — `.env.local`'s
   `DATABASE_URL` is production Supabase, NEVER use it for tests) → strip prod
   Supabase creds from any test env → add `.env.test.local` overriding the DB
   (committed `.env.test` beats inline env) →
   `NODE_OPTIONS=--max-old-space-size=8192`.
4. **Never skip the pre-ship gate.** No `SKIP_PRESHIP` exists; `--no-verify`
   needs explicit owner approval. `PRESHIP_ALLOW_MISSING=1` only when infra is
   genuinely down, never to hide failures.
5. **Commit hygiene:** NO `Co-Authored-By: Claude` trailers (commitlint +
   system-audit hard-fail them). Body lines ≤100 chars. PR titles ≤100 chars.
6. **Merge discipline:** after each push, check `gh pr checks <n>`; merge only
   with ZERO fail AND ZERO pending (gate on the GitHub `SonarCloud Scan` check,
   not the Sonar API). If sibling PRs from this sprint merged since the branch
   was cut, **re-merge current main and re-run CI before trusting green** —
   semantic conflicts (renamed exports) don't show as textual conflicts.
7. **Run the FULL test suite for every touched package**
   (`pnpm --filter <pkg> test`), never a guessed subset.
8. **Red flags** found mid-task (disabled security config, TODOs, stubs, prod
   mocks) must be analyzed + fixed-or-tracked in ALL THREE surfaces: a
   `gh issue`, `artifacts/metrics/debt-ledger.yaml`, and the sprint findings
   doc. Pre-existing/out-of-scope problems → `gh issue` with file:line +
   proposed fix, never mention-and-drop.
9. **Co-dependent changes ride the feature branch** — never a standalone PR for
   a waiver/stub/config tweak that only exists to make another PR green.
10. **Semantic review gate before every commit.** Run
    `node scripts/codex-review.mjs` in the worktree BEFORE committing. Fix or
    waive (with a non-empty reason in `tools/audit/codex-review-waivers.yaml`)
    every unwaived finding. Do NOT push until the gate exits 0. This catches
    correctness/data-integrity bugs that pass the author's own tests because the
    tests encode the same wrong assumption. The gate uses the LOCAL OAuth codex
    session (ChatGPT/Codex login) — no API key required. Confirm auth with
    `codex login status`. There is no CI codex check; this is pre-push only.
11. **Owner ledger — one writer per branch/worktree.** Maintain a live table of
    which agent (a named CLI or a named subagent) owns each
    task/branch/worktree. A worktree/branch is an **exclusive single-writer
    resource**. BEFORE dispatching any agent, check the ledger; if the
    task/branch already has an owner, do NOT dispatch — confirm the prior owner
    is finished first. **Delegated == in-flight == owned:** the moment a
    corrective is relayed to a CLI (or any agent), that task is owned and off
    the to-dispatch list. **One execution substrate per task** — never both
    relay-to-CLI and ship-a-subagent for the same fix. Confirm-before-dispatch,
    not after. Background subagents are still ships and obey this rule. (Lesson:
    Sprint-18 double-dispatch collision on `../iflow-pg-060` /
    `../iflow-ifc-256`.)

## What "complete and validated" means (your gate before unblocking dependents)

A task is DONE only when **you have independently verified all of**:

1. The loop emitted its completion promise AND
   `apps/project-tracker/docs/metrics/sprint-18/**/<TASK-ID>.json` shows the
   exec attestation (`attestation.json` evidence, all gates PASS — gates are
   binary, no WARN/SKIP).
2. Spec + plan + exec artifacts all exist for the task (spec doc, TDD plan with
   all steps checked, implementation).
3. The 4 mandatory validations passed: TypeScript, Tests, Lint, **Build**.
4. `/compliance-check` passed for the task.
5. The PR is **merged to main with all checks green** (rule 6 above).
6. `Sprint_plan.csv` updated to Completed (edit CSV only, then run the split
   regeneration `npx tsx tools/scripts/split-sprint-plan.ts` and sync) and
   context regenerated
   (`npx tsx apps/project-tracker/scripts/generate-context.ts`).

Do NOT start a dependent task until its prerequisites pass ALL six checks. An
agent claiming "PIPELINE COMPLETE" is a claim, not evidence — verify yourself.

If a task's loop exhausts 10 iterations without completing: stop that lane,
record the blocker (gh issue + note in your status report), and continue other
lanes. Do not restart the loop blindly; diagnose first.

## Phase 0 — Reconciliation (do this BEFORE launching any pipeline)

The CSV is stale for some rows. For each task below, verify against `main` (git
log, existing code, existing attestations) and either mark it Completed in the
CSV (with evidence) or confirm real work remains:

- **INFRA-TF-001, INFRA-TF-002, INFRA-TF-004**: landed via PRs #286/#289
  (Terraform SSOT initiative, ADR-064). Likely only attestation/CSV sync is
  missing — do NOT re-implement Terraform from scratch.
- **INFRA-TF-005** (CI + import + runbooks): largely landed via #291/#297
  (build-images), #298 (railway-deploy dormant CI), #296 (import prep). Audit
  the Definition of Done line-by-line; pipeline only the genuinely missing
  remainder.
- **INFRA-TF-003**: ✅ **ALREADY MERGED** — PR #299 landed on main
  (`15bcc0fc8 feat(infra): migrate supabase module to official supabase/supabase provider (INFRA-TF-003)`).
  My earlier "parked draft" note is STALE. This is reconcile-only: verify DoD
  against the merged code, attest, flip CSV. The prod `terraform import`/apply
  step remains user-gated, but the code task is done.
- **IFC-212**: commit
  `feat(IFC-212): Redis monitoring snapshot bridge for AI metrics (#59)` already
  exists on main. Verify what's actually missing (container wiring to
  QueueAIService) before running the pipeline.
- **IFC-032** (OpenTelemetry): prod currently has `OTEL_ENABLED=false` because
  no collector exists, and api/ai-worker observability env is Terraform-managed
  per the #314 observability decision (surgical
  `railway_variable.observability`, STOP at plan review — no `terraform apply`
  without user sign-off). Scope the task accordingly; any prod apply is a hard
  stop for user approval.
- **IFC-314 known landmine**: a pre-existing plan-linter failure references
  IFC-314 — non-TS-only commits trigger the full `pnpm run lint` fallback and
  hit it. Fix or waive it INSIDE the IFC-314 branch, never as a standalone PR.

## Task Graph — Lanes and Waves

Lanes run **in parallel** with each other (subject to the concurrency cap of 3).
Tasks **within a lane run strictly serially** — each must pass the 6-point
validation before the next starts. `→` is a hard or file-conflict ordering. All
cross-sprint dependencies are already Completed; only the orderings below
constrain you.

### Lane A — Leads vertical (serial, 9 tasks)

```
PG-060 (New Lead) → PG-061 (Lead Detail) → PG-062 (Edit Lead, hard dep PG-061)
→ PG-063 (Import Leads) → IFC-242 (create-form fixes: BANT/revenue/validation)
→ IFC-230 (unify create/edit form — touches both pages above)
→ IFC-247 (lead detail page tests) → IFC-248 (lead list & create page tests)
```

Rationale: all touch `apps/web` lead pages; tests last so they test the final
form code, not code about to be rewritten. Note: lead create/detail pages may
already partially exist (IFC-230's description references a 1029-line create
page) — spec-session must explore actual code first.

### Lane B — Contacts vertical (serial, 4 tasks)

```
IFC-256 (detail hardcoded tabs) → IFC-257 (wire 18 detail action buttons)
→ IFC-265 (contact detail page tests) → IFC-266 (contact list/create tests + E2E)
```

### Lane C — Accounts vertical (serial, 3 tasks)

```
IFC-271 (domain model fixes / AccountDeletedEvent) → IFC-270 (router procedures
+ update fix) → IFC-273 (list page type safety & filter enums)
```

### Lane D — Deals vertical (serial, 3 tasks)

```
IFC-282 (router correctness) → IFC-280 (wire 14 no-op detail buttons)
→ IFC-287 (filter wiring & type safety)
```

### Lane E — Audit logging (serial, 2 tasks; shares SecurityAuditService pattern)

✅ **LANE CLOSED 2026-06-25** — both tasks merged (IFC-240 #514, IFC-255 #516).
Kept for historical context; do not dispatch. The scheduling caveat below is
moot.

```
IFC-240 (lead router audit logging) → IFC-255 (contact router audit logging)
```

⚠ IFC-240 must not run concurrently with Lane A's IFC-242 (both can touch the
lead router/validators). Schedule IFC-240 either before Lane A reaches IFC-242
or after it finishes.

### Lane F — Help Center (2 sub-tracks)

```
F1: IFC-301 (Tiptap editor integration) → PG-181 (article editor page, hard dep)
F2: IFC-302 (refactor help article page to DB)   [parallel to F1]
```

### Lane G — Module Settings pages (16 tasks; parallel in batches of ≤3)

All follow the established PG-178 module-settings pattern on distinct routes —
parallel-safe across different modules. Hard deps: PG-208/PG-209 require PG-191
done first.

```
Batch G1: PG-188 (Billing), PG-191 (Tasks), PG-196 (Account Tiers)
Batch G2: PG-197 (Territory Mapping), PG-198 (Approval Policies), PG-199 (Model Config)
Batch G3: PG-200 (Report Templates), PG-201 (Scheduled Reports), PG-202 (Availability)
Batch G4: PG-203 (Event Types), PG-204 (Case Types), PG-205 (Contact Types)
Batch G5: PG-206 (Storage Policies), PG-207 (Email Settings)
Batch G6 (after PG-191): PG-208 (Task Automation), PG-209 (Task Types)
```

Tip: after the first one merges, later specs should reference the merged
pattern; expect mergeable-but-semantically-overlapping edits to shared settings
nav/registry files — re-merge main between batches (Global Rule 6).

### Lane H — Docs integrity (serial, 2 tasks)

```
DOC-015 (reconcile route totals) → DOC-016 (CI drift gate, hard dep)
```

### Lane I — AI monitoring chain (serial, 3 tasks; reconcile IFC-212 first)

```
IFC-212 (container → QueueAIService wiring) → IFC-214 (Redis-backed monitoring
state bridge) → IFC-215 (payload fidelity: real tokenCost + hallucination, hard dep IFC-214)
```

### Lane J — Independent singles (each is its own 1-task lane; fill spare slots)

| Task                                         | Notes                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PG-058 (Dashboard)                           | All deps completed.                                                                                                                                                                                                                                                          |
| IFC-032 (OTel monitoring)                    | See Phase 0 — prod apply requires user sign-off.                                                                                                                                                                                                                             |
| IFC-211 (Goal Settings RBAC)                 | Builds on IFC-195/IFC-098 (done).                                                                                                                                                                                                                                            |
| IFC-234 (core Settings pages wiring)         | 4 settings pages, hardcoded data + inert buttons. Distinct from Lane G routes.                                                                                                                                                                                               |
| IFC-309 (server-side terms acceptance)       | Immutable TermsAcceptance audit record; tenantId required (db rule).                                                                                                                                                                                                         |
| IFC-314 (CRM→portal delivery & billing sync) | ✅ **ALREADY MERGED** via #333 (delivery + billing sync) + #367 (setup-fee invoicing). RECONCILE-ONLY — do NOT launch a fresh pipeline. Verify the merged code covers the full DoD, attest, flip CSV. (Earlier "largest task, start early" note was wrong — corrected here.) |

### Lane K — INFRA-TF (after Phase 0 reconciliation; serial)

```
INFRA-TF-001 → INFRA-TF-002 ∥ INFRA-TF-004 → INFRA-TF-005
INFRA-TF-003 = human-blocked, excluded.
```

Expectation: most of this lane resolves in Phase 0 as attest-and-close rather
than full pipelines. Remember: merging Terraform PRs NEVER auto-applies
(prod-apply is manual-dispatch-only) — leave it that way.

## Suggested schedule (3 slots)

- **Slot 1:** Lane A (longest serial chain — start immediately)
- **Slot 2:** IFC-314 (largest single task), then Lane I, then Lane K remainder
- **Slot 3:** Lane B → Lane C → Lane D → Lane E → Lane F → Lane H, with Lane G
  batches and Lane J singles backfilling whenever a slot is idle

Re-plan opportunistically: whenever a slot frees, start the highest-value
unblocked task (prefer unblocking chains over leaf tasks).

## Reporting

Maintain a running status table (task, lane, state: queued / running /
validating / done / blocked, PR #, blockers). After EVERY task completion:
update `Sprint_plan.csv` → regenerate splits → regenerate
`docs/SESSION_CONTEXT.md`. At sprint end (or when out of schedulable work),
produce a final report: completed list with PR links, blocked list with reasons,
issues filed, and any CSV reconciliations made in Phase 0.

Escalate to the user (do not proceed) on: any prod `terraform apply`, any
`--no-verify` push, any destructive git operation, INFRA-TF-003's secrets, any
task requiring production credentials or live prod verification.

---

# ADDENDUM — Agent & Skill Assignments (added 2026-06-10, supersedes conflicts above)

## A. Reconciliation result (verified against `main` git history)

Seven "Backlog" tasks are **already implemented and merged** — they do NOT get a
`/loop /full-pipeline`. They get a lightweight **verify-and-attest** flow:

| Task         | Evidence on main                                                                                    | Verify-and-attest flow                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| IFC-212      | `feat(IFC-212): Redis monitoring snapshot bridge (#59)` + `wire QueueAIService as default provider` | agent **ai-specialist** runs `/task-code-audit IFC-212` → if DoD met: `/compliance-check` → `/exec-attestation` → flip CSV |
| IFC-314      | `#333` (CRM→portal delivery + billing sync) + `#367` (setup-fee invoicing)                          | agent **backend-architect** runs `/task-code-audit IFC-314` → `/compliance-check` → `/exec-attestation` → flip CSV         |
| INFRA-TF-001 | provider-schema drift fix folded into #286/#289 (dependents green ⇒ satisfied)                      | agent **devops-lead** runs `/task-code-audit INFRA-TF-001` → `/stoa-foundation` → attest → flip CSV                        |
| INFRA-TF-002 | `#289` (3 workers + cost guards)                                                                    | agent **devops-lead** → `/task-code-audit` → `/stoa-foundation` → attest → flip CSV                                        |
| INFRA-TF-003 | `#299` (official supabase provider)                                                                 | agent **devops-lead** → `/task-code-audit` → `/stoa-foundation` → attest → flip CSV. Prod import/apply stays user-gated.   |
| INFRA-TF-004 | `#286` (HCP backend + tfvars + monitoring module)                                                   | agent **devops-lead** → `/task-code-audit` → `/stoa-foundation` → attest → flip CSV                                        |
| INFRA-TF-005 | `#291` (build-images) + `#296` (import runbook) + `#298` (railway-deploy)                           | agent **devops-lead** → `/task-code-audit` → `/stoa-foundation` → attest → flip CSV                                        |

If `/task-code-audit` finds the merged code does **not** fully satisfy the DoD,
THEN launch a `/loop /full-pipeline <id>` for the gap only (it will detect
existing artifacts and resume at the right phase). Lane K collapses into these
rows; INFRA-TF-003 is no longer "blocked."

**This drops the genuine-pipeline backlog from 55 → ~48 tasks.**

## B. How each `/loop /full-pipeline` session engages agents + skills

`/full-pipeline` already chains `/spec-session` (spawns its own parallel persona
sub-agents) → `/plan-session` → `/exec` (which runs the STOA validation skills).
The orchestrator's job per task is to **launch the loop in a worktree with the
correct PRIMARY agent persona and pin the correct STOA validation skill**, so
spec/plan/exec are reviewed by the right specialist and validated by the
matching STOA. Pass these as the session's context. Format per task:

```
Agent: <subagent_type>   (the implementing/reviewing persona for the worktree session)
Loop:  /loop "/full-pipeline <TASK-ID>" --max-iterations <N> --completion-promise "PIPELINE COMPLETE: ..."
STOA:  /<stoa-skill>     (the validation skill /exec must pass)
Skills:<task-specific skills the persona should invoke during exec>
```

`--max-iterations` per the skill's budget guide: simple/legal page **15**,
settings CRUD page **20**, CRM list+detail page **30**, complex AI/workflow
feature **40**. (Your command template uses 10; bump per this table — a 30-step
CRM page will exhaust 10 iterations mid-exec.)

## C. Per-task assignment matrix (the ~48 pipeline tasks)

### Lane A — Leads (frontend-heavy vertical)

| Task                                                | Agent                                            | max-iter | STOA          | Task skills                               |
| --------------------------------------------------- | ------------------------------------------------ | -------- | ------------- | ----------------------------------------- |
| PG-060 New Lead                                     | frontend-lead                                    | 20       | /stoa-domain  | /frontend-design, then a11y-expert review |
| PG-061 Lead Detail                                  | frontend-lead                                    | 30       | /stoa-domain  | /frontend-design                          |
| PG-062 Edit Lead                                    | frontend-lead                                    | 20       | /stoa-domain  | /frontend-design                          |
| PG-063 Import Leads                                 | frontend-lead (+backend-architect for CSV parse) | 30       | /stoa-domain  | /frontend-design                          |
| IFC-242 Create-form fixes (BANT/revenue/validation) | backend-architect (validators) + frontend-lead   | 20       | /stoa-domain  | —                                         |
| IFC-230 Unify create/edit form                      | frontend-lead                                    | 30       | /stoa-quality | /frontend-design                          |
| IFC-247 Lead detail page tests                      | test-engineer                                    | 30       | /stoa-quality | /webapp-testing                           |
| IFC-248 Lead list & create page tests               | test-engineer                                    | 30       | /stoa-quality | /webapp-testing                           |

### Lane B — Contacts

| Task                                    | Agent                             | max-iter | STOA          | Task skills                      |
| --------------------------------------- | --------------------------------- | -------- | ------------- | -------------------------------- |
| IFC-256 Detail hardcoded tabs → API     | frontend-lead + backend-architect | 30       | /stoa-domain  | —                                |
| IFC-257 Wire 18 detail action buttons   | frontend-lead                     | 30       | /stoa-domain  | —                                |
| IFC-265 Contact detail page tests       | test-engineer                     | 30       | /stoa-quality | /webapp-testing                  |
| IFC-266 Contact list/create tests + E2E | test-engineer                     | 30       | /stoa-quality | /webapp-testing (Playwright E2E) |

### Lane C — Accounts

| Task                                             | Agent                             | max-iter | STOA         | Task skills |
| ------------------------------------------------ | --------------------------------- | -------- | ------------ | ----------- |
| IFC-271 Domain model fixes (AccountDeletedEvent) | domain-expert + backend-architect | 30       | /stoa-domain | —           |
| IFC-270 Router procedures + update fix           | backend-architect                 | 30       | /stoa-domain | —           |
| IFC-273 List page type safety & filter enums     | frontend-lead                     | 20       | /stoa-domain | —           |

### Lane D — Deals

| Task                                 | Agent             | max-iter | STOA         | Task skills |
| ------------------------------------ | ----------------- | -------- | ------------ | ----------- |
| IFC-282 Router correctness fixes     | backend-architect | 30       | /stoa-domain | —           |
| IFC-280 Wire 14 no-op detail buttons | frontend-lead     | 30       | /stoa-domain | —           |
| IFC-287 Filter wiring & type safety  | frontend-lead     | 20       | /stoa-domain | —           |

### Lane E — Audit logging (security pattern)

| Task                                 | Agent         | max-iter | STOA           | Task skills |
| ------------------------------------ | ------------- | -------- | -------------- | ----------- |
| IFC-240 Lead router audit logging    | security-lead | 30       | /stoa-security | —           |
| IFC-255 Contact router audit logging | security-lead | 30       | /stoa-security | —           |

### Lane F — Help Center

| Task                                     | Agent                             | max-iter | STOA         | Task skills                                |
| ---------------------------------------- | --------------------------------- | -------- | ------------ | ------------------------------------------ |
| IFC-301 Tiptap editor integration        | frontend-lead                     | 30       | /stoa-domain | /frontend-design, context7 for Tiptap docs |
| PG-181 Article editor page (dep IFC-301) | frontend-lead                     | 20       | /stoa-domain | /frontend-design                           |
| IFC-302 Refactor help article page to DB | frontend-lead + backend-architect | 20       | /stoa-domain | —                                          |

### Lane G — Module Settings pages (CRUD-form pattern, batches ≤3)

All: **frontend-lead**, **max-iter 20**, **/stoa-domain**, skills
**/frontend-design** + a11y-expert review. Two carry an AI-governance angle —
add an **ai-specialist** review pass:

| Task                                                                                                           | Extra                                  |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| PG-188, PG-191, PG-196, PG-197, PG-200, PG-201, PG-202, PG-203, PG-204, PG-205, PG-206, PG-207, PG-208, PG-209 | standard                               |
| PG-198 Approval Policies (/agent-approvals)                                                                    | + ai-specialist review (AI governance) |
| PG-199 Model Config (/agent-approvals)                                                                         | + ai-specialist review (AI governance) |

### Lane H — Docs integrity

| Task                                | Agent                       | max-iter | STOA             | Task skills |
| ----------------------------------- | --------------------------- | -------- | ---------------- | ----------- |
| DOC-015 Reconcile route totals      | general-purpose (scripting) | 20       | /stoa-automation | —           |
| DOC-016 CI drift gate (dep DOC-015) | devops-lead                 | 20       | /stoa-automation | —           |

### Lane I — AI monitoring chain

| Task                                                                   | Agent                                     | max-iter | STOA               | Task skills |
| ---------------------------------------------------------------------- | ----------------------------------------- | -------- | ------------------ | ----------- |
| IFC-214 Redis-backed monitoring state bridge                           | ai-specialist + backend-architect (Redis) | 40       | /stoa-intelligence | —           |
| IFC-215 Payload fidelity (real tokenCost + hallucination, dep IFC-214) | ai-specialist                             | 40       | /stoa-intelligence | —           |

### Lane J — Independent singles

| Task                                 | Agent                             | max-iter | STOA             | Task skills / notes                                               |
| ------------------------------------ | --------------------------------- | -------- | ---------------- | ----------------------------------------------------------------- |
| PG-058 Dashboard                     | frontend-lead                     | 30       | /stoa-domain     | /frontend-design                                                  |
| IFC-032 OTel monitoring              | devops-lead                       | 40       | /stoa-foundation | prod apply ⇒ STOP for user sign-off (#314 observability decision) |
| IFC-211 Goal Settings RBAC           | security-lead + domain-expert     | 30       | /stoa-security   | —                                                                 |
| IFC-234 Core settings pages wiring   | frontend-lead + backend-architect | 30       | /stoa-domain     | /frontend-design                                                  |
| IFC-309 Server-side terms acceptance | compliance + security-lead        | 30       | /stoa-security   | tenantId required (db rule); immutable audit record               |

## D. Cross-cutting agent usage (every task)

- **spec-session** for each task runs in **team mode** so its parallel personas
  (a11y-expert, domain-expert, security-lead, backend-architect, frontend-lead,
  test-engineer) debate the spec — the matrix above names which persona's
  verdict is **load-bearing** for that task, not the only voice.
- After `/exec` GREEN, run **/code-review** on the diff and **/sonarqube-fix**
  for any new Sonar findings before opening the PR (mirrors the gate; cheaper
  than a CI round-trip).
- For UI tasks, an **a11y-expert** review pass is mandatory before merge (WCAG
  on new pages); for test tasks, **test-engineer** owns coverage ≥ the diff
  floor (Sonar new_coverage ≥80%).
- The reconcile-set (§A) uses **/task-code-audit** as the primary skill, not the
  spec→plan→exec chain.

## E. Updated slot schedule

- **Slot 1:** Lane A (longest chain).
- **Slot 2:** §A reconciliations FIRST (fast, high-value attest-and-close incl.
  IFC-314 + all INFRA-TF) → then Lane I (AI monitoring) → then Lane J singles.
- **Slot 3:** Lane B → C → D → E → F → H, with Lane G batches + remaining Lane J
  singles backfilling idle slots.

IFC-314 is no longer an early dedicated-slot item; it is a reconciliation.
