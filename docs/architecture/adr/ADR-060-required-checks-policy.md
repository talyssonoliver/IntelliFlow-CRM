# ADR-060: Required Status Checks Policy

**Status:** Proposed

**Date:** 2026-06-03

**Deciders:** DevOps + QA Lead (STOA-Quality), CI/CD Reliability — _pending
ratification._

**Technical Story:** CI Audit Report
(`docs/operations/ci-cost-audit-2026-05-25.md`); sharded test-regression rewrite
that introduces `.github/workflows/test-regression.yml` and folds `sonar.yml`
into the pipeline.

## Context and Problem Statement

Before this change the full Vitest suite (~30,000 tests across 1,417 files in 16
workspace projects) runs **unsharded** and is executed **three times per PR**:
once in `ci.yml` (`CI Pipeline / Unit Tests`), once in `pr-checks.yml`
(`PR Checks / Test Coverage`), and once in `sonar.yml`
(`SonarCloud Analysis / SonarCloud Scan`). Each run takes ~40 minutes. 20-shard
parallelism with `vitest run --shard=i/20 --reporter=blob --coverage` plus a
single `vitest run --merge-reports` step reduces the wall-clock gate to **~8-12
min end-to-end for a PR** (install + library pre-build + 20 parallel shards +
merge gate), while preserving merged coverage accuracy (webhooks example: shards
88.08% + 84.25% → merged 89.36%).

The rewrite introduces a canonical reusable workflow
(`.github/workflows/test-regression.yml`) that `ci.yml` calls via a job keyed
`test` (display name "Unit Tests (sharded)") using
`uses: ./.github/workflows/test-regression.yml`. It removes the duplicate
`test-coverage` job from `pr-checks.yml` and deletes `sonar.yml` (Sonar is
folded into `test-regression.yml` so the merged lcov is reused rather than
triggering a fourth full test run). Inside `test-regression.yml` the jobs are:
`unit-shards` (display "Unit Shard N/20"), `merge` (display "Merge Coverage
Gate"), `coverage-report`, `sonar` (display "SonarCloud Scan"), `shard-balance`,
and `e2e-cross-browser` (nightly only).

Because `ci.yml` calls the reusable workflow from a job named `test` with
display name "Unit Tests (sharded)", the coverage-gate status check renders as
**`Unit Tests (sharded) / Merge Coverage Gate`** on a PR run, and the Sonar
check as **`Unit Tests (sharded) / SonarCloud Scan`**. On standalone
nightly/dispatch runs they render as `Merge Coverage Gate` and `SonarCloud Scan`
respectively. Reusable-workflow check-run naming can vary; **the admin MUST
confirm the exact check-run names from one real PR run before issuing the
`gh api PATCH`** — do not hardcode a guessed string as certain.

This leaves three required status check **contexts** orphaned in GitHub's
branch-protection settings — those settings live outside the repo and cannot be
updated by merging workflow files.

The question is: **what is the canonical required-context set after the rewrite,
and how must the transition be executed safely so no PR can merge against the
stale protection rules?**

## Decision Drivers

- Orphaned required contexts cause every future PR to block on a check that will
  never appear, making the branch unmerge-able without admin override.
- The green-shim alternative (keeping old job NAMES emitting `echo success`
  while the real work moves) perpetuates dead YAML and misleads contributors
  about what each check actually validates. The owner explicitly rejected it.
- No required check may be silently dropped; each removal must be deliberate and
  approved by the repo owner.
- The 90/80/90/90 Istanbul thresholds must continue to be enforced at the merge
  job only — each shard applies `--coverage.thresholds.lines=0` (and similarly
  for statements, branches, functions) because a shard's partial slice will
  never meet the global threshold in isolation.
- Security scans (Trivy, OWASP, `pnpm audit --audit-level=high`, CodeQL,
  GitLeaks), the SonarCloud quality gate (≥A, now a **blocking** required
  check), and `pnpm install --frozen-lockfile` discipline must all remain.
- The `shard-balance` job warns when the slowest shard exceeds **1.3x the
  median** shard duration; this is a non-blocking step summary warning.

## Considered Options

- **Option A — Full rewrite + admin PATCH to rename/replace contexts.**
  Introduce `test-regression.yml`, delete `sonar.yml`, strip the duplicate job
  from `pr-checks.yml`, and issue a `gh api PATCH` to swap the three obsolete
  contexts for the new ones before the PR merges. _(chosen)_
- **Option B — Green-shim (keep old job names, emit `echo success`).** Add stub
  jobs named `Unit Tests`, `Test Coverage`, and `SonarCloud Scan` that always
  pass, so branch protection never blocks. New sharded jobs run in parallel but
  are not required. Rejected by owner.
- **Option C — Keep the three redundant runs, add sharding as an optional
  parallel job.** Eliminates no duplication, costs ~80 min/PR total on two
  runners.

## Decision Outcome

Chosen option: **Option A — full rewrite + admin PATCH**, because it is the only
path that makes the sharded gate the _actual_ merge gate, retires three
redundant full test runs, and keeps the required-context list honest.

### Canonical required contexts after the rewrite

| Context string                                          | Job / workflow                                                        | Notes                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `CI Pipeline / Lint & Format`                           | `ci.yml` → `lint` job                                                 | unchanged                                                                                                                             |
| `CI Pipeline / Type Check`                              | `ci.yml` → `typecheck` job                                            | unchanged                                                                                                                             |
| `CI Pipeline / Build`                                   | `ci.yml` → `build` job (needs: [lint, typecheck])                     | unchanged                                                                                                                             |
| `CI Pipeline / Integration Tests`                       | `ci.yml` → `integration` job                                          | unchanged, runs in parallel with sharded suite                                                                                        |
| `Unit Tests (sharded) / Merge Coverage Gate`            | `test-regression.yml` → `merge` job (called from `ci.yml` job `test`) | NEW — enforces 90/80/90/90 thresholds on merged lcov; **confirm exact name from a real PR run before PATCHing**                       |
| `Unit Tests (sharded) / SonarCloud Scan`                | `test-regression.yml` → `sonar` job                                   | NEW — **blocking** gate (≥A quality; `continue-on-error` removed per F-04); **confirm exact name from a real PR run before PATCHing** |
| `Security Scanning / Trivy Container & Filesystem Scan` | `security.yml`                                                        | unchanged                                                                                                                             |
| `Security Scanning / OWASP Dependency Check`            | `security.yml`                                                        | unchanged                                                                                                                             |
| `Security Scanning / npm Audit`                         | `security.yml`                                                        | unchanged                                                                                                                             |
| `Security Scanning / CodeQL Analysis`                   | `security.yml`                                                        | unchanged                                                                                                                             |
| `Secret Scanning / Secret Scanning with GitLeaks`       | `secret-scan.yml`                                                     | unchanged                                                                                                                             |

### Contexts removed from required set (owner approved)

| Removed context                         | Reason                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CI Pipeline / Unit Tests`              | Replaced by the sharded `unit-shards` matrix + `Merge Coverage Gate` in `test-regression.yml`                                                                      |
| `PR Checks / Test Coverage`             | Duplicate run removed from `pr-checks.yml`; Codecov comment preserved via `coverage-report` job (non-required)                                                     |
| `SonarCloud Analysis / SonarCloud Scan` | `sonar.yml` deleted; Sonar analysis now runs inside `test-regression.yml` `sonar` job, consuming the merged lcov; the new context string differs (see table above) |

### Transition protocol

Because GitHub branch-protection is an external resource, merging the workflow
files alone does NOT update the required contexts.

**Step 1 — Confirm exact check-run names.** Merge a draft/test PR that exercises
`test-regression.yml` via `ci.yml` and note the exact context strings that
appear in the branch-protection "checks" list. The expected names are
`Unit Tests (sharded) / Merge Coverage Gate` and
`Unit Tests (sharded) / SonarCloud Scan`, but reusable-workflow check-run
rendering can vary. **Do not PATCH with guessed strings.**

**Step 2 — Apply the PATCH.** Replace the three obsolete contexts with the
confirmed new ones using the following command shape (substitute `OWNER`,
`REPO`, and the confirmed context strings into `required-checks.json`):

```sh
gh api -X PATCH \
  repos/OWNER/REPO/branches/main/protection/required_status_checks \
  --input required-checks.json
```

where `required-checks.json` contains:

```json
{
  "strict": true,
  "contexts": [
    "CI Pipeline / Lint & Format",
    "CI Pipeline / Type Check",
    "CI Pipeline / Build",
    "CI Pipeline / Integration Tests",
    "<CONFIRMED: Unit Tests (sharded) / Merge Coverage Gate>",
    "<CONFIRMED: Unit Tests (sharded) / SonarCloud Scan>",
    "Security Scanning / Trivy Container & Filesystem Scan",
    "Security Scanning / OWASP Dependency Check",
    "Security Scanning / npm Audit",
    "Security Scanning / CodeQL Analysis",
    "Secret Scanning / Secret Scanning with GitLeaks"
  ]
}
```

The `<CONFIRMED: ...>` placeholders MUST be replaced with the exact strings
observed in Step 1. `OWNER` and `REPO` are substituted for the real GitHub
org/repo values (`gh repo view --json owner,name` resolves them). The command
requires `admin:repo_hook` scope and branch-admin rights.

**Timing:** Execute the PATCH **before** the rewrite PR merges (or immediately
after, with the branch unprotected by admin override for that window) to avoid a
gap where the orphaned contexts block all PRs.

### Shard threshold invariant

Each shard job runs:

```sh
vitest run \
  --shard=${{ matrix.shard }}/${{ env.TOTAL_SHARDS }} \
  --reporter=blob \
  --coverage \
  --coverage.thresholds.statements=0 \
  --coverage.thresholds.branches=0 \
  --coverage.thresholds.functions=0 \
  --coverage.thresholds.lines=0
```

The `merge` job runs `vitest run --merge-reports=.vitest-reports --coverage`
with the full 90/80/90/90 thresholds applied to the unioned
`artifacts/coverage/lcov.info`. The `merge` job is the required gate; individual
shard jobs are `needs` dependencies of `merge` only.

Blob report artifacts (each ~150 KB, e.g. `blob-i-20.json`) are uploaded with
`actions/upload-artifact` using `retention-days: 1`. GitHub Actions does NOT
delete artifacts when the merge job downloads them — they are retained for 1 day
via the retention policy, then expire automatically.

**Integration** tests are excluded from the shard matrix because they require
live Postgres/Redis **services** not available in the shard runner environment.
**Property** tests are excluded because they are stochastic and long-running;
they run on a dedicated schedule in `property-tests.yml` per ADR-054.

### Positive Consequences

- PR wall-clock time for the test gate drops from ~40 min (unsharded, serial) to
  **~8-12 min end-to-end** (install + library pre-build + 20 parallel shards +
  merge gate).
- Each PR invokes the full test suite exactly once (down from three).
- The required-context list matches the actual jobs; no phantom contexts block
  PRs.
- Merged lcov is reused for both Codecov upload and SonarCloud analysis — zero
  extra test runs.
- The `shard-balance` non-blocking job surfaces skew (slowest shard > **1.3x the
  median**) as a step summary warning without blocking merge.
- The SonarCloud gate is now **blocking** (≥A quality enforced); the prior
  `continue-on-error: true` advisory mode is removed.

### Negative Consequences

- An admin `gh api PATCH` is required outside the normal PR flow; if missed, the
  branch is either unmerge-able (old contexts never appear) or the new `merge`
  job is not required (rewrite merged without protection).
- Blob reports from all 20 shards must be available before `merge` can run; a
  single cancelled shard runner stalls the gate (mitigated by
  `cancel-in-progress: true` + shard retry policy).
- The `sonar` job inside `test-regression.yml` must tolerate `lcov.info` being
  written by the `merge` job in a prior step — job ordering must be explicit via
  `needs`.
- Confirming the exact check-run name requires a real PR run before the PATCH,
  adding a coordination step to the rollout.

## Pros and Cons of the Options

### Option A — Full rewrite + admin PATCH

- Good, because required contexts exactly match the real gate jobs after the
  rewrite.
- Good, because three redundant full test runs are eliminated.
- Good, because SonarCloud consumes the same merged lcov as Codecov — no
  coverage drift between the two analysis tools.
- Good, because the SonarCloud gate is promoted from advisory to blocking.
- Bad, because it requires a manual out-of-band admin PATCH; window between
  workflow merge and PATCH execution leaves the branch in a transitional state.
- Bad, because the `merge` job is a new context name; first-time appearance in
  the protection list must be coordinated with the first successful run.

### Option B — Green-shim (keep old job names)

- Good, because no admin PATCH is required.
- Good, because the transition is invisible to contributors.
- Bad, because stub jobs that emit `echo success` make the required-context list
  meaningless — a CI outage would be silently ignored.
- Bad, because the dead YAML lives indefinitely and confuses future maintainers.
- Bad, because owner explicitly rejected this path.

### Option C — Keep three runs, add sharding as optional

- Good, because zero branch-protection changes needed.
- Bad, because the three-run duplication problem is not solved.
- Bad, because adding a fourth (sharded) run increases total runner spend
  without retiring the existing cost.

## Links

- CI cost audit: `docs/operations/ci-cost-audit-2026-05-25.md`
- Reusable workflow: `.github/workflows/test-regression.yml` _(introduced in the
  rewrite PR)_
- Removed workflow: `.github/workflows/sonar.yml` _(deleted in the rewrite PR)_
- Modified workflows: `.github/workflows/ci.yml`,
  `.github/workflows/pr-checks.yml`
- Related: ADR-054 (Property-Based and Race-Condition Testing — shard exclusion
  of property tests; scheduled in `property-tests.yml`)
- Related: ADR-053 (N+1 Query Budget Detector — `pnpm run nplus1:scan` in the
  `lint` job; context unchanged)
- Branch protection API docs:
  https://docs.github.com/en/rest/branches/branch-protection

### Related ADRs in this CI overhaul set

- **ADR-057** — Fast PR vs Full Regression Split: separates the lightweight PR
  gate from the full nightly regression suite.
- **ADR-058** — Vitest 20-Shard Strategy: defines the 20-shard matrix,
  blob-report artifact design, and per-shard threshold suppression.
- **ADR-059** — CI Cache Strategy: pnpm store + Turborepo remote-cache
  configuration that keeps install + pre-build within the ~8-12 min budget.
- **ADR-060** — Required Status Checks Policy _(this document)_: canonical
  required-context set pre/post migration and transition protocol.
- **ADR-061** — Test Impact / Changed-Test Policy: scopes which test files are
  executed on a given PR based on changed source files.

## Implementation Notes

### Validation Criteria

- [ ] `test-regression.yml` exists with jobs: `unit-shards` (matrix 1..20),
      `merge`, `coverage-report`, `sonar`, `shard-balance`
- [ ] Each shard job sets all four coverage thresholds to `0`; `merge` job sets
      them to `90/80/90/90`
- [ ] `ci.yml` `test` job (display "Unit Tests (sharded)") replaced with
      `uses: ./.github/workflows/test-regression.yml`
- [ ] `ci.yml` `build` job `needs` list contains only `[lint, typecheck]`
- [ ] `ci.yml` `integration` job runs in parallel with the sharded suite
- [ ] `pr-checks.yml` `test-coverage` job removed
- [ ] `sonar.yml` deleted from `.github/workflows/`
- [ ] Admin confirms exact check-run names from a real PR run, then executes
      `gh api PATCH`;
      `gh api repos/OWNER/REPO/branches/main/protection/required_status_checks`
      returns the canonical eleven-context list with confirmed Sonar + coverage
      gate strings
- [ ] A test PR passes with the confirmed coverage gate context appearing and
      being satisfied
- [ ] The three removed contexts (`CI Pipeline / Unit Tests`,
      `PR Checks / Test Coverage`, `SonarCloud Analysis / SonarCloud Scan`) no
      longer appear in the required list
- [ ] `pnpm install --frozen-lockfile` present in every workflow job that uses
      pnpm
- [ ] SonarCloud quality gate is **blocking** (≥A) on the first merged
      lcov-based scan; `continue-on-error: true` is absent from the `sonar` job
- [ ] PR wall-clock time observed at **~8-12 min end-to-end**
- [ ] `shard-balance` job emits a warning (not a failure) when slowest shard
      exceeds **1.3x the median** shard duration

### Rollback Plan

1. Revert the workflow-file changes via a standard PR (restores the three
   workflows to their pre-rewrite state and re-adds the `test-coverage` job to
   `pr-checks.yml`).
2. Issue a second admin `gh api PATCH` to restore the original required
   contexts:
   - `CI Pipeline / Unit Tests`
   - `PR Checks / Test Coverage`
   - `SonarCloud Analysis / SonarCloud Scan`
3. Verify that a subsequent PR unblocks against the restored contexts before
   closing the rollback PR.

No data is lost during rollback; lcov artifacts and Codecov history are
unaffected.
