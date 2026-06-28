# Sprint 18 — PG-058 (Dashboard) Session Issues Log

> Candid, severity-ordered record of every issue, mistake, workaround, protocol
> mismatch, and gate failure encountered while shipping PG-058. Committed with
> the feature PR. Severity legend: **S1** blocks ship · **S2** costs real time ·
> **S3** minor friction / cosmetic.

## Task

- **ID:** PG-058 — Dashboard (Lane J)
- **Persona/lens:** frontend-lead · **STOA:** /stoa-domain · **Skill:**
  /frontend-design
- **Deps:** IFC-089, IFC-091, IFC-095 (all completed)
- **Artifacts:** `apps/web/src/app/dashboard/page.tsx`,
  `apps/web/src/lib/dashboard/kpi-calculator.ts`,
  `.specify/sprints/sprint-18/attestations/PG-058/context_ack.json`
- **Acceptance:** Response <200ms, Lighthouse ≥90, real-time data
- **Gate:** lighthouse-gte-90

## Timeline (real timestamps)

| Milestone             | Timestamp (BST)     |
| --------------------- | ------------------- |
| Session start         | 2026-06-28 12:56:47 |
| Worktree provisioned  | 2026-06-28 12:58:26 |
| Spec done             | 2026-06-28 13:18:37 |
| Plan done             | 2026-06-28 13:33:31 |
| Exec/attestation done | _pending_           |
| PR opened             | _pending_           |
| PR merged             | _pending_           |

## Issues

### S1 (resolved) — Lighthouse gate: unauthenticated `/dashboard` measurement was a misleading 74

- **What happened:** A base-recipe (unauthenticated) Lighthouse run of
  `/dashboard` scored perf **74** (LCP 6.5s) — below the ≥90 gate. Root cause:
  `/dashboard` is auth-gated client-side, so an unauthenticated headless run
  renders the shell then the client redirects to the login/home page; the LCP
  element was the **login hero `<p>`**, and 93% of LCP was the redirect's render
  delay. The 74 measured the redirect, not the dashboard.
- **Why it matters:** Nearly shipped with the perf KPI mis-recorded (I initially
  proposed waiving it out-of-scope — the owner correctly rejected that). The
  real gate status was unknown until a representative measurement was taken.
- **Fix/prevention:** Owner-authorized a read-only authenticated measurement.
  The harness's designated test user (`admin@intelliflow.dev`) did not exist in
  prod Supabase (`invalid_credentials`); owner authorized creating it via the
  service-role admin API. Rebuilt web with `NEXT_PUBLIC_API_URL` = live Railway
  baked in (NEXT*PUBLIC* are build-time), served on port **3500** (port 3000 had
  an unrelated project's stale server — NOT touched), ran the PG-166
  Supabase-auth Puppeteer harness. **Authenticated result: perf 97 / a11y 90 /
  LCP 1.2s / TTI 1.2s / TBT 0ms — gate PASSES.** Deleted the test user afterward
  (login now 400, prod restored). Evidence + full writeup:
  `artifacts/lighthouse/PG-058/SUMMARY.md`. **Lesson for the harness:** for
  client-side-auth-gated routes the base recipe is not representative; the
  authenticated harness is required, and it needs the test user provisioned +
  `NEXT_PUBLIC_API_URL` baked at build time. Consider permanently provisioning
  the lighthouse test user so future authenticated runs don't hit
  `invalid_credentials`.

### S3 (tracked, not fixed) — pre-existing `color-contrast` a11y failure on /dashboard

- The authenticated a11y score is held at exactly 90 by a `color-contrast`
  failure (muted text on muted backgrounds). This is an app-wide brand
  design-token issue, not introduced by PG-058 and out of its scope. Tracked for
  a design-system follow-up.

### S3 — Orchestrator prompt referenced a non-existent `iflow-fleet` main dir

- **What happened:** The dispatch prompt named
  `C:\Users\talys\projects\iflow-fleet` as the main repo and worktree parent.
  That path does not exist; the real repo is
  `C:\Users\talys\projects\intelliFlow-CRM`.
- **Why it matters:** A literal-minded agent would fail `git worktree add` and
  stall on provisioning.
- **Fix/prevention:** Provisioned from the real repo (`intelliFlow-CRM`) into
  `../iflow-pg-058`. Dispatch templates should derive the main-repo path from
  the actual checkout, not a hard-coded fleet alias.

### S3 — main is ahead of the prompt's stated green SHA

- **What happened:** Prompt said "main is green at a6026d7c8"; `origin/main` is
  actually at `bb7acac1e` (#536, newer).
- **Why it matters:** Basing the worktree on the stale SHA would start me
  behind.
- **Fix/prevention:** Branched from `origin/main` (bb7acac1e), the live tip.

### S2 — PG-058's required artifact already partly shipped by PG-129 (scope ambiguity)

- **What happened:** `apps/web/src/app/dashboard/page.tsx` (a PG-058 required
  artifact) already exists, built by PG-129. Only `kpi-calculator.ts` is
  missing. The CSV row reads as if PG-058 builds the dashboard from scratch.
- **Why it matters:** Without exploration first, an agent could rebuild the page
  (massive duplicate effort) or, worse, trip gotcha #9 (new-page doc-cochange
  cascade) for a page that already exists and is already counted.
- **Fix/prevention:** spec-session Phase 0.75 exploration caught it. PG-058 is
  scoped as KPI-calculator extraction + real-time polling + a11y gate fixes — a
  minimal-change enhancement, not a rebuild. No new `page.tsx` → no page-count
  cascade.

### S3 (tracked, not fixed) — three pre-existing server-side domain bugs found by domain-expert

These pre-date PG-058 and are out of its minimal-change scope. To be filed
during exec as gh issue + `artifacts/metrics/debt-ledger.yaml` + this doc (RED
FLAGS protocol):

1. `apps/api/src/modules/opportunity/opportunity.router.ts:554` —
   `buildWinRateTrend` hardcodes month labels
   `['May','Jun','Jul','Aug','Sep','Oct']`; wrong from Aug 2026. Fix: derive
   labels from real `closedAt` dates.
2. `apps/api/src/modules/opportunity/opportunity.router.ts:1290-1291` —
   `getPipeline.totalPipelineValue` includes CLOSED_WON/CLOSED_LOST even when
   `includeClosedStages:false`. **Client side now FIXED in this task:**
   `PipelineSummaryWidget` computes the denominator from the displayed (open)
   stages instead of the API total, so open-stage percentages are no longer
   understated (flagged independently by the domain-expert AND codex-review).
   The underlying SERVER total is still mis-scoped and remains a tracked
   server-side finding for a follow-up.
3. `packages/application/src/services/AnalyticsAggregationService.ts:194` —
   `result.at(-12)` on a 12-element array is 11 months back; YoY off by one.

### S3 — draft plan pointed a11y tests at a non-existent path outside vitest's include

- **What happened:** The draft plan placed the new axe tests at
  `apps/web/tests/a11y/axe-core.spec.ts`. That directory does not exist, and
  vitest's `include` is `src/**/*` — so the CSV gate command
  (`pnpm --filter @intelliflow/web test --run`) would have **silently skipped**
  the a11y tests. Caught independently by the lead and by the plan-reviewer
  subagent (Issue #1/#5).
- **Why it matters:** "Fake green" — a11y tests that never run would let the
  WCAG/Lighthouse regressions through.
- **Fix/prevention:** Colocated the axe test at
  `apps/web/src/app/dashboard/__tests__/dashboard-a11y.test.tsx` (inside
  `src/`), following the PG-166 precedent. The plan-reviewer gate did its job —
  it also caught a missing dependency-chain step and Files-Summary miscounts.
  This is the exact value of the mandatory subagent review (vs self-review).

## Net assessment

_To be completed at session end._
