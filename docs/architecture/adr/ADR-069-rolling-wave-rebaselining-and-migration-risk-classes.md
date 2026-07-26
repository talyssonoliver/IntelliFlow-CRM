# ADR-069: Rolling-Wave Rebaselining and Migration Risk Classes

**Status:** Accepted

**Date:** 2026-07-26

**Deciders:** Product Owner (authorization 2026-07-26), Architecture Team,
DevOps Lead

**Technical Story:** Governance — agent autonomy scoping. Operational detail:
[`docs/operations/agent-autonomy-policy.md`](../../operations/agent-autonomy-policy.md).

## Context and Problem Statement

The IntelliFlow CRM roadmap is a **living plan**: `Sprint_plan.csv` is edited
continuously as prerequisites are discovered mid-flight, estimates move, and
tasks split. In parallel, database changes were governed by a single blanket
rule — "all production migrations are manual/human-only" — carried only as an
agent loop-memory lesson (**L13**), never written into the repository.

Both blanket positions created **autonomy gaps**: safe, additive, reversible
migrations (a new nullable column, a `CREATE INDEX CONCURRENTLY`) were treated
with the same human-gate friction as a destructive `DROP`; and it was ambiguous
which CSV edits were routine adaptation versus which materially altered an
approved product outcome. How should agents decide, faithfully and safely, what
they may do autonomously versus what must escalate?

## Decision Drivers

- Preserve the hard safety floor — nothing weakens tenant isolation, deletes
  production data, or commits external spend without a human.
- Remove friction from genuinely safe, additive, reversible work.
- Make the rule **durable and reviewable in the repo**, not carried as ephemeral
  agent memory (L13).
- Keep the classification conservative at the boundary ("when in doubt,
  escalate").
- Prefer **existing** machine enforcement over new, fragile CI checks.

## Considered Options

- **Option 1**: Rolling-wave CSV categories (A/B/C) + DB migration risk classes
  (A/B/C), replacing both blanket rules.
- **Option 2**: Keep "all migrations manual" and "all roadmap edits need product
  sign-off" (status quo).
- **Option 3**: Fully autonomous migrations and roadmap edits with post-hoc
  audit only.

## Decision Outcome

Chosen option: **"Option 1 — rolling-wave categories + migration risk
classes"**, because it removes the autonomy gap for demonstrably safe work while
keeping the destructive/irreversible/security-weakening floor firmly
human-gated, and it encodes the rule where it is reviewable.

**DB migration risk classes** (full gate list in the policy doc):

- **Class A — autonomous through production**: additive, backward-compatible,
  non-destructive (new tables, nullable/defaulted columns, tenant-safe
  relations, non-blocking indexes, isolation-preserving RLS, new event/aggregate
  storage; no deletion or rewrite of existing data). Runs autonomously **only**
  after all ten required gates pass — independent SQL review, expand/contract
  compatibility, local + real-DB integration tests, staging verification,
  tenant-isolation + auth tests, lock/plan/perf assessment, documented recovery
  plan, feature-disable without schema revert, `prisma migrate deploy` (never
  `db push`/`db reset`/ `migrate dev`), and post-migration schema + smoke
  checks.
- **Class B — prepare autonomously, one escalation before the prod mutation**:
  backfills/row rewrites, `NOT NULL`/uniqueness on populated data, large-table
  or meaningful-locking operations, type narrowing/rename, contract-phase
  removal after expand, coordinated-downtime migrations.
- **Class C — human-only, never autonomous**: drop/truncate/reset/irreversible
  deletion, destructive schema replacement, unrecoverable transforms, weakening
  RLS/tenant isolation, ad-hoc prod DML, unknown target DB or missing recovery
  evidence.

**CSV rolling-wave categories:**

- **Category A — implementation adaptation**: autonomous.
- **Category B — roadmap rebaseline inside the approved outcome envelope**:
  autonomous, but only when the envelope holds — never delete the outcome, never
  silently remove acceptance criteria, record old→new + evidence + impact, edit
  only the canonical `Sprint_plan.csv`, regenerate derived splits + reports, run
  plan validation, obtain independent review.
- **Category C — remove/materially alter an approved outcome, weaken
  security/tenant/privacy/compliance, external spend, permanently abandon a
  capability**: human-only.

### Positive Consequences

- Safe additive migrations and routine rebaselining no longer block on a human,
  shrinking cycle time without lowering the floor.
- The rule is durable and diffable — L13 is now repo text, not agent memory.
- Escalations are crisp: Class B is a single go/no-go on the prod step; Class C
  / Category C are hard stops.
- Reuses the two existing DB guards for the highest-risk enforcement — no new
  fragile CI surface.

### Negative Consequences

- Class A's ten gates require honest evidence; a skipped-but-claimed gate is a
  false attestation (this risk is inherent to any reviewed-discipline gate).
- Boundary calls (is this Class A or B?) need judgment; the conservative
  "escalate when in doubt" rule accepts some over-escalation as the safe error.

## Pros and Cons of the Options

### Option 1 — rolling-wave categories + risk classes

- Good, because it removes friction from safe work while keeping the destructive
  floor human-gated.
- Good, because it encodes the policy in the repo and reuses existing guards.
- Good, because escalation points are explicit and auditable.
- Bad, because several Class A gates rest on reviewed discipline, not code.

### Option 2 — keep both blanket rules (status quo)

- Good, because it is maximally conservative.
- Bad, because it blocks safe additive work and leaves L13 as unreviewable agent
  memory.

### Option 3 — fully autonomous with post-hoc audit

- Good, because it is maximally fast.
- Bad, because it removes the human gate from destructive and security-weakening
  changes — an unacceptable floor.

## Links

- Refines / replaces the L13 blanket "manual migrations" rule →
  [`docs/operations/agent-autonomy-policy.md`](../../operations/agent-autonomy-policy.md)
- Sibling autonomy-scoping decision →
  [ADR-054](./ADR-054-property-based-race-condition-testing.md)
- Builds on → [ADR-012](./ADR-012-csv-source-of-truth.md) (CSV as source of
  truth)
- Related → [ADR-004](./ADR-004-multi-tenancy.md) (RLS / tenant isolation — the
  floor Class C protects)
- Enforcement → `.claude/hooks/db-destructive-guard.mjs`,
  `tools/scripts/guard-db-target.mjs`, `.claude/hooks/csv-status-guard.mjs`
- Release ops →
  [`docs/operations/runbooks/release-checklist.md`](../../operations/runbooks/release-checklist.md),
  [`docs/operations/release-rollback.md`](../../operations/release-rollback.md)
- [ADR Index](./README.md) ·
  [Sprint Plan](../../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)

## Implementation Notes

The highest-risk boundary (Class C floor / Class A gate 9) is already enforced
in code: `db-destructive-guard.mjs` (PreToolUse) and `guard-db-target.mjs` (pnpm
`db:*` wrapper) block a destructive Prisma command whose **resolved** datasource
is a non-local host unless `ALLOW_PROD_DB_OPS=1` is explicitly set. The intended
production path — `prisma migrate deploy` — is deliberately unguarded. No new CI
check is added for the Category B envelope: a string grep for `db push` /
`migrate dev` false-positives on the legitimate local dev scripts, so the
runtime-target guards remain the meaningful enforcement and the envelope stays
reviewed discipline (documented, not silently skipped).

### Validation Criteria

- [x] Policy encoded in `docs/operations/agent-autonomy-policy.md`
- [x] L13 rule updated at the agent-facing surface (root `CLAUDE.md`)
- [x] CSV Category A/B/C encoded (root `CLAUDE.md` + policy doc)
- [x] Release/migration runbooks reflect the Class A path + prod-command
      guidance
- [x] ADR indexed in `README.md`
- [x] Enforcement vs manual-discipline documented honestly

### Rollback Plan

Revert this ADR, the policy doc, and the `CLAUDE.md`/runbook edits. The DB
guards predate this decision and are unaffected — reverting restores the prior
blanket "migrations manual" posture (as agent memory) without touching any
enforcement code.
