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

_(to be completed at end of task)_
