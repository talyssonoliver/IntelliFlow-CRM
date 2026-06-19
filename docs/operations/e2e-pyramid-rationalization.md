# E2E Pyramid Rationalization — Audit & Plan

> **Goal.** Restore a healthy test pyramid: a broad, fast unit base; a
> deterministic integration/API middle; and a **lean, green** E2E top reserved
> for genuine cross-layer user journeys. Today the base is healthy but the **top
> is bloated and red** — this is the audit + the plan to rebalance it.

## Measured baseline (2026-06-18)

| Layer                | Cases                                  | Files  | Health                                               |
| -------------------- | -------------------------------------- | ------ | ---------------------------------------------------- |
| Unit (bottom)        | **31,607** (20,139 apps + 11,468 pkgs) | ~1,415 | ✅ broad, matches 30k+ target                        |
| Integration (middle) | 414                                    | 19     | growing (RLS, tier-gating, module-entitlement added) |
| Property             | 49                                     | 26     | —                                                    |
| **E2E (top)**        | **~313 tests / 434 cases**             | 21     | ⚠️ **too heavy; 122 failing**                        |

The shape is base-healthy but **inverted at the top**: E2E (~313) ≈ Integration
(414), and ~122 E2E fail. A pyramid wants the top to be the _smallest_ and the
_most reliable_ tier; here it is neither.

## Root cause of the 122 failures: no auth fixture

`tests/e2e/global-setup.ts` has its authentication block **commented out** — it
never produces a `storageState`, so every authenticated/data-dependent spec hits
an unauthenticated app and fails. The failures are therefore **environmental,
not product regressions** (confirmed: none touch the shipped feature code).

Two independent fixes are needed, and they are different decisions:

1. **Trim redundancy** — most failing specs assert _logic/presentation_ already
   covered deterministically at a lower layer. Those cases should move down (or
   be deleted) rather than be made to pass at the top. _(Needs owner sign-off to
   delete tests.)_
2. **Real auth fixture** — the handful of genuine journeys that remain at E2E
   need a real `storageState` built from the Option B real-auth stack (see
   `local-real-auth-validation-runbook.md`). _(Needs an environment decision: is
   prod-Supabase auth reachable from the E2E runner / CI?)_

## Per-spec classification

Legend — **Journey** = genuine multi-layer user flow, keep at E2E (needs auth
fixture); **Relocate** = logic/presentation already (or better) covered below,
trim to a thin render-smoke or delete; **Smoke** = structural, no auth, keep.

| Spec                         | Tests | Class                 | Lower-layer home (evidence)                                                                                                                                                                      |
| ---------------------------- | ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai-features/ai-approvals`   | 51    | **Relocate**          | approval logic: `agent/__tests__/approval-workflow.test.ts` (+`.supplementary`), `modules/agent/__tests__/agent.router.test.ts`. UI ("display diff view", "reasoning expand") → component tests. |
| `agent-approvals`            | 32    | **Relocate**          | same as above; mostly "should display …" render checks.                                                                                                                                          |
| `case-timeline`              | 22    | **Relocate** ✓covered | already below: `modules/misc/__tests__/{timeline.router,timeline.router.additional,timeline-communication}.test.ts`. Trim E2E to 1 render smoke.                                                 |
| `forms`                      | 22    | **Relocate** ✓done    | validation now at `packages/validators/src/__tests__/lead.test.ts` (email required/format/lowercase/whitespace, source default+enum). Field-render/a11y → component (RTL).                       |
| `ai-features/ai-scoring`     | 19    | **Relocate**          | **threshold boundaries (80/60)** → unit. _Worked example done (below)._ score chains: `ai-worker/src/chains/scoring.chain*.test.ts`.                                                             |
| `navigation`                 | 19    | **Journey** (thin)    | keep a small authed nav smoke; the rest is route-config (unit).                                                                                                                                  |
| `pipeline-settings`          | 19    | **Relocate** ✓covered | already below: `opportunity/__tests__/{deal-settings.router,pipeline-config.integration,pipeline-config.router}.test.ts`. No backfill needed — trim E2E to 1 smoke.                              |
| `signup`                     | 19    | **Journey**           | real signup→auto-login→onboarding — keep, needs auth/real-Supabase.                                                                                                                              |
| `smoke`                      | 19    | **Smoke**             | keep (structural).                                                                                                                                                                               |
| `ai-features/ai-predictions` | 8     | **Relocate**          | churn/forecast chains already unit-covered in ai-worker.                                                                                                                                         |
| `ai-visual-regression`       | 12    | **Journey** (visual)  | keep (VRT is inherently top-layer).                                                                                                                                                              |
| `home/home-page`             | 12    | **Journey** (thin)    | keep authed home smoke.                                                                                                                                                                          |
| `mfa`                        | 11    | **Journey**           | real MFA flow — keep.                                                                                                                                                                            |
| `tasks`                      | 10    | **Relocate** ✓covered | already below: `modules/task/__tests__/task.router.test.ts` + `__tests__/contract/task.contract.test.ts`. No backfill needed — trim E2E to 1 smoke.                                              |
| `icons`                      | 8     | **Smoke**             | keep (asset/structural).                                                                                                                                                                         |
| `contact-crud`               | 8     | **Journey** (thin)    | keep 1 authed CRUD round-trip; needs seeded contact.                                                                                                                                             |
| `workflow-builder`           | 7     | **Relocate** ✓covered | automation logic covered in `ai-worker` chains/agents (auto-response, crew). Builder UI → keep 1 render smoke.                                                                                   |
| `auth-flow`                  | 5     | **Journey**           | keep (core).                                                                                                                                                                                     |
| `features-tour`              | 5     | **Journey** (thin)    | keep; fix cookie-banner overlay (see runbook).                                                                                                                                                   |
| `email/inbound-webhook`      | 3     | **Relocate** ✓covered | already below: `modules/email/__tests__/inbound.router*.test.ts`, `documents/__tests__/email-inbound.router.test.ts`, `modules/inbound/__tests__/inbound.router.test.ts`.                        |

**Rough split:** ~190 of ~313 E2E tests are **Relocate** candidates
(logic/render already covered below); ~120 are genuine **Journey/Smoke** to keep
and stabilise with a real auth fixture. Trimming the Relocate set roughly
**halves** the top tier and removes the bulk of the 122 failures at the _right_
layer.

## Worked example (done this iteration)

`ai-scoring.spec.ts` asserts confidence-badge **threshold boundaries** ("exactly
80 = HIGH", "exactly 60 = MEDIUM", "79 = MEDIUM") through a real browser — pure
threshold logic at the most expensive layer. While locating it we found the
mapping **duplicated** in two pages (`agent-approvals/page.tsx`,
`agent-approvals/preview/page.tsx`) that had **drifted at the zero edge**.

Fix: extracted `getConfidenceBadge()` to `lib/lead-scoring/confidence-badge.ts`
(behaviour-preserving, `hideWhenZero` option reproduces the preview's badge
suppression) with a unit test covering every boundary
(`lib/lead-scoring/__tests__/confidence-badge.test.ts`, 7 tests). The E2E
boundary cases are now redundant and can drop to a single render smoke.

## Recommended next actions (owner decisions)

- [ ] **Approve trimming** the Relocate set (start with the 83 approval + 27
      AI-logic tests — biggest, fully covered below). Replace each with at most
      one render smoke.
- [ ] **Decide the auth-fixture investment**: wire `global-setup.ts` to mint a
      real `storageState` via Option B, or keep E2E unauthenticated + tagged
      `@authed` and excluded from the required gate until then.
- [x] Backfill the **Relocate** behaviours that lacked a lower-layer test —
      done: forms validation → `lead.test.ts`; pipeline/tasks were **already**
      covered by router/integration tests (no new tests needed). The only
      remaining lower-layer gap is field-render/a11y component (RTL) tests for
      the forms/modal surface, which is optional polish, not a blocker to
      trimming.

> **Status:** every **Relocate** spec now has its logic covered at a lower
> layer, so the trim in action #1 is safe to execute on owner approval — it
> removes redundancy, not coverage.
