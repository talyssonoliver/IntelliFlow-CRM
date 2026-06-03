# ADR-058: Vitest 20-Shard Regression Strategy

**Status:** Proposed

**Date:** 2026-06-03

**Deciders:** DevOps + QA Lead (STOA-Quality), CI/CD Reliability

**Technical Story:** CI Audit Report
(`docs/operations/ci-cost-audit-2026-05-25.md`)

## Context and Problem Statement

The full test suite (~30,000 tests across 1,417 files in 16 Vitest projects)
runs **unsharded** and is executed **three times** per PR: once in `ci.yml`
(`test` job), once in `pr-checks.yml` (`test-coverage` job), and once in
`sonar.yml`. This produces ~40 min of wall-clock latency per ship and
significant duplicated compute spend. How can we cut wall time to ~8-12 min
end-to-end, eliminate the duplicated runs, and preserve the 90/80/90/90 Istanbul
coverage gate plus the SonarCloud quality gate?

## Decision Drivers

- 40 min PR latency blocks developer flow; target is ~8-12 min end-to-end
  (install + library pre-build + 20 parallel shards + merge gate).
- 29,661 runner-minutes / $178.51 burned in 24 days; sharding is the highest
  leverage reduction available (CI Audit Report §4).
- The coverage gate (statements 90 %, branches 80 %, functions 90 %, lines 90 %)
  must not regress — SonarCloud gate must stay blocking/A.
- Three independent runs of the full suite are redundant; the merged `lcov.info`
  from one sharded run is sufficient input for SonarCloud.
- Up to 20 concurrent GitHub Actions runners are available; native Vitest
  sharding requires no extra tooling.
- Security scans (Trivy / OWASP / pnpm-audit high / CodeQL / GitLeaks) must
  remain unaffected.
- `pnpm install --frozen-lockfile` must run in every job (lockfile integrity).

## Considered Options

- **Option A — Native Vitest sharding** (20 shards, reusable workflow, fold
  Sonar into merge job)
- **Option B — Turborepo remote cache only** (no sharding; rely on cache hits to
  reduce repeat-run cost)
- **Option C — Jest sharding via `--shard`** (migrate away from Vitest)
- **Option D — Single-runner parallelism via
  `--pool=threads --maxWorkers=auto`** (no matrix, squeeze one runner)

## Decision Outcome

Chosen option: **Option A — Native Vitest sharding**, because it is the only
option that simultaneously cuts wall time to the ~8-12 min end-to-end target,
eliminates the three-run duplication, and has been **empirically verified on
this repo**: webhooks shard 1 reported 88.08 % line coverage, shard 2 reported
84.25 %, and the merge job produced 89.36 % — correctly above threshold after
union. Options B–D do not address the duplication problem and cannot approach
the target wall time with the available runner budget.

### Positive Consequences

- Wall time drops from ~40 min to **~8-12 min end-to-end** (20 shards run in
  parallel; the merge job adds a short tail for report union + threshold
  enforcement).
- `sonar.yml` is deleted; SonarCloud consumes the merged `lcov.info` produced by
  the merge job, eliminating the third full test run.
- `pr-checks.yml` drops its duplicate `test-coverage` job; coverage artifact is
  reused from `test-regression.yml`.
- A single `test-regression.yml` reusable workflow is the canonical test
  contract — callable by `ci.yml`
  (`uses: ./.github/workflows/test-regression.yml`) and available for nightly
  schedule and `workflow_dispatch`.
- False-negative threshold failures on partial shards are structurally
  impossible: thresholds are 0 on shards and enforced only at the merge job.
- The merge gate enforces a **ratchet floor**
  (`statements 78 / branches 70 / functions 75 / lines 80` — current measured
  coverage), NOT the 90/80/90/90 in `vitest.config.ts`. Those config thresholds
  were aspirational and **never actually enforced** before this rewrite
  (`run-tests.js` parsed only pass/fail; `run-coverage.js` treats breaches as
  "debt", exit 0 — so real merged coverage sits at ~stmt 79 / br 71 / fn 76 / ln
  80). The floor blocks coverage **regression** while the team ratchets back
  toward 90; the config keeps 90 as the documented aspiration.
- The `shard-balance` job provides non-blocking skew detection (flags slowest
  shard > 1.3 × median) without blocking the PR gate.
- The SonarCloud gate is now a **blocking** required status check (the previous
  `continue-on-error: true` in `sonar.yml` is removed per F-04).

### Negative Consequences

- Branch-protection required-status-check contexts must be updated: the
  pre-migration contexts (`CI Pipeline / Unit Tests`,
  `PR Checks / Test Coverage`, `SonarCloud Analysis / SonarCloud Scan`) become
  orphaned and must be replaced with the new post-migration contexts via admin
  `gh api PATCH`. See ADR-060 for the exact migration procedure.
- File-count sharding gives even file counts but uneven duration: `apps/web`
  holds ~586 files (41 % of total) and will dominate whichever shards it lands
  on. Skew is mitigated by the `shard-balance` job (1.3 × median threshold);
  full fix requires timing-based partitioning (see Implementation Notes).
- Integration tests are **excluded** from the shard matrix because they require
  live Postgres/Redis **services** that are not available in the standard shard
  runner environment; they continue to run in their own job.
- Property-based tests are **excluded** from the shard matrix because they are
  stochastic and long-running; they run on a dedicated schedule in
  `property-tests.yml` per ADR-054.
- Neither integration nor property coverage is merged into the shard lcov.
- 20 simultaneous runner checkouts produce 20 per-shard blob artifacts
  (`blob-i-20.json`, each ~150 KB empirically). Artifacts are **retained 1 day**
  via `retention-days: 1` in `actions/upload-artifact`; GitHub Actions does not
  delete them when the merge job downloads them.

## Pros and Cons of the Options

### Option A — Native Vitest sharding

Vitest 4.x `--shard=i/N --reporter=blob --coverage` writes per-shard blob files;
`--merge-reports=.vitest-reports --coverage` unions them. Verified in this repo
(webhooks: 88.08 % + 84.25 % → 89.36 % merged).

- Good, because it uses Vitest's own merge path — no third-party coverage
  stitching, no Istanbul divergence.
- Good, because it eliminates the three-run duplication structurally, not just
  via caching.
- Good, because the empirical proof already exists in this repo.
- Good, because `concurrency: cancel-in-progress` is already on, so stale shard
  runs are cancelled automatically.
- Bad, because file-count sharding can yield uneven shard duration without
  timing-based partitioning.
- Bad, because required-status-check context rename is an admin operation
  outside the repo.

### Option B — Turborepo remote cache only

- Good, because it requires no workflow restructuring.
- Good, because it works for repeat pushes on the same content.
- Bad, because cache misses (first push on a branch, dependency bumps,
  Dependabot PRs) still run the full unsharded suite three times.
- Bad, because it does nothing to eliminate the duplicate runs across `ci.yml`,
  `pr-checks.yml`, and `sonar.yml`.

### Option C — Jest migration

- Bad, because it requires migrating 1,417 files of Vitest-specific syntax and
  is a months-long effort with no wall-time benefit over Option A.
- Bad, because the Istanbul provider, `--reporter=blob`, and the
  `--merge-reports` API are Vitest-native features that Jest does not replicate
  identically.

### Option D — Single-runner maxWorkers tuning

- Good, because it requires no matrix changes.
- Bad, because a single runner (8 vCPU on ubuntu-latest) cannot match 20
  parallel runners; the ~8-12 min end-to-end target is out of reach.
- Bad, because it still runs the suite three times (duplication unresolved).

## Links

- CI Audit Report: `docs/operations/ci-cost-audit-2026-05-25.md`
- Refines [ADR-054](./ADR-054-property-based-race-condition-testing.md)
  (property tests run in their own job, excluded from shard matrix)
- Related workflow: `.github/workflows/ci.yml` (calls `test-regression.yml`)
- Deleted workflow: `.github/workflows/sonar.yml` (folded into merge job)
- Removed job: `pr-checks.yml` `test-coverage` job
- Vitest sharding docs: https://vitest.dev/guide/improving-performance#sharding

### Related ADRs in this CI overhaul set

- [ADR-057](./ADR-057-fast-pr-vs-full-regression-split.md) — Fast PR vs Full
  Regression Split: separates the quick lint/type/build PR gate from the full
  nightly regression suite.
- **ADR-058** (this document) — Vitest 20-Shard Strategy: fans the full unit
  suite across 20 parallel runners to hit ~8-12 min end-to-end.
- [ADR-059](./ADR-059-ci-cache-strategy.md) — CI Cache Strategy: pnpm store +
  Turborepo remote cache layering to minimise install and build time per run.
- [ADR-060](./ADR-060-required-checks-policy.md) — Required Status Checks
  Policy: documents the exact pre- and post-migration branch-protection contexts
  and the admin PATCH procedure.
- [ADR-061](./ADR-061-test-impact-changed-test-policy.md) — Test Impact /
  Changed-Test Policy: defines which tests run on each trigger and the
  changed-file filtering rules.

## Implementation Notes

### Workflow Structure

`test-regression.yml` (`on: workflow_call | workflow_dispatch | schedule`):

```yaml
jobs:
  unit-shards: # matrix: shard [1..20], excludes integration+property
    # vitest run \
    #   --shard=${{ matrix.shard }}/20 \
    #   --reporter=blob \
    #   --coverage \
    #   --coverage.thresholds.statements=0 \
    #   --coverage.thresholds.branches=0 \
    #   --coverage.thresholds.functions=0 \
    #   --coverage.thresholds.lines=0
    # uploads blob-${{ matrix.shard }}-20.json (~150 KB) as artifact
    # retention-days: 1

  merge: # needs: unit-shards — THE real gate
    # vitest run \
    #   --merge-reports=.vitest-reports \
    #   --coverage \
    #   --reporter=junit
    # thresholds: statements=90, branches=80, functions=90, lines=90
    # emits: artifacts/coverage/lcov.info + coverage-summary.json

  coverage-report: # needs: merge — Codecov upload + PR comment

  sonar: # needs: merge — SonarCloud from merged lcov.info
    # BLOCKING gate (continue-on-error removed per F-04)
    # On PRs via ci.yml: "Unit Tests (sharded) / SonarCloud Scan"
    # On standalone runs: "SonarCloud Scan"

  shard-balance: # needs: unit-shards — non-blocking; flags >1.3x median
```

`ci.yml` calls the reusable workflow from a job keyed `test` with display name
`Unit Tests (sharded)`:

```yaml
jobs:
  test:
    name: Unit Tests (sharded)
    uses: ./.github/workflows/test-regression.yml
```

**Resulting PR status-check names** (when invoked via `ci.yml`):

| Check         | Rendered context                             |
| ------------- | -------------------------------------------- |
| Coverage gate | `Unit Tests (sharded) / Merge Coverage Gate` |
| SonarCloud    | `Unit Tests (sharded) / SonarCloud Scan`     |

> **Note:** reusable-workflow check-run naming can vary. ADR-060 instructs the
> admin to confirm exact names from one real PR run before patching branch
> protection.

**Critical constraint:** `maxWorkers` must be identical across all 16 Vitest
projects (Vitest 4.x `sequence.groupOrder` constraint). Set once in the root
`vitest.workspace.ts` and do not override per-project.

### Excluded Projects

The shard matrix selects projects with a **positive include-list**
(`$UNIT_PROJECTS` — the 18 unit projects), **not** with `--project` negations:
multiple `--project='!x'` negations silently fail in Vitest 4.1.7 (verified
2026-06-03 — `integration` and `property` still ran), whereas positive filters
are reliable. A `project-guard` job asserts the set of all collected projects
equals `$UNIT_PROJECTS` ∪ `{integration, property}`, so a newly-added project
cannot silently skip CI. The two excluded projects:

- **`integration`** — excluded because integration tests require live
  **Postgres/Redis services** not present in the standard shard runner
  environment (they run in `ci.yml`'s dedicated `integration` job).
- **`property`** — excluded because property-based (fast-check) tests are
  **stochastic and long-running**; they are scheduled separately in
  `property-tests.yml` per ADR-054.

### Shard Skew Rebalance Fallback

If `shard-balance` reports slowest > 1.3 × median for two consecutive nightly
runs, switch to timing-based partitioning: extract per-file durations from the
JUnit XML produced by the merge job, sort descending, and assign files to shards
using a greedy bin-packing script at `tools/scripts/partition-shards.mjs`.

### Validation Criteria

- [ ] PR wall time reaches **~8-12 min end-to-end** (install + library
      pre-build + 20 parallel shards + merge gate).
- [ ] `merge` job enforces 90/80/90/90 thresholds and exits non-zero on
      violation.
- [ ] Merged `lcov.info` line coverage ≥ pre-sharding baseline (verified by
      `shard-balance` artifact diff).
- [ ] SonarCloud quality gate remains A (blocking) after `sonar.yml` deletion.
- [ ] `pr-checks.yml` no longer contains a `test-coverage` job.
- [ ] Required-status-check contexts updated from pre-migration orphans
      (`CI Pipeline / Unit Tests`, `PR Checks / Test Coverage`,
      `SonarCloud Analysis / SonarCloud Scan`) to post-migration contexts per
      ADR-060 via `gh api PATCH /repos/{owner}/{repo}/branches/main/protection`.
- [ ] `shard-balance` job flags an artificially imbalanced test distribution in
      a dry-run scenario (>1.3 × median threshold).
- [ ] All security scans (Trivy, OWASP, pnpm-audit high, CodeQL, GitLeaks)
      remain in their existing jobs, unaffected.
- [ ] Each `blob-i-20.json` artifact is ~150 KB and uses `retention-days: 1`.

### Rollback Plan

1. Revert `ci.yml` to call the `test` job directly (restore the unsharded
   `vitest run` step) rather than delegating to `test-regression.yml`.
2. Restore `sonar.yml` from git history
   (`git show HEAD~1:.github/workflows/sonar.yml`).
3. Re-add the `test-coverage` job to `pr-checks.yml`.
4. Update the required-status-check context back to `CI Pipeline / Unit Tests`
   (and restore `PR Checks / Test Coverage` and
   `SonarCloud Analysis / SonarCloud Scan`) via `gh api PATCH`.
5. Delete `.github/workflows/test-regression.yml`.

The rollback is a straight revert of the three workflow files; no test code
changes and no coverage configuration changes are required.
