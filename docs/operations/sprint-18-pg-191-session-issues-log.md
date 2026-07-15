# Sprint 18 — PG-191 Session Issues Log

Task: **PG-191 — Module Settings - Tasks (`/tasks/task-settings`)** Lane G ·
persona lens: frontend-lead · STOA: /stoa-domain Worktree:
`C:/Users/talys/projects/iflow-pg-191` · branch `feat/pg-191`

A candid, severity-ordered record of every issue, mistake, workaround, protocol
mismatch, and gate failure encountered while executing PG-191. Committed with
the feature PR.

---

## Severity: HIGH

### H1 — Harness did NOT provision an isolated worktree; agent launched in the main working dir

- **What happened:** The dispatch prompt asserted "you are ALREADY inside a
  harness-provisioned isolated git worktree ... do NOT run `git worktree add`".
  In reality the session started in the **main working directory**
  (`C:/Users/talys/projects/intelliFlow-CRM`) on branch `main`, confirmed by
  `pwd` + `git worktree list` (all sibling agents had their own
  `.claude/worktrees/agent-*` dirs; this session had none).
- **Why it matters:** Building in the main working dir is explicitly forbidden
  ("Do NOT touch the main working dir") and would contaminate the control plane
  that the orchestrator and sibling agents read (uncommitted coverage artifacts,
  `settings.local.json`, scratchpad were already dirty there).
- **Fix / prevention:** Deviated from the "do not run worktree add" instruction
  — which was predicated on already being in a worktree — and provisioned a
  fresh isolated worktree at `C:/Users/talys/projects/iflow-pg-191` from **live
  `origin/main`** (matching the sibling manual pattern `iflow-ifc-214`,
  `iflow-pg-058`). `git worktree add` is non-destructive and not blocked by the
  destructive guard. The main working dir was left untouched. The orchestrator
  merges via the PR, so the physical worktree path is immaterial to it.
  **Prevention:** the harness should verify `pwd != main repo root` before
  handing an agent the "already provisioned" prompt, or the prompt should
  instruct the agent to self-provision if it detects it is in the main dir.

### H2 — Default `node` on this host is v25.2.1 (repo pins Node 22)

- **What happened:** `node --version` reported `v25.2.1` after `pnpm install`.
  Per prior fleet findings, Node 25 silently HANGS node-pg / Prisma DB writes,
  which surfaces later as an unrelated-looking pre-ship `integration-tests`
  failure on the RLS suites.
- **Why it matters:** Cost a prior session ~2h to diagnose.
- **Fix / prevention:** Prepended `C:/Users/talys/AppData/Roaming/nvm/v22.14.0`
  to `PATH` for every command in this session (`node --version` -> v22.14.0
  confirmed before building). All builds/tests/gates run under Node 22.

---

## Severity: MEDIUM

### M1 — `@intelliflow/db` requires an EXPLICIT model-type re-export per new model

- **What happened:** After adding the `TaskSettings` Prisma model, `apps/api`
  typecheck failed with
  `TS2724: '@intelliflow/db' has no exported member named 'TaskSettings'`. The
  db package does NOT `export *` its generated model types; it maintains a
  hand-curated `export type { ... } from '../generated/prisma/ client'`
  allowlist (`packages/db/src/index.ts:20-86`).
- **Why it matters:** `prisma generate` + rebuild alone is insufficient — a new
  model's TS type is invisible to consumers until added to that allowlist. Easy
  to miss because the Prisma client itself has the type; only downstream
  typecheck reveals it.
- **Fix / prevention:** Added `TaskSettings` to the `export type` block and
  rebuilt db. **Prevention:** any new Prisma settings model in this repo needs a
  matching line in `packages/db/src/index.ts`'s type-export allowlist.

### M2 — DRY: extracted a shared `SectionHeader` to avoid Sonar copy-paste on 3 new files

- **What happened:** The sibling settings pages each inline an identical
  ~15-line `SectionHeader`. Replicating that across THREE new task-settings
  section files in one PR risks a Sonar duplicate-block finding (the existing
  copies predate each other in separately-merged files, so were never flagged
  together).
- **Fix / prevention:** Created one shared
  `task-settings/components/SectionHeader.tsx` imported by all three sections
  (one extra file beyond the plan's 16, noted here for the count
  reconciliation).

### M3 — Adding a tRPC router to `router.ts` is a DOC-COCHANGE event (API-router count)

- **What happened:** The FULL pre-ship (only reachable at the end, not the cheap
  loop) failed `unit-tests` on 2 of 33,314 tests:
  `apps/web/src/app/__tests__/ia-reconciliation.test.ts` and
  `ui-flow-mapping-reconciliation.test.ts` both assert the "API Routers" count
  in a design-doc header matches the live `router.ts` registration count. Adding
  `taskSettings: taskSettingsRouter` bumped that count 63 -> 64, so both docs
  (`docs/design/information-architecture.md:4`,
  `docs/design/ui-flow-mapping.md:6`) were stale.
- **Why it matters:** This is a NEW doc-cascade class the spec/plan did not
  anticipate. The well-known page-doc-cochange gotcha (#9) covers NEW
  `page.tsx`; it does NOT mention that **adding a NEW tRPC router key to
  `apps/api/src/ router.ts` also triggers a doc-cochange** on the two
  API-router-count docs. Because these are unit tests over the whole repo, the
  failure ONLY surfaces at the final full pre-ship — costing a ~10-min gate
  cycle to discover.
- **Fix / prevention:** Bumped both doc headers 63 -> 64 (the `(369 procedures)`
  count is validated only for in-doc self-consistency, not vs `router.ts`, so it
  stays untouched). **PREVENTION — encode alongside gotcha #9:** any Lane-G
  module-settings task (or any task adding a root-sibling `*Settings` router)
  must update `docs/design/information-architecture.md` +
  `docs/design/ ui-flow-mapping.md` "API Routers" count in the SAME PR, and the
  plan should list those two docs as co-change files. The plan-reviewer Category
  Y (page reachability) should gain a sibling check for the API-router count.

---

## Severity: HIGH

### H3 — codex-review gate is non-functional in this environment (CLI version drift)

- **What happened:** `scripts/codex-review.mjs` invokes
  `codex exec - --ephemeral -o <path>` (line ~655), but the installed
  `codex-cli 0.79.0` rejects `--ephemeral` ("unexpected argument"). The script
  then falls back to a local `claude -p` review, which is also unavailable in
  this headless sub-agent context, so it degrades to `SKIPPED_PRECONDITION` and
  **exits 0**.
- **Why it matters:** The dispatch protocol's core quality gate — codex semantic
  convergence to >=5 clean runs — CANNOT run here. Worse, because it exits 0,
  the full pre-ship `codex-review` step PASSES silently without any semantic
  review actually happening. A real bug that codex would catch would sail
  through.
- **Fix / prevention:** Did NOT patch the shared tool (out of scope; a
  fleet-wide tooling fix). COMPENSATED by spawning adversarial subagent
  reviewers (backend-architect over db/api, frontend-lead over web) on the
  committed diff to substitute for codex's semantic pass, and fixing every real
  finding. **Prevention (orchestrator/owner):** bump `codex-review.mjs` to the
  `codex-cli` 0.79.x arg surface (drop/replace `--ephemeral`), or pin the codex
  CLI version the script expects. Until then, the codex gate is a no-op on this
  host.
- **Compensating review outcome:** backend-architect review of db/api found NO
  bugs (2 minor non-blocking notes). frontend-lead review of the web diff found
  3 REAL findings, ALL FIXED before final commit:
  1. Edit-during-in-flight-save race (an invalidate refetch could clobber an
     unsaved concurrent edit) -> wrapped the sections in a native
     `<fieldset disabled={isSaving}>` so inputs lock during save/reset.
  2. Reminder lead-time was `aria-disabled` + `pointer-events-none` only, so a
     keyboard user could still Tab in and edit a visually-disabled field ->
     switched to a native `<fieldset disabled={!enabled}>` (blocks keyboard +
     removes from tab order); test now asserts the input is truly disabled.
  3. `parseServerSnapshot` did a whole-object parse, so ONE corrupt/out-of-range
     server field wiped ALL three (a valid template list could be silently
     dropped, then persisted-as-empty on next save) -> made it parse each field
     INDEPENDENTLY (mirrors the router's per-column normalizeRow); added a test
     proving a valid template survives a corrupt offset field.

---

## Severity: LOW

### L1 — `vi.mock` factory + top-level `mockToast` const → "Cannot access before initialization"

- **What happened:** The Content test referenced a top-level `const mockToast`
  inside a hoisted `vi.mock('@intelliflow/ui', ...)` factory → ReferenceError
  (vi.mock is hoisted above the const).
- **Fix / prevention:** Use
  `const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }))`. The
  sibling report-settings test dodged this by inlining `toast: vi.fn()` (no
  external assertion); I needed the ref to assert toast calls, so `vi.hoisted`
  is the correct tool.

### L2 — CSV status-tracking deviation (deliberate, per fleet protocol)

- **What happened:** The `/spec-session` + `/plan-session` skills mandate
  editing `Sprint_plan.csv` status ("Specifying"/"Planning"/etc.). The fleet
  dispatch protocol overrides this: the ORCHESTRATOR owns the CSV; the executor
  never touches the control-plane CSV.
- **Fix / prevention:** Skipped all CSV status edits; tracked status via the
  `.specify` attestation + `task-tracking.json` + the gitignored metrics cache
  instead. This also avoids a guaranteed merge conflict on the shared CSV. The
  orchestrator flips PG-191 to Completed on merge.

---

## Net assessment

**Single avoidable root cause: none in the implementation itself** — the task
built cleanly on a well-established, 9x-proven pattern (PG-178 module settings),
and the multi-persona spec/plan ceremony pre-empted every structural pitfall
(RLS-in-migration, app-router smoke wiring, EmptyState, per-field a11y, no
container.ts, the db type-export allowlist was the only surprise and was caught
by typecheck in seconds).

The two genuinely avoidable frictions were **environmental / harness-level, not
task-level**:

1. **Harness provisioning gap (H1):** the agent was launched in the main working
   dir with an "already provisioned" prompt. Self-provisioning a worktree
   recovered it, but a `pwd`-check in the harness would remove the ambiguity and
   the risk of an agent building in the shared control plane.
2. **codex gate is a silent no-op on this host (H3):** `codex-review.mjs` is out
   of date vs `codex-cli 0.79.0` (`--ephemeral` rejected) and exits 0, so the
   fleet's primary semantic gate provides ZERO coverage while appearing to pass.
   This is the most dangerous finding: a real bug WOULD ship. Only the
   compensating adversarial subagent review caught 3 real web bugs. **Fix the
   tool or the fleet is running without its semantic safety net.**

Everything else (Node 25 default, db type-export, vi.mock hoisting, jsx spacing,
CSV-ownership deviation) was minor, expected, or already encoded in prior fleet
memory. The shared-test-DB integration-test contention is precisely what the
gate-lock exists to serialize and is handled by running the one full pre-ship
solo under the lock.
