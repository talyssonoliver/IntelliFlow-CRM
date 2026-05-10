# Phase 4.5: Completion Gates (BLOCKING)

**ALL gates must pass before marking task complete.**

## Gate 0: Context Ack Verification

If task requires `EVIDENCE:context_ack.json`:

- Verify file exists at
  `.specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json`
- Verify JSON parses, task_id matches, files_read covers ALL FILE: prerequisites
- Verify NO sha256 is all-zeros, invariants >= 5

**Deterministic check** (run this command — do NOT skip):

```bash
ls .specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json
```

If the file does not exist → **BLOCK**. Go back to Phase 1.5 and create it
before continuing.

**IFC-220 lesson**: This gate was skipped, leading to a false PIPELINE COMPLETE
with missing evidence. The `detect-phantom-completions.ts` script now catches
this at the pipeline level, but catching it HERE prevents wasted time on later
gates.

## Gate 1: Plan Checkbox Verification

Read plan file → count `- [ ]` and `- [x]` patterns across ALL sections
(including Preflight Checks).

- 100% checked → PASS
- <100% → **BLOCK** (every unchecked item must be completed or justified before
  proceeding)

**Scope**: ALL checkboxes in the plan file count — Preflight, RED, GREEN,
REFACTOR, and Validation sections. Preflight items left unchecked are a common
miss; scan the top of the plan file explicitly.

**No WARN.** Binary gate per policy. If any checkbox is unchecked, fix it before
continuing.

## Gate 2: Artifact Hash Verification (EXHAUSTIVE)

Parse ALL `**Files to Create:**` and `**Files to Modify:**` blocks from plan.
For EACH path: verify file exists at EXACT path → calculate SHA256
(`certutil -hashfile <path> SHA256`).

**CRITICAL**: Count must match plan's stated total. If count < plan total →
**BLOCK**. If file at different path than planned → **BLOCK** (move file or
update plan).

**ANTI-SHIM RULE (BLOCKING):** Files in "Files to Create" that are single-line
re-export shims (e.g., `export { X } from '../other/path'`) are a **BLOCK**.
Re-export shims are created to make Gate 2 pass when the implementation deviated
from the planned path. Instead of creating a shim, **update the plan path** to
match the actual location using the Edit tool, then re-run Gate 2. A file whose
only purpose is to re-export from another location is dead on arrival.

Display:

```
[Gate 2: Artifact Hashes]
Plan states: X files to create, Y to modify (total: Z)
Verified: Z/Z
| File | Exists | Hash | Shim? |
|------|--------|------|-------|
Status: PASS
```

## Gate 2b: Import Reachability Check (NEW — prevents dead-on-arrival files)

For EACH file in "Files to Create", verify it is **actually imported** by at
least one other file in the codebase. A file that exists but is never imported
is dead code.

**How to validate:**

```bash
# For each created file, search for imports referencing it
grep -r "from.*<file-stem-without-extension>" apps/ packages/ --include='*.ts' --include='*.tsx' -l
```

**Rules:**

- Each created file must have >= 1 importer → PASS
- Zero importers → **BLOCK** (wire the file or remove it from the plan)

**Exceptions (files that don't need importers):**

- Next.js entry points: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`,
  `route.ts`
- Config files: `vitest.config.ts`, `setup.ts`, `tailwind.config.*`
- Prisma files: `schema.prisma`, migrations
- CLI scripts invoked via `npx tsx` (must have a `// Run via:` comment
  documenting usage)

**Specific sub-checks:**

- **Server actions** (`'use server'` files): Verify at least one client
  component imports AND calls the exported function. An
  imported-but-never-called server action is also dead.
- **Barrel re-exports** (`index.ts` that only re-exports): Verify at least one
  file imports from the barrel path (not directly from the source files).
- **Test fixtures**: Verify at least one test file imports from the fixture.
  Test files that define their own inline mocks instead of using the shared
  fixture make it dead.
- **Handler factories** (e.g., `getMetricsHandler`): Verify they are mounted on
  an actual HTTP server/router, not just exported into the void.

Display:

```
[Gate 2b: Import Reachability]
| File | Importers | Status |
|------|-----------|--------|
| components/Foo.tsx | 3 files | PASS |
| lib/utils.ts | 0 files | BLOCK — not imported by anything |
Status: PASS/BLOCK
```

## Gate 2c: Runtime Wiring & Replacement Verification

Read the plan's `## Implementation Reality Checks` section.

For EACH declared surface:

- Verify the named production consumer actually imports/calls/uses the new
  surface
- Verify any `Replaces / Blocks` path no longer owns the behavior directly

Examples:

- Server procedure added -> UI/form/hook now calls the procedure instead of
  reading local config directly
- New shared helper added -> existing callers invoke the helper rather than
  duplicated inline logic
- Security fix added -> old permissive path is removed or blocked

If the plan marked runtime checks as `N/A`, confirm the task truly did not
change runtime behavior.

**Rules:**

- All declared reality checks verified -> PASS
- Any declared consumer still bypasses the new surface -> **BLOCK**
- Any declared replaced path still performs the behavior -> **BLOCK**

## Gate 2d: Shared Component Reuse Check (UI tasks only)

For EACH file in "Files to Create" that is a UI component (`.tsx` in a
`components/` directory), verify it does NOT functionally duplicate an existing
shared component.

**How to validate:**

```bash
# 1. List shared components
Glob: apps/web/src/components/shared/*.tsx

# 2. For each new component, search shared/ by FUNCTION keyword
# Example: new file is "SearchFilters.tsx" → search for "filter" in shared/
Grep: "<keyword>" in apps/web/src/components/shared/

# 3. If a match is found, compare the exported props/features
# Read both files and compare what they render
```

**Rules:**

- New component has a functional equivalent in `apps/web/src/components/shared/`
  → **BLOCK** (use the shared component)
- New component has 80%+ overlap with a shared component → **BLOCK** (extend the
  shared component with props)
- New component is genuinely unique → PASS
- Task creates NO new UI components → N/A

**Functional equivalence signals** (any of these → likely duplicate):

- Same feature keywords: "filter", "search", "sort", "table", "header",
  "avatar", "badge", "empty state"
- Same prop patterns: accepts `items[]`, `onFilter`, `onSort`, `columns[]`
- Same rendered elements: search input + dropdown selects + chip list

**Example:** | New File | Shared Match | Keywords | Verdict |
|----------|-------------|----------|---------| | `SearchFilters.tsx` |
`search-filter-bar.tsx` | filter, search, sort | **BLOCK** — use SearchFilterBar
| | `HelpArticleCard.tsx` | (none) | article, card | PASS — no shared equivalent
|

Display:

```
[Gate 2d: Shared Component Reuse]
New UI components in plan: N
Functional duplicates found: M
| New Component | Shared Match | Verdict |
|---------------|-------------|---------|
Status: PASS/BLOCK/N/A
```

## Gate 3: Build Validation (ALL 4 COMMANDS — NO EXCEPTIONS)

```bash
pnpm --filter <affected-package> typecheck
pnpm --filter <affected-package> test --run
pnpm --filter <affected-package> lint
pnpm --filter <affected-package> build    # ← MANDATORY — never skip
```

All 4 must exit 0. Attestation MUST have exactly 4 `validation_results` entries.

## Gate 3a: Validation Matrix Verification

Read the plan's `## Validation Matrix` and verify:

- Every listed command was actually executed during exec
- Every listed command exited 0
- Logs exist for each command under the execution directory

This gate is what prevents "59 tests passed" style claims when a touched
adjacent suite is still failing.

**Rules:**

- All commands executed and passed -> PASS
- Any missing command, failed command, or missing log -> **BLOCK**

## Gate 3b: Scoped Coverage Measurement

```bash
npx vitest run <test-dir> --coverage --coverage.include='<src-glob>'
```

Thresholds: Statements >=90%, Branches >=80%, Functions >=90%, Lines >=90%.

KPI format:
`"actual": "Statements 91.21%, Branches 82.11%, Functions 90.14%, Lines 95.08% (148 tests)"`
**NEVER**: `"actual": "100% (104 tests passing)"` — false metric.

## Gate 3c: Dead Code Check (NEW — catches unused files at creation time)

Run Knip scoped to files created/modified by this task. Any newly-created file
flagged as unused is dead code that should be wired or removed.

**How to validate:**

```bash
npx knip --include files --no-progress 2>&1
```

Then check if any file from "Files to Create" appears in Knip's "Unused files"
output.

**Rules:**

- No newly-created files in Knip "Unused files" → PASS
- Any newly-created file flagged as unused → **BLOCK** (wire it or remove it)
- Pre-existing files flagged as unused → INFO (not this task's responsibility)

**Common false positives to exclude:**

- Vitest config/setup files (should be in `knip.json` entry points)
- CLI scripts invoked via `npx tsx` (should be in `knip.json` entry points)
- Next.js entry points (page.tsx, route.ts) — usually already handled by Knip
  config

If a legitimate file is flagged, add it to `knip.json` `entry` array rather than
ignoring the gate.

Display:

```
[Gate 3c: Dead Code Check]
Files created by this task: N
Flagged as unused by Knip: M
| File | Knip Status |
|------|-------------|
Status: PASS/BLOCK
```

## Gate 4: STOA Gate Verification

Read verdicts from `matop/stoa-verdicts/*.json`. No FAIL verdicts allowed.

## Gate 4b: Worktree Landed (BLOCKING — prevents orphaned COMPLETE verdicts)

**Applies to**: ALL tasks executed in a git worktree.

**Why**: IFC-227, IFC-031, PG-053, and PG-054 were stamped `verdict: COMPLETE`
against worktree-only state. The worktree's branch was never committed, never
pushed, and the work was never integrated. Three tasks were permanently lost.
Gate 4b is the binary BLOCK that makes orphaning structurally impossible.

**How to validate**:

```bash
node tools/scripts/exec-preflight/check-worktree-landed.mjs <TASK_ID> <SPRINT>
```

**Rules** (each prints `PASS:` or `BLOCK:` with the reason):

| Check               | PASS condition                                                                 | BLOCK condition                                                                                        |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Clean working tree  | `git status --porcelain` is empty                                              | Non-empty → "Uncommitted edits present. Commit your work first. See docs/runbooks/gate-4b-recovery.md" |
| Branch name pattern | Branch matches `^agent/[A-Z]+-d+(-.+)?# Phase 4.5: Completion Gates (BLOCKING) |

**ALL gates must pass before marking task complete.**

## Gate 0: Context Ack Verification

If task requires `EVIDENCE:context_ack.json`:

- Verify file exists at
  `.specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json`
- Verify JSON parses, task_id matches, files_read covers ALL FILE: prerequisites
- Verify NO sha256 is all-zeros, invariants >= 5

**Deterministic check** (run this command — do NOT skip):

```bash
ls .specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json
```

If the file does not exist → **BLOCK**. Go back to Phase 1.5 and create it
before continuing.

**IFC-220 lesson**: This gate was skipped, leading to a false PIPELINE COMPLETE
with missing evidence. The `detect-phantom-completions.ts` script now catches
this at the pipeline level, but catching it HERE prevents wasted time on later
gates.

## Gate 1: Plan Checkbox Verification

Read plan file → count `- [ ]` and `- [x]` patterns across ALL sections
(including Preflight Checks).

- 100% checked → PASS
- <100% → **BLOCK** (every unchecked item must be completed or justified before
  proceeding)

**Scope**: ALL checkboxes in the plan file count — Preflight, RED, GREEN,
REFACTOR, and Validation sections. Preflight items left unchecked are a common
miss; scan the top of the plan file explicitly.

**No WARN.** Binary gate per policy. If any checkbox is unchecked, fix it before
continuing.

## Gate 2: Artifact Hash Verification (EXHAUSTIVE)

Parse ALL `**Files to Create:**` and `**Files to Modify:**` blocks from plan.
For EACH path: verify file exists at EXACT path → calculate SHA256
(`certutil -hashfile <path> SHA256`).

**CRITICAL**: Count must match plan's stated total. If count < plan total →
**BLOCK**. If file at different path than planned → **BLOCK** (move file or
update plan).

**ANTI-SHIM RULE (BLOCKING):** Files in "Files to Create" that are single-line
re-export shims (e.g., `export { X } from '../other/path'`) are a **BLOCK**.
Re-export shims are created to make Gate 2 pass when the implementation deviated
from the planned path. Instead of creating a shim, **update the plan path** to
match the actual location using the Edit tool, then re-run Gate 2. A file whose
only purpose is to re-export from another location is dead on arrival.

Display:

```
[Gate 2: Artifact Hashes]
Plan states: X files to create, Y to modify (total: Z)
Verified: Z/Z
| File | Exists | Hash | Shim? |
|------|--------|------|-------|
Status: PASS
```

## Gate 2b: Import Reachability Check (NEW — prevents dead-on-arrival files)

For EACH file in "Files to Create", verify it is **actually imported** by at
least one other file in the codebase. A file that exists but is never imported
is dead code.

**How to validate:**

```bash
# For each created file, search for imports referencing it
grep -r "from.*<file-stem-without-extension>" apps/ packages/ --include='*.ts' --include='*.tsx' -l
```

**Rules:**

- Each created file must have >= 1 importer → PASS
- Zero importers → **BLOCK** (wire the file or remove it from the plan)

**Exceptions (files that don't need importers):**

- Next.js entry points: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`,
  `route.ts`
- Config files: `vitest.config.ts`, `setup.ts`, `tailwind.config.*`
- Prisma files: `schema.prisma`, migrations
- CLI scripts invoked via `npx tsx` (must have a `// Run via:` comment
  documenting usage)

**Specific sub-checks:**

- **Server actions** (`'use server'` files): Verify at least one client
  component imports AND calls the exported function. An
  imported-but-never-called server action is also dead.
- **Barrel re-exports** (`index.ts` that only re-exports): Verify at least one
  file imports from the barrel path (not directly from the source files).
- **Test fixtures**: Verify at least one test file imports from the fixture.
  Test files that define their own inline mocks instead of using the shared
  fixture make it dead.
- **Handler factories** (e.g., `getMetricsHandler`): Verify they are mounted on
  an actual HTTP server/router, not just exported into the void.

Display:

```
[Gate 2b: Import Reachability]
| File | Importers | Status |
|------|-----------|--------|
| components/Foo.tsx | 3 files | PASS |
| lib/utils.ts | 0 files | BLOCK — not imported by anything |
Status: PASS/BLOCK
```

## Gate 2c: Runtime Wiring & Replacement Verification

Read the plan's `## Implementation Reality Checks` section.

For EACH declared surface:

- Verify the named production consumer actually imports/calls/uses the new
  surface
- Verify any `Replaces / Blocks` path no longer owns the behavior directly

Examples:

- Server procedure added -> UI/form/hook now calls the procedure instead of
  reading local config directly
- New shared helper added -> existing callers invoke the helper rather than
  duplicated inline logic
- Security fix added -> old permissive path is removed or blocked

If the plan marked runtime checks as `N/A`, confirm the task truly did not
change runtime behavior.

**Rules:**

- All declared reality checks verified -> PASS
- Any declared consumer still bypasses the new surface -> **BLOCK**
- Any declared replaced path still performs the behavior -> **BLOCK**

## Gate 2d: Shared Component Reuse Check (UI tasks only)

For EACH file in "Files to Create" that is a UI component (`.tsx` in a
`components/` directory), verify it does NOT functionally duplicate an existing
shared component.

**How to validate:**

```bash
# 1. List shared components
Glob: apps/web/src/components/shared/*.tsx

# 2. For each new component, search shared/ by FUNCTION keyword
# Example: new file is "SearchFilters.tsx" → search for "filter" in shared/
Grep: "<keyword>" in apps/web/src/components/shared/

# 3. If a match is found, compare the exported props/features
# Read both files and compare what they render
```

**Rules:**

- New component has a functional equivalent in `apps/web/src/components/shared/`
  → **BLOCK** (use the shared component)
- New component has 80%+ overlap with a shared component → **BLOCK** (extend the
  shared component with props)
- New component is genuinely unique → PASS
- Task creates NO new UI components → N/A

**Functional equivalence signals** (any of these → likely duplicate):

- Same feature keywords: "filter", "search", "sort", "table", "header",
  "avatar", "badge", "empty state"
- Same prop patterns: accepts `items[]`, `onFilter`, `onSort`, `columns[]`
- Same rendered elements: search input + dropdown selects + chip list

**Example:** | New File | Shared Match | Keywords | Verdict |
|----------|-------------|----------|---------| | `SearchFilters.tsx` |
`search-filter-bar.tsx` | filter, search, sort | **BLOCK** — use SearchFilterBar
| | `HelpArticleCard.tsx` | (none) | article, card | PASS — no shared equivalent
|

Display:

```
[Gate 2d: Shared Component Reuse]
New UI components in plan: N
Functional duplicates found: M
| New Component | Shared Match | Verdict |
|---------------|-------------|---------|
Status: PASS/BLOCK/N/A
```

## Gate 3: Build Validation (ALL 4 COMMANDS — NO EXCEPTIONS)

```bash
pnpm --filter <affected-package> typecheck
pnpm --filter <affected-package> test --run
pnpm --filter <affected-package> lint
pnpm --filter <affected-package> build    # ← MANDATORY — never skip
```

All 4 must exit 0. Attestation MUST have exactly 4 `validation_results` entries.

## Gate 3a: Validation Matrix Verification

Read the plan's `## Validation Matrix` and verify:

- Every listed command was actually executed during exec
- Every listed command exited 0
- Logs exist for each command under the execution directory

This gate is what prevents "59 tests passed" style claims when a touched
adjacent suite is still failing.

**Rules:**

- All commands executed and passed -> PASS
- Any missing command, failed command, or missing log -> **BLOCK**

## Gate 3b: Scoped Coverage Measurement

```bash
npx vitest run <test-dir> --coverage --coverage.include='<src-glob>'
```

Thresholds: Statements >=90%, Branches >=80%, Functions >=90%, Lines >=90%.

KPI format:
`"actual": "Statements 91.21%, Branches 82.11%, Functions 90.14%, Lines 95.08% (148 tests)"`
**NEVER**: `"actual": "100% (104 tests passing)"` — false metric.

## Gate 3c: Dead Code Check (NEW — catches unused files at creation time)

Run Knip scoped to files created/modified by this task. Any newly-created file
flagged as unused is dead code that should be wired or removed.

**How to validate:**

```bash
npx knip --include files --no-progress 2>&1
```

Then check if any file from "Files to Create" appears in Knip's "Unused files"
output.

**Rules:**

- No newly-created files in Knip "Unused files" → PASS
- Any newly-created file flagged as unused → **BLOCK** (wire it or remove it)
- Pre-existing files flagged as unused → INFO (not this task's responsibility)

**Common false positives to exclude:**

- Vitest config/setup files (should be in `knip.json` entry points)
- CLI scripts invoked via `npx tsx` (should be in `knip.json` entry points)
- Next.js entry points (page.tsx, route.ts) — usually already handled by Knip
  config

If a legitimate file is flagged, add it to `knip.json` `entry` array rather than
ignoring the gate.

Display:

```
[Gate 3c: Dead Code Check]
Files created by this task: N
Flagged as unused by Knip: M
| File | Knip Status |
|------|-------------|
Status: PASS/BLOCK
```

## Gate 4: STOA Gate Verification

Read verdicts from `matop/stoa-verdicts/*.json`. No FAIL verdicts allowed.

| Does not match → "Branch `<name>` does not match `agent/<TASK_ID>` pattern" |
| Commits beyond origin/main | `git rev-list --count origin/main..HEAD` > 0 | 0
→ "Branch has zero commits beyond origin/main. See
docs/runbooks/gate-4b-recovery.md" | | Branch pushed to remote |
`git rev-list --count HEAD..origin/<branch>` is 0 | Local ahead → "Branch not
yet pushed. Run: `git push -u origin <branch> --force-with-lease`" |

**No waiver accepted.** If the gate BLOCKs, fix the root cause (commit, push)
and re-run. Attempting to skip this gate defeats its entire purpose.

Recovery commands: `docs/runbooks/gate-4b-recovery.md`

Display:

```
[gate-4b] Checking worktree-landed state for <TASK_ID> (sprint <N>)
PASS: [gate-4b] Working tree is clean.
PASS: [gate-4b] Branch name "agent/IFC-042" matches agent/<TASK_ID> pattern.
PASS: [gate-4b] Branch is 3 commit(s) ahead of origin/main.
PASS: [gate-4b] Branch is pushed to origin/agent/IFC-042.

[gate-4b] PASS — worktree work is committed and pushed. Safe to proceed.
```

## Gate 14: Lighthouse Evidence Artifact Check (NEW — artifact-based, not text-based)

**Applies to**: Any attestation whose `kpi_results` contains any entry whose
`kpi` matches `/lighthouse/i` (case-insensitive).

**Why**: Guards 4, 6, and 8 all scan attestation TEXT. Agents optimise against
text. Gate 14 checks for a real JSON report on disk, with real category scores,
fresh relative to the attestation timestamp, and hash-matched to the
attestation's `artifact_hashes` block.

PG-184 shipped with `met: true` and actual text "Deferred to CI lhci
(lighthouserc.js now includes /deals/deal-settings)" — a false PASS that every
prior guard missed because it wasn't `met: false` and didn't use a flagged
phrase more than once. Gate 14 catches it because no report file exists.

**How to validate**:

```bash
node tools/scripts/exec-preflight/check-lighthouse-evidence.mjs {{task_id}} {{sprint}}
```

**Rules**:

- No Lighthouse KPI in attestation → N/A
- KPI `met: true` AND `artifacts/lighthouse/<TASK_ID>/*.json` exists AND
  fetchTime within 72h of `attestation_timestamp` AND category scores
  `>= threshold` AND file sha256 matches `artifact_hashes` → PASS
- KPI `met: true` with missing/stale/mismatched/failing report → **BLOCK**
- KPI `met: false` AND attestation has `lighthouse_waiver_approved_by` set to a
  real human identity (email or `@handle`, not CI / bot / Claude / self / etc.)
  → PASS
- KPI `met: false` without a valid human approver → **BLOCK**

**Approval token rules** (shared with Gate 13):

- Must be 3+ chars.
- Accepted shapes: email `x@y.z`, GitHub `@handle`, or plain name.
- Rejected tokens: `CI`, `cicd`, `bot`, `claude`, `agent`, `automation`, `self`,
  `none`, `n/a`, `pending`, `tbd`, `lhci`, `system`, `auto`, `autoapprove`,
  `deferred`, `later`, `todo`.

**The three-paths rule**: before ever writing `met: false`, follow
`docs/claude-refs/lighthouse-playbook.md`. Path A (unauth) works for most static
routes. Path B (unauth + extended timeouts) works for dynamic public routes.
Path C (`lighthouse:auth`) works for auth-gated routes. Only after all three
genuinely fail on this host is a waiver legitimate.

## Gate 13: Lighthouse Waiver Cap (NEW — breaks the sprint waiver chain)

**Applies to**: Any attestation whose `kpi_results` contains a `Lighthouse`
entry with `met: false`.

**Why**: Across sprints 16-18 six tasks shipped COMPLETE with a Lighthouse
met:false KPI (PG-047, PG-053, PG-054, PG-056, PG-180, PG-189), each citing the
previous as precedent. PG-053 introduced the waiver ("build blocked"), PG-054
cited PG-053 ("NO*FCP waiver class"), PG-056 cited OOM pressure, then PG-180 and
PG-189 copied the "deferred to CI" pattern verbatim. The gate breaks that
precedent chain by capping \_unapproved* waivers at one per sprint.

**How to validate**:

```bash
node tools/scripts/exec-preflight/check-lighthouse-waiver.mjs {{task_id}} {{sprint}}
```

**Rules**:

- No Lighthouse met:false KPI in this task → N/A
- Met:false but this is the FIRST such waiver in the current sprint → PASS (with
  WARN log)
- Met:false AND the sprint already has one such waiver AND the current
  attestation's `notes` contains a `lighthouse_waiver_approved_by: <name>` token
  → PASS
- Met:false AND the sprint already has one such waiver AND no human approval
  token → **BLOCK**

**Approval token format**: a single line anywhere in the attestation's `notes`
field, e.g.:

```
Lighthouse run skipped locally — no Chrome binary on the exec host.
lighthouse_waiver_approved_by: talyssonoliveira
CI enforcement remains on; Grafana dashboard will page on regression.
```

The named human is accepting the risk that CI-only enforcement may drift; the
gate refuses silent "deferred to CI" text because that phrase is how the
precedent chain started.

## Gate 12: Navigation Wiring (NEW — catches PG-180 pattern)

**Applies to**: Any plan whose `Files to Create` list includes a file matching
`apps/web/src/app/**/page.tsx`. Otherwise N/A.

**Why**: PG-180 shipped `/settings/help-center/articles` with a correct role
gate, passing tests, passing Lighthouse enrolment, and passing all prior gates —
but with zero inbound navigation references. The page was unreachable to real
users. Spec-session Phase 0.92 existed to catch this but was self-waived via an
"Out of scope — sidebar wiring deferred to a follow-up task" bullet.
Plan-reviewer Category Y was omitted from the verdict table entirely. The
three-doc preflight passed structurally because the doc filenames were listed,
even though their contents recorded the waiver.

Gate 12 is a pure code check — no waiver accepted. If the route has no inbound
reference, the task does not complete.

**How to validate**:

```bash
node tools/scripts/exec-preflight/check-nav-wiring.mjs {{task_id}} {{sprint}}
```

The script walks `apps/web/src/**/*.{ts,tsx}` (excluding `__tests__`,
`*.test.*`, `*.d.ts`, `node_modules`, build outputs) and counts literal
occurrences of each new route under:

1. `apps/web/src/components/sidebar/configs/*` — canonical sidebar surface
2. anywhere else under `apps/web/src/` — parent links, breadcrumbs, CTAs

**Rules**:

- Each new route has >= 1 inbound reference → PASS
- Any new route with 0 inbound references → **BLOCK** (wire it in the sidebar
  config, or link to it from a parent page / breadcrumb / settings index — do
  not defer)
- Plan creates no new `page.tsx` under `apps/web/src/app/` → N/A

**Role-gated admin surfaces are not exempt.** If the route is ADMIN-only, add
the sidebar entry with `roles: ['ADMIN', 'MANAGER']` on the item, not by
omitting the entry entirely. Role-aware sidebar rendering already exists in
`apps/web/src/components/sidebar/` — use it.

Display:

```
[Gate 12: Navigation Wiring]
| Route | Sidebar refs | Component refs | Reachable? |
|-------|--------------|----------------|------------|
| /settings/help-center/articles | 2 | 2 | YES |
Status: PASS/BLOCK/N-A
```

## Required Summary Output

```
+-----------------------------------------------------------------------+
|  COMPLETION GATE SUMMARY - Task: {{task_id}}                          |
|  Gate 0: Context Ack          [PASS/N/A]                              |
|  Gate 1: Plan Checkboxes      [12/12 - 100%]  [PASS]                 |
|  Gate 2: Artifact Hashes      [5/5 verified]   [PASS]                |
|  Gate 2b: Import Reachability [5/5 imported]   [PASS]                |
|  Gate 2c: Runtime Wiring      [3/3 verified]   [PASS]                |
|  Gate 2d: Shared Comp Reuse   [0 duplicates]   [PASS/N/A]            |
|  Gate 3: Build Validation     [4/4 passed]     [PASS]                |
|  Gate 3a: Validation Matrix   [6/6 passed]     [PASS]                |
|  Gate 3b: Scoped Coverage     [91%/82%/90%/95%] [PASS]               |
|  Gate 3c: Dead Code Check     [0 unused]        [PASS]               |
|  Gate 4: STOA Gates           [3/3 PASS]       [PASS]                |
|  Gate 4b: Worktree Landed     [committed+pushed] [PASS]              |
|  Gate 12: Navigation Wiring   [1/1 reachable]  [PASS/N-A]            |
|  Gate 13: Lighthouse Waiver   [0 prior waivers] [PASS/N-A]           |
|  Gate 14: Lighthouse Evidence [report backs KPI] [PASS/N-A]          |
|  OVERALL: ALL GATES PASSED                                            |
+-----------------------------------------------------------------------+
```

If ANY gate BLOCKED: set status "In Progress", fix issues, re-run gates.
