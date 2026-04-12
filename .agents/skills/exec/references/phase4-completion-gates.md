# Phase 4.5: Completion Gates (BLOCKING)

**ALL gates must pass before marking task complete.**

## Gate 0: Context Ack Verification

If task requires `EVIDENCE:context_ack.json`:

- Verify file exists at
  `.specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json`
- Verify JSON parses, task_id matches, files_read covers ALL FILE: prerequisites
- Verify NO sha256 is all-zeros, invariants >= 5

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

## Required Summary Output

```
+-----------------------------------------------------------------------+
|  COMPLETION GATE SUMMARY - Task: {{task_id}}                          |
|  Gate 0: Context Ack          [PASS/N/A]                              |
|  Gate 1: Plan Checkboxes      [12/12 - 100%]  [PASS]                 |
|  Gate 2: Artifact Hashes      [5/5 verified]   [PASS]                |
|  Gate 2b: Import Reachability [5/5 imported]   [PASS]                |
|  Gate 2c: Runtime Wiring      [3/3 verified]   [PASS]                |
|  Gate 3: Build Validation     [4/4 passed]     [PASS]                |
|  Gate 3a: Validation Matrix   [6/6 passed]     [PASS]                |
|  Gate 3b: Scoped Coverage     [91%/82%/90%/95%] [PASS]               |
|  Gate 3c: Dead Code Check     [0 unused]        [PASS]               |
|  Gate 4: STOA Gates           [3/3 PASS]       [PASS]                |
|  OVERALL: ALL GATES PASSED                                            |
+-----------------------------------------------------------------------+
```

If ANY gate BLOCKED: set status "In Progress", fix issues, re-run gates.
