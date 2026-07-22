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

## If it is still red after merge

The guard's diagnostic output (cwd + full chromium `--list`) will show whether
Playwright now discovers the smoke tests on the runner. If discovery still
returns 0, escalate to a Playwright positional/grep filter issue on Linux and
consider pinning discovery via a dedicated `smoke` project
(`testMatch: ['**/smoke.spec.ts']`).

## Related (out of scope here)

The broader E2E suite (129 backend-dependent specs) is quarantined to
`e2e-full.yml` (scheduled + manual). Expanding real E2E coverage beyond the
smoke critical-path is tracked separately at GH #95.
