# CI Audit Report — GitHub Actions, Vitest, Sharding & Caching

**Date:** 2026-06-03 · **Author:** CI/CD Reliability · **Status:** Implemented
(this branch) · **ADRs:** 057–061 · **Migration:**
`ci-required-checks-migration.md`

## 1. Executive Summary

- **Bottleneck:** the ~30k-test Vitest suite ran **unsharded on a single
  runner** and was executed **three times per PR** — `ci.yml` `test`,
  `pr-checks.yml` `test-coverage`, and `sonar.yml` — for ~40 min PR feedback.
- **Highest-impact fix:** one **20-shard** Vitest run with `--reporter=blob`
  feeding a single merge job (the coverage gate); Sonar + Codecov consume the
  merged lcov. Removes 2 of 3 full executions and uses the 20 available runners.
- **PR CI target:** ~8–12 min end-to-end. **Full-suite target:** ~10–15 min.

## 2. Findings & Resolution

| ID   | Sev      | Finding                                                                    | Resolution                                                                   |
| ---- | -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F-01 | Critical | Full suite ran 3×/PR (`ci.yml:80`, `pr-checks.yml:114`, `sonar.yml:72`)    | Single sharded run; `test-coverage` removed; Sonar folded into pipeline      |
| F-02 | Critical | No sharding; `maxWorkers:4` single machine                                 | `test-regression.yml` matrix `shard:[1..20]`                                 |
| F-03 | High     | Coverage serial (16 projects, `run-coverage.js`), 25–30 min                | Sharded blob coverage + `--merge-reports`; thresholds enforced once at merge |
| F-04 | High     | `sonar.yml` re-ran tests and was `continue-on-error` (gate couldn't block) | `sonar` job consumes merged lcov; `continue-on-error` removed                |
| F-05 | High     | `ci.yml build` + `pr-checks build-preview` both `pnpm run build`           | `build-preview` removed; single Turbo-cached build, parallel with tests      |
| F-06 | Medium   | `run-tests.js` masked Vitest exit code                                     | Exit code authoritative; only known cleanup noise forgiven                   |
| F-07 | Medium   | No nightly full-unit regression / manual full run                          | `test-regression.yml` `schedule` (05:00) + `workflow_dispatch`               |
| F-08 | Low      | No root Node pin                                                           | `.nvmrc=22`; `setup-monorepo` uses `node-version-file`                       |
| F-09 | Low      | Playwright browsers re-downloaded each e2e run                             | `actions/cache` on `~/.cache/ms-playwright` keyed by version                 |
| F-10 | Low      | Turbo remote cache configured but tests bypass it                          | Build runs via `turbo run build`; test parallelism via shards (ADR-059)      |

## 3. Empirical Proof (keystone)

Verified locally on `packages/webhooks` (2026-06-03):

- `vitest run --shard=i/N --reporter=blob --coverage` writes
  `.vitest-reports/blob-i-N.json` per shard.
- `vitest run --merge-reports=.vitest-reports --coverage` **unions** coverage:
  shard1 lines 88.08% + shard2 84.25% → **merged 89.36%** (higher than either),
  producing `artifacts/coverage/lcov.info` + `coverage-summary.json`.
- **Critical constraint:** each shard applies the global 90/80/90/90 thresholds
  to its **own partial** coverage and exits 1. Shards therefore run with
  thresholds overridden to `0`; the **merge job is the only threshold gate**.

## 4. Target Architecture

`test-regression.yml` (reusable, `workflow_call` + `workflow_dispatch` + nightly
`schedule`):

```
unit-shards [1..20] ──► merge (90/80/90/90 gate) ──┬─► coverage-report (Codecov + PR comment)
        │                                          └─► sonar (Quality Gate A, from merged lcov)
        └─► shard-balance (skew > 1.3× median → warn)
                                   (schedule only) e2e-cross-browser (cached browsers)
```

`ci.yml` calls it: `test: uses: ./.github/workflows/test-regression.yml`. Other
jobs (`lint`, `typecheck`, `build`, `architecture`, `integration`) run in
parallel; `build` is gated only on `[lint, typecheck]`.

## 5. Sharding Plan

- 1,417 test files (web 586/41%, api 226/16%) ÷ 20 ≈ 71 files/shard; Vitest
  interleaves files so heavy projects spread across shards.
- Exclusions: a **positive include-list** of the 18 unit projects
  (`$UNIT_PROJECTS`), because multiple `--project` _negations_ silently fail in
  Vitest 4.1.7 (verified 2026-06-03 — both ran anyway). `integration` (live DB
  services) and `property` (stochastic/scheduled — ADR-054) are thereby
  excluded; a `project-guard` job fails if a new project escapes both the list
  and the exclusions.
- **Skew detection:** `shard-balance` warns when slowest shard > **1.3×**
  median; fallback is timing-based partitioning from per-shard durations.
- Merge produces lcov + json-summary + junit; thresholds applied post-merge.

## 6. Cache Plan (ADR-059)

| Cache                                  | Decision                                      |
| -------------------------------------- | --------------------------------------------- |
| pnpm store (`setup-node cache:'pnpm'`) | keep (lockfile-keyed)                         |
| node_modules                           | reject (pnpm symlink store + frozen install)  |
| Turbo remote (build/lint/typecheck)    | keep (`signature:true`)                       |
| Playwright browsers                    | add (`~/.cache/ms-playwright`, version-keyed) |
| `.vitest-reports` blobs                | artifact, `retention-days:1`                  |

## 7. Acceptance Criteria

- [ ] PR workflow ≤ ~12 min; full suite runs across exactly 20 shards.
- [ ] No shard > 1.3× median (else `shard-balance` warns).
- [ ] Merged coverage ≥ the **ratchet floor** (`78/70/75/80` — current
      measured), enforced **only** at the merge job; `vitest.config.ts` keeps
      90/80/90/90 as the unenforced aspiration to ratchet toward.
- [ ] SonarCloud Quality Gate stays **A**, fed from the merged lcov (blocking).
- [ ] `pnpm install --frozen-lockfile` everywhere; cache hit/miss observable.
- [ ] `cancel-in-progress` retained; security + secret scans still run on PRs.
- [ ] No required check removed without the admin PATCH
      (`ci-required-checks-migration.md`).

## 8. Residual / Follow-ups

- Real GitHub Actions validation requires pushing this branch (not done here to
  avoid CI spend — owner to push).
- **Doc-only path filtering (from adversarial review):** the old `sonar.yml`
  skipped its run on doc-only changes via `paths-ignore`; the folded `sonar` job
  no longer does, so Sonar now runs on doc-only PRs. Note the 20-shard suite
  _already_ ran on doc-only PRs via `ci.yml` (no `paths-ignore`), so this is not
  a suite regression — only Sonar-on-docs is new. A clean fix (skip the heavy
  jobs on doc-only) is non-trivial because `ci.yml` contexts are **required**,
  and a workflow-level `paths-ignore` makes required checks report `skipped` →
  branch protection blocks merge. Tracked as a follow-up (needs a
  changed-files-gated "always-green-shim" pattern).
- **Coverage gate = ratchet floor (measured 2026-06-03, PR #247 first run):**
  merged coverage measured at **stmt 78.99 / br 71 / fn 75.66 / ln 80.18 %** —
  below the 90/80/90/90 in `vitest.config.ts`. Those config thresholds were
  **never actually enforced** before this rewrite (old `run-tests.js` parsed
  only pass/fail; `run-coverage.js` treats breaches as "debt", exit 0), so the
  merge job is the first real enforcement. Per the owner's decision (**Approach
  A**), the merge job enforces a **floor at `78/70/75/80`** (just under current)
  to block regression; the config keeps 90 as the documented target to ratchet
  toward. Integration + property are excluded from the gate (DB-truncating /
  stochastic); folding integration's blob in would recover a few points but not
  reach 90.
- `governance-metrics.yml:176` has a cosmetic `sonar.yml` log string (left
  untouched — that file carries unrelated in-flight changes).
- Optional affected-tests draft-PR workflow (ADR-061) not yet added
  (non-required).

### Adversarial review hardening (2026-06-03)

A multi-agent review confirmed 5 issues, all fixed here: Sonar action pinned to
`@v5.0.0` (was floating `@master`); `merge` gate now
`needs: [unit-shards, project-guard]` so the coverage gate blocks on project
drift; `lighthouse` dropped from `pr-summary` `needs`; secret-scan required
context corrected to `Secret Scanning / Secret Scanning with GitLeaks` in this
doc, the migration runbook, and ADR-060.
