# Agent Autonomy Policy — Migration Risk Classes & Rolling-Wave Rebaselining

> **Decision of record:**
> [ADR-069](../architecture/adr/ADR-069-rolling-wave-rebaselining-and-migration-risk-classes.md).
> This doc is the operational, agent-facing detail; the ADR is the "why".
> **Sibling:**
> [ADR-054](../architecture/adr/ADR-054-property-based-race-condition-testing.md)
> (property-based / race-condition testing — the other autonomy-scoping
> decision).

This policy defines **what an AI agent may do autonomously** versus **what must
escalate to a human**, across the two areas where the old blanket rules created
unnecessary autonomy gaps:

1. **Database migrations** — replaces the previous "all production migrations
   are manual" blanket rule (the rule formerly carried only as agent loop-memory
   lesson **L13**). See
   [Database Migration Risk Classes](#database-migration-risk-classes-abc).
2. **`Sprint_plan.csv` roadmap changes** — makes explicit which CSV edits are
   autonomous adaptation versus which materially alter an approved outcome. See
   [CSV Rebaselining Categories](#csv-rebaselining-categories-abc).

The classification is intentionally **conservative at the boundary**: when a
change could plausibly fall into a higher-risk class, it takes the higher class.
"When in doubt, escalate."

---

## Database Migration Risk Classes (A/B/C)

The old rule — "production migrations are always manual/human-only" — was safe
but blocked a large class of genuinely safe, additive, reversible changes. It is
replaced by three risk classes keyed to what the migration does to **existing
production data**.

### Class A — Autonomous through production

**Scope (all must hold):** additive, backward-compatible, non-destructive.

- New tables
- New **nullable** or **defaulted** columns
- New tenant-safe relations
- New **non-blocking** indexes (e.g. `CREATE INDEX CONCURRENTLY`)
- New RLS policies that **preserve or strengthen** tenant isolation
- New event / aggregate storage
- **No deletion or rewriting of existing production data**

**Required gates — every one must pass before the production migration runs.**
These are binary; there is no partial credit (see
[`quality-gates.md`](./quality-gates.md)).

| #   | Gate                                              | Evidence                                                                                 |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Independent SQL review                            | A second reviewer (human or a distinct review agent) signs off on the generated SQL      |
| 2   | Expand/contract compatibility verified            | Old and new application code both run against the new schema (expand-only phase)         |
| 3   | Local + real-DB integration tests pass            | Test DB at `localhost:5433`; never `.env.local` prod URL                                 |
| 4   | Staging migration + application verification pass | Migration applied to staging, app verified green against it                              |
| 5   | Tenant isolation + auth tests pass                | RLS/tenant-isolation suite green (`tests/integration/rls-tenant-isolation.test.ts`)      |
| 6   | Lock / query-plan / perf risk assessed            | Explicit note that the migration takes no long-held locks and has no adverse plan impact |
| 7   | Snapshot / forward-recovery plan documented       | Where the pre-migration snapshot is and how to roll forward                              |
| 8   | Feature disable without schema revert             | The feature can be turned off (flag/config) **without** reverting the schema             |
| 9   | Prod command uses the intended migration path     | `prisma migrate deploy` **only** — never `db push`, `db reset`, or `migrate dev`         |
| 10  | Post-migration schema + smoke verification pass   | Schema matches expectation and a smoke test confirms the app is healthy                  |

> **Gate 9 is enforced in code, not just policy** — see
> [Enforcement matrix](#enforcement-matrix). `db push` / `migrate reset` /
> `migrate dev` against a non-local database are blocked by
> `.claude/hooks/db-destructive-guard.mjs` and
> `tools/scripts/guard-db-target.mjs` unless the deliberate
> `ALLOW_PROD_DB_OPS=1` flag is present. The intended prod path,
> `prisma migrate deploy` (`pnpm --filter @intelliflow/db db:migrate`), is
> **not** guarded because it is the safe path.

### Class B — Prepare autonomously, one escalation before the production mutation

Class B migrations may be **fully prepared** by an agent — SQL written,
reviewed, tested locally and in staging — but require **one explicit human
escalation before the production data mutation runs.**

**Scope (any one qualifies):**

- Backfilling or rewriting existing rows
- Adding `NOT NULL` or uniqueness constraints to already-populated data
- Large-table operations or any migration with **meaningful locking risk**
- Renaming or **narrowing** column types
- Contract-phase removal **after** a completed expand (dropping a now-unused
  column/table that used to hold data)
- Migrations requiring coordinated downtime

The escalation is a **go/no-go on the production step only** — the agent has
already done the preparation and presents the plan, the tested SQL, the recovery
plan, and the staging result for the human's sign-off.

### Class C — Human-only, never autonomous

An agent **must not** perform these, even fully prepared, and must stop and hand
the task to a human:

- `DROP` / `TRUNCATE` / `RESET` / any irreversible deletion
- Destructive schema replacement
- Unrecoverable data transformations
- **Weakening** RLS or tenant isolation
- Direct, ad-hoc production DML (hand-run `UPDATE`/`DELETE` outside a reviewed
  migration)
- Any operation whose **target database is unknown** or where **recovery
  evidence is missing**

Class C is the hard floor: it maps to the `git`/DB destructive guards and the
Category C human-only list below. No pipeline, flag, or "it's just a test"
framing overrides it.

---

## CSV Rebaselining Categories (A/B/C)

`Sprint_plan.csv` is the
[single source of truth](../architecture/adr/ADR-012-csv-source-of-truth.md) for
the roadmap. It is a **living plan**: prerequisites get discovered mid-flight,
estimates move, tasks split. Not every edit needs product sign-off — but some
do.

### Category A — Implementation adaptation (autonomous)

Day-to-day execution reality: status transitions, evidence links, split/estimate
adjustments, dependency corrections, adaptation of _how_ an already-approved
outcome is delivered. Fully autonomous. (Status transitions are additionally
gated by `.claude/hooks/csv-status-guard.mjs`, which requires the prerequisite
spec/plan/attestation artifacts to exist before a status flip.)

### Category B — Roadmap rebaseline inside the approved outcome envelope (autonomous)

Re-sequencing, re-scoping, or rebaselining the roadmap **while staying inside
the approved outcome** — e.g. inserting a discovered prerequisite, moving a task
between sprints, revising acceptance criteria to better express the same intent.
Autonomous **only if the full envelope is honoured**:

- **Never delete the outcome** — the capability the row promises stays promised.
- **Never silently remove acceptance criteria** — criteria may be refined, not
  quietly dropped.
- **Record old → new + evidence + impact** — the change is auditable (in the
  commit/PR body and, where relevant, `docs/planning/plan-change-log.md`).
- **Edit only the canonical `Sprint_plan.csv`** — never a derived split/JSON.
- **Regenerate derived splits + reports** —
  `npx tsx tools/scripts/split-sprint-plan.ts` and the metrics sync, so derived
  surfaces stay consistent.
- **Run plan validation** — the plan linter / metrics sync must pass.
- **Obtain independent review** — a second reviewer confirms the rebaseline
  stays inside the envelope.

### Category C — Human-only

An agent must **not** do these autonomously:

- **Remove or materially alter an approved outcome** (delete a capability,
  change what a task fundamentally delivers)
- **Weaken security, tenant isolation, privacy, or compliance** posture
- **Commit external spend**
- **Permanently abandon a capability**

---

## Enforcement matrix

What is machine-enforced today versus what rests on reviewed discipline. Honesty
about this line is itself a governance requirement — a gate documented as
enforced that is only manual is a false attestation.

| Rule                                                                                                                           | Enforcement                                                                        | Where                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| No `db push` / `migrate reset` / `migrate dev` on a non-local DB without `ALLOW_PROD_DB_OPS=1` (Class C floor, Class A gate 9) | **Code (PreToolUse hook + script guard)**                                          | `.claude/hooks/db-destructive-guard.mjs`, `tools/scripts/guard-db-target.mjs` |
| Prod path is `prisma migrate deploy` (`db:migrate`), which is _not_ guarded because it is the safe path                        | **Code (by omission — the destructive commands are guarded, the safe one is not)** | `packages/db` scripts                                                         |
| CSV status transition requires prerequisite artifacts (Category A safety)                                                      | **Code (PreToolUse hook)**                                                         | `.claude/hooks/csv-status-guard.mjs`                                          |
| Class A migration gates 1–8, 10 (SQL review, staging, recovery plan, etc.)                                                     | **Reviewed discipline** — evidence attached to the PR/attestation                  | this doc + [`quality-gates.md`](./quality-gates.md)                           |
| Category B envelope (old→new + evidence, no silent criteria removal, independent review)                                       | **Reviewed discipline** — recorded in PR body / plan change log                    | this doc                                                                      |
| Class B production escalation; all Class C / Category C items                                                                  | **Human gate** — agent stops and hands off                                         | this doc                                                                      |
| 4-way dispatch binding (taskId + sessionId + branch + worktree) verified before execution                                      | **Code (supervisor-invoked CLI guard)**                                            | `tools/scripts/orchestration/verify-dispatch-binding.ts`                      |

**Why no new "Category B envelope" CI linter?** A generic grep for `db push` /
`migrate dev` / `db reset` in the repo produces false positives — those strings
legitimately name the local dev scripts (`db:reset`, `db:migrate:dev`). The
meaningful enforcement point is the **resolved database target at runtime**,
which the two existing guards already cover precisely (they block only when the
target resolves to a non-local host). Adding a string-grep gate on top would be
noise, so the Category B envelope stays reviewed discipline, documented here and
in the ADR.

---

## Dispatch-Binding Enforcement

Defined by
[ADR-070](../architecture/adr/ADR-070-task-contract-format-and-dispatch-binding.md).
Every autonomous task dispatch MUST have a machine-readable task contract (JSON
Schema at `tools/scripts/orchestration/schemas/task-contract.schema.json`) and a
verified 4-way binding before execution begins.

### What the 4-way binding enforces

| Dimension        | Contract field | Must equal                              |
| ---------------- | -------------- | --------------------------------------- |
| Task identity    | `taskId`       | Supervisor's intended task ID           |
| Session identity | `agentLeaseId` | Executing Claude Code session ID        |
| Branch           | `branch`       | HEAD branch of the executing worktree   |
| Worktree         | `worktree`     | Absolute path of the executing worktree |

A mismatch on ANY dimension is a hard stop. The supervisor MUST see exit 0 from
the guard before the agent writes any file. This prevents L48-class mid-task
containment incidents (see ADR-070 context).

### Guard usage

```sh
npx tsx tools/scripts/orchestration/verify-dispatch-binding.ts \
  --contract .specify/sprints/sprint-19/spec/ORCH-002/contract.json \
  --task-id   ORCH-002-task-contract-schema-and-dispatch-guard \
  --session-id local_28109fae \
  --branch    fix/orch-002-task-contract-and-dispatch-guard \
  --worktree  /c/Users/talys/projects/iflow-orch-002-contract-and-guard
```

Exit 0 = binding verified, proceed. Exit 1 = binding mismatch — diagnostics
printed to stderr; do NOT begin execution.

### Contract validation

```sh
npx tsx tools/scripts/orchestration/validate-task-contract.ts \
  --contract <path-to-contract.json> \
  [--leases-file .orchestration/active-leases.jsonl]
```

Validates all 20 required fields and checks for duplicate `agentLeaseId` in the
per-machine active-leases log (`.orchestration/active-leases.jsonl`). Absence of
the leases file is safe — treated as no prior leases.

---

## See also

- [ADR-070](../architecture/adr/ADR-070-task-contract-format-and-dispatch-binding.md)
  — task-contract format, dispatch-binding, and ledger architecture decision
- [ADR-069](../architecture/adr/ADR-069-rolling-wave-rebaselining-and-migration-risk-classes.md)
  — rolling-wave rebaselining and migration risk classes
- [ADR-012](../architecture/adr/ADR-012-csv-source-of-truth.md) — CSV as source
  of truth
- [`release-rollback.md`](./release-rollback.md) — blue/green deploy + rollback
- [`runbooks/release-checklist.md`](./runbooks/release-checklist.md) — release +
  DB migration checklist
- [`quality-gates.md`](./quality-gates.md) — binary gate discipline
