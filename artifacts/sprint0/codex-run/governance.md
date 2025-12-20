You are Codex acting as a Senior Monorepo Governance Engineer (TypeScript + pnpm/turbo + CI). You will implement fixes to our validation system to eliminate false confidence and make results governance-grade.

Repo: intelliFlow-CRM (Windows environment is common)
Goal: Make validators truthful, enforce key hygiene invariants, and provide strict-mode gates for CI—WITHOUT moving source-code files in this change set.

Context (facts you must treat as true):
- `pnpm run validate:sprint0` executes `tsx tools/scripts/sprint0-validation.ts`
- `pnpm run validate:sprint-data` executes `tsx tools/scripts/validate-sprint-data.ts`
- Current issue: validate:sprint0 prints “[OK] Sprint 0 is complete!” purely based on existence checks; it does not verify Sprint completion.
- Current Sprint Plan indicates Sprint 0 is NOT complete: EP-001-AI is Planned.
- `validate:sprint-data` reports Sprint 0 tasks: Completed 27, Planned 1, and still exits 0 and prints “All Sprint data validations passed.”
- There are ignored runtime-ish files under `apps/project-tracker/docs/artifacts/*` and `.gitignore` ignores multiple `apps/project-tracker/docs/metrics/*` runtime paths.
- Root `artifacts/` currently exists, but may not be fully gitignored; evidence suggests tracked/untracked changes under `artifacts/`.

HARD CONSTRAINTS:
1) Do not move source-code files (.ts/.tsx/.js). Do not rename directories.
2) Focus on validators and minimal supporting utilities/tests only.
3) Add new checks in a conservative mode: WARN by default, FAIL only in strict/CI mode.
4) The scripts must remain fast (<2 seconds typical) and cross-platform (Windows + Linux).
5) Output must be unambiguous: separate “baseline readiness”, “data consistency”, “completion”, and “hygiene”.

SUB-AGENT MODEL (you must explicitly follow this):
- Sub-agent A: Validator UX / Messaging Fix
  - Update script output to remove unsupported completion claims.
  - Ensure summary clearly states what was checked and what was NOT checked.
- Sub-agent B: Governance Rules (Hygiene + Uniqueness)
  - Add “no runtime artifacts under docs” rule using git ignored/untracked detection.
  - Add canonical uniqueness checks (Sprint_plan.csv/json, task-registry.json, dependency-graph.json).
- Sub-agent C: Strict Mode + Exit Semantics
  - Add strict mode controlled by CLI flag `--strict` and env `VALIDATION_STRICT=1`.
  - In strict mode: WARNs become FAILs (exit code 1). In non-strict: WARN does not fail.
- Sub-agent D: Test Harness (Negative tests)
  - Add Vitest unit tests for new rules using fixture-based inputs (no heavy filesystem deps where possible).
  - Add at least one integration-style test that mocks `git ls-files -o -i --exclude-standard` output.

FILES YOU MUST REVIEW/MODIFY:
- `tools/scripts/sprint0-validation.ts`
- `tools/scripts/validate-sprint-data.ts`
- Add a small shared helper module, e.g. `tools/scripts/lib/validation-utils.ts` (path resolution, strict mode, printing, shell execution, csv parsing helper).
- Add tests under `tools/scripts/__tests__/` or a similar appropriate location.
- If needed, update root `package.json` scripts (only if strictly necessary; avoid churn).

MANDATORY IMPLEMENTATION REQUIREMENTS:

A) Fix misleading messaging in `validate:sprint0`
- Replace “Sprint 0 is complete!” with:
  - “[OK] Sprint 0 baseline validations passed (structure/config only).”
- Print an explicit section summarizing gates:
  - Baseline structure: PASS/FAIL
  - Sprint completion gate: NOT RUN / WARN / FAIL / PASS (depending on configuration)
  - Docs hygiene gate: WARN/FAIL/PASS
- Ensure messages match actual checks performed.

B) Add an explicit Sprint 0 completion check (WARN by default)
- In `sprint0-validation.ts`, add a check that parses the canonical CSV (see below) and determines:
  - All Sprint 0 tasks have Status in {Done, Completed} => PASS
  - Otherwise => WARN in default mode, FAIL in strict mode
- Must print a concise summary including up to 5 incomplete tasks (Task ID + Status + Title), and the count.

C) Define canonical CSV location + resolve confusion
- Current code checks `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`.
- Our system sometimes references a root `Sprint_plan.csv`.
- Implement explicit resolution priority:
  1) If env `SPRINT_PLAN_PATH` is set, use it (absolute or repo-relative).
  2) Else prefer `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` if it exists.
  3) Else fallback to `Sprint_plan.csv` at repo root if it exists.
  4) Else FAIL with clear error.
- Print the resolved absolute CSV path in both validators.

D) Add “no runtime artifacts under docs” hygiene rule (WARN default; FAIL strict)
- Implement using `git ls-files -o -i --exclude-standard apps/project-tracker/docs`
- If any returned paths match forbidden areas, emit WARN/FAIL:
  - `apps/project-tracker/docs/artifacts/**`
  - `apps/project-tracker/docs/metrics/**` where subpaths include `.locks/`, `.status/`, `logs/`, `backups/`, `artifacts/`
- Allowlist:
  - `apps/project-tracker/docs/.specify/**` (treat as allowed by default)
  - Provide a mechanism for allowlist extension via config file or inline list.

E) Add uniqueness checks for canonical “source-of-truth” artifacts (FAIL always)
- Enforce exactly one copy of each in tracked files:
  - `**/Sprint_plan.csv`
  - `**/Sprint_plan.json`
  - `**/task-registry.json`
  - `**/dependency-graph.json`
- Use `git ls-files` to find tracked copies; FAIL if count != 1 and list duplicates.

F) Improve `validate:sprint-data` truthfulness + robustness
- Keep it as a consistency validator; DO NOT claim sprint completion.
- Print:
  - resolved CSV path
  - resolved metrics dir path
- Add FAIL checks:
  - required CSV headers must exist: `Task ID`, `Status`, `Target Sprint`
  - `Task ID` uniqueness in CSV (no duplicates)
- Keep current orphan checks as WARN by default; FAIL in strict mode.

G) Exit codes / severity policy
- Standardize results across both scripts:
  - FAIL => exit 1
  - WARN => exit 0 in default, exit 1 in strict
  - PASS only => exit 0
- Ensure the printed summary clearly indicates how many PASS/WARN/FAIL.

H) Add regression tests (minimum acceptable)
- Unit tests for:
  - sprint completion evaluation logic
  - uniqueness detection logic (given a list of paths)
  - hygiene matcher logic (given mocked git output)
  - strict-mode semantics (WARN => FAIL)
- Provide at least one “negative test” verifying:
  - EP-001-AI Planned causes completion gate WARN (default) and FAIL (strict)
  - ignored artifacts under `apps/project-tracker/docs/artifacts/` triggers hygiene WARN/FAIL

DEFINITION OF DONE (DoD):
1) `pnpm run validate:sprint0` no longer prints “Sprint 0 is complete” unless completion gate explicitly passes.
2) Both scripts print resolved canonical paths (CSV and metrics dir) so we can detect wrong-source reads immediately.
3) Hygiene rule detects ignored runtime artifacts under docs using `git ls-files -o -i --exclude-standard` and:
   - WARNs in default mode; FAILs in strict.
4) Uniqueness rule fails if duplicate “source-of-truth” artifacts exist.
5) Strict mode works via `--strict` and `VALIDATION_STRICT=1`.
6) New tests exist and pass.

DELIVERABLES:
- Code changes (as PR-ready patch) implementing the above.
- Brief changelog in the script output or a short markdown note under `docs/operations/` describing the new semantics.
- Do not introduce broad formatting churn.

After changes, provide example console outputs for:
- Default mode with EP-001-AI Planned (should WARN, exit 0)
- Strict mode with EP-001-AI Planned (should FAIL, exit 1)
- Repo with forbidden ignored docs artifacts present (WARN/FAIL depending on mode)
