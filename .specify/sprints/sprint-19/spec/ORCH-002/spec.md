# ORCH-002 Spec — Task-Contract JSON Schema & Dispatch-Binding Enforcement

**Task ID**: ORCH-002-task-contract-schema-and-dispatch-guard
**Sprint**: 19
**Baseline SHA**: `1810a937137adf4b8410eac1719500ea3558ac3b`
**Author**: local_28109fae (ORCH-002 lease, 2026-07-26)
**ADR**: ADR-070 (decision on contract format, dispatch binding, ledger architecture)

---

## Problem Statement

The autonomous delivery harness dispatches AI agents against Sprint tasks with
no machine-enforced contract between the dispatcher and the agent. The 20-field
task-contract format (taskId, approvedOutcome, acceptanceCriteria, branch,
worktree, agentLeaseId, etc.) exists only as prose in agent prompts and ops
docs. This caused:

- **L48 recurrence**: an agent began work without a verified 4-way binding
  (taskId + sessionId + branch + worktree). The binding mismatch was discovered
  mid-task, requiring containment (ORCH-CLEANUP-001).
- **Phantom completions** (ENG-OPS-002 history): agents self-attested "Completed"
  without all acceptance criteria met, partly because criteria weren't
  machine-readable at dispatch time.
- **Duplicate lease races**: two agents began the same task in different worktrees
  because no system enforced "exactly one active lease per task".

ORCH-001 recon (e667d6988) confirmed: no schema exists, no validator exists, no
dispatch-binding guard exists.

---

## Approved Outcome

A single independently reviewable + mergeable PR that lands:

1. Exactly ONE canonical CSV roadmap row (ORCH-002, deduplicated).
2. This spec + execution plan as committed evidence artifacts.
3. ADR-070: complete decision on task-contract format, dispatch-binding
   enforcement strategy, and ledger architecture (evaluating ≥4 options against
   9 Section 4 requirements; recommendation with rationale).
4. `tools/scripts/orchestration/schemas/task-contract.schema.json` — complete
   JSON Schema (Draft 2020-12) covering all 20 required fields.
5. `tools/scripts/orchestration/validate-task-contract.ts` — runtime validator
   module + CLI; rejects any dispatch where a required field is missing,
   wrong-typed, or where the agentLeaseId is a duplicate.
6. `tools/scripts/orchestration/__tests__/validate-task-contract.test.ts` —
   test suite (≥90% coverage on new code) covering: missing-field rejection,
   wrong-type rejection, duplicate-lease rejection, binding-mismatch rejection,
   valid-dispatch happy-path.
7. `tools/scripts/orchestration/verify-dispatch-binding.ts` — CLI guard that
   validates the 4-way binding (taskId + agentLeaseId/sessionId + branch +
   worktree) BEFORE execution begins; preventing L48-class binding violations.
8. `docs/operations/agent-autonomy-policy.md` — dispatch-binding section added
   (enforcement matrix row + usage note for the guard).

Future ORCH increments (event ledger, live lease store, scheduler) are recorded
as candidates in plan.md. They become CSV tasks only when rolling-wave recon
makes them the next justified slice.

---

## Acceptance Criteria

1. Exactly one ORCH-002 CSV row added; no other ORCH rows added; no ENG-OPS
   rows modified; dedup verified against existing rows.
2. Spec + plan present at
   `.specify/sprints/sprint-19/spec/ORCH-002/{spec,plan}.md`.
3. ADR-070 published (not a skeleton) — evaluates all 4 candidate ledger
   options, names a winner with rationale, records trade-offs.
4. JSON Schema includes all 20 required fields (taskId, approvedOutcome,
   acceptanceCriteria, baselineMainSha, specHash, policyVersion,
   dependencySnapshot, riskClass, priority, estimatedEffort, timeBudget,
   retryBudget, validationProfile, expectedArtifacts, branch, worktree,
   agentLeaseId, leaseExpiry, allowedMutationScope,
   humanEscalationConditions); each has type + description.
5. Validator rejects: (a) missing required field, (b) wrong-type field,
   (c) duplicate agentLeaseId (checked against `.orchestration/active-leases.jsonl`),
   (d) task/session/branch/worktree 4-way binding mismatch.
   Validator accepts valid contracts.
6. Test coverage ≥90% on new code in `tools/scripts/orchestration/`.
7. `verify-dispatch-binding.ts` documents its usage in
   `docs/operations/agent-autonomy-policy.md` (enforcement matrix row + example
   invocation); guard exits 0 on valid binding, 1 on mismatch with error details.

---

## Allowed Mutation Scope

- `.specify/sprints/sprint-19/spec/ORCH-002/` — spec + plan (this task's evidence)
- `docs/architecture/adr/ADR-070-*.md` — new ADR
- `docs/operations/agent-autonomy-policy.md` — dispatch-binding section appended
- `tools/scripts/orchestration/` — schema, validator, guard, tests
- `Sprint_plan.csv` — exactly one ORCH-002 row appended
- Split files regenerated automatically after CSV edit

NOT in scope: `packages/**`, `apps/**`, `.claude/hooks/**`, `scripts/**`.

---

## Risk Class

**Low.** New files only; no existing code modified except agent-autonomy-policy.md
(append-only). No DB migrations. No runtime app code.

---

## Lane Constraint

Per Section 6 of owner correction 2026-07-26: Slot 2 holds the merge lane.
Author + commit + run scoped unit tests locally. Do NOT run full pre-ship / push
/ open PR until Slot 2 releases the lane.
