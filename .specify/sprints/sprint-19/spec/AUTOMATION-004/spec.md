# AUTOMATION-004 Spec — Task-Contract JSON Schema & Dispatch-Binding Enforcement

**Task ID**: AUTOMATION-004-task-contract-schema-and-dispatch-guard
**Sprint**: 19
**Baseline SHA**: `1810a937137adf4b8410eac1719500ea3558ac3b`
**Author**: local_28109fae (AUTOMATION-004 lease, 2026-07-26)
**ADR**: ADR-070 (decision on contract format, dispatch binding, ledger architecture)

> **Note on branch**: the working branch is `fix/orch-002-task-contract-and-dispatch-guard`
> (created before the ORCH-* prefix was identified as undocumented). The canonical
> branch for this task would have been `fix/automation-004-task-contract-…`. The
> branch name discrepancy is recorded here and will be documented in the PR body.

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

AUTOMATION-001 (Sprint 0, Completed) established the multi-agent orchestration
foundation. This task (AUTOMATION-004) formalises the task-contract schema and
dispatch-binding enforcement on top of that foundation. The task was initially
registered as ORCH-002 before the prefix was identified as undocumented; the CSV
row and all artifacts have been renamed to AUTOMATION-004 per owner directive.

---

## Approved Outcome

A single independently reviewable + mergeable PR that lands:

1. Exactly ONE canonical CSV roadmap row (AUTOMATION-004, deduplicated).
2. This spec + execution plan as committed evidence artifacts.
3. ADR-070: complete decision on task-contract format, dispatch-binding
   enforcement strategy, and ledger architecture (evaluating ≥4 options against
   9 Section 4 requirements; recommendation with rationale).
4. `tools/scripts/orchestration/schemas/task-contract.schema.json` — complete
   JSON Schema (Draft 2020-12) covering all 20 required fields.
5. `tools/scripts/orchestration/validate-task-contract.ts` — runtime validator
   module + CLI; rejects any dispatch where a required field is missing,
   wrong-typed, has an unknown extra field, or where the agentLeaseId is a duplicate.
6. `tools/scripts/orchestration/__tests__/validate-task-contract.test.ts` —
   test suite (≥90% coverage on new code) covering: missing-field rejection,
   wrong-type rejection, unknown-field rejection (additionalProperties:false),
   duplicate-lease rejection, binding-mismatch rejection, restart-persistence
   semantics, valid-dispatch happy-path.
7. `tools/scripts/orchestration/verify-dispatch-binding.ts` — CLI guard that
   validates the 4-way binding (taskId + agentLeaseId/sessionId + branch +
   worktree) BEFORE execution begins AND compares against the stored-lease
   record in `.orchestration/active-leases.jsonl` (per-machine authority check);
   preventing L48-class binding violations.
8. `docs/operations/agent-autonomy-policy.md` — dispatch-binding section added
   (enforcement matrix row + usage note for the guard).

Future AUTOMATION increments (event ledger, live lease store, scheduler) are
recorded as candidates in plan.md. They become CSV tasks only when rolling-wave
recon makes them the next justified slice.

---

## Acceptance Criteria

1. Exactly one AUTOMATION-004 CSV row added; no other AUTOMATION/ORCH rows added;
   no ENG-OPS rows modified; dedup verified against existing rows.
2. Spec + plan present at
   `.specify/sprints/sprint-19/spec/AUTOMATION-004/{spec,plan}.md`.
3. ADR-070 published (not a skeleton) — evaluates all 4 candidate ledger
   options, gives correct verdicts (no option passes all 9 cross-env requirements),
   identifies Upstash Redis SET NX EX as the AUTOMATION-005 leading candidate.
4. JSON Schema includes all 20 required fields (taskId, approvedOutcome,
   acceptanceCriteria, baselineMainSha, specHash, policyVersion,
   dependencySnapshot, riskClass, priority, estimatedEffort, timeBudget,
   retryBudget, validationProfile, expectedArtifacts, branch, worktree,
   agentLeaseId, leaseExpiry, allowedMutationScope,
   humanEscalationConditions); each has type + description;
   `additionalProperties: false` enforced by both schema and runtime validator.
5. Validator rejects: (a) missing required field, (b) wrong-type field,
   (c) unknown extra field, (d) duplicate agentLeaseId (checked against
   `.orchestration/active-leases.jsonl`), (e) task/session/branch/worktree
   4-way binding mismatch, (f) binding mismatch against stored lease record.
   Validator accepts valid contracts.
6. Test coverage ≥90% on new code in `tools/scripts/orchestration/`.
7. `verify-dispatch-binding.ts` documents its usage in
   `docs/operations/agent-autonomy-policy.md` (enforcement matrix row + example
   invocation); guard exits 0 on valid binding, 1 on mismatch with error details.

---

## Allowed Mutation Scope

- `.specify/sprints/sprint-19/spec/AUTOMATION-004/` — spec + plan (this task's evidence)
- `docs/architecture/adr/ADR-070-*.md` — new ADR
- `docs/operations/agent-autonomy-policy.md` — dispatch-binding section appended
- `tools/scripts/orchestration/` — schema, validator, guard, tests
- `Sprint_plan.csv` — exactly one AUTOMATION-004 row appended
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
