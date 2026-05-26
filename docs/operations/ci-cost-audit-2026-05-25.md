# CI Cost & Failure Audit — 2026-05-25

> **Scope:** GitHub Actions usage report 2026-05-01 → 2026-05-24 (24 days) plus
> the live state of `.github/workflows/`, `.husky/`, `.github/dependabot.yml`,
> and the last 100 failed runs queried via `gh run list`.
>
> **Author:** Claude Code (audit only — no repo changes made).
>
> **Audience:** Repo maintainers. This is a discovery document; the
> recommendations at the end are ranked but **none have been applied** yet.

---

## 1. Executive summary

In 24 days the repo burned **29,661 Linux compute minutes** across **29 workflow
files**, costing **$177.97 in compute + $0.55 in cache/artifact storage =
$178.51 grand total** (see §3). The pain the team is reporting ("40 min per
ship, 99% fail") is real and is caused by four compounding issues:

1. **Massive duplication** — the same install / build / lint / typecheck / test
   / audit steps run 2–9 times per push across overlapping workflows.
2. **Local hooks under-enforce** — `pre-push` only blocks pushes to `main`; it
   does not run lint, typecheck, build, or unit tests. Pre-commit runs
   typecheck + lint but skips `build`. So "compiles in editor → fails in CI" is
   the default failure shape.
3. **Dependabot fan-out** — major-version bumps are not grouped; each one spawns
   ~9 workflows. 13 of 15 currently-open PRs are Dependabot. On 2026-05-04 alone
   Dependabot burned **989 min ($5.93)**.
4. **"Fix" steps run as "fail" steps in CI** — formatters, lockfile drift,
   inventory drift, lint-fix, artifact-path-fix, and material-symbols subsets
   are all idempotent operations the runner CAN apply. We currently fail the
   build and ask the human to re-run them locally instead.

**Three changes would cut spend ~50% and ship-failure rate ~70%** (see §10).

---

## 2. Workflow inventory (29 files)

Grouped by **actual** trigger shape (re-verified against each workflow's `on:`
block; the path-filter column matters for fan-out math). Italicised entries are
the ones whose share of total compute is >5%.

### Unconditional on push to `main`/`develop` AND on every PR (no path filter)

These four always run on push to main/develop AND on every PR, no escape hatch.
Together with `pr-checks.yml` (PR-only, see next section) they dominate spend.

| Workflow                | Jobs                                                                                                                                   | Triggers                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **_ci.yml_**            | lint, typecheck, test, architecture, integration, build, security-scan, plan-lint, e2e                                                 | `push` + `PR` to main/develop                       |
| **_security.yml_**      | trivy-scan, dependency-check, npm-audit, codeql-analysis, secret-scanning, security-baseline-validation, docker-scan, security-summary | `push` + `PR` to main/master/develop + nightly cron |
| **_sonar.yml_**         | sonarcloud (re-runs test:coverage)                                                                                                     | `push` + `PR` to main/develop                       |
| **_security-sbom.yml_** | SBOM + dependency-track                                                                                                                | `push` + `PR` to main/develop + `release`           |

### PR-only or PR + manual (no `push` trigger)

These do NOT run on pushes to main/develop — only on PRs (some with path
filters). Bot PRs still trigger them, which is the largest mis-targeted spend in
this category.

| Workflow               | Jobs                                                                                                               | Triggers                      | Path-filtered?                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **_pr-checks.yml_**    | pr-validation, quality-checks, test-coverage, build-preview, deploy-preview, security-scan, lighthouse, pr-summary | `PR` to main/develop          | No                                                                                                                                                                 |
| **_system-audit.yml_** | system-audit (Tier 1+2 + library re-build)                                                                         | `PR` to main/develop + manual | No                                                                                                                                                                 |
| content-audit.yml      | content drift                                                                                                      | `PR` to main/develop + manual | **Yes** — `apps/web/src/app/**/page.tsx`, `layout.tsx`, `sitemap.ts`, `data/*.json`, `lighthouserc.js`, `tools/scripts/content-audit.ts`, the workflow file itself |

### Push + PR with path filters (only run on relevant changes)

| Workflow                     | Triggers                                                | Path filter scope                                                                                                |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| validate-sprint.yml          | `push` main/master/develop + `PR`                       | `.gitignore`, `apps/project-tracker/docs/**`, sprint validation scripts                                          |
| validate-sprint-data.yml     | `push` main/master/develop + `PR`                       | `apps/project-tracker/docs/metrics/**`, validation script                                                        |
| artifact-lint.yml            | `push` main/develop + `PR` to main/develop + manual     | `**/*.log`, `**/*.html`, `**/*.json`, `**/*.csv`, `artifacts/**`, linter source, workflow                        |
| runtime-path-lint.yml        | `push` main/develop + `PR` to main/develop + manual     | `apps/project-tracker/docs/metrics/**/*`, `artifacts/**/*`, logs/json/csv globs, linter source, policy, workflow |
| api-inventory-drift.yml      | `push` + `PR` main/develop + daily cron + manual        | `apps/api/src/modules/**/*.router.ts`, `artifacts/benchmarks/baseline.json`, sync script                         |
| codebase-inventory-drift.yml | `push` + `PR` main/develop + daily cron + manual        | DB schema, middleware, workers, adapters, domain events, validators, sync script, baseline                       |
| dependency-scan.yml          | `push`/`PR` main + weekly cron + manual                 | `pnpm-lock.yaml`, `package.json`, `**/package.json`                                                              |
| image-scan.yml               | `push`/`PR` main/master/develop + nightly cron + manual | `apps/**/Dockerfile`, `infra/docker/**`, `docker-compose*.yml`, workflow                                         |
| migration.yml                | `push` main + `PR` + manual                             | `scripts/migration/**`, `packages/db/prisma/schema.prisma`                                                       |
| terraform.yml                | `push` + `PR` main/develop + manual                     | `infra/terraform/**`, the workflow file itself (push only)                                                       |

### Push-only (release/deploy path) and cron-only

(Unchanged from previous draft — these don't run on PRs and aren't the focus of
the duplication problem.)

| Workflow                    | Trigger                           |
| --------------------------- | --------------------------------- |
| cd.yml                      | `push` to main                    |
| build-images.yml            | `push` to main + manual           |
| signing.yml                 | `push` to main + manual           |
| release.yml                 | `push` to release/\*\* + manual   |
| railway-deploy.yml          | `workflow_run` after CD + manual  |
| blue-green-deploy.yml       | manual only                       |
| performance-gate.yml        | manual only                       |
| governance-metrics.yml      | nightly cron + push to main       |
| system-audit-nightly.yml    | nightly cron                      |
| system-audit-integrity.yml  | nightly cron (cache-bypass smoke) |
| secret-rotation.yml         | weekly cron                       |
| sprint-completion-audit.yml | manual only                       |

### Why this matters for the savings math

- The **path-filtered group** is already well-targeted. A markdown-only or
  metrics-only commit will skip them — that's good. They do not contribute to
  the duplication problem.
- The **four unconditional workflows** (plus `pr-checks.yml` on PR events) are
  where `paths-ignore` adds the most value (recommendation B in §10).
- `pr-checks.yml`, `system-audit.yml`, and `sonar.yml` all run on **every**
  Dependabot PR (no path filter). `content-audit.yml` is path-filtered to web
  content files (`apps/web/src/app/**/page.tsx`, `layout.tsx`, `sitemap.ts`,
  `data/*.json`, `lighthouserc.js`) so a Dependabot lockfile/package.json bump
  does NOT trigger it. Skipping those three on bot PRs (recommendation G in §10)
  is safe because `security.yml`, `security-sbom.yml`, and `dependency-scan.yml`
  still cover the actual security concern of a dependency change, and `ci.yml`
  still runs typecheck/test/build on the bumped version.

---

## 3. Compute breakdown — last 24 days

### Top workflows by minutes

|         % | Minutes |   Cost | Runs |  Avg/run | Workflow              |
| --------: | ------: | -----: | ---: | -------: | --------------------- |
| **24.4%** |   7,247 | $43.48 |   28 | **258m** | security.yml          |
| **22.2%** |   6,578 | $39.47 |   19 | **346m** | ci.yml                |
| **19.2%** |   5,692 | $34.15 |   16 | **356m** | pr-checks.yml         |
|      6.6% |   1,944 | $11.66 |   16 |     122m | system-audit.yml      |
|      5.0% |   1,473 |  $8.84 |   16 |      92m | sonar.yml             |
|      3.9% |   1,151 |  $6.91 |   16 |      72m | security-sbom.yml     |
|      2.5% |     744 |  $4.46 |    7 |     106m | validate-sprint.yml   |
|      2.5% |     737 |  $4.42 |   14 |      53m | artifact-lint.yml     |
|      1.9% |     575 |  $3.45 |   14 |      41m | runtime-path-lint.yml |
|      1.4% |     407 |  $2.44 |   10 |      41m | dependency-scan.yml   |

**The top 3 alone = 65.8% of all spend.** Cap them and you cap the bill.

> **Cost terminology used throughout this section.** Numbers in the "Cost"
> column above are GitHub Actions Linux runner compute spend only ($177.97
> aggregate). Actions cache + artifact storage adds **$0.55** on top. Grand
> total for the 24-day window: **$178.51**. The structured artifact at
> `artifacts/reports/ci-cost/latest.json` splits these into `compute_cost_usd`,
> `storage_cost_usd`, and `grand_total_usd` so downstream consumers can't
> conflate them.

### Single-day spikes

| Date       |    Minutes |       Cost | What happened                                              |
| ---------- | ---------: | ---------: | ---------------------------------------------------------- |
| 2026-05-23 | **15,433** | **$92.60** | "Five chronic workflow failure shapes" — PR #107–#113 walk |
| 2026-05-09 |      2,993 |     $17.96 | Wave 1 rebase storm                                        |
| 2026-05-04 |      1,483 |      $8.90 | Dependabot batch landed                                    |
| 2026-05-14 |      1,321 |      $7.93 | –                                                          |
| 2026-05-02 |      1,315 |      $7.89 | –                                                          |

2026-05-23 = **52% of the entire 24-day spend** in one day. That single incident
is documented in `memory/feedback_ci_chronic_workflow_patterns.md`.

### By actor

|         % |   Minutes |       Cost | Actor                               |
| --------: | --------: | ---------: | ----------------------------------- |
|     85.7% |    25,413 |    $152.48 | talyssonoliver (human pushes + PRs) |
| **13.7%** | **4,050** | **$24.30** | **dependabot[bot]**                 |
|      0.6% |       181 |      $1.09 | copilot-pull-request-reviewer[bot]  |
|      0.0% |        12 |      $0.07 | github-advanced-security[bot]       |
|      0.0% |         5 |      $0.03 | copilot-swe-agent[bot]              |

### Dependabot drill-down

The top 5 workflows Dependabot triggers per PR:

| Minutes |  Cost | Runs | Workflow         |
| ------: | ----: | ---: | ---------------- |
|     907 | $5.44 |    4 | ci.yml           |
|     837 | $5.02 |    4 | security.yml     |
|     792 | $4.75 |    4 | pr-checks.yml    |
|     401 | $2.41 |    4 | system-audit.yml |
|     219 | $1.31 |    4 | sonar.yml        |

A single Dependabot major-bump PR consumes ~750 minutes ($4.50) just to tell us
"the new version still passes the same tests" — which we already knew because
the project already passes those tests.

---

## 4. Duplication map

The same step is repeated across workflows. Numbers are _occurrences per
push-with-PR_ (one CI run + one PR-checks run + one system-audit run + one sonar
run + one security run = baseline):

| Step                                                     |                                            Times run | Where                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------: | ----------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                         | **49 across all workflow files** (9× per typical PR) | every job in every workflow re-installs                                       |
| `pnpm turbo run build --filter=!web/api/tracker/workers` |                                        **5×** per PR | ci.typecheck, ci.test, ci.integration, pr-checks.quality-checks, system-audit |
| `pnpm run lint`                                          |                                        **2×** per PR | ci.lint, pr-checks.quality-checks                                             |
| `pnpm run typecheck`                                     |                                        **2×** per PR | ci.typecheck, pr-checks.quality-checks                                        |
| `pnpm run format:check`                                  |                                        **2×** per PR | ci.lint, pr-checks.quality-checks                                             |
| `pnpm run build` (full prod build)                       |                                        **2×** per PR | ci.build, pr-checks.build-preview (both ~10m each)                            |
| `pnpm run test` / `test:coverage`                        |                                        **3×** per PR | ci.test, pr-checks.test-coverage, sonar                                       |
| `pnpm audit`                                             |                                        **3×** per PR | ci.security-scan, pr-checks.security-scan, security.npm-audit                 |
| Secret scan                                              |                                **3 different tools** | trufflehog (ci), trufflehog (pr-checks), gitleaks (security)                  |
| `pnpm exec playwright install`                           |                                        unique to e2e | ci.e2e only (`continue-on-error: true` — so this also doesn't gate anything)  |

**The cache IS shared, the install is not.** `actions/setup-node@v6` with
`cache: 'pnpm'` restores the pnpm store from GitHub's shared cache service
across jobs and runs whenever the cache key (lockfile hash) hits. The real cost
driver is that every job still **executes a full `pnpm install`** — the store
restore avoids re-downloading tarballs, but it does not skip the install step
itself (linking node_modules, running install scripts, building the workspace
graph). For a monorepo this size that step is 30–60s of CPU per job, multiplied
by ~9 jobs per PR. Turbo remote cache (`TURBO_TOKEN`) is configured but
inconsistently exported across workflows; verify per-workflow before claiming a
hit-rate.

**There is no reusable composite action** — the checkout + pnpm + node +
install + library-build sequence is hand-written in every job (49 install
occurrences across workflow files). A composite at
`.github/actions/setup-monorepo/action.yml` would not change the cache hit-rate
AND would not by itself share build outputs across jobs (each calling job still
executes the composite's steps in its own runner). What a composite alone gets
you: (a) consistent `--prefer-offline --frozen-lockfile` invocation, (b) one
place to maintain the env-stub block so the 2026-05-23 "stub drifted between
workflows" failure cannot recur, (c) a single canonical
`pnpm turbo run build --filter=!@intelliflow/web --filter=!@intelliflow/api --filter=!@intelliflow/project-tracker --filter=!@intelliflow/workers`
step everyone calls the same way. To actually share the _output_ of that build
across jobs you must pair the composite with `upload-artifact` /
`download-artifact` + `needs:`, or with `actions/cache` keyed on the
workspace-graph hash — see recommendation D in §10 for the full pairing.

---

## 5. Why they fail — recent run pattern (last 100 failed runs)

| Failures | Workflow                        |
| -------: | ------------------------------- |
|   **23** | PR Checks                       |
|   **22** | System Audit (Tier 1+2)         |
|        9 | Railway Deploy                  |
|        8 | Terraform CI/CD                 |
|        7 | Artifact Signing and Provenance |
|        5 | CI Pipeline                     |
|        5 | CD Pipeline                     |
|        5 | Build & Push Images             |
|        4 | Dependency Security Scan        |
|        3 | Governance Metrics              |
|        3 | Release                         |

### The five chronic failure shapes (2026-05-23)

> **Note on sources.** The "memory" entries cited in this section live in the
> audit author's external Claude Code memory at
> `~/.claude/projects/C--Users-talys-projects-intelliFlow-CRM/memory/`, **not in
> the repo**. The repo itself has no `memory/`, `.claude/memory/`, or
> `.codex/memory/` directory. These references are reproducible only from that
> author's environment. See §13 below for an in-repo evidence appendix with the
> same facts derived from commit history and workflow source.
>
> The five-shape summary itself:

1. **Missing v0.0.0 bootstrap tag** — `git describe` errors in workflows that
   compute version. Fix: wrap with `git rev-parse --verify` fallback to HEAD.
2. **Unbuilt internal packages before tests/build** — workspace packages depend
   on each other's dist/. Fix: pre-build with
   `pnpm turbo run build --filter=!@intelliflow/{web,api,project-tracker,workers}`.
3. **Missing env stubs for module-load guards** — `next build` fails at
   page-data collection because Prisma / Supabase / encryption-key guards throw
   at module-load. Fix: copy ci.yml's Build env block verbatim
   (`PRISMA_FIELD_ENCRYPTION_KEY`, `AI_AUDIT_SIGNING_KEY`, stub `DATABASE_URL`,
   Supabase stubs).
4. **Direct push to main from github-actions bot** — branch protection blocks.
   Fix: replace `git push` with `gh pr create`.
5. **Malformed SLSA provenance predicate** — cosign wraps it in the Statement
   envelope, so the predicate file must contain ONLY the predicate body.

Plus two related patterns from the same external-memory store: (a) the "fake
green" failure mode (PG-126 lesson — pipeline reports COMPLETE while integration
wiring was reverted by an external formatter; rule: re-grep every integration
edit before final report), and (b) the "PowerShell Set-Content corruption"
pattern (CSV row updates via `Set-Content -Value` on Windows can wipe leading
rows when the file contains embedded quoted multi-line cells; rule: write the
script to a `.mjs` file first, then run it via node). Both are also reproducible
from this checkout — see §13.

### Failure modes specific to the duplicate-job pattern

When `pr-checks.quality-checks` and `ci.lint` both run `pnpm run lint`, they
fail together and the human sees TWO failed checks for one underlying problem.
The PR-checks summary step then posts a comment listing both failures. This is
amplified by Dependabot: each bot PR generates ~9 parallel jobs, half of which
all fail with the same root cause, producing 4–5 red checks per PR and 4–5 bot
comments per push.

---

## 6. Auto-PR and auto-merge analysis

### Current state

- **`.github/dependabot.yml`** groups non-major npm updates into two buckets
  (`production-minor-and-patch`, `development-minor-and-patch`) and groups
  github-actions minor/patch. **Major bumps are NOT grouped** — each major
  spawns its own PR. The currently-open PR queue confirms it: PR #144 (Stripe),
  #148 (twilio), #149 (checkout v6), #151 (cache v5), #150 (metadata v6), #147
  (build-push v7), #146/#145/#154 (bull-board), #153 (csv-parse v6) all
  individually opened, each running 9 workflows.
- **There is no auto-merge configured anywhere.** No Mergify, no
  `.github/auto-merge.yml`, no workflow with `gh pr merge --auto`. Every PR
  requires manual merge after review.
- **There is no auto-approve for Dependabot.** Each bot PR sits at
  `REVIEW_REQUIRED` waiting on a human.
- **Branch protection requires PR** (the `master:main` push-rename incident on
  2026-05-01 was caught by it). This is good; do not disable.

### Open PR fan-out (right now)

| Author         | Open PRs | Triggers per push                                 |
| -------------- | -------: | ------------------------------------------------- |
| app/dependabot |       13 | ~9 workflows each = **~117 workflow runs queued** |
| talyssonoliver |        2 | ~9 workflows each                                 |

15 open PRs × ~9 workflows = ~135 workflow runs sit in the queue at any moment.
With concurrency cancellation enabled (good — already configured) the _latest_
push wins, but every rebase / new commit re-triggers the fan-out.

### Recommended auto-PR / auto-merge changes

| Change                                                                                                                                                                                                                                                                                                                              | Saves                                                                                    | Risk                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Expand Dependabot grouping to include majors for low-risk ecosystems (e.g. `actions/*`, `docker/*`, build-only devDependencies)                                                                                                                                                                                                     | ~40% of bot minutes                                                                      | Low — majors of build-only deps rarely break runtime                                    |
| Add a `auto-merge.yml` workflow that auto-approves+merges Dependabot PRs once all required checks pass AND the change is patch/minor on a non-runtime dep                                                                                                                                                                           | All review-roundtrip latency                                                             | Low if scoped tightly                                                                   |
| Add `paths-ignore: ['**/*.md', 'docs/**', 'apps/project-tracker/docs/metrics/**']` to ci/pr-checks/security/sonar/system-audit                                                                                                                                                                                                      | ~30–40% of all human minutes                                                             | None — these paths cannot affect those checks                                           |
| Trim heavy steps inside `pr-checks.yml` for Dependabot (per-step `if:`), and skip `system-audit.yml`/`sonar.yml` entirely (these are NOT in the required-context list). See §10-G for the exact constraint: pr-checks's 7 required-context jobs must keep emitting success on bot PRs or branch protection will deadlock the merge. | ~1,095m / ~3.7% of total spend with the safe shim approach (see §10-G for the breakdown) | Medium — every required-context job in pr-checks must keep emitting success for bot PRs |
| Bump `concurrency` to also cancel on workflow_dispatch and schedule overlap                                                                                                                                                                                                                                                         | Minor                                                                                    | None                                                                                    |

---

## 7. "Fix-in-pre-commit instead of fail-in-CI" inventory

This is the highest-leverage change category. Every entry below is something CI
currently fails on but the runner has the information and tools to apply the fix
itself.

| Currently fails in CI           | Could be auto-fixed in pre-commit                  | Status                                                                   |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm run lint`                 | `pnpm run lint:fix` → re-stage                     | **Not implemented** — pre-commit runs `lint`, not `lint:fix`             |
| `pnpm run format:check`         | `prettier --write` → re-stage                      | **Implemented** ✅ (pre-commit lines 67–73)                              |
| Sprint plan split drift         | `npx tsx tools/scripts/split-sprint-plan.ts`       | **Implemented** ✅ (pre-commit lines 10–18)                              |
| API inventory drift             | `npx tsx tools/scripts/sync-api-inventory.ts`      | **Implemented** ✅ (pre-commit lines 22–27)                              |
| Codebase inventory drift        | `npx tsx tools/scripts/sync-codebase-inventory.ts` | **Implemented** ✅ (pre-commit lines 28–33)                              |
| Material Symbols subset drift   | `node tools/scripts/subset-material-symbols.mjs`   | **Implemented** ✅ (pre-commit lines 39–51)                              |
| `pnpm run lint:artifacts`       | `pnpm run lint:artifacts:fix`                      | **Not implemented** — only `:fix` is wired but pre-commit doesn't run it |
| `pnpm run lint:runtime-paths`   | No auto-fix available (linter-only)                | Cannot auto-fix                                                          |
| `pnpm run validate:a11y-routes` | No auto-fix available                              | Cannot auto-fix                                                          |
| `pnpm audit --audit-level=high` | `pnpm audit fix --force` (risky — version bumps)   | **Should NOT auto-fix** in pre-commit; let Dependabot own this           |
| `gitleaks protect --staged`     | Cannot auto-fix (remove the secret manually)       | Cannot auto-fix                                                          |
| `pnpm run typecheck`            | Cannot auto-fix (compiler errors)                  | Cannot auto-fix                                                          |
| `pnpm run build` (next.js)      | Cannot auto-fix                                    | Cannot auto-fix                                                          |

**Action items in this category:**

1. Change pre-commit step "Linting code" (line 76–80) from `pnpm run lint` to
   `pnpm run lint:fix && pnpm run lint`. Apply fixes, then verify nothing's
   left. Re-stage the autofix'd files.
2. Add a pre-commit step that runs `pnpm run lint:artifacts:fix` whenever any
   `artifacts/**` path is staged.

**These two changes alone would eliminate the largest class of "shipped to CI
just to get told to run a fix command locally" loops.**

---

## 8. Local belt-and-suspenders pre-ship spec

The user-selected pre-ship gate runs **all of these in order** before any push
is allowed (the slowest mirror of CI possible — 15–20 min on a dev laptop,
intentionally aggressive). The script should be a single `pnpm pre-ship`
invocation, opt-out via `SKIP_PRESHIP=1`.

| Order | Command                                                                                        | Mirrors CI step                        | Wall-clock |
| ----: | ---------------------------------------------------------------------------------------------- | -------------------------------------- | ---------: |
|     1 | `pnpm install --frozen-lockfile`                                                               | every workflow                         |       ~30s |
|     2 | `pnpm turbo run build --filter=!web --filter=!api --filter=!project-tracker --filter=!workers` | ci.typecheck pre-step                  |       ~60s |
|     3 | `pnpm run format:check`                                                                        | ci.lint, pr-checks.quality-checks      |       ~10s |
|     4 | `pnpm run lint` (after `lint:fix` autofix)                                                     | ci.lint, pr-checks.quality-checks      |       ~45s |
|     5 | `pnpm run typecheck`                                                                           | ci.typecheck, pr-checks.quality-checks |       ~90s |
|     6 | `pnpm run lint:artifacts`                                                                      | pr-checks.quality-checks               |        ~5s |
|     7 | `pnpm run lint:runtime-paths`                                                                  | runtime-path-lint.yml                  |        ~5s |
|     8 | `pnpm --filter @intelliflow/web audit:material-symbols`                                        | ci.build, pr-checks                    |       ~10s |
|     9 | `pnpm run validate:a11y-routes` (VALIDATION_STRICT=1)                                          | pr-checks.quality-checks               |        ~5s |
|    10 | `pnpm run test:unit`                                                                           | ci.test                                |   ~3-4 min |
|    11 | `pnpm run test:integration` (needs Docker postgres+redis)                                      | ci.integration                         |   ~3-4 min |
|    12 | `pnpm run test:coverage`                                                                       | pr-checks.test-coverage                |     ~5 min |
|    13 | `pnpm run build` (with full env stubs)                                                         | ci.build, pr-checks.build-preview      |     ~5 min |
|    14 | `pnpm audit --audit-level=high`                                                                | security.npm-audit                     |       ~10s |
|    15 | `gitleaks protect --staged --redact`                                                           | security.secret-scanning               |        ~5s |
|    16 | `pnpm exec dependency-cruiser tests/architecture`                                              | ci.architecture                        |       ~10s |
|    17 | `pnpm run validate:sprint-data`                                                                | validate-sprint-data.yml               |        ~5s |

**Total: ~15–20 min wall-clock.** First failure stops the rest. Each step's exit
code goes into a JSON report at `artifacts/preship/last-run.json` so the next
push can skip already-passing steps (cache invalidated by git SHA).

**Why this matters:** today the team finds out about a typecheck error after CI
eats 4 minutes of install + 4 minutes of build dependencies + 3 minutes of
type-checking before failing. Locally that's the same step but
already-warm-cached, ~90s. The bottleneck is _not_ compute speed — it's where
the failure surfaces. Surfacing it on the laptop costs zero $$$ and zero queue
time.

---

## 9. Bot comment policy

The team reports: _"the agents write comments and no one reads, sometimes
enforce bypass and sometimes we even lost code or ship things broken without
fix."_

Current state in this repo:

- **No CodeRabbit** detected (`.coderabbit.yml` does not exist).
- **GitHub Copilot PR Reviewer** active (`copilot-pull-request-reviewer[bot]` in
  usage logs, 181m / $1.09).
- **`copilot-swe-agent[bot]`** active (5m).
- **`github-advanced-security[bot]`** active (CodeQL, 12m).

### Recommended policy (per user selection)

1. **Block merge if any reviewer-bot comment is unresolved.** Implement as a
   non-required check first (`bot-comments-resolved`); only promote to a
   _required_ check after the gaps listed below are closed. **Use GraphQL, not
   REST** — thread resolution state is only exposed through the GraphQL
   `reviewThreads { isResolved }` connection on `PullRequest`; the REST
   `pulls/{N}/reviews` endpoint only returns review-level state (APPROVED /
   COMMENTED / CHANGES_REQUESTED) and has no concept of thread resolution.

   **The query must paginate.** `reviewThreads(first: 100)` caps at 100 per page
   and a long-lived PR easily exceeds that. The skeleton below loops until
   `pageInfo.hasNextPage` is false; **do not** use the single-page form, it
   silently misses threads:

   ```bash
   # Iterate threads, then iterate each thread's comments (the LAST comment
   # is what tells you whether a bot is still in the conversation; first: 1
   # would miss bot replies to a human-opened thread).
   gh api graphql --paginate -F owner='OWNER' -F name='REPO' -F number=$PR -f query='
     query($owner:String!, $name:String!, $number:Int!, $endCursor:String) {
       repository(owner:$owner, name:$name) {
         pullRequest(number:$number) {
           reviewThreads(first: 100, after: $endCursor) {
             pageInfo { hasNextPage endCursor }
             nodes {
               isResolved
               comments(last: 100) {
                 nodes { author { login } path line body }
               }
             }
           }
         }
       }
     }'
   ```

   Filter the returned threads to those whose comment list contains an author in
   the known-bot allowlist (e.g. `copilot-pull-request-reviewer[bot]`,
   `coderabbitai[bot]`, `github-advanced-security[bot]`) and fail if any such
   thread has `isResolved: false`.

   **Known gaps before this is safe to make required:**
   - **Issue comments** (the regular `gh pr comment` channel CodeRabbit uses for
     summary/walkthrough output) are NOT review threads and won't appear in
     `reviewThreads`. Cover them via REST `GET /repos/.../issues/{n}/comments`
     with pagination, filtered by the same bot allowlist.
   - **Code-scanning alerts** (CodeQL, Trivy SARIF uploads) are not comments at
     all — they live in the Security tab and surface as check-run conclusions.
     Cover them via `GET /repos/.../code-scanning/alerts?ref=refs/pull/{n}/head`
     filtered to `state=open` AND `severity in (high, critical)`.
   - **Check-run conclusions** (Copilot SWE-agent's `neutral`/`action_required`
     outcomes) don't post comments either. Cover them via
     `GET /repos/.../commits/{sha}/check-runs` filtered to
     `conclusion in (action_required, neutral)`.

   Each gap above is independent — pick which ones must block merge per bot.
   Until all the gaps relevant to your bot fleet are wired in, keep this check
   **non-required** so it can't silently miss a real blocker.

2. **Auto-summarize bot comments into a single PR comment.** On each
   `pull_request` synchronize event, a workflow reads all open comments from the
   known bot list, groups them by file:line, and posts/updates a single "🤖 Bot
   review digest" PR comment. Reduces noise so humans actually read.
3. **Open question: auto-PR/auto-merge investigation.** User flagged this as a
   separate analysis topic — see §6 above for current state and §10 for ranked
   options.

---

## 10. Ranked recommendations

> **Read §10.0 first.** Several rows below depend on facts about branch
> protection and `continue-on-error` flags that change whether a change is safe.
> The prerequisites in §10.0 are not optional.

### 10.0 Branch protection ground truth (verified 2026-05-25)

`gh api repos/talyssonoliver/IntelliFlow-CRM/branches/main/protection` reports
**15 required status-check contexts**, all from `ci.yml` and `pr-checks.yml`:

```
CI Pipeline / Lint & Format             PR Checks / PR Validation
CI Pipeline / Type Check                PR Checks / Quality Checks
CI Pipeline / Unit Tests                PR Checks / Test Coverage
CI Pipeline / Architecture Tests        PR Checks / Build Preview
CI Pipeline / Integration Tests         PR Checks / Deploy Preview
CI Pipeline / Build                     PR Checks / Security Scan
CI Pipeline / Security Scan             PR Checks / PR Summary
CI Pipeline / Sprint Plan Validation
```

`strict: true` (PRs must be up-to-date with main). No rulesets in addition to
branch protection.

**Why this matters for the recommendations below:** GitHub treats a required
check that _never runs_ as **pending forever** — the PR cannot merge. Therefore
any change that prevents one of these 15 jobs from emitting its status (via
`paths-ignore`, top-level `if:`, or workflow deletion) must first either:

- **(P1)** Update branch protection to remove that context, OR
- **(P2)** Replace the heavy job with a same-named _gate_ job that always emits
  success when the work isn't needed (the "skip-with-success-shim" pattern), OR
- **(P3)** Move the heavy work into a child job and make `needs:` / `if:` decide
  whether the child runs, while the parent still emits the required context.

Rows B, E, and G below all touch required contexts. Each lists which
prerequisite it requires.

### 10.0b Security-gate ground truth (verified 2026-05-25)

`grep -n 'continue-on-error' .github/workflows/*` shows the following
audit/security steps are non-gating today (they fail-soft, the check still
passes):

| File:line                       | Step                                | Current behaviour                                                                             |
| ------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `ci.yml:307`                    | `pnpm audit --audit-level=high`     | `continue-on-error: true`                                                                     |
| `pr-checks.yml:309`             | `pnpm audit --audit-level=high`     | `continue-on-error: true`                                                                     |
| `security.yml:152`              | `pnpm audit --audit-level=critical` | gates only on **critical** (was tightened down per the comment "until Dependabot bumps land") |
| `dependency-scan.yml:55,89,140` | npm audit, snyk, OSV scanners       | `continue-on-error: true`                                                                     |
| `ci.yml:364`                    | E2E                                 | `continue-on-error: true` (chronic flake, separate issue)                                     |

**Implication for recommendation H (auto-merge).** Saying "security workflows
still cover the dep change" understates the gap: all four dependency-scanning
surfaces are either fail-soft or gated at a level above `high`. Auto-merge today
could land a `high`-severity dependency finding because every required check
would still report `success`. Prerequisite H0 in §10 closes this gap before H is
safe to enable.

### 10.1 Ranked changes

Each row is independently shippable **after its listed prerequisites are met**.
Risk = blast radius if it goes wrong. Savings = % of current 24-day spend
recovered.

|     # | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |                                                                                                                                                                                                                                                  Saves | Risk                                                                                                                     | Effort                                                                                            |
| ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **A** | **Harden `pre-push` to mirror CI's required gates** (steps 1–13 of §8). Default-on, opt-out via `SKIP_PRESHIP=1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                30–40% of human-author CI runs (the ones that fail in the first 10 min) | Low — opt-out exists                                                                                                     | 1 day (script + docs)                                                                             |
| **B** | **Add `paths-ignore` to ci/pr-checks/security/sonar/system-audit** for `**/*.md`, `docs/**`, `apps/project-tracker/docs/metrics/_global/Sprint_plan_*.csv`. **Prerequisite:** apply pattern **P2** from §10.0 first — every one of the 15 required contexts above must be split into a same-named _gate_ job that runs in <30s and always emits success on the ignored paths, plus a heavy job gated on the path filter. Without this, a docs-only PR sits at pending forever. The "Required workflow with paths-ignore" GitHub recipe is the canonical reference.                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                      30–40% of all minutes — but only after the P2 refactor; before then, savings = 0 and PRs deadlock | **Was "None" — actually Medium** because P2 touches every required-check job. Without P2: HIGH (PR deadlock)             | 1 hr to add paths-ignore + 1 day for the P2 refactor across 15 required contexts                  |
| **C** | **Auto-fix lint at pre-commit on staged files only.** Get the staged TS/TSX list with `git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx'`, run `pnpm exec eslint --fix` on **those files only**, then `git add` the same list to re-stage. Do **NOT** call `pnpm run lint:fix` — that's `turbo run lint:fix` which lints every package and will modify unrelated files. Apply the same staged-file-only pattern for `lint:artifacts` (script already supports a fix mode against a file list).                                                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                            All "lint failed in CI" loops for issues eslint can autofix | Low — staged-files-only scoping prevents drive-by edits to unrelated packages                                            | 30 min                                                                                            |
| **D** | **Create reusable composite action** `.github/actions/setup-monorepo/action.yml` doing checkout + pnpm + node + install + library-build. Adopt across all 17 PR-triggered workflows. Composites do **not** share build outputs across jobs by themselves — each job still executes the steps inside the composite. To actually share the library-build output across jobs, pair the composite with one of: (a) a separate `build-libs` job that uploads `dist/` via `actions/upload-artifact` and downstream jobs `needs: build-libs` + `download-artifact`, or (b) `actions/cache` keyed on the workspace-graph hash. Without that pairing, the savings are limited to: (i) consistent `--prefer-offline --frozen-lockfile`, (ii) one place to maintain the env-stub block so the 2026-05-23 "stub drifted between workflows" failure cannot recur, (iii) easier future migration to a shared cache layer. |                                                                                                                                      Composite alone: ~5–10% wall-clock + drift-prevention. Composite + build-libs job with artifacts: ~15–25% on top. | Low-Medium — coordinated change                                                                                          | Composite: 1 day. Composite + artifact-share refactor: 2 days.                                    |
| **E** | **Dedupe**: delete `quality-checks` job from `pr-checks.yml` (`ci.lint`+`ci.typecheck` cover it); delete `security-scan` from BOTH ci.yml and pr-checks.yml (`security.yml` covers it). **Prerequisite P1:** the required-context names today include `PR Checks / Quality Checks`, `CI Pipeline / Security Scan`, and `PR Checks / Security Scan` (see §10.0) — those must be removed from branch protection in the same PR that deletes the jobs, or the PR self-deadlocks.                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                          25% of pr-checks + ci minutes | Medium — requires coordinated branch-protection edit in the same PR                                                      | 2 hr (verify) + 1 hr (apply) + 15 min (branch protection edit, admin only)                        |
| **F** | **Expand Dependabot grouping** to include majors for `actions/*`, `docker/*`, and `devDependencies` ecosystems                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                                                40% of bot minutes (~5% of total spend) | Low — devDep majors rarely break runtime                                                                                 | 30 min                                                                                            |
| **G** | **Trim Dependabot work inside `pr-checks.yml` + `system-audit.yml` + `sonar.yml`**, but keep the required-check contexts emitting success. Concretely: (a) for `pr-checks.yml`, the 7 required-context jobs (`PR Validation`, `Quality Checks`, `Test Coverage`, `Build Preview`, `Deploy Preview`, `Security Scan`, `PR Summary`) must still report — wrap the _heavy steps inside each_ with `if: github.event.pull_request.user.login != 'dependabot[bot]'` and add a same-job success shim for bot PRs. (b) `system-audit.yml` and `sonar.yml` are NOT in the required-context list, so they can be skipped at the job level safely. Do **not** skip the whole `pr-checks.yml` workflow — that deadlocks every bot PR on 7 pending required checks.                                                                                                                                                     | Per §3 Dependabot drill-down: full saves are 792m (pr-checks) + 401m (system-audit) + 219m (sonar) = 1,412m. Realistic with the shim approach: ~60–70% of pr-checks bot minutes (~475m) + all of system-audit + sonar = ~1,095m / ~3.7% of total spend | Medium — every required-context job in pr-checks must keep emitting success for bot PRs; mis-wiring deadlocks bot merges | 1 day (per-job shim audit + change)                                                               |
| **H** | **Auto-merge Dependabot patch/minor PRs** once all required checks pass and dep is in a non-runtime ecosystem. **Prerequisite H0 (mandatory, do not skip):** before enabling auto-merge, tighten the security gate so "all required checks pass" actually means "no high-severity dep findings". Specifically: (a) remove `continue-on-error: true` from `ci.yml:307` and `pr-checks.yml:309` `pnpm audit` steps, (b) raise `security.yml:152` from `--audit-level=critical` back to `--audit-level=high` (and close out the temporarily-waived findings), (c) remove `continue-on-error: true` from `dependency-scan.yml` scanners at lines 55/89/140 OR replace with a single gating job that aggregates their findings. Without H0, auto-merge can land a `high`-severity vuln because the required checks will all report `success` regardless.                                                         |                                                                                                                                                                                                          Eliminates manual-review latency on bot churn | **Was Medium — actually HIGH without H0** (auto-lands vulns). With H0: Medium and requires a runtime-dep allow-list      | H0: 2 hr (audit-level + lockfile-bump audit). H proper: 1 day (allow-list + auto-merge workflow). |
| **I** | **Bot-comment digest** workflow + **bot-comments-resolved** check. Ship as a _non-required_ check first. Promoting to _required_ (branch-protection enforced) needs the four coverage gaps listed in §9 closed: (i) GraphQL `reviewThreads` paginated via `pageInfo.hasNextPage`, (ii) issue comments via REST `issues/{n}/comments` with pagination, (iii) code-scanning alerts via `code-scanning/alerts?ref=refs/pull/{n}/head` filtered to `severity in (high, critical)`, (iv) check-run conclusions filtered to `action_required`/`neutral`. Without those, the required check silently misses real blockers.                                                                                                                                                                                                                                                                                         |                                                                                                                                                           Forces engagement with bot review; addresses "we ship broken because we ignored the comment" | Non-required version: Low. Required version: Medium until all four gaps are closed                                       | Non-required: 1 day. Required (with all gaps): 2–3 days                                           |
| **J** | **Cancel duplicate Railway Deploy runs** — current pattern shows 9 Railway Deploy failures back-to-back from `workflow_run` retries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                      ~2% of total spend, removes noise | Low                                                                                                                      | 30 min                                                                                            |
| **K** | **Tighten `security.npm-audit` back to `--audit-level=high`** (currently at `critical` per the comment "until Dependabot bumps land"); decide once now that they have landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                Catches more issues; no compute savings | Low                                                                                                                      | 15 min                                                                                            |

### Combined-impact summary

| Bundle                             | Effort  |                               Savings | Risk       |
| ---------------------------------- | ------- | ------------------------------------: | ---------- |
| **Quick wins (B + C + F + G + J)** | ~3 hr   |          **~45–55%** of current spend | Low        |
| **Quick wins + A (pre-ship hook)** | ~1 day  |    **+10–15%** failure-rate reduction | Low        |
| **Above + D (composite action)**   | ~2 days |                        **+15%** spend | Low-Medium |
| **Everything (A–K)**               | ~5 days | **~70%** spend, **~70%** failure rate | Medium     |

---

## 11. Proposed skill: `ci-shipfast`

No existing skill in `.claude/skills/` covers GitHub Actions cost, duplication,
or local-mirror execution (closest are `code-review`, `fix-failing-tests`,
`sonarqube-fix` — none fit). Proposal:

**`.claude/skills/ci-shipfast/SKILL.md`** with three sub-commands:

1. **`pre-ship`** — runs the §8 17-step gate locally and writes
   `artifacts/preship/last-run.json`. Resumable via git SHA caching.
2. **`workflow-audit`** — re-parses any GitHub Actions usage CSV (the parser
   already exists at `tools/scripts/parse-actions-usage.mjs`, written during
   this audit) and emits a duplication map, cost-by-workflow, and recommendation
   list. Re-runnable monthly.
3. **`triage-failures [--limit 100]`** — pulls last N failed runs via
   `gh run list --status failure`, fetches their job logs, clusters by failure
   signature, posts a triage digest. Extends the pattern from
   `fix-failing-tests`.

Owner: repo maintainer. Run cadence (target):

- `pre-ship` — every push, intended to be wired into the pre-push hook
  (recommendation A in §10). **Not yet wired** — pre-push currently only blocks
  pushes to `main`. Tracking PR is on the audit follow-up backlog.
- `workflow-audit` — monthly.
- `triage-failures` — on-demand when CI is chronically red.

---

## 12. Artefacts produced by this audit

- This document.
- `tools/scripts/parse-actions-usage.mjs` — re-usable parser. Uses the repo's
  existing `csv-parse` dependency (devDep `^5.6.0`), strips the UTF-8 BOM
  GitHub's exporter writes, maps columns by header name (not position, so quoted
  commas in workflow paths can't corrupt rows), accepts common header-casing
  aliases (`SKU`/`Gross Amount`/`Actor`/etc.), fails fast (exit 3) if a required
  column is missing, and guards divide-by-zero so storage-only inputs don't
  print `NaN%`. Takes a usage CSV path as arg.
- `tools/scripts/__tests__/parse-actions-usage.test.ts` — 15-case Vitest
  regression suite. Each case maps to a specific issue caught during the
  red-team review of this audit: BOM stripping, quoted-comma preservation,
  uppercase/space header aliases, `MISSING_COLUMN` fail-fast, NaN coercion,
  storage-only input, empty input. Runs in ~30ms.

**Nothing else has been changed.** No workflow edits, no hook edits, no
dependabot.yml edits, no skill files created. Awaiting maintainer go-ahead per
item in §10.

---

## 13. Evidence appendix (in-repo reproducible)

This appendix lets a future audit verify the §5 failure-pattern claims from the
repo alone, without access to the original author's Claude Code memory.

### Evidence — the 2026-05-23 "five chronic failure shapes"

All five shapes are corroborated by merged commits on 2026-05-23. Run
`git log --oneline --since='2026-05-22' --until='2026-05-24' --grep='fix(ci)'`
to see the full sequence; the key landings:

| Shape (per §5)                                        | Verifiable evidence in this checkout                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 missing `v0.0.0` bootstrap tag                     | PR **#107** (`0876ba271` / merge `0876ba271`) — "release workflow handles missing v0.0.0 bootstrap tag", merged 2026-05-23 16:?? UTC                                                                                                                                                                                        |
| #2 unbuilt internal packages                          | Visible in `ci.yml` lines 62–63, 84–85, 195–196 — every job runs `pnpm turbo run build --filter=!@intelliflow/web --filter=!@intelliflow/api --filter=!@intelliflow/project-tracker --filter=!@intelliflow/workers` to ensure library `dist/` exists before typecheck/test/integration                                      |
| #3 missing env stubs                                  | PR **#109** (`f48a5bd31`) — "release workflow build mirrors env stubs from ci.yml". The mirrored block is `ci.yml` lines 269–278 (`PRISMA_FIELD_ENCRYPTION_KEY`, `AI_AUDIT_SIGNING_KEY`, stub `DATABASE_URL`, Supabase stubs) and is repeated verbatim in `pr-checks.yml` lines 180–199 and `system-audit.yml` lines 82–108 |
| #4 direct push to main from bot                       | PR **#111** (`c7d273519`) and `ead3b3ca0` — "release workflow no longer pushes to main directly"; also the live pre-push hook at `.husky/pre-push` lines 7–14 blocks `refs/heads/main` for any pusher                                                                                                                       |
| #5 SLSA predicate body shape                          | PR **#112** (`be5aba42b`) and PR **#113** (`6f8e3a267`) — "SLSA predicate v0.2 + governance metrics PR-flow", "SLSA predicate body shape + CD Vercel rate-limit tolerance"                                                                                                                                                  |
| Bonus: dead `amondnet/vercel-action@v25`              | `pr-checks.yml` line 245–248 comment explicitly documents the swap: "amondnet/vercel-action@v25 is unmaintained and ships Vercel CLI 25.1.0, which the deploy endpoint rejects"                                                                                                                                             |
| Bonus: Vercel `continue-on-error: true` for Hobby cap | `pr-checks.yml` line 261–266 comment explains the 5000-files-per-24h cap and the `--archive=tgz` workaround                                                                                                                                                                                                                 |
| Bonus: E2E chronic flakiness                          | `ci.yml` lines 358–364 — `continue-on-error: true` on the E2E job with a comment pointing to GH issue #95                                                                                                                                                                                                                   |

### Evidence — "fake green" failure mode (PG-126 lesson)

Reproducible from commit `36d9d276d` ("chore: normalise line endings in PG-126
attestation.json (CRLF)") and the follow-up `a0917310d` ("fix(db): enable RLS on
public_feedback table (PG-126 follow-up)"). The pattern: PG-126 shipped with
COMPLETE attestation while integration wiring had been silently reverted by an
external formatter; the follow-up commit had to re-apply work that was supposed
to be in the original task. This is also why CLAUDE.md mentions the "verify auth
cookies are written before reading them" rule (PG-180 audit, same failure
family).

### Evidence — PowerShell `Set-Content` CSV corruption pattern

The pre-commit hook at `.husky/pre-commit` lines 10–18 auto-regenerates the
Sprint Plan split files via `npx tsx tools/scripts/split-sprint-plan.ts`
specifically because hand-edits via PowerShell `Set-Content -Value` on
multi-line quoted CSV cells corrupt the file. The script approach is the
mitigation. See also `tools/scripts/split-sprint-plan.ts` for the canonical
generator.

### How to refresh this evidence appendix

Re-run the parser on the latest export:

```bash
node tools/scripts/parse-actions-usage.mjs <usage.csv>
```

Re-pull recent failed runs and cluster:

```bash
gh run list --status failure --limit 100 --json name,workflowName \
  | jq -r '.[] | .workflowName' | sort | uniq -c | sort -rn
```

Verify chronic-fix landings:

```bash
git log --oneline --since='2026-05-15' --until='2026-05-30' --grep='fix(ci)'
```

---

## 14. Operational integration — how this audit becomes living infrastructure

A static Markdown audit is stale the moment the next PR merges. To prevent that,
this audit ships **four durable artifacts** that plug into the repo's existing
governance/platform-health pattern. The audit doc itself remains the
human-readable narrative; the durable surfaces below are what dashboards, gates,
and recurrence checks read from.

### 14.1 What ships alongside this audit

| Artifact                                           | Role                                                                                                                                                                          | Refresh cadence                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `artifacts/reports/ci-cost/latest.json`            | Structured cost aggregation — totals, by-workflow, by-user, by-day. Conforms to `ci-cost-metrics.schema.ts`.                                                                  | Weekly via the `ci-cost-metrics` job in `.github/workflows/governance-metrics.yml` (wired in this audit); manual via `--emit-json` |
| `artifacts/reports/ci-cost/latest.provenance.json` | Freshness sidecar — source CSV SHA256, min/max date, generated_at, git HEAD, `is_stale` flag. Conforms to `ci-cost-metrics-provenance.schema.ts`.                             | Same as above                                                                                                                      |
| `artifacts/reports/ci-cost/history/<ISO8601>.json` | Immutable per-run snapshot. Builds the trend line a dashboard can render without log-replay.                                                                                  | Append-only on every refresh                                                                                                       |
| `artifacts/reports/ci-failures/registry.json`      | Structured failure-pattern registry. Conforms to `ci-failure-registry.schema.ts`. Each entry has a `verification_command` so a future regression is automatically detectable. | Hand-edited when a pattern recurs or a guard lands                                                                                 |

Zod schemas (single source of truth) live at:

- `tools/scripts/lib/schemas/ci-cost-metrics.schema.ts` — artifact + provenance
  shapes
- `tools/scripts/lib/schemas/ci-failure-registry.schema.ts` — registry shape

JSON-Schema mirrors (editor tooling + human docs) at
`apps/project-tracker/docs/metrics/schemas/`: `ci-cost-metrics.schema.json`,
`ci-cost-metrics-provenance.schema.json`, `ci-failure-registry.schema.json`.

### 14.2 Plug-in to platform-health (wired)

`apps/project-tracker/app/api/governance/platform-health/route.ts` reads
`artifacts/reports/ci-cost/latest.provenance.json` directly inside
`computeProvenanceChecks()`. When the sidecar is present, the route emits two
health checks:

- `metrics_staleness:ci_cost` — passes iff `is_stale === false`. The detail
  message includes either `stale_reason` or the freshness evidence (CSV max
  date + most recent observed run).
- `source_confidence:ci_cost` — passes iff `confidence !== 'low'`.

A failed `metrics_staleness:ci_cost` flips the aggregate `provenance_fresh` to
false, which in turn fails the maturity criterion of the same name
(`provenance_fresh`). When the sidecar does NOT exist (fresh clone, parser never
run) the route adds no check — absence is bootstrap, not regression.

Field mapping the route reads from the sidecar:

| Sidecar field                     | How the route uses it                               |
| --------------------------------- | --------------------------------------------------- |
| `is_stale`                        | Drives the pass/fail of `metrics_staleness:ci_cost` |
| `stale_reason`                    | Shown in the check's `detail` when stale            |
| `source_csv_max_date`             | Shown in the check's `detail` when fresh            |
| `latest_observed_workflow_run_at` | Appended to fresh `detail` for transparency         |
| `confidence`                      | Drives `source_confidence:ci_cost`                  |
| `collection_method`               | Shown in the `source_confidence:ci_cost` detail     |

### 14.3 Plug-in to governance-metrics workflow (wired)

`.github/workflows/governance-metrics.yml` now has a `ci-cost-metrics` job
(added by this audit) that runs alongside the existing four metrics jobs,
weekly + on push to main + manual. It does three things:

1. **Conditional re-aggregate** — when `artifacts/inputs/actions-usage.csv` is
   committed, runs
   `node tools/scripts/parse-actions-usage.mjs <csv> --emit-json=artifacts/reports/ci-cost --staleness-days=30 --gh-freshness=${{ github.repository }}`
   to write a fresh `latest.json` + `latest.provenance.json`.
2. **Unconditional freshness refresh** — always runs
   `node tools/scripts/refresh-ci-cost-freshness.mjs ${{ github.repository }}`
   so `latest_observed_workflow_run_at` + `is_stale` + `stale_reason` track
   gh-API reality even when no new CSV has been exported.
3. **Verify failure-pattern guards** — runs the verifier; exits non-zero on
   REGRESSION verdicts only (TODO/PROMOTE log but don't fail).

Artifacts are uploaded via `actions/upload-artifact@v7` and committed back via
the existing `commit-artifacts` PR flow.

**Open follow-up** (out of scope for this audit): replace the manual CSV with an
auto-fetch step using `gh api /repos/{owner}/{repo}/actions/runs?per_page=100`
(paginated) + `/runs/{run_id}/timing` to assemble the CSV inline. The artifact
schema already accepts `collection_method: 'gh_actions_api'`.

Until that job lands, the parser is invoked manually after each usage-CSV
export. The provenance sidecar's `is_stale` flag protects downstream consumers
from acting on outdated numbers — if `is_stale: true`, the platform-health check
fails and dashboards show the cost panel as `pending`.

### 14.4 The failure-pattern registry replaces prose with enforced knowledge

The five chronic-failure shapes documented in §5 (plus the "fake green" mode)
are now structured entries in `artifacts/reports/ci-failures/registry.json`.
Each entry carries:

- `first_seen` / `last_seen` / `occurrences` — frequency tracking so a
  recurrence is visible.
- `affected_workflows` — which file(s) it surfaces in.
- `owner` — accountability.
- `guard_added` + `guard_prs` + `guard_pattern` — the fix-shape and the PRs that
  landed it.
- `verification_command` — a shell snippet that exits zero if the guard still
  holds. Run all of them as a single nightly check and any regression surfaces
  as an explicit failure rather than a Markdown footnote.

Verify all guards locally:

```bash
jq -r '.patterns[] | "echo === \(.id) ===; \(.verification_command)"' \
  artifacts/reports/ci-failures/registry.json | bash
```

Runbook for adding/updating entries:
[`docs/operations/runbooks/ci-cost-monitoring.md`](./runbooks/ci-cost-monitoring.md).

### 14.5 Tests that prevent these surfaces from drifting

`tools/scripts/__tests__/parse-actions-usage.test.ts` (21 cases) covers the
parser's own regressions (BOM, quoted commas, header aliases, NaN guard,
stale-flag math, artifact hash stability).

`tools/scripts/__tests__/ci-cost-artifacts-schema.test.ts` (7 cases) covers
schema drift in three places:

- emitter output validates against `ciCostMetricsSchema`;
- writeArtifact round-trip stays valid after disk write;
- the hand-curated `registry.json` validates against `ciFailureRegistrySchema`
  AND every pattern has a non-empty `verification_command` (the load-bearing
  field).

Both suites run in ~70ms — cheap enough to run on every PR.

### 14.6 What this audit closed, and what it still does NOT close

**Wired in this audit:**

- `.github/workflows/governance-metrics.yml` has a `ci-cost-metrics` job that
  runs weekly + manual + on push to main. It conditionally re-aggregates from a
  committed CSV, then unconditionally refreshes freshness via gh API, then
  verifies the failure-pattern registry — exits non-zero on REGRESSION verdicts
  only.
- `apps/project-tracker/app/api/governance/platform-health/route.ts` reads
  `artifacts/reports/ci-cost/latest.provenance.json` and emits
  `metrics_staleness:ci_cost` + `source_confidence:ci_cost` checks that fold
  into the existing `provenance_fresh` aggregate.
- `tools/scripts/refresh-ci-cost-freshness.mjs` calls
  `gh api /repos/.../actions/runs?per_page=1` and flips `is_stale` whenever CI
  has run more than 24h after the source CSV's max date — catching the "after
  the next commit/PR" case the date-only check missed.
- All three new Zod schemas registered in `tools/scripts/generate-schemas.ts` +
  `validate-schemas.ts` + the schema index, with a drift test that fails CI if
  the JSON mirror diverges from the Zod source.

**Open follow-ups:**

- **Auto-fetch of usage data via gh API** (so no manual CSV export is needed).
  The artifact schema already accepts `collection_method: 'gh_actions_api'`; the
  workflow just needs the paginated `actions/runs` + per-run `/timing` fetch +
  CSV assembly step.
- **Dashboard panel** for cost trend / by-workflow heatmap — the data is
  structured (history snapshots, schema-validated) so this is UI work only.
- **Nightly verification-command runner** as a separate workflow that posts a
  GitHub issue on REGRESSION. Today the verifier runs as part of
  `governance-metrics.yml`'s `ci-cost-metrics` job.
- **`fake-green-attestation` recurrence guard** is honestly tracked as
  `guard_added: false` in the registry. The natural home for the rule
  (`.claude/skills/exec/SKILL.md`) is gitignored (per-developer Claude tooling,
  not repo-shared), so the guard text needs to land in a committed location
  instead — `docs/operations/exec-attestation-policy.md` is the proposed path;
  the registry's `verification_command` already greps that file. Until the
  policy doc lands and exec is wired to consume it, the verifier reports this as
  a TODO that doesn't fail the build.

Each follow-up is mechanical given the foundations now in place.
