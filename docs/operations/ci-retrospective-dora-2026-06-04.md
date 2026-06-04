# CI/CD Retrospective + DORA — learning from the #247 cycle

**Date:** 2026-06-04 · **Scope:** the PR #247 sharding rollout and the deploy
pipeline around it · **Refs:** ADR-057…062, `ci-audit-report-2026-06-03.md`,
`ci-gains-dora-2026-06-03.md`

This is the "learn from the faults" pass the owner asked for after #247 merged.
It quantifies where we are (DORA), names the structural root cause behind the
web 500s + wasted resources, and maps each lesson to a concrete fix shipped in
the `ci/efficiency-hardening` PR.

## 1. DORA scorecard (last ~30 PRs / 9 days)

| Metric                | Value                                      | Tier         | The catch                                            |
| --------------------- | ------------------------------------------ | ------------ | ---------------------------------------------------- |
| Deployment Frequency  | ~2.9 prod deploys/day                      | **Elite**    | inflated by hotfix-PRs-as-deploys                    |
| Lead Time for Changes | p50 **90 min** · p75 5.3 h · p90 9.9 h     | Elite→Medium | long tail = infra PRs needing many CI rounds         |
| Change Failure Rate   | CI-metric **4.8 %** · real-world **~17 %** | High→Medium  | **deploys ran before CI green**                      |
| MTTR                  | median **2.7 h** · worst 9.2 h             | High→Medium  | recovery only via new-PR + CI-wait; no fast rollback |

**Overall: High, held back entirely by deploy-before-green.**

## 2. Root cause — deploys ran _beside_ CI, not _after_ it

The single structural defect behind the 500s, the red previews, and the wasted
minutes:

- `cd.yml` triggered on `push: [main]`, `deploy-staging needs: [prepare]` only —
  **zero dependency on `CI Pipeline`** (verified: `workflow_run` refs in cd.yml
  = 0). A broken main build reached staging/prod ~15 min before CI went red.
- **Vercel's Git integration auto-builds a preview on every branch push**,
  independent of GitHub Actions. Confirmed live: previews for `ci-sharded-r…`,
  `dependabot…`, `chore-commit…`, `feat-openrou…` branches, one of them in
  `ERROR` state. Every push = a full Next.js build on un-green code.
- A second pre-green preview path lived in `pr-checks.yml` (`deploy-preview` on
  `pull_request`, gated on `DEPLOY_ELIGIBLE`, not on CI).

→ Fixed by **ADR-062**: CD gated on `workflow_run: CI Pipeline success`; Vercel
preview auto-build suppressed (`scripts/vercel-ignore-build.sh`); previews
deploy after green (`deploy-preview.yml`); `pr-checks` deploy-preview reduced to
a required-status shim.

## 3. Web 500 — diagnosis (already resolved)

Investigated live via the Vercel MCP. Findings:

- **Production is healthy.** `intelli-flow-crm-web.vercel.app` `/`,
  `/api/health`, `/login`, `/dashboard` all return **200**. Zero error/fatal
  runtime logs in the last 7 days. The current production deployment is
  `a9fb6865b` (#251 — _"web tier must not eagerly construct worker-only services
  (Vercel 500s)"_), state `READY`. **#251 was the 500 fix; it is live.**
- The `…-git-main-…vercel.app` alias returns **401** — that is Vercel Deployment
  Protection (an SSO/auth wall), **not** an application 500.
- **All 61 production runtime env vars are present**
  (PRISMA*FIELD_ENCRYPTION_KEY, AI_AUDIT_SIGNING_KEY, every
  SUPABASE*_/NEXT*PUBLIC_SUPABASE*_, DATABASE_URL). So the historical
  module-load-guard 500s (REDIS_HOST eager throw, supabase-js Node 22, LiteLLM
  provider gate, OTel instrumentation throw) are all closed and **the 500 was
  never a missing-token problem.**

Residual risk (latent, not active): a future env var with a
`throw`-at-module-load guard, if added to code but not to Vercel prod env, would
500 every route. The **fail-first token gate** now guards the known set.

## 4. Misconfiguration found: wrong Vercel project id

`VERCEL_PROJECT_ID` in `.env.local` and `secrets.VERCEL_PROJECT_ID` =
`prj_Atygl…` = **"ecommerce-bags"** — an unrelated project. The correct CRM
project (`prj_AQ1IS…` = "intelli-flow-crm-web") is what `.vercel/project.json`
and `vars.VERCEL_PROJECT_ID` use. `cd.yml` read the wrong **secret**; previews
come from Vercel Git integration on the right project, so the impact was a
latent wrong-target for the cd.yml CLI deploy. → `cd.yml` switched to
`vars.VERCEL_PROJECT_ID`; `.env.local` corrected; an issue tracks rotating the
stale secret.

## 5. CI resource waste (measured / estimated)

| Source                                              | Cost                      | Fix                                                                                          |
| --------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| #247: 8 force-push rounds × ~280 runner-min         | **~2,200+ runner-min**    | failures only catchable in CI → pre-ship now mirrors CI (token gate + shared coverage floor) |
| #248: full _old_ CI for a 1-line waiver             | ~130 runner-min           | CLAUDE.md rule: co-dependent changes ride the feature branch                                 |
| Vercel preview build on every push (incl. un-green) | N builds/day              | `vercel-ignore-build.sh` suppresses pre-green previews                                       |
| Doc-only pushes to main running the full suite      | ~115 runner-min each      | `ci.yml` `paths-ignore` on the push trigger                                                  |
| `sonar.yml` double-run                              | (already removed in #247) | —                                                                                            |

## 6. Top lessons

1. **A gate that doesn't propagate its exit code isn't a gate.** Coverage 90 %
   and Sonar A were green-theater for months (#247 made them real). Corollary:
   audit every "gate" for whether it can actually fail the build.
2. **Config valid as YAML can still be wrong at runtime.** Sonar host/token,
   auto-analysis, and the wrong Vercel project id were only catchable live. The
   fail-first token gate moves the cheapest of these checks to the laptop.
3. **Deploy after the gate, never beside it.** (ADR-062.)
4. **Co-dependent changes belong on the same branch.** A waiver/stub that exists
   only to make the feature's CI pass must not be its own PR (doubles CI, splits
   review). New CLAUDE.md rule.
5. **`git reset --soft` mid-debug silently leaves edits unstaged** — use new
   commits + squash, and `git add -A` before `git commit -C`.

## 7. Fixes shipped (this PR — `ci/efficiency-hardening`)

| #   | Change                                                                       | Addresses                                 |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| P0  | `cd.yml` → `workflow_run: CI Pipeline success` gate + validated-SHA checkout | deploy-before-green / CFR                 |
| P0  | `scripts/vercel-ignore-build.sh` + `vercel.json` ignoreCommand               | pre-green preview builds / waste          |
| P0  | `deploy-preview.yml` (preview after green) + `pr-checks` shim                | previews after green, required check kept |
| P0  | `cd.yml` `vars.VERCEL_PROJECT_ID` + `.env.local` fix                         | wrong-project deploy                      |
| #1  | `scripts/check-required-tokens.mjs` as pre-ship step 0                       | fail-first on missing tokens              |
| P1  | `scripts/check-coverage-floor.mjs` shared by CI + pre-ship                   | local predicts CI                         |
| P1  | `ci.yml` `paths-ignore` (push trigger)                                       | doc-only push waste                       |
| P1  | CLAUDE.md co-dependent-changes rule                                          | split-PR CI waste                         |
| P2  | `cd.yml` production smoke blocking + retry                                   | a 500 deploy fails the pipeline           |

## 8. Residuals / follow-ups (tracked as issues)

- PR-side `paths-ignore` (doc-only PRs skipping the heavy suite) needs the
  changed-files-guard pattern to avoid the skipped-required-check footgun
  (ADR-060). Deferred — filed as an issue.
- Rotate the stale `secrets.VERCEL_PROJECT_ID` (ecommerce-bags) — filed.
- `SONAR_TOKEN` was pasted in chat during setup — rotate.
- Add a one-click rollback path (Vercel `isRollbackCandidate` promotion) to cut
  MTTR — filed.
