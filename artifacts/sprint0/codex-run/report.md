# IntelliFlow CRM - Validation System Audit (Sprint 0 + Sprint Data)

Repo: `C:\taly\intelliFlow-CRM`  
Date: 2025-12-19

## 1) Executive summary

`pnpm run validate:sprint0` reports **"Sprint 0 is complete!"** purely because a set of mostly *existence* checks passed, not because Sprint 0 work is actually complete or the repo is governance-clean. In the current repo state, the canonical sprint plan still has a Sprint 0 task in `Planned`, yet `validate:sprint0` exits `0` and prints completion; and the validators do not gate on "no runtime artifacts under `docs/`", allowing ignored doc-artifacts to persist undetected.

## 2) Findings

### False positives (what passed but shouldn't)

**FP1 - `validate:sprint0` declares Sprint completion without checking Sprint completion.**  
Evidence:
- CLI output shows success and explicit completion claim:
  - `pnpm run validate:sprint0` -> exit `0` and prints `[OK] Sprint 0 is complete! All validations passed.` (see `artifacts/sprint0/codex-run/validation-output.txt` and reproduced locally on this run).
- Code makes the completion claim conditional only on "all validations passed", not on Sprint data:
  - `tools/scripts/sprint0-validation.ts` -> `printSummary()` prints completion when `totalPassed === totalTests` (line ~527-528).
- Sprint plan indicates Sprint 0 is **not** fully done:
  - PowerShell:
    ```powershell
    Import-Csv apps/project-tracker/docs/metrics/_global/Sprint_plan.csv |
      Where-Object { $_.'Target Sprint' -eq '0' -and $_.Status -notin @('Done','Completed') } |
      Select-Object 'Task ID',Status,Title
    ```
    Output:
    ```
    Task ID   Status  Title
    -------   ------  -----
    EP-001-AI Planned
    ```

**FP2 - "Task Metrics" in `validate:sprint0` is a partial spot-check (2 files), but is treated as "Sprint complete".**  
Evidence:
- `tools/scripts/sprint0-validation.ts` -> `validateTaskMetrics()` checks only:
  - `apps/project-tracker/docs/metrics/sprint-0/phase-4-final-setup/ENV-017-AI.json`
  - `apps/project-tracker/docs/metrics/sprint-0/phase-5-completion/ENV-018-AI.json`
  (line ~456-492)
- Meanwhile, Sprint Data validation identifies **28** Sprint 0 tasks and **28** task JSON files:
  - `pnpm run validate:sprint-data` output:
    ```
     Validating 305 tasks from CSV...
     Found 28 Sprint 0 tasks
        Completed: 27
        Planned: 1
     Found 28 task JSON files
     All Sprint data validations passed!
    ```

**FP3 - "Testing" checks in `validate:sprint0` can pass even if tests fail.**  
Evidence:
- `tools/scripts/sprint0-validation.ts` -> `validateTestInfrastructure()` only checks:
  - files exist under `tests/` (`fileExists(...)`)
  - deps exist in `package.json` (`hasDependency(...)`)
  - it never executes `pnpm test`, `vitest`, or Playwright (line ~215-281).

### Missing checks (what it doesn't validate at all)

**MC1 - No governance rule preventing runtime artifacts under `docs/` (or `docs/metrics`).**  
Evidence:
- `tools/scripts/sprint0-validation.ts` -> `validateDocumentation()` only checks:
  - `README.md`, `CLAUDE.md`, `docs/` exists, and `Sprint_plan.csv` exists (line ~342-376).
  - It does not scan for forbidden/ignored runtime outputs under `apps/project-tracker/docs/**`.
- Repo *explicitly* expects doc-runtime outputs to exist and be ignored:
  - `.gitignore` includes:
    - `.gitignore:109` `apps/project-tracker/docs/artifacts/`
    - `.gitignore:113-124` entries for `apps/project-tracker/docs/metrics/{backups,artifacts,.locks,.status,logs}/`
- Ignored runtime-ish files exist today under `apps/project-tracker/docs`:
  - `git ls-files -o -i --exclude-standard apps/project-tracker/docs`
    ```
    apps/project-tracker/docs/.specify/memory/constitution.md
    apps/project-tracker/docs/artifacts/blockers.json
    apps/project-tracker/docs/artifacts/human-intervention-required.json
    ```
  - and those are ignored via:
    - `git check-ignore -v apps/project-tracker/docs/artifacts/blockers.json`
      ```
      .gitignore:109:apps/project-tracker/docs/artifacts/  apps/project-tracker/docs/artifacts/blockers.json
      ```

**MC2 - No canonical "source of truth" uniqueness checks (duplicate plans/registries/graphs).**  
Evidence:
- `tools/scripts/sprint0-validation.ts` checks existence of `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` only; it does not assert there are *no other* `Sprint_plan.csv` copies.
- Current tracked state shows single copies (good), but this is not enforced:
  - `git ls-files | Select-String -Pattern "Sprint_plan\\.csv|Sprint_plan\\.json|task-registry\\.json|dependency-graph\\.json"`
    ```
    apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
    apps/project-tracker/docs/metrics/_global/Sprint_plan.json
    apps/project-tracker/docs/metrics/_global/dependency-graph.json
    apps/project-tracker/docs/metrics/_global/task-registry.json
    ```
  - `rg --files -g "Sprint_plan.csv"` returns only:
    ```
    apps\project-tracker\docs\metrics\_global\Sprint_plan.csv
    ```

**MC3 - `validate:sprint-data` does not validate several "semantic integrity" properties it claims/needs.**  
Evidence in `tools/scripts/validate-sprint-data.ts`:
- Header comment says it validates "status, description, sprint" (line ~8), but code only checks status (and optionally description); it does **not** verify a JSON "sprint" field matches the CSV.
- `_summary.json` missing is only a warning (line ~105) and warnings do not fail the run:
  - `return { passed: errors.length === 0, errors, warnings };` (line ~171)
- Orphaned JSON files are warnings only (line ~122), which allows drift to accumulate without failing CI.

### Misleading messaging (claims not supported by checks)

**MM1 - The `validate:sprint0` success banner is incorrect in meaning.**  
Evidence:
- `tools/scripts/sprint0-validation.ts` prints:
  - `[OK] Sprint 0 is complete! All validations passed.`
  - even though the script does not inspect completion criteria (CSV statuses, JSON evidence, etc.).

**MM2 - "All Sprint data validations passed" is easy to misread as "Sprint complete".**  
Evidence:
- `tools/scripts/validate-sprint-data.ts` is primarily a **consistency** validator (CSV <-> JSON <-> summary), not a completion gate, but its final line is unconditional on completion state.

## 3) Recommended remediation (prioritized, incremental)

### P0 - Make outputs truthful + add governance-grade checks (no file moves)

1) **Fix `validate:sprint0` messaging to not claim Sprint completion.**  
Modify: `tools/scripts/sprint0-validation.ts` -> `printSummary()`  
Change the final success message from "Sprint 0 is complete!" to something like:
- `[OK] Sprint 0 baseline validations passed (structure/config only).`
- Add a second line for "Sprint completion gate: NOT RUN" or "Sprint completion gate: PASS/WARN/FAIL".

2) **Add an explicit Sprint 0 completion check (WARN by default; FAIL in CI/strict mode).**  
Modify: `tools/scripts/sprint0-validation.ts` (or add a small helper module used by it)  
Check:
- Parse `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Filter `Target Sprint == 0`
- If any are not `Done|Completed`, emit:
  - `[WARN] Sprint completion: 1 incomplete Sprint 0 tasks (e.g. EP-001-AI Planned)`
  - exit code stays `0` locally unless `--strict` / `VALIDATION_STRICT=1` is set.

3) **Add "no runtime artifacts under docs/" rule (WARN by default; FAIL in CI/strict mode).**  
Modify: `tools/scripts/sprint0-validation.ts`  
Check (cross-platform, fast, and catches ignored files):
- Run `git ls-files -o -i --exclude-standard apps/project-tracker/docs`
- Fail/Warn if any paths are returned under:
  - `apps/project-tracker/docs/artifacts/`
  - `apps/project-tracker/docs/metrics/{logs,backups,artifacts,.locks,.status}/`
Allowlist exceptions (explicit and documented), e.g.:
- `apps/project-tracker/docs/.specify/**` (if intentionally local-only)

4) **Add uniqueness checks for canonical plan/registry/graph paths.**  
Modify: `tools/scripts/sprint0-validation.ts` and/or `tools/scripts/validate-sprint-data.ts`  
Checks:
- `git ls-files | rg -c "apps/project-tracker/docs/metrics/_global/Sprint_plan\\.csv$"` must equal `1`
- same for `task-registry.json`, `dependency-graph.json`
- If >1, FAIL with a list of duplicates.

5) **Improve `validate:sprint-data` robustness & clarity (no behavioral change by default).**  
Modify: `tools/scripts/validate-sprint-data.ts`  
Add:
- Print resolved absolute paths:
  - `console.log("CSV:", path.resolve(CSV_PATH))`
  - `console.log("METRICS_DIR:", path.resolve(METRICS_DIR))`
- Validate required CSV headers exist (`Task ID`, `Status`, `Target Sprint`) and FAIL if missing.
- Validate `Task ID` uniqueness in the CSV (FAIL on duplicates).
- Optionally add `--require-sprint0-complete` (or env var) that FAILs if any Sprint 0 tasks are not Done/Completed (so completion is an explicit opt-in gate).

### P1 - Small refactors to reduce drift + enable regression tests

1) **Centralize path resolution** used by both scripts.  
Add: `tools/scripts/lib/paths.ts` exporting canonical absolute paths based on `process.cwd()`.

2) **Schema-validate JSON metrics** using existing schemas.  
Leverage `apps/project-tracker/docs/metrics/schemas/*.schema.json` with `ajv` to validate:
- task JSON files
- `_phase-summary.json`
- `sprint-0/_summary.json`

3) **Introduce a severity model**: `PASS | WARN | FAIL` with a consistent exit policy.  
Suggested behavior:
- Default: exit `1` on any FAIL; exit `0` if only WARNs.
- CI / strict: exit `2` if WARNs exist (or treat WARN as FAIL).

## 4) Definition of Done (DoD) for improved validations

1) `pnpm run validate:sprint0` no longer prints "Sprint 0 is complete" unless an explicit completion check passes.  
2) `pnpm run validate:sprint0` reports separate gates:
- Structural readiness (files/dirs/deps)
- Sprint data consistency (CSV <-> JSON <-> summary)
- Sprint completion (optional / strict)
- Docs hygiene ("no runtime artifacts under docs/")
3) Docs hygiene gate detects ignored runtime artifacts via `git ls-files -o -i --exclude-standard apps/project-tracker/docs` and:
- WARNs locally by default
- FAILs in strict/CI mode
4) Duplicate canonical artifacts (multiple `Sprint_plan.csv`, `task-registry.json`, `dependency-graph.json`) cause FAIL with the duplicate list.
5) Missing required CSV columns or duplicate `Task ID`s cause FAIL.

## 5) Test plan for validations (prevent regressions)

1) Add **negative tests** for the new hygiene + duplication checks.  
Approach (minimal refactor):
- Extract core checks into pure functions (input: file lists / parsed CSV rows) and unit-test with Vitest.
- Keep CLI scripts as thin wrappers.

2) Add a fixture-driven test for forbidden doc-runtime artifacts:
- Create a temp directory structure with `apps/project-tracker/docs/artifacts/foo.json`
- Assert validator returns WARN/FAIL depending on strict mode.

3) Add a duplicate plan artifact test:
- Fixture contains 2 files matching `**/Sprint_plan.csv`
- Assert validator FAILs and lists both paths.

4) Add CSV header & task-id integrity tests:
- Missing `Target Sprint` column -> FAIL
- Duplicate `Task ID` rows -> FAIL

5) Add an "incomplete Sprint 0" test (completion gate only):
- One Sprint 0 task in `Planned` -> completion gate WARN/FAIL (depending on strict mode), but consistency gate still PASS.

---

## Evidence (CLI checks performed)

### Scripts invoked by pnpm

`package.json`:
```json
"validate:sprint0": "tsx tools/scripts/sprint0-validation.ts",
"validate:sprint-data": "tsx tools/scripts/validate-sprint-data.ts"
```

### Validation runs

`pnpm run validate:sprint0` (exit 0) prints:
```
[OK] Sprint 0 is complete! All validations passed.
```

`pnpm run validate:sprint-data` (exit 0) prints:
```
 Found 28 Sprint 0 tasks
    Completed: 27
    Planned: 1
 All Sprint data validations passed!
```

### Metrics inventory (filesystem)

PowerShell:
```powershell
Get-ChildItem -Recurse apps/project-tracker/docs/metrics | Select FullName
```
Result: metrics contains tracked schemas + Sprint 0 JSONs + `_global` plan artifacts (no `logs/`, `.locks/`, `.status/` in this workspace at the time of this run).

### Metrics inventory (git-tracked)

```powershell
git ls-files apps/project-tracker/docs/metrics
```
Includes `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` and Sprint 0 task JSONs, but does not provide any hygiene guarantees about ignored/untracked runtime outputs.

### Duplicate plan artifacts (git-tracked)

```powershell
git ls-files | Select-String -Pattern "Sprint_plan\.csv|Sprint_plan\.json|task-registry\.json|dependency-graph\.json"
```
Output:
```
apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
apps/project-tracker/docs/metrics/_global/Sprint_plan.json
apps/project-tracker/docs/metrics/_global/dependency-graph.json
apps/project-tracker/docs/metrics/_global/task-registry.json
```

### Runtime file types under docs (git-tracked)

```powershell
git ls-files apps/project-tracker/docs | Select-String -Pattern "\.log$|\.lock$|\.csv$|backups/|\.status/|\.locks/|logs/"
```
Output:
```
apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
apps/project-tracker/docs/metrics/plan-remediation.csv
```

### Runtime artifacts under docs (ignored, present)

```powershell
git ls-files -o -i --exclude-standard apps/project-tracker/docs
```
Output:
```
apps/project-tracker/docs/.specify/memory/constitution.md
apps/project-tracker/docs/artifacts/blockers.json
apps/project-tracker/docs/artifacts/human-intervention-required.json
```

### Artifacts directory gitignore check

```powershell
git check-ignore -v artifacts/reports 2>$null
git status --porcelain
```
Result: `git check-ignore` produced no ignore rule for `artifacts/reports`, and `git status` shows multiple tracked + untracked paths under `artifacts/` (so it is not globally ignored).
