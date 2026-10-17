# PG-198 — owner rulings (given 2026-10-13, relayed by the runner)

These settle the two June open questions. Do not re-ask them.

## R1 — API location

EXTEND the existing `apps/api/src/modules/agent/`. Add `approval-policies.router.ts`
(and its tests) inside `modules/agent/`, mounted in `apps/api/src/router.ts` beside
`agentRouter`. Do NOT create `modules/agent-approval/`.

The task row's ARTIFACT path `apps/api/src/modules/agent-approval/approval-policies.router.ts`
is superseded: update that ARTIFACT entry in `Sprint_plan.csv` to
`apps/api/src/modules/agent/approval-policies.router.ts` (CSV only, then
`split-sprint-plan.ts`). PG-199 (`model-config.router.ts`) will follow in the same
folder, so shared pieces must stay reusable.

## R2 — Never-downgrade

Applies to PG-199 (model config), not PG-198: allow-listed models may be picked;
picking an older/smaller/cheaper model than the current one needs a confirm dialog
plus an audit-log entry naming the actor. Nothing to build for it in PG-198.

## R3 (2026-10-13): open questions Q1-Q4
Q1 B both queues; Q2 B enforce all four; Q3 A minimum role; Q4 B colour token per policy + CHECK (TagsTab N/A).
Full text: PG-198-open-question.md, "## Answer".
