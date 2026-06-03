# ADR-061: Test Impact / Changed-Test Policy

**Status:** Proposed

**Date:** 2026-06-03

**Deciders:** DevOps + QA Lead (STOA-Quality), CI/CD Reliability

**Technical Story:** CI Audit Report
(`docs/operations/ci-cost-audit-2026-05-25.md`)

## Context and Problem Statement

The IntelliFlow CRM monorepo hosts ~30,000 Vitest tests across 1,417 files in 16
workspace projects. Every PR currently triggers the full suite **three times** —
in `ci.yml` (test job), `pr-checks.yml` (test-coverage job), and `sonar.yml` —
with no sharding, producing a combined wall-clock time of ~40 minutes per PR.
The CI cost audit (2026-05-25) identified the three workflows as 65.8 % of total
spend (~$178 over 24 days). We need a test-execution policy that: (a) eliminates
the duplicate full runs, (b) shards the single remaining run to fit under a
~8-12 min wall-clock target, (c) preserves the 90/80/90/90 coverage thresholds
and Sonar A gate, and (d) defines the boundaries and safety guardrails for any
optional affected-tests fast-path on draft PRs.

## Decision Drivers

- **Eliminating triple-run waste:** three independent full runs produce
  identical coverage data; consolidating to one canonical run with reused
  artefacts removes at least two full runs' worth of runner cost per PR.
- **Sharding feasibility, empirically proven:**
  `vitest run --shard=i/N --reporter=blob --coverage` followed by
  `vitest run --merge-reports=.vitest-reports --coverage` correctly unions shard
  coverage (webhooks shard1 88.08 % lines + shard2 84.25 % → merged 89.36 %).
  This result was verified on this repo on 2026-06-03.
- **Threshold placement correctness:** each shard applies the global 90/80/90/90
  thresholds to its own _partial_ coverage and exits 1. Thresholds must be
  suppressed on shards and enforced only at the merge job.
- **No silent scope reduction:** test-scope narrowing (affected-only, top-N
  sampling, random sub-selection) is forbidden on the required gate. Any bound
  must be logged; the full 20-shard suite is always the merge gate.
- **Security and governance continuity:** Trivy, OWASP, pnpm-audit (high),
  CodeQL, and GitLeaks scans are unaffected by this change and must remain
  required status checks.
- **Minimal branch-protection churn:** renaming required status-check contexts
  needs an admin `gh api PATCH` per protected branch; the new workflow names are
  chosen once and frozen.

## Considered Options

- **Option A — Reusable sharded workflow (`test-regression.yml`) + fold Sonar
  in, drop duplicate jobs.** _(chosen)_
- **Option B — Shard inside each existing workflow independently (ci.yml,
  pr-checks.yml, sonar.yml each add matrix).** Three separate sharded runs still
  pay the triple-run cost; coverage data is re-generated three times; Sonar
  still re-runs the suite.
- **Option C — Affected-tests only on all PRs (turbo `--filter=...[origin/main]`
  as the required gate).** Turbo's affected detection is input-hash based and
  misses runtime/dynamic coupling (e.g. shared Prisma schema changes, domain
  barrel re-exports). Using it as a _required_ gate creates false-green merges.
  ADR-057/058 explicitly require the full suite as the merge gate.
- **Option D — Keep the status quo; accept the cost.** Does not address the
  40-minute PR cycle or the $178/24-day spend; deferred indefinitely.

## Decision Outcome

Chosen option: **Option A**, because it is the only option that eliminates the
triple-run waste while keeping a single authoritative coverage source, enforcing
thresholds exactly once, and reusing the merged `lcov.info` for SonarCloud —
without weakening the required gate.

### Architecture

A new reusable workflow `.github/workflows/test-regression.yml` is introduced
with triggers `on: [workflow_call, workflow_dispatch, schedule (nightly)]`. It
owns the following jobs:

| Job               | Responsibility                                                                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit-shards`     | Matrix `shard: [1..20]`; runs `vitest run --shard=${{ matrix.shard }}/20 --reporter=blob --coverage --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0`; uploads blob artefact `blob-${{ matrix.shard }}-20.json` |
| `merge`           | Downloads all 20 blobs; runs `vitest run --merge-reports=.vitest-reports --coverage`; enforces the canonical 90/80/90/90 thresholds; **this is the required gate**                                                                                                                                 |
| `coverage-report` | Reads merged `artifacts/coverage/lcov.info`; uploads to Codecov; posts PR comment via `marocchino/sticky-pull-request-comment`                                                                                                                                                                     |
| `sonar`           | Reads merged `artifacts/coverage/lcov.info` and `coverage-summary.json`; runs SonarCloud analysis; **blocking gate** (no test re-execution)                                                                                                                                                        |
| `shard-balance`   | Non-blocking; warns when slowest shard exceeds 1.3x the median shard time; reports per-shard timing skew to GitHub Step Summary for capacity planning                                                                                                                                              |

**Callers:**

- `ci.yml` replaces its `test` job (display name "Unit Tests (sharded)") with
  `uses: ./.github/workflows/test-regression.yml`. The `build` job now depends
  only on `[lint, typecheck]` and runs in parallel with the sharded suite;
  `integration` also runs in parallel.
- `pr-checks.yml` drops its `test-coverage` job entirely.
- `sonar.yml` is **deleted**; Sonar analysis moves into `test-regression.yml`'s
  `sonar` job, which consumes the already-merged `lcov.info`.

**Check-run context naming:** `ci.yml` calls `test-regression.yml` from a job
keyed `test` with display name `"Unit Tests (sharded)"`. On a PR the coverage
gate therefore renders as `"Unit Tests (sharded) / Merge Coverage Gate"` and the
Sonar check as `"Unit Tests (sharded) / SonarCloud Scan"`. On standalone
nightly/dispatch runs they render as `"Merge Coverage Gate"` and
`"SonarCloud Scan"`. Because reusable-workflow check-run naming can vary by
GitHub runtime version, the admin MUST confirm the exact check-run names from
one real PR run before applying the `gh api PATCH` to branch protection — do not
hardcode a guessed string as if certain.

**Shard scope exclusions:** the `unit-shards` matrix excludes two Vitest
projects:

- `integration` — excluded because it requires live Postgres/Redis SERVICES
  (running in their own job with `services:` containers).
- `property` — excluded because it is stochastic and long-running; it runs on a
  dedicated schedule in `property-tests.yml` per ADR-054, not on every PR.

The 20 shards cover only the 14 unit/component/e2e-mock projects.

**Threshold placement (critical):** `--coverage.thresholds.*=0` on every shard
prevents partial-coverage false exits. The `merge` job omits those overrides, so
the default `vitest.config.ts` thresholds (statements 90, branches 80, functions
90, lines 90) apply to the fully-merged report. A CI step that inverts the exit
code of `merge` documents this contract in the workflow YAML comment.

**Blob artefact lifecycle:** each `blob-i-20.json` is roughly ~150 KB
(empirical: a webhooks 1-of-2 shard blob was ~150 KB). Blobs are uploaded with
`actions/upload-artifact` using `retention-days: 1`. GitHub Actions does NOT
delete artefacts when the merge job downloads them — they are retained for 1 day
until the retention period expires.

### Optional Affected-Tests Fast-Path (Draft PRs Only)

An **optional**, non-required job `affected-smoke` may run on `draft` PRs:

```yaml
affected-smoke:
  if: github.event.pull_request.draft == true
  runs-on: ubuntu-latest
  steps:
    - run: pnpm turbo run test --filter=...[origin/main]
```

Guardrails:

1. `affected-smoke` is **never** a required status check. Branch protection
   requires only `merge` (from `test-regression.yml`).
2. The job name includes `(advisory)` in its GitHub Check title so reviewers
   cannot mistake it for the gate.
3. Silent scope reduction is forbidden: if `turbo --filter` resolves to zero
   affected packages, the job logs a warning and exits 0 without suppressing the
   full gate.
4. The fast-path is advisory only because Turbo's affected detection is
   input-hash based and cannot detect runtime/dynamic coupling (e.g., a change
   to the Prisma schema that affects generated types in untouched packages, or a
   domain barrel re-export that fans out to 12 consumers). The required gate is
   always the full 20-shard run.

### Positive Consequences

- Wall-clock time drops from ~40 min (three sequential full runs) to ~8-12 min
  end-to-end for a PR (install + library pre-build + 20 parallel shards + merge
  gate).
- Coverage data is generated exactly once per PR; `lcov.info` is reused by
  `coverage-report` and `sonar` jobs without re-running tests.
- The 90/80/90/90 thresholds are enforced at one point (`merge` job),
  eliminating false exits caused by partial-coverage on individual shards.
- Sonar A gate is preserved and now blocking, because it reads the same merged
  `lcov.info` that the `merge` job validated (the previous `continue-on-error`
  was removed per F-04).
- Draft PR authors get sub-2-minute turnaround from `affected-smoke` without any
  risk of that feedback replacing the real gate.
- `shard-balance` surfaces load-skew data (warning at 1.3x median) that will
  guide future shard count tuning without requiring workflow changes.

### Negative Consequences

- **Branch-protection migration:** required status-check context names change
  (e.g., `"CI Pipeline / Unit Tests"` and `"PR Checks / Test Coverage"` → new
  context names). Each protected branch needs one admin
  `gh api PATCH /repos/{owner}/{repo}/branches/{branch}/protection` call. This
  is a one-time operational step, not automated by this ADR.
- **Artefact storage cost:** 20 blob JSON files (~150 KB each) are uploaded per
  PR run and retained 1 day via `retention-days: 1`. At current GitHub pricing
  this is negligible compared to saved runner-minutes, but must be monitored if
  the test suite grows.
- **20-shard skew:** uneven test distribution causes some shards to finish later
  than others, wasting runner slots. The `shard-balance` job warns at 1.3x
  median and provides data to rebalance; initial distribution is alphabetical by
  file.
- **`sonar.yml` deletion is irreversible** without re-adding the workflow.
  Rollback requires re-creating it from git history.

## Pros and Cons of the Options

### Option A — Reusable sharded workflow + Sonar folded in

Empirically validated shard/merge approach; single source of merged coverage;
Sonar reuses artefact; eliminates triple-run cost entirely.

- Good, because it reduces wall-clock time from ~40 min to ~8-12 min
- Good, because coverage is generated once and reused by both Codecov and Sonar
- Good, because threshold enforcement is at one deterministic point
- Good, because the optional `affected-smoke` path is fully decoupled from the
  required gate
- Bad, because it requires a one-time admin branch-protection migration
- Bad, because it introduces a new required-check context name that must be
  stable

### Option B — Shard inside each existing workflow independently

Reduces wall-clock per workflow but pays three independent shard runs; coverage
data diverges between workflows; Sonar still re-runs the suite.

- Good, because no workflow consolidation is required
- Good, because callers do not need updating
- Bad, because triple cost is only partially reduced (shards run faster but
  three times)
- Bad, because Sonar still re-runs tests, wasting runners
- Bad, because three separate merged-coverage reports may diverge if shards
  differ between workflows

### Option C — Affected-tests as the required gate

Sub-2-minute PRs when scope is small.

- Good, because very fast for isolated changes
- Bad, because Turbo input-hash detection misses dynamic coupling
- Bad, because directly contradicts ADR-057/058 (full suite required)
- Bad, because a false-green merge on a schema/barrel change could ship a
  regression undetected

### Option D — Status quo

No engineering work required.

- Good, because nothing breaks
- Bad, because $178/24 days and 40-minute PRs continue indefinitely
- Bad, because coverage is re-generated three times with no additional signal

## Links

- Supersedes duplicate test execution established in `ci.yml` and
  `pr-checks.yml` (no formal ADR predecessor)
- Informed by: ADR-057 (fast-check PR vs full regression split — full suite
  required for merge gate)
- Informed by: ADR-058 (Vitest 20-Shard Regression Strategy)
- CI cost audit: `docs/operations/ci-cost-audit-2026-05-25.md`
- Empirical shard/merge validation: 2026-06-03 branch `audit_sprint-17`,
  webhooks project (shard1 88.08 % + shard2 84.25 % → merged 89.36 %)
- New workflow: `.github/workflows/test-regression.yml` _(deliverable)_
- Vitest sharding docs: `vitest run --shard` / `--merge-reports` flags

### Related ADRs in this CI overhaul set

- **ADR-057** — Fast PR vs Full Regression Split: defines which workflows are
  fast-path vs full-suite and the boundary rules.
- **ADR-058** — Vitest 20-Shard Regression Strategy: 20-shard matrix design,
  blob artefact format, merge-coverage contract, and 1.3x skew threshold.
- **ADR-059** — CI Cache Strategy: pnpm store + Turbo remote cache layering that
  makes ~8-12 min feasible.
- **ADR-060** — Required Status Checks Policy: branch-protection context names,
  admin PATCH procedure, and migration/rollback runbook.
- **ADR-061** — Test Impact / Changed-Test Policy _(this document)_: policy for
  the optional affected-tests fast-path on draft PRs and the guardrails that
  keep it advisory-only.

## Implementation Notes

### Validation Criteria

- [ ] `.github/workflows/test-regression.yml` exists with jobs `unit-shards`
      (matrix 1..20), `merge`, `coverage-report`, `sonar`, `shard-balance`
- [ ] Each shard job passes
      `--coverage.thresholds.statements=0     --coverage.thresholds.branches=0 --coverage.thresholds.functions=0     --coverage.thresholds.lines=0`
- [ ] `merge` job enforces 90/80/90/90 thresholds and is the only required
      status check for tests
- [ ] `sonar` job reads `artifacts/coverage/lcov.info` without re-running tests
      and is configured as a blocking gate (no `continue-on-error`)
- [ ] `shard-balance` job warns when slowest shard exceeds 1.3x the median shard
      time
- [ ] `ci.yml` calls `uses: ./.github/workflows/test-regression.yml`; its old
      `test` job is removed; `build` depends only on `[lint, typecheck]`
- [ ] `pr-checks.yml` `test-coverage` job is removed
- [ ] `sonar.yml` is deleted from `.github/workflows/`
- [ ] `affected-smoke` job carries `(advisory)` in its Check title and is absent
      from branch-protection required checks
- [ ] Admin confirms exact check-run context names from one real PR run before
      applying `gh api PATCH` to replace old required-check contexts
      (`"CI Pipeline / Unit Tests"` and `"PR Checks / Test Coverage"`) with the
      new context names
- [ ] PR wall-clock time measured at ~8-12 min on a representative PR after
      rollout

### Rollback Plan

1. Re-add `sonar.yml` from `git show HEAD~1:.github/workflows/sonar.yml`.
2. Revert `ci.yml` to call its inline `test` job (restore from the commit prior
   to this change).
3. Restore `pr-checks.yml` `test-coverage` job from git history.
4. Apply admin `gh api PATCH` to revert required-check context names on all
   protected branches to the previous values:
   - `"CI Pipeline / Unit Tests"`
   - `"PR Checks / Test Coverage"`
   - `"SonarCloud Analysis / SonarCloud Scan"`
5. Delete `.github/workflows/test-regression.yml`.

The rollback is fully reversible via git; no database or secret changes are
involved.
