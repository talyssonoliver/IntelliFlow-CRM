# Gate Details — Individual Gate Specifications

This file is a supplemental helper reference.
If any detail here conflicts with `.claude/skills/exec/references/phase4-completion-gates.md`,
the `/exec` gate file is the source of truth.

## Gate 1: Plan Checkboxes (BLOCKING)

**Read the plan file and verify ALL checkboxes are checked.**

```
PLAN_PATH=".specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md"
```

**Steps:**
1. Read the plan file
2. Count total checkboxes: `- [ ]` and `- [x]` patterns
3. Count checked checkboxes: `- [x]` patterns only
4. Calculate completion percentage

| Completion % | Action |
|---|---|
| 100% | PASS — proceed |
| <100% | **BLOCK — go back and complete ALL pending steps** |

**Display:**
```
[Gate 1: Plan Checkboxes]
Plan: .specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md
Total: 12 | Checked: 10 | Completion: 83.3%
Unchecked:
- [ ] Phase 3 Step 2: Document API schema
- [ ] Phase 4 Step 1: Run integration tests
STATUS: BLOCKED (must be 100%)
```

---

## Gate 2: Artifact Existence & Hash Verification (BLOCKING)

**All files listed in the plan MUST exist and have valid hashes.**

**Steps:**
1. Parse plan file for `**Files to Create:**` and `**Files to Modify:**` sections
2. For each file path:
   - Verify file EXISTS on disk
   - Calculate current SHA256 hash: `certutil -hashfile <path> SHA256` (Windows)
   - If previously attested, verify hash matches

| Condition | Action |
|---|---|
| All files exist | PASS |
| Any file missing | **BLOCK — create missing files** |
| Hash mismatch | **BLOCK — file modified after creation, re-run validation** |

**Display:**
```
[Gate 2: Artifact Verification]
Files to Create (5 items):
| File | Status | Hash |
|------|--------|------|
| apps/ai-worker/src/chains/scoring.chain.ts | EXISTS | a1b2c3d4... |
| artifacts/benchmarks/accuracy-benchmarks.json | MISSING | N/A |
STATUS: BLOCKED — Create missing file
```

---

## Gate 2.5: CSV Artifact Reconciliation (BLOCKING)

**Cross-validate Sprint_plan.csv "Artifacts To Track" against the plan file and actual files on disk.**

This gate catches stale artifact paths, missing files, and divergence between what the CSV promises and what the plan/implementation actually created.

**CRITICAL — Check ALL prefix types, not just ARTIFACT:**

The "Artifacts To Track" column uses multiple prefixes. **Every prefix type is mandatory:**

| Prefix | What It Is | When Created | Common Miss |
|--------|-----------|-------------|-------------|
| `ARTIFACT:` | Source code files | During implementation (Phase 2-3) | Rarely missed |
| `EVIDENCE:` | Attestation/context files | During attestation (Phase 5) | **Often missed** — executor skips attestation phase |
| `FILE:` | Config/docs files | During implementation | Occasionally missed |
| (no prefix) | Plain path | Varies | Check context |

**Root cause of past failures**: Executors verify only `ARTIFACT:` paths (source code) and skip `EVIDENCE:` paths (attestation files like `context_ack.json`). This gate MUST check ALL prefixes equally.

**Steps:**
1. Read task's "Artifacts To Track" from Sprint_plan.csv
2. Split on `;` delimiter
3. For EACH entry, strip the prefix (`ARTIFACT:`, `EVIDENCE:`, `FILE:`) to get the raw path
4. **Verify EVERY path exists on disk** — no exceptions for any prefix type
5. Cross-reference with plan "Files to Create/Modify" sections
6. If paths differ between CSV and plan → **BLOCK** (fix CSV to match actual paths before proceeding)
7. If ANY file missing on disk → **BLOCK** — regardless of prefix type

| Condition | Action |
|---|---|
| All CSV artifacts exist on disk AND match plan | PASS |
| CSV has stale paths but files exist under different names | **BLOCK — fix CSV paths to match actual paths before proceeding** |
| Any `ARTIFACT:` file missing on disk | **BLOCK — create missing source file** |
| Any `EVIDENCE:` file missing on disk | **BLOCK — create attestation/evidence file before completing** |
| Any `FILE:` file missing on disk | **BLOCK — create missing config/doc file** |

**Display:**
```
[Gate 2.5: CSV Artifact Reconciliation]
| Prefix | Path | On Disk | In Plan | Status |
|--------|------|---------|---------|--------|
| ARTIFACT | apps/web/src/components/MyPage.tsx | YES | YES | PASS |
| ARTIFACT | apps/web/src/__tests__/MyPage.test.tsx | YES | YES | PASS |
| EVIDENCE | .specify/sprints/sprint-7/attestations/PG-144/context_ack.json | NO | NO | ❌ BLOCK |
STATUS: BLOCKED — EVIDENCE file missing (must create before completing)
```

**Resolution:**
- If CSV path is stale → update Sprint_plan.csv "Artifacts To Track" to match actual implementation
- If plan path diverged → update plan "Files to Create/Modify" to match
- If `EVIDENCE:` file missing → create the attestation/context_ack file (this is part of Phase 5)
- If file genuinely missing → create it or formally remove from tracking

**Why EVIDENCE files are often missed:**
EVIDENCE files (attestation.json, context_ack.json) are created in Phase 5 (attestation), not during implementation. If the executor jumps from "tests pass" directly to "update CSV to Completed", the EVIDENCE files never get created. This gate ensures Phase 5 cannot be skipped.

---

## Gate 3: Build Validation (BLOCKING)

**All four validation commands MUST pass with exit code 0.**

```bash
pnpm --filter <affected-package> typecheck  # Exit 0 required
pnpm --filter <affected-package> test --run  # Exit 0 required
pnpm --filter <affected-package> lint        # Exit 0 required
pnpm --filter <affected-package> build       # Exit 0 required
```

**IMPORTANT**: You MUST actually run these commands. Do NOT simulate or skip them.
If a command fails, fix the issue and re-run. Do NOT proceed to attestation.

**Display:**
```
[Gate 3: Build Validation]
| Check | Command | Exit Code | Duration | Status |
|-------|---------|-----------|----------|--------|
| Typecheck | pnpm --filter @intelliflow/ai-worker typecheck | 0 | 12.5s | PASS |
| Tests | pnpm --filter @intelliflow/ai-worker test --run | 0 | 45.0s | PASS |
| Lint | pnpm --filter @intelliflow/ai-worker lint | 1 | 8.0s | FAIL |
| Build | (not run — blocked by lint) | - | - | BLOCKED |
STATUS: BLOCKED — Fix lint errors
```

---

## Gate 4: STOA Gate Pass (BLOCKING)

**All STOA gates from MATOP must have passed.**

**Steps:**
1. Read STOA verdicts from `matop/stoa-verdicts/*.json`
2. Verify each verdict is PASS (not WARN, not FAIL)
3. Verify consensus verdict is PASS

| Verdict | Action |
|---|---|
| All PASS | PASS |
| Any WARN | **BLOCK — fix the warnings before proceeding. WARN is not acceptable.** |
| Any FAIL | **BLOCK — fix STOA failures** |

**Display:**
```
[Gate 4: STOA Gate Pass]
| STOA | Verdict | Issues |
|------|---------|--------|
| Foundation | PASS | 0 |
| Security | FAIL | pnpm-audit (3 moderate) |
| Quality | PASS | 0 |
Consensus: FAIL
STATUS: BLOCKED — All STOAs must be PASS
```

---

## Gate 5: Container Registration Check (BLOCKING — API/Backend Tasks)

**Skip if task has NO backend services, repositories, or routers.**

**Verifies that all services created by this task (and its dependencies) are actually wired in the DI container and context.**

**Why**: TypeScript typecheck and mocked tests can pass even when a service class exists but is never instantiated in the container. This causes runtime errors ("service not available") that static checks cannot detect.

**Steps:**

1. **Identify services** from the task's plan and attestation `artifact_hashes`:
   - Files matching `*Service.ts`, `*Repository.ts`, `*.router.ts`
2. **For each service class**:
   - Read `apps/api/src/container.ts` — verify `new ServiceName(...)` or equivalent instantiation
   - Read `apps/api/src/context.ts` — verify service is mapped to context (NOT optional/undefined)
3. **For each repository class**:
   - Verify it is imported and instantiated in `container.ts`
   - Verify its corresponding Prisma model exists in `packages/db/prisma/schema.prisma`
4. **For each router**:
   - Read `apps/api/src/router.ts` — verify the router is merged into `appRouter`

**Display:**
```
[Gate 5: Container Registration Check]
| Component | Type | In container.ts | In context.ts | In router.ts | Status |
|-----------|------|----------------|---------------|--------------|--------|
| ChainVersionService | Service | YES | YES (required) | N/A | PASS |
| PrismaChainVersionRepo | Repository | YES | N/A | N/A | PASS |
| chainVersion.router | Router | N/A | N/A | YES | PASS |
STATUS: PASS
```

| Condition | Action |
|---|---|
| All components wired | PASS |
| Service exists but not in container | **BLOCK — wire service in container.ts** |
| Service in container but optional in context | **BLOCK — make non-optional in context.ts** |
| Router not merged | **BLOCK — add to router.ts** |
| Task creates NO services/repos/routers (verified by scanning plan artifacts) | PASS — gate verified no backend components exist |

**CRITICAL**: "Frontend-only" is NOT a free pass. You MUST scan the plan's "Files to Create/Modify" for `*Service.ts`, `*Repository.ts`, `*.router.ts` patterns. If ANY backend file exists, this gate runs fully. Only PASS (not SKIP) if zero backend files found — and log what you scanned.

---

## Gate 6: Mock Coverage Audit (BLOCKING)

**Detects tests that mock away the exact integration they should be testing, hiding real failures.**

**Steps:**

1. **Identify all test files** created or modified by this task (from plan artifacts and attestation)
2. **Scan each test file for mock patterns**:
   ```
   vi.mock('...container...')    → CRITICAL: mocking the DI container itself
   vi.mock('...context...')      → CRITICAL: mocking the API context
   vi.mock('...Service')         → Check if mocked service exists in container
   mockReturnValue(...)          → Check what's being mocked
   ```
3. **Cross-reference with container.ts**:
   - If a test mocks `ServiceX` AND `ServiceX` is NOT instantiated in `container.ts` → **BLOCK**
   - If a test mocks the entire container → **BLOCK** (mocking the container hides all wiring issues)
4. **Cross-reference with context.ts**:
   - If a test mocks `ctx.services.X` AND `X` is optional/undefined in context → **BLOCK**

**Display:**
```
[Gate 6: Mock Coverage Audit]
| Test File | Mocked Component | In Container? | Status |
|-----------|-----------------|---------------|--------|
| ChainVersionEditor.test.tsx | useChainVersions (hook) | N/A (frontend) | OK |
| chain-version.router.test.ts | ctx.services.chainVersion | NO (optional) | FAIL |
STATUS: BLOCKED — Test mocks a service that doesn't exist in the container
```

| Condition | Action |
|---|---|
| All mocked services exist in container | PASS |
| Mocked service missing from container | **BLOCK — service must be wired first, test is hiding a gap** |
| Only frontend hooks/components mocked | PASS (acceptable for pure frontend) |
| Test mocks entire container | **BLOCK — mocking the container hides all wiring issues. Mock individual dependencies instead.** |

---

## Gate 7: Coverage Measurement (BLOCKING)

**Actual coverage must be measured and meet >=90% threshold. Self-attested claims are NOT valid.**

**Why**: Previous tasks wrote `"actual": "25/25 tests passing, all components covered"` — a qualitative claim, not a measurement. The KPI target is a percentage, so the actual must also be a percentage from `--coverage`.

**Steps:**

1. **Identify test files** from the plan and attestation `artifact_hashes` (files matching `*.test.ts`, `*.test.tsx`)
2. **Identify implementation files** to include in coverage scope (from plan "Files to Create/Modify")
3. **Run coverage command** with scoped includes:
   ```bash
   pnpm vitest run <test-files...> --coverage \
     --coverage.include='<impl-dir-1>/**' \
     --coverage.include='<impl-dir-2>/**' \
     --coverage.thresholds.lines=0 \
     --coverage.thresholds.functions=0 \
     --coverage.thresholds.statements=0 \
     --coverage.thresholds.branches=0
   ```
   (Thresholds set to 0 to prevent vitest from failing — we evaluate the numbers ourselves.)
4. **Parse the coverage table** from stdout: extract `% Stmts`, `% Branch`, `% Funcs`, `% Lines` for the "All files" row
5. **Evaluate against threshold**: Statements >= 90% AND Lines >= 90%

**CRITICAL**:
- Type-only files (e.g., `types.ts` with no runtime code) may show 0% — exclude them from the threshold calculation
- Fully-mocked files (e.g., hooks mocked in component tests) need their OWN unit tests to achieve coverage
- If hooks/utils are 0% because they're mocked in integration tests, write separate unit tests

| Condition | Action |
|---|---|
| Stmts >= 90% AND Lines >= 90% | PASS |
| Stmts < 90% OR Lines < 90% | **BLOCK — write more tests until both >= 90%** |

**Display:**
```
[Gate 7: Coverage Measurement]
Command: pnpm vitest run ... --coverage
| File | % Stmts | % Lines | % Funcs | % Branch |
|------|---------|---------|---------|----------|
| All files | 95.27 | 96.21 | 100 | 92.12 |
| drift-utils.ts | 100 | 100 | 100 | 100 |
| hooks.ts | 100 | 100 | 100 | 90.9 |
| DriftDashboard.tsx | 100 | 100 | 100 | 100 |
STATUS: PASS (95.27% stmts, 96.21% lines — both >= 90%)
```

**Attestation update**: The `kpi_results` entry for coverage MUST include the measured numbers:
```json
{ "kpi": "Test coverage >=90%", "actual": "95.27% stmts, 96.21% lines, 100% functions", "met": true }
```
NOT: `"actual": "25/25 tests passing, all components covered"` (this is a count, not coverage)

---

## Plan Deliverables Verification

The system parses the plan file and verifies:
1. **Files to Create/Modify**: All paths under those headings
2. **Implementation Steps**: All checkboxes from the plan

| Completion % | Status | Action |
|---|---|---|
| 100% | PASS | All deliverables verified |
| <100% | **BLOCK** | Missing deliverables — must complete ALL before proceeding |
