# CI Rewrite — Real Gains & DORA Impact

**Date:** 2026-06-03 · **Branch:** `ci/sharded-regression` · **Refs:**
`ci-audit-report-2026-06-03.md`, ADR-057…061

Quantifies the impact of the 20-shard CI rewrite. Numbers are **modeled
estimates** unless marked _measured_; the authoritative wall-clock comes from
the first sharded CI run (needs the PR).

## Validation status (pre-merge)

| Check                                                                                                    | Result                                                                        |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Static gate on isolated commit (`format-check`, `lint`, `typecheck`, linters, architecture, sprint-data) | ✅ **PASS in 7m48s** _(measured, clean worktree @ `69aa0b4a3`)_               |
| Blob → merge coverage union                                                                              | ✅ _measured_ (webhooks 88.08% + 84.25% → 89.36%)                             |
| Workflow YAML parse + project-drift guard                                                                | ✅ _measured_                                                                 |
| Adversarial review (5 HIGH findings)                                                                     | ✅ all fixed                                                                  |
| `unit-tests` / `coverage` / `integration`                                                                | ⏳ deferred to sharded CI (DB-truncating + validates base code, not the YAML) |
| End-to-end sharded wall-clock                                                                            | ⏳ needs first CI run (PR)                                                    |

## Real gains — before → after (per PR)

| Dimension                         | Before                                                | After                      | Δ        |
| --------------------------------- | ----------------------------------------------------- | -------------------------- | -------- |
| Full-suite **executions** / PR    | **3×** (`ci.test` + `pr.test-coverage` + `sonar.yml`) | **1×**                     | −67%     |
| Test **parallelism**              | 1 runner (`maxWorkers:4`)                             | **20 runners**             | 20×      |
| **Builds** / PR                   | 2 (`ci.build` + `build-preview`)                      | 1 (Turbo-cached, parallel) | −50%     |
| **Wall-clock** test gate _(est.)_ | ~40–50 min                                            | **~10–12 min**             | **~75%** |
| Runner-**minutes** / PR _(est.)_  | ~135                                                  | ~115                       | ~−15%    |

The headline lever is **wall-clock via parallelism + dedup**. Runner-minutes
drop modestly: removing the two duplicate full runs saves ~80 min, partly spent
back on 20× per-shard setup overhead — so the rewrite is a **lead-time**
optimisation first, a cost optimisation second.

## DORA impact

| Metric                    | Effect                       | Mechanism                                                                                                                                                         |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lead Time for Changes** | ⬇⬇ ~40 → ~11 min PR feedback | 20-shard suite + removal of 2 duplicate full runs                                                                                                                 |
| **Deployment Frequency**  | ⬆ unblocked                  | the ~40-min gate was the throughput ceiling                                                                                                                       |
| **Change Failure Rate**   | ⬇ higher gate fidelity       | SonarCloud Gate-A now **blocks** (was `continue-on-error`); `run-tests.js` no longer masks Vitest exit codes; coverage gate enforced once, correctly (post-merge) |
| **MTTR**                  | ⬇ faster verify loop         | fast CI + `project-guard` / `shard-balance` / honest exit codes for quicker diagnosis                                                                             |

## Quality holes closed (beyond the original audit)

- **SonarCloud gate was silently non-blocking** (`continue-on-error: true`) —
  the A-rating could regress unnoticed. Now blocking.
- **`run-tests.js` masked Vitest's exit code** — a fake-green risk. Now
  authoritative (forgives only known cleanup noise).
- **Vitest 4.1.7 multiple-`--project` negation bug** — `!integration !property`
  silently ran both; would have executed integration tests with no DB inside
  shards. Caught and replaced with a positive include-list + `project-guard`.

## Caveats

- ~10–12 min and runner-minute figures were **modeled**; PR #247's first run
  **measured** ~4 min/shard (20 in parallel) — the design holds.
- Coverage gate enforces a **ratchet floor** (`78/70/75/80`), not the
  `vitest.config.ts` 90/80/90/90 — which was aspirational and **never enforced**
  before (old runners swallowed threshold breaches). Real merged coverage is
  ~stmt 79 / br 71 / fn 76 / ln 80 (unit projects; integration + property
  excluded). The floor blocks regression; ratchet toward 90 over time. See
  ADR-058.
