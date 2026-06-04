# ADR-062: Deploys Gated on CI Green (CD + Vercel previews)

**Status:** Accepted

**Date:** 2026-06-04

**Deciders:** CI/CD Reliability, Platform (owner)

**Technical Story:** Post-#247 DORA retrospective
(`docs/operations/ci-retrospective-dora-2026-06-04.md`)

## Context and Problem Statement

After the 20-shard CI rewrite landed (PR #247, ADR-057…061), a structural gap
remained: **deployments ran in parallel with CI, not after it.**

- `cd.yml` (CD Pipeline) triggered on `push: [main]` with `deploy-staging`
  depending only on a `prepare` job — **no dependency on `CI Pipeline`**. A
  broken main build reached staging/prod ~15 min before its own CI went red.
- Vercel's Git integration **auto-builds a preview on every branch push**,
  independent of GitHub Actions. Previews deployed before — and regardless of —
  CI. At least one PR #247 preview landed in `ERROR` state; every push burned
  Vercel build minutes on un-green commits.
- A second pre-green preview path existed in `pr-checks.yml` (`deploy-preview`
  ran on `pull_request`, gated only on `DEPLOY_ELIGIBLE`, not on CI).
- `cd.yml` read `secrets.VERCEL_PROJECT_ID`, which pointed at an **unrelated
  Vercel project** (`ecommerce-bags`); the correct CRM project id lived in
  `vars.VERCEL_PROJECT_ID`.

Symptoms the owner reported: "running preview on Vercel before all checks are
completed green", intermittent web 500s, red CI, and inefficient resource use.
Measured DORA: deploy frequency Elite, but a ~17 % real-world change-failure
rate driven entirely by deploy-before-green (the CI-metric CFR was 4.8 %).

## Decision Drivers

- A deploy must never run **beside** its gate; it must run **after** green.
- The fix should be **in-repo and reversible**, not hidden dashboard state.
- Required status checks must keep reporting (no "skipped required check blocks
  merge" footgun — see ADR-060).
- Don't make deploys depend on a single fragile path; degrade gracefully.

## Decision

**1. CD gated on CI (`cd.yml`).** Trigger changed from `push: [main]` to
`workflow_run: { workflows: [CI Pipeline], types: [completed], branches: [main] }`
(plus `workflow_dispatch`). The `prepare` job asserts
`github.event.workflow_run.conclusion == 'success'` (manual dispatch always
proceeds). Deploy jobs check out `github.event.workflow_run.head_sha` — the
exact commit CI validated, not main's current tip.

**2. Vercel preview auto-build suppressed (`scripts/vercel-ignore-build.sh`).**
`vercel.json` `ignoreCommand` now runs a script: production (main, post-merge =
already green via branch protection) builds; doc-only change sets skip; **all
preview auto-builds are skipped**. Vercel spends 0 build minutes on un-green
previews.

**3. Previews deploy after green (`.github/workflows/deploy-preview.yml`).** A
new workflow triggered by `workflow_run` on `CI Pipeline` success deploys the PR
preview via the Vercel CLI (for the validated SHA) and comments the URL. The old
`pr-checks.yml` `deploy-preview` job is reduced to a **required-status shim**
that reports `success` without deploying (keeps `PR Checks / Deploy Preview`
green; lighthouse/pr-summary degrade cleanly).

**4. Correct project id.** `cd.yml` now reads `vars.VERCEL_PROJECT_ID` /
`vars.VERCEL_ORG_ID` (the CRM project) instead of the stale secret.

**5. Production smoke is blocking.** `cd.yml`'s production `Run smoke tests`
step now retries `/api/health` and **fails the job** on non-200 (was
`continue-on-error`). Target overridable via `vars.PRODUCTION_SMOKE_URL`.

## Consequences

**Positive:** broken builds can no longer reach staging/prod or previews;
projected CFR drops toward the 4.8 % CI metric; Vercel build minutes on un-green
previews eliminated; deploys are traceable to a green SHA; a 500 deploy fails
the pipeline instead of reporting success.

**Negative / trade-offs:**

- `workflow_run`-triggered workflows only activate from the file on the
  **default branch**, so `deploy-preview.yml` and the `cd.yml` gate take effect
  for runs **after** this PR merges (validated post-merge on main).
- Previews now appear a few minutes later (after CI), not instantly on push.
- Deploys depend on the Actions path; if `VERCEL_TOKEN` is unset the CLI steps
  skip (Vercel Git still handles production on main). The fail-first token gate
  (`scripts/check-required-tokens.mjs`, pre-ship step 0) guards against this.

**Reversal:** delete `scripts/vercel-ignore-build.sh` + restore the inline
`git diff` ignoreCommand; revert `cd.yml` trigger to `push: [main]`; delete
`deploy-preview.yml` and restore the `pr-checks.yml` deploy steps.
