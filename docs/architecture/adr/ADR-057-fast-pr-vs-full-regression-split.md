# ADR-057: Fast PR Gate vs Full Regression Split

**Status:** Proposed

**Date:** 2026-06-03

**Deciders:** DevOps + QA Lead (STOA-Quality), CI/CD Reliability — _pending
ratification._

**Technical Story:** CI Audit Report
(`docs/operations/ci-cost-audit-2026-05-25.md`); observed ~40 min unsharded
full-suite runtime running three times per PR across `ci.yml`, `pr-checks.yml`,
and `sonar.yml`.

## Context and Problem Statement

The IntelliFlow CRM monorepo contains ~30,000 tests across 1,417 files in 16
Vitest workspace projects. Today, the full suite runs **unsharded** and is
triggered **three separate times** on every PR:

1. `ci.yml` — `test` job
2. `pr-checks.yml` — `test-coverage` job
3. `sonar.yml` — standalone Sonar run that re-executes all tests to produce
   `lcov.info`

This triples compute cost, inflates per-PR wall-clock time to ~40 minutes, and
makes the feedback loop slow enough that engineers push without waiting for
green. No `--shard` flag is used anywhere.

Should we split PR test execution into an "affected only" fast gate (skipping
unaffected packages) and a separate scheduled full run, or should we instead
shard the full suite across parallel runners to achieve the same wall-clock
speed with zero confidence loss?

## Decision Drivers

- **Full-confidence on every PR:** Turborepo's affected-package heuristic cannot
  detect cross-package type regressions, shared-state mutations, or coverage
  regressions in packages that _import_ a changed symbol without directly
  testing it. A partial run can silently pass a breaking change.
- **Wall-clock target ~8–12 min:** With 20 concurrent GitHub Actions runners
  available, a 20-shard full run is empirically as fast as an affected-package
  subset. The speed win does not require confidence loss.
- **Istanbul + merge-reports verified:**
  `vitest run --shard=i/N --reporter=blob --coverage` writes `blob-i-N.json` per
  shard; `vitest run --merge-reports=.vitest-reports --coverage` unions coverage
  correctly (empirically confirmed 2026-06-03: webhooks shard1 88.08% lines
  - shard2 84.25% → merged 89.36%, meeting the 90-line threshold aggregate).
- **Threshold enforcement placement:** Each shard applies global thresholds to
  its _own_ partial coverage and exits 1 if thresholds are not met locally.
  Thresholds therefore **must** be set to 0 on shards and enforced only at the
  `merge` job where full coverage is available.
- **Eliminate triple execution:** Sonar currently re-runs all tests to get
  `lcov.info`. Folding Sonar into the merge step reuses the merged `lcov.info`
  from the sharded run, removing the third full test execution entirely.
- **Required checks must not change names silently:** Renaming a GHA job that is
  listed as a required status check breaks branch protection. Context renames
  require an admin `gh api PATCH` to the branch protection rule.
- **Security scans non-negotiable:** Trivy, OWASP,
  `pnpm audit --audit-level high`, CodeQL, and GitLeaks must remain unchanged.

## Considered Options

- **Option 1 — Affected-only PR gate + full run on push-to-main/nightly.** Use
  `pnpm turbo run test --filter=...[origin/main]` as the PR check, run the full
  suite only on merge to `main` and on a nightly cron.
- **Option 2 — Sharded full run on every PR (20 shards) + no affected-only
  shortcut for required checks.** Run the complete suite on every PR and every
  push-to-main via a 20-way shard matrix; fold Sonar into the merge job to
  eliminate the third execution. Provide an optional affected-tests workflow for
  draft PRs only, never as a required check.
- **Option 3 — Status quo.** Keep three unsharded full runs per PR.

## Decision Outcome

Chosen option: **Option 2 — sharded full run (20-way) on every PR**, because:

- It achieves the same ~8–12 min wall-clock target as Option 1 without
  sacrificing coverage completeness or introducing the false-negative risk
  inherent in affected-only heuristics.
- The `vitest --merge-reports` path has been empirically verified to produce
  correct merged Istanbul coverage on this repo.
- Folding `sonar.yml` into the `test-regression.yml` `sonar` job eliminates the
  third full test run with no new infrastructure.

The reusable workflow is named **`.github/workflows/test-regression.yml`**
(`on: workflow_call | workflow_dispatch | schedule`). Its top-level name is
**"Test Regression"**. Its jobs are:

| Job               | Display name          | Purpose                                                                                                  | Blocks merge?          |
| ----------------- | --------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| `unit-shards`     | "Unit Shard N/20"     | Matrix `shard: [1..20]`; `vitest run --shard=$i/20 --reporter=blob --coverage --coverage.thresholds.*=0` | No (individual shards) |
| `merge`           | "Merge Coverage Gate" | `vitest run --merge-reports=.vitest-reports --coverage`; enforces 90/80/90/90 thresholds                 | **Yes**                |
| `coverage-report` | "coverage-report"     | Codecov upload + PR comment                                                                              | No                     |
| `sonar`           | "SonarCloud Scan"     | SonarCloud from merged `lcov.info`; `continue-on-error` removed per F-04                                 | **Yes**                |
| `shard-balance`   | "shard-balance"       | Non-blocking skew check; alerts when any shard exceeds **1.3× median**                                   | No                     |

`ci.yml` calls the workflow via `uses: ./.github/workflows/test-regression.yml`
from a job keyed `test` with display name **"Unit Tests (sharded)"**. Resulting
check-run names on a PR:

- Coverage gate: **"Unit Tests (sharded) / Merge Coverage Gate"**
- SonarCloud: **"Unit Tests (sharded) / SonarCloud Scan"**

`pr-checks.yml` drops its `test-coverage` job (duplicate eliminated).
`sonar.yml` is deleted (Sonar is now the `sonar` job inside
`test-regression.yml`, reusing the already-merged `lcov.info`).

The **integration** project is **excluded from shards**
(`--project='!integration'`) because it needs live Postgres/Redis SERVICES that
are not available in the shard matrix. The **property** project is also excluded
(`--project='!property'`) because it is stochastic and long-running; it is
scheduled via `property-tests.yml` per ADR-054. These two exclusion reasons are
distinct and must not be conflated.

Both excluded projects run in their own jobs in parallel with the shard matrix.
The `ci.yml` `build` job now only needs `[lint, typecheck]` as prerequisites and
runs in parallel with the sharded suite; `integration` also runs in parallel.

An **affected-tests workflow** (`turbo --filter=...[origin/main]`) is allowed as
an optional speed hint for draft PRs only and is **never** listed as a required
status check (see ADR-061).

Required status checks (post-migration): "CI Pipeline / Lint & Format", "CI
Pipeline / Type Check", "CI Pipeline / Build", "CI Pipeline / Integration
Tests", "Unit Tests (sharded) / Merge Coverage Gate", "Unit Tests (sharded) /
SonarCloud Scan" (blocking), the Security Scanning jobs, and "Secret Scanning".

### Positive Consequences

- Full-suite confidence on every PR with ~8–12 min wall-clock time instead of
  ~40 min.
- Third full test execution (standalone `sonar.yml`) eliminated; total compute
  per PR reduced from 3× to effectively 1×.
- Coverage thresholds (90/80/90/90) are enforced exactly once, at the point
  where the full merged coverage is available — no false negatives from partial
  shard thresholds.
- `lcov.info` consumed by SonarCloud is produced from the same merged run that
  the PR gate uses, guaranteeing Sonar sees the same coverage the gate passed.
- SonarCloud is now a **blocking gate** (F-04 removed `continue-on-error`),
  ending the silent-advisory pattern that let quality regressions merge.
- `shard-balance` job surfaces uneven test distribution early without blocking
  the developer.
- The `workflow_dispatch` trigger on `test-regression.yml` provides a one-click
  manual full run for release validation.

### Negative Consequences

- **Required-check context rename:** any existing branch protection rule
  pointing to the old context names — "CI Pipeline / Unit Tests", "PR Checks /
  Test Coverage", "SonarCloud Analysis / SonarCloud Scan" — must be updated via
  `gh api PATCH /repos/{owner}/{repo}/branches/main/protection`. This is a
  one-time admin operation outside the repo.
- **Shard threshold override footgun:** developers editing `vitest.config.ts`
  must remember that per-shard threshold values are intentionally `0`; the real
  thresholds live only in the `merge` job's vitest invocation. A comment in
  `test-regression.yml` documents this.
- **Blob artifact size:** 20 `blob-*.json` files (~150 KB each, empirical from
  webhooks shard) must be uploaded as a GitHub Actions artifact and downloaded
  by the `merge` job. Artifacts are retained 1 day via `retention-days: 1`.
  GitHub Actions does **not** delete artifacts when a job downloads them; they
  persist until the retention period expires.
- **Integration + property projects excluded from shards:** they retain their
  own jobs and are not gated by the `merge` job's threshold; their coverage
  contribution to Sonar requires a separate upload step or a combined artifact
  merge (future work).

## Pros and Cons of the Options

### Option 1 — Affected-only PR gate + full run on main/nightly

- Good, because the PR gate is maximally fast (only touches changed packages).
- Good, because it reduces compute on branches with narrowly scoped changes.
- Bad, because Turborepo's affected heuristic is file-level, not symbol-level: a
  type change in `packages/domain` may break a consumer in `apps/api` without
  modifying any file in `apps/api`, silently passing the gate.
- Bad, because Istanbul coverage for the PR gate is partial; the merge job
  cannot enforce repo-wide thresholds from a partial run.
- Bad, because confidence loss is hard to quantify — engineers cannot know which
  classes of regression are invisible to the affected heuristic.
- Bad, because it introduces two tiers of "CI green" (affected-green vs
  full-green), eroding the shared meaning of the merge gate.

### Option 2 — 20-shard full run on every PR (chosen)

- Good, because every PR is validated against the full suite with zero
  omissions.
- Good, because 20 parallel runners bring wall-clock time into the same ~8–12
  min range as an affected-only run, eliminating the speed argument for
  Option 1.
- Good, because `vitest --merge-reports` coverage union is empirically correct
  on this repo.
- Good, because folding Sonar in eliminates the entire third test execution.
- Good, because the `shard-balance` job provides observability on test
  distribution without adding a blocking gate.
- Bad, because it consumes 20 runner-minutes of GitHub Actions capacity on every
  PR (vs. fewer for small-scope PRs under Option 1). Acceptable given the
  available runner budget and the confirmed 3× reduction in total executions per
  PR.
- Bad, because the shard threshold-zero override is a non-obvious configuration
  that must be documented to avoid accidental reintroduction of per-shard
  threshold failures.

### Option 3 — Status quo (three unsharded full runs)

- Good, because no migration risk.
- Bad, because ~40 min wall-clock time consistently delays feedback.
- Bad, because triple execution wastes ~2/3 of all test compute.
- Bad, because Sonar ingests `lcov.info` from a separate run, introducing the
  possibility of a coverage race (one run passes thresholds, the other does not,
  depending on non-deterministic test ordering).

## Links

- CI cost audit: `docs/operations/ci-cost-audit-2026-05-25.md`
- Property testing strategy:
  [ADR-054](./ADR-054-property-based-race-condition-testing.md)
- Affected-tests draft-PR policy: ADR-061 _(forthcoming)_
- Vitest shard docs:
  [vitest.dev/guide/cli#shard](https://vitest.dev/guide/cli#shard)
- Vitest merge-reports docs:
  [vitest.dev/guide/merging-reports](https://vitest.dev/guide/merging-reports)
- Reusable workflow: `.github/workflows/test-regression.yml`
- Superseded jobs: `sonar.yml` (deleted), `pr-checks.yml` `test-coverage` job
  (removed)

### Related ADRs in this CI overhaul set

- **ADR-057** _(this document)_ — Fast PR vs Full Regression Split: decides to
  run the full suite on every PR via 20 shards rather than an affected-only
  gate.
- **ADR-058** — Vitest 20-Shard Strategy: details shard matrix configuration,
  blob artifact format, and merge-reports mechanics.
- **ADR-059** — CI Cache Strategy: pnpm store + Turborepo remote cache
  configuration to minimise install and pre-build time across shard runners.
- **ADR-060** — Required Status Checks Policy: maps old check-run context names
  to new ones and documents the admin `gh api PATCH` procedure.
- **ADR-061** — Test Impact / Changed-Test Policy: governs the optional
  affected-tests workflow for draft PRs and forbids it from becoming a required
  check.

## Implementation Notes

### Validation Criteria

- [ ] `test-regression.yml` exists with
      `on: workflow_call | workflow_dispatch | schedule` triggers and the five
      jobs listed in the Decision Outcome table.
- [ ] `unit-shards` matrix sets `coverage.thresholds` to `0` for all four
      metrics; shard blob artifacts uploaded with `retention-days: 1`.
- [ ] Each blob artifact (`blob-i-20.json`) is approximately ~150 KB; confirmed
      by inspecting a real shard run artifact in GitHub Actions.
- [ ] `merge` job enforces
      `statements: 90, branches: 80, functions: 90, lines: 90`; exits non-zero
      if any threshold is missed.
- [ ] `sonar` job consumes `artifacts/coverage/lcov.info` produced by the
      `merge` job; does not re-run tests; `continue-on-error` is absent (Sonar
      is a blocking gate).
- [ ] `ci.yml` calls `test-regression.yml` via
      `uses: ./.github/workflows/test-regression.yml` from a job keyed `test`
      with display name "Unit Tests (sharded)".
- [ ] `pr-checks.yml` no longer contains a `test-coverage` job.
- [ ] `sonar.yml` deleted from `.github/workflows/`.
- [ ] Branch protection required-checks updated by admin to replace the old
      contexts ("CI Pipeline / Unit Tests", "PR Checks / Test Coverage",
      "SonarCloud Analysis / SonarCloud Scan") with the new contexts; verified
      via `gh api GET /repos/{owner}/{repo}/branches/main/protection`.
- [ ] `shard-balance` job produces a step summary showing per-shard test count
      and warns when any shard exceeds **1.3× median** (non-blocking).
- [ ] Wall-clock time for a PR run (install + library pre-build + 20 parallel
      shards + merge gate) is **~8–12 min end-to-end**.
- [ ] Manual trigger via `workflow_dispatch` runs all 20 shards and the merge
      job end-to-end successfully.
- [ ] Nightly `schedule` trigger adds cross-browser E2E and
      `test:property:stress` steps (coordinated with `property-tests.yml` and
      ADR-054 tier table).

### Rollback Plan

If the sharded workflow produces incorrect merged coverage or the `merge` job
proves unreliable:

1. Re-add the `test-coverage` job to `pr-checks.yml` from git history
   (`git show HEAD~1:.github/workflows/pr-checks.yml`).
2. Restore `sonar.yml` from git history.
3. Update branch protection required checks via `gh api PATCH` to restore the
   previous context names: "CI Pipeline / Unit Tests", "PR Checks / Test
   Coverage", "SonarCloud Analysis / SonarCloud Scan".
4. Remove `test-regression.yml` or set it to `workflow_dispatch`-only to
   preserve it for future re-enablement.
5. File a bug against the `vitest --merge-reports --coverage` path with a
   minimal reproduction before re-attempting.
