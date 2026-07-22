# Runbook: CI "E2E Tests" — `No tests found` (discovery fix)

**Status:** Fixed 2026-07-22 · **Workflow:** `.github/workflows/ci.yml` job
`e2e` · **Tracks:** GH #95

## Symptom

The `CI Pipeline → E2E Tests` job on `main` failed on **every push for weeks**
with:

```
Starting Playwright Global Setup...
Global setup completed
Error: No tests found.
Make sure that arguments are regular expressions matching test files.
##[error]Process completed with exit code 1.
```

Because the job is `if: push && ref == refs/heads/main` and `continue-on-error`
was removed (#212), this rendered `main` permanently red **and meant we had zero
real E2E signal** — a critical-path smoke gate that never actually asserted
anything.

## Root cause

The job ran:

```bash
pnpm exec playwright test --project=chromium tests/e2e/smoke.spec.ts
```

The positional argument `tests/e2e/smoke.spec.ts` is a **regular expression
matched against test file paths**. This resolved to **16 tests locally**
(Windows, Playwright 1.60.0) in every form tested — `--list`, full run, and
filter variants (`smoke.spec.ts`, `tests/e2e/smoke`, `-g "Smoke Tests"`) — but
resolved to **zero on the ubuntu-latest runner**. The failure appears _after_
`globalSetup` completes, which confirms Playwright collected the project, ran
setup, then the positional path-regex filtered the set down to zero on Linux.

This is a **platform-specific positional-file-path-filter resolution gap**, not:

- a missing test suite — `tests/e2e/smoke.spec.ts` is git-tracked with 16 real
  tests;
- a config error — `testDir: ./tests/e2e`, `testMatch: **/*.spec.ts`, and the
  `chromium` project's `testIgnore` do **not** exclude `smoke.spec.ts`;
- a build/artifact handoff failure — `apps/web/.next` downloads (129M) and
  `next start` boots ("Ready in 176ms") before this step.

### Verification performed

| Check                                                                       | Result                                |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `playwright test --project=chromium tests/e2e/smoke.spec.ts --list` (local) | 16 tests                              |
| Full run with a dummy server (globalSetup + collection)                     | `Running 16 tests using 6 workers`    |
| Filter variants `smoke.spec.ts` / `tests/e2e/smoke` / `-g "Smoke Tests"`    | 16 each                               |
| `git ls-files tests/e2e/smoke.spec.ts`                                      | tracked                               |
| `--grep "Smoke Tests"` uniqueness                                           | only smoke.spec.ts uses that describe |

The failure was **not reproducible on Windows**; it is specific to the CI Linux
runner's handling of the positional path-regex.

## Fix

Select the smoke suite by **test title** (`--grep "Smoke Tests"`) instead of a
positional file-path regex. Test titles are identical across OSes, so this
removes the path-resolution dependency entirely. A `--list` guard runs first and
fails **loud** — printing `cwd` and the full chromium discovery — if the count
is ever 0 again, so any regression is diagnosable in a single run rather than a
bare "No tests found".

```bash
count=$(pnpm exec playwright test --project=chromium --grep "Smoke Tests" --list \
  | grep -cE "smoke\.spec\.ts:[0-9]+")
[ "$count" -eq 0 ] && { echo "::error::0 smoke tests discovered"; ...diagnostics...; exit 1; }
pnpm exec playwright test --project=chromium --grep "Smoke Tests"
```

**Not masked:** `continue-on-error` was _not_ added and the job still fails red
on a genuine broken smoke path. The 16 tests are real and now actually run.

## Validation

- `--grep "Smoke Tests"` selects exactly 16 tests under `chromium` locally.
- YAML validated (`js-yaml` parse of `ci.yml`).
- **The E2E job only runs on push to `main`, not on PRs**, so the definitive
  proof is the first `main` run after this merges. The fail-loud guard
  guarantees that run is conclusive either way.

## Iteration 2 (2026-07-22, post-merge of #608)

The first fix (`--grep` title selection) **did not resolve it** — the post-merge
main run (job 89002927429) still failed, but the fail-loud guard paid off. It
proved:

- `cwd=/home/runner/work/IntelliFlow-CRM/IntelliFlow-CRM` (correct repo root);
- the guard's `test -f tests/e2e/smoke.spec.ts` **passed** — the file is on
  disk;
- yet `playwright test --project=chromium --list` returned
  **`Total: 0 tests in 0 files`**.

So the failure is **not a filter problem at all** — Playwright's chromium
project globs **zero files** on the ubuntu runner, even though the spec is
present on disk. Every locally-testable hypothesis was refuted on Windows
(positional path, `HAS_QA_ENV`, relative-testDir-vs-cwd all still find 16). It
is Linux-runner specific and not reproducible on this Windows host.

Iteration-2 changes:

1. `playwright.config.ts` — `testDir` is now `path.join(__dirname, 'tests/e2e')`
   (absolute) instead of `'./tests/e2e'`, so discovery cannot depend on cwd.
2. The `Run E2E tests` step now dumps rich diagnostics **before** running:
   `PW_VERSION`, `ls -la tests/e2e`, `find tests -name '*.spec.ts'`,
   `realpath tests/e2e`, and an **unfiltered** `playwright test --list` (all
   projects). The next main run will show definitively whether the files are
   where Playwright globs and whether ANY project discovers ANY test.

## If it is still red after merge

Read the iteration-2 diagnostics in the `Run E2E tests` step log:

- If `ls tests/e2e` shows `smoke.spec.ts` but unfiltered `--list` is still 0 → a
  Playwright/Linux glob or transform failure; pin discovery via a dedicated
  `smoke` project (`testMatch: ['**/smoke.spec.ts']`) or `--config` with an
  explicit absolute `testDir`.
- If `ls tests/e2e` is empty/missing → the checkout or `download-artifact` step
  is clobbering the tree; fix the artifact layout, not Playwright.

## ROOT CAUSE FOUND (iteration 3, 2026-07-22)

The iteration-2 diagnostic dump (main run 29947499690, job 89018222356) was
conclusive:

- `PW_VERSION=1.60.0` (identical to local — not a version skew);
- `ls -la tests/e2e` shows `smoke.spec.ts` present (9471 bytes);
- **unfiltered `playwright test --list` → `Total: 868 tests in 25 files`** —
  Playwright discovers the full suite fine, including smoke (listed under the
  `[tablet]` project);
- but `--project=chromium` → **0**.

**Root cause:** the `tablet`/`mobile-*` projects use an **explicit `testMatch:
['**/smoke.spec.ts']`** and discover `smoke.spec.ts`on the ubuntu runner. The`chromium`project has **no explicit`testMatch`** — it relies on the inherited global `testMatch:
'**/\*.spec.ts'`plus a`testIgnore` array — and that combination globs **0
files\*\* on Linux (`Total: 0 tests in 0 files`), even though the spec is on
disk. Explicit `testMatch` works; inherited-global + `testIgnore` does not. Not
reproducible on Windows — a Playwright 1.60 Linux-specific quirk.

**Fix (iteration 3):** a dedicated `smoke` project with an **explicit
`testMatch:
['**/smoke.spec.ts']`** (Desktop Chrome engine, to match the chromium-only `playwright
install`in CI), and the CI job runs`playwright test
--project=smoke`. This mirrors the discovery form proven to work on the runner. Verified locally (16 tests, both `HAS_QA_ENV`
modes). The diagnostic dump + fail-loud guard are retained.

## Related (out of scope here)

The broader E2E suite (129 backend-dependent specs) is quarantined to
`e2e-full.yml` (scheduled + manual). Expanding real E2E coverage beyond the
smoke critical-path is tracked separately at GH #95.
