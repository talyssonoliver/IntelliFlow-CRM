# ADR-059: CI Cache Strategy

**Status:** Proposed

**Date:** 2026-06-03

**Deciders:** DevOps + QA Lead (STOA-Quality), CI/CD Reliability

**Technical Story:** CI Audit Report
(`docs/operations/ci-cost-audit-2026-05-25.md`); empirical shard verification
2026-06-03. Companion to the test-sharding refactor that introduces
`.github/workflows/test-regression.yml`.

## Context and Problem Statement

The full Vitest suite (~30 000 tests across 1 417 files, 16 workspace projects)
runs **unsharded and three times per PR** — once each in `ci.yml`,
`pr-checks.yml`, and `sonar.yml` — costing ~40 min of serial runner time per PR.
The repo has no explicit cache strategy: pnpm store caching is automatic but
inconsistently applied, `node_modules` are cached by some jobs and not others,
Turbo remote cache is configured but unused in CI build jobs, and Playwright
browsers are downloaded fresh on every e2e run. Node version divergence between
local environments and CI causes periodic spurious failures. What combination of
cache primitives reduces wall-clock time and cost while keeping every result
deterministic and correct?

## Decision Drivers

- Reduce per-PR CI wall-clock time from ~40 min to ~8-12 min end-to-end
  (install + library pre-build + 20 parallel shards + merge gate).
- Eliminate the triple test run; each test file must run exactly once per PR.
- Keep all cache keys **lockfile-deterministic** — no mutable or branch-scoped
  keys that produce partial-restore corruption.
- Retain the full security scan surface (Trivy, OWASP, pnpm-audit high, CodeQL,
  GitLeaks) unchanged.
- Maintain SonarCloud quality gate A; the merge job enforces a coverage
  **ratchet floor** (statements 78, branches 70, functions 75, lines 80 —
  current measured) rather than the 90/80/90/90 in `vitest.config.ts`, which was
  aspirational and never actually enforced before this rewrite (see ADR-058).
- No regression on correctness: empirically verified that
  `vitest --merge-reports` unions shard coverage faithfully (shard1 88.08 % +
  shard2 84.25 % → merged 89.36 %).
- Node version must be pinned consistently across local dev and all CI jobs.

## Considered Options

- **Option A — pnpm store cache via `actions/setup-node cache:'pnpm'`**
  (lockfile-keyed, automatic): keep as-is.
- **Option B — `node_modules` cache** (tar the installed tree, restore on cache
  hit, skip `pnpm install`): replace frozen install with cached tree.
- **Option C — Turbo remote cache for build/lint/typecheck** (already configured
  with `signature:true`): route the build job through `turbo run build`; let
  Turbo decide what to replay.
- **Option D — Turbo test caching**: cache `vitest` invocations via Turbo,
  replacing shard parallelism.
- **Option E — Playwright browser cache** (`~/.cache/ms-playwright`, keyed by
  resolved `@playwright/test` version): add explicit cache step to the e2e and
  nightly jobs.
- **Option F — `.nvmrc`-pinned Node version** (root `.nvmrc=22`, all
  `setup-monorepo` steps switch to `node-version-file`): pin CI to the same Node
  22 as local dev.

## Decision Outcome

Chosen options: **A (keep) + B (reject) + C (add) + D (reject) + E (add) + F
(add)**, because this combination maximises cache hit rate with fully
deterministic keys, eliminates partial-restore corruption risk, and correctly
pairs Turbo's artifact-level replay with Vitest's shard-level parallelism for
tests.

Specific resolutions:

| Layer                      | Decision              | Rationale                                                                                                                                                                                                                                                   |
| -------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm store                 | **Keep** (Option A)   | `actions/setup-node cache:'pnpm'` is lockfile-keyed and automatic; already correct.                                                                                                                                                                         |
| `node_modules`             | **Reject** (Option B) | pnpm symlink store + `--frozen-lockfile` is the correct pnpm contract. Tarring `node_modules` across pnpm's symlink graph produces partial-restore corruption and masks `--frozen-lockfile` verification.                                                   |
| Turbo build/lint/typecheck | **Add** (Option C)    | `turbo run build` in the build job replays unchanged packages from remote cache (signature-verified); saves repeated compilation across PRs that touch a leaf package. Turbo test caching stays off.                                                        |
| Turbo test cache           | **Reject** (Option D) | CI correctness relies on shard parallelism in `test-regression.yml` (`unit-shards` matrix 1..20). Turbo test caching would replay stale blob reports, break the `--merge-reports` aggregation, and eliminate the wall-clock benefit of 20 parallel runners. |
| Playwright browsers        | **Add** (Option E)    | `~/.cache/ms-playwright` keyed by resolved `@playwright/test` version; saves ~90 s browser download on every e2e and nightly run with no correctness risk.                                                                                                  |
| Node version pin           | **Add** (Option F)    | Root `.nvmrc=22` + `node-version-file: .nvmrc` in every `actions/setup-node` call. `engines` in `package.json` can stay `>=20` for downstream consumers; CI and local dev both run 22.                                                                      |

### Positive Consequences

- pnpm store cache hit on every job that was already using Option A; no change
  required.
- Turbo remote cache eliminates repeated `tsc`/`eslint`/`build` runs for PRs
  that only touch a single package; average build job time expected to drop by
  50-70 % on non-breaking PRs.
- Playwright browser cache saves ~90 s per e2e / nightly run with a fully
  deterministic key.
- `.nvmrc` pin removes the "works on my machine" class of Node version
  divergence failures.
- All keys remain lockfile- or version-file-based; no mutable branch keys.
- End-to-end PR wall-clock time drops to ~8-12 min (install + library
  pre-build + 20 parallel shards running concurrently + merge gate tail).

### Negative Consequences

- Turbo remote cache adds a network round-trip on cold runs (new lockfile hash);
  negligible vs. the build time saved.
- `node-version-file` requires `.nvmrc` to be present in the repo root; becomes
  a required file (low maintenance burden).
- Turbo remote cache requires the `TURBO_TOKEN` / `TURBO_TEAM` secrets to remain
  valid; a rotated or expired token silently falls back to local computation
  (safe but slow — should be monitored).

## Pros and Cons of the Options

### Option A — pnpm store cache (keep)

- Good, because it is lockfile-keyed and managed automatically by
  `actions/setup-node`; zero maintenance overhead.
- Good, because it is the pnpm-recommended pattern and avoids symlink graph
  corruption.
- Bad, because it does not cache compiled build artifacts or test results
  (complementary options are needed for those layers).

### Option B — `node_modules` cache (reject)

- Good, because it could skip the `pnpm install` network step entirely on cache
  hit.
- Bad, because pnpm's `node_modules` is a symlink graph pointing into the global
  store; tarballing and restoring it without the matching store state produces
  broken symlinks or silently stale packages.
- Bad, because it bypasses `--frozen-lockfile` verification — the safety net
  that catches lockfile drift between branches.
- Bad, because a partial restore (cache key miss on a single package) is
  indistinguishable from a full hit, hiding missing packages until runtime.

### Option C — Turbo remote cache for build/lint/typecheck (add)

- Good, because build artifact replay is content-addressed and
  signature-verified (`signature:true` is already configured).
- Good, because it is additive: `turbo run build` replays unchanged packages and
  re-runs only touched ones; no workflow logic changes required.
- Good, because it benefits all CI jobs that call `turbo run build`, not just
  `test-regression.yml`.
- Bad, because it requires the `TURBO_TOKEN` / `TURBO_TEAM` secrets to be set
  and kept valid; a silent fallback to local compute must be monitored.

### Option D — Turbo test caching (reject)

- Good, because it could skip unchanged test files on re-runs.
- Bad, because `test-regression.yml` `unit-shards` uses
  `vitest run --shard=i/20 --reporter=blob --coverage`; Turbo would need to own
  the shard-to-task mapping to replay blob reports, which it does not.
- Bad, because replaying a stale blob report from a previous run breaks
  `vitest run --merge-reports=.vitest-reports --coverage`, producing incorrect
  merged coverage that may falsely pass or fail thresholds.
- Bad, because shard parallelism (20 runners running concurrently) already
  delivers the ~8-12 min wall-clock target; test caching adds complexity for
  marginal further gain.

### Option E — Playwright browser cache (add)

- Good, because the key (`hashFiles('**/package-lock.json', '**/pnpm-lock.yaml')
  - env.PLAYWRIGHT_VERSION`) is fully deterministic; the cache is never stale
    after a dependency bump.
- Good, because it saves ~90 s per e2e / nightly run with zero correctness risk
  (browsers are versioned artifacts).
- Bad, because it requires an explicit cache step in the e2e job; small one-time
  authoring cost.

### Option F — `.nvmrc`-pinned Node version (add)

- Good, because it eliminates Node version divergence as a class of CI failure.
- Good, because `node-version-file: .nvmrc` is a one-line change per job and a
  single `.nvmrc` file at the repo root.
- Good, because local developers using `nvm use` or `fnm use` automatically pick
  up the pinned version.
- Bad, because adding `.nvmrc` is a required file; forgetting to update it on a
  planned Node upgrade would silently leave CI on the old version until the file
  is updated.

## Links

- Refines [ADR-054](./ADR-054-property-based-race-condition-testing.md) —
  property-based testing program that drives shard correctness requirements.
- Related: CI cost audit `docs/operations/ci-cost-audit-2026-05-25.md`.
- Implemented in: `.github/workflows/test-regression.yml` (new reusable
  workflow), `ci.yml` (calls `test-regression.yml`), `pr-checks.yml` (drops
  duplicate `test-coverage` job), `sonar.yml` (deleted; Sonar folded into
  `test-regression.yml` `sonar` job).
- Empirical shard verification: `vitest run --merge-reports` union test
  (2026-06-03, webhooks shard1 88.08 % + shard2 84.25 % → merged 89.36 %).

### Related ADRs in this CI overhaul set

- [ADR-057](./ADR-057-fast-pr-vs-full-regression-split.md) — Fast PR vs Full
  Regression Split: separates the lightweight PR gate from the full nightly
  regression suite.
- [ADR-058](./ADR-058-vitest-20-shard-strategy.md) — Vitest 20-Shard Strategy:
  defines the shard matrix, blob reporter, and merge-coverage architecture.
- **ADR-059** (this document) — CI Cache Strategy: pnpm store, Turbo remote
  cache, Playwright browser cache, and Node version pinning decisions.
- [ADR-060](./ADR-060-required-checks-policy.md) — Required Status Checks
  Policy: branch-protection context strings, migration procedure, and rollback
  plan for the new sharded check names.
- [ADR-061](./ADR-061-test-impact-changed-test-policy.md) — Test Impact /
  Changed-Test Policy: which tests run on every PR vs. only when their files
  change, and the changed-test detection algorithm.

## Implementation Notes

### Key job names (canonical)

The top-level workflow is named **"Test Regression"**
(`.github/workflows/test-regression.yml`). `ci.yml` calls it from a job keyed
`test` with display name **"Unit Tests (sharded)"** via
`uses: ./.github/workflows/test-regression.yml`.

| Job                 | Display name          | Description                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit-shards`       | `Unit Shard N/20`     | Matrix `shard: [1..20]`; flags: `--shard=${{ matrix.shard }}/20 --reporter=blob --coverage`; thresholds set to `0` on shards. Each shard uploads a blob artifact (~150 KB, e.g. `blob-i-20.json`) with `retention-days: 1`; artifacts persist until retention expires — they are **not** deleted when the merge job downloads them. |
| `merge`             | `Merge Coverage Gate` | Runs `vitest run --merge-reports=.vitest-reports --coverage`; enforces global 90/80/90/90 thresholds; this is the real gate. On a PR the required-context check renders as **"Unit Tests (sharded) / Merge Coverage Gate"**.                                                                                                        |
| `coverage-report`   | `coverage-report`     | Uploads to Codecov; posts PR comment.                                                                                                                                                                                                                                                                                               |
| `sonar`             | `SonarCloud Scan`     | SonarCloud scan from merged `artifacts/coverage/lcov.info`; replaces deleted `sonar.yml`. This is a **blocking gate** (not advisory — `continue-on-error` was removed per F-04). On a PR renders as **"Unit Tests (sharded) / SonarCloud Scan"**.                                                                                   |
| `shard-balance`     | `shard-balance`       | Non-blocking skew check; warns when any shard exceeds **1.3x median** wall-clock time.                                                                                                                                                                                                                                              |
| `e2e-cross-browser` | `e2e-cross-browser`   | Nightly only; not in the PR gate.                                                                                                                                                                                                                                                                                                   |

**Excluded projects:** The `unit-shards` matrix runs with
`--project='!integration' --project='!property'`:

- `integration` is excluded because its tests require live Postgres and Redis
  **service containers** that are not available in the shard matrix jobs.
- `property` is excluded because property-based tests are stochastic and
  long-running; they are scheduled in `property-tests.yml` per ADR-054 (not a
  service-dependency issue).

Both excluded suites run in their own dedicated jobs outside the shard matrix.

**Threshold rule (CRITICAL):** Global thresholds (statements 90, branches 80,
functions 90, lines 90) MUST be set to `0` in each shard's Vitest config
override and enforced **only** at the `merge` job. A shard applies thresholds to
its own partial coverage and will exit 1 on a correct implementation; this is
not a flake — it is a mis-configuration.

### Validation Criteria

- [ ] `pnpm store` cache hit rate >= 95 % on repeat PR pushes (visible in
      Actions cache tab).
- [ ] `turbo run build` reports `>>> FULL TURBO` (all packages replayed) on a PR
      that modifies no source files.
- [ ] Playwright browser cache is restored on the second e2e run after a
      cache-priming run (key unchanged).
- [ ] All 20 `unit-shards` jobs complete without threshold exits (exit 0).
- [ ] `merge` job enforces thresholds and fails the workflow if any metric falls
      below 90/80/90/90.
- [ ] SonarCloud gate remains A and is **blocking** after `sonar.yml` is deleted
      and Sonar migrates to the `sonar` job in `test-regression.yml`.
- [ ] `.nvmrc` present at repo root with content `22`; all CI jobs resolve Node
      22 via `node-version-file: .nvmrc`.
- [ ] `node_modules` cache step absent from all jobs (no `path: node_modules` in
      any `actions/cache` step).
- [ ] End-to-end PR wall-clock time measures ~8-12 min across install + library
      pre-build + 20 parallel shards + merge gate tail.

### Rollback Plan

1. **Turbo remote cache:** remove `TURBO_TOKEN` / `TURBO_TEAM` secrets from the
   repository. `turbo run build` falls back to local computation automatically;
   no workflow file change required.
2. **Playwright browser cache:** delete the `actions/cache` step from the e2e
   job. Browsers are re-downloaded on every run; no correctness impact.
3. **`.nvmrc` Node pin:** change `node-version-file: .nvmrc` back to
   `node-version: '22'` (or the prior literal) in affected jobs; delete
   `.nvmrc`. Requires updating each job that was migrated — a mechanical
   find-and-replace.
4. **Full cache strategy rollback:** restore the pre-change `ci.yml`,
   `pr-checks.yml`, and `sonar.yml` from git history. All changes are confined
   to workflow files and `.nvmrc`; no application code is affected. Re-add the
   following required contexts that become orphaned after migration (exact
   strings for branch-protection):
   - `"CI Pipeline / Unit Tests"`
   - `"PR Checks / Test Coverage"`
   - `"SonarCloud Analysis / SonarCloud Scan"`
