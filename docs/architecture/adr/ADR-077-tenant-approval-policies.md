# ADR-077: Tenant Approval Policies for AI Work

**Status:** Accepted (2026-10-13 — implemented on
`feat/pg-198-approval-policies`)

**Date:** 2026-10-13

**Deciders:** Talysson Oliveira (owner rulings R1–R3, 2026-10-13, relayed by the
runner); PG-198 spec session (Backend-Architect, AI-Specialist, Domain-Expert,
Frontend-Lead; final-spec consensus 4/4 APPROVED on 2026-10-13)

**Technical Story:** PG-198 — Module Settings: Approval Policies
(`/agent-approvals/approval-policies`)

> Numbering: the PG-198 plan reserved ADR-076. Before the final commit, other
> lanes held ADR-075 (two branches) and ADR-076 (PG-204), so this record takes
> ADR-077.

## Context and Problem Statement

IntelliFlow has two approval queues for AI work, and before PG-198 neither one
had tenant-level rules:

1. **Agent tool actions** (IFC-139/149). Five tools need approval:
   `create_case`, `create_appointment`, `update_case`, `update_appointment` and
   `draft_message`. Each one hard-coded a 30-minute expiry. Anyone with
   `agent:tool-approval` could decide. Approving an action did not execute it:
   it returned a canned success (#853). Confidence was derived from impact, not
   reported by a model (#854).
2. **AI email auto-response drafts** (IFC-029). A fixed 24-hour expiry, a manual
   escalate, and actor ids taken from the client (#855).

The owner ruled (R3: Q1=B, Q2=B, Q3=A, Q4=B):

- policies govern **both** queues;
- all four rules are enforced now: timeout, minimum reviewer, auto-approve and
  escalation;
- the reviewer rule is a **minimum role** on top of the existing permission;
- each policy carries a **colour token**.

R1 placed the router in `apps/api/src/modules/agent/`.

How should approval rules be modelled and enforced so they are tenant-isolated,
fail closed, and never let AI work run without a person unless a tenant
explicitly opted in?

## Decision Drivers

- ISO 42001 D.1 / ADR-006: automation only above 0.9 confidence. AI defaults are
  OFF (module-settings playbook §7).
- Fail closed. A policy that can't be read must never auto-approve or silently
  drop a reviewer requirement.
- With no policy, behaviour stays exactly as it was (AC-007).
- Hexagonal rule: decisions live in `packages/domain`, with zero infra deps.
- Explicit `tenantId` on every query. RLS is defence in depth only.
- Class A migration only (ADR-069): new tables plus nullable/defaulted columns.
  The large-table index is `CONCURRENTLY`, in its own file.

## Considered Options

1. **Per-tool constants in config.** Rejected: not tenant-configurable, and it
   doesn't cover the auto-response queue.
2. **Reuse `RoutingRule`** (lead/ticket routing). Rejected: a different concept,
   and no reviewer, timeout or escalation semantics.
3. **Dedicated `ApprovalPolicy` + `ApprovalPolicyAssignment` tables, a pure
   domain resolver and predicates, and API-side enforcement in both routers plus
   an escalation sweep (chosen).**

## Decision Outcome

Chosen option 3.

- **Model.**
  - `approval_policies`: tenant, scope (`AGENT_TOOL` | `AUTO_RESPONSE`), name
    unique per scope (case-insensitive), colour token (CHECK against the
    18-token allowlist), timeout 5..10080 min, minimum reviewer role,
    auto-approve (default false, threshold 90..99), escalation (delay below
    timeout, target user `ON DELETE SET NULL`), and at most one default per
    scope.
  - `approval_policy_assignments` route `(agentKey, actionType)` pairs to a
    policy. The FK is `(tenantId, policyId, scope)`, so an assignment can't
    cross tenants or queues.
- **Resolution** (`packages/domain/src/ai/approval-policy/resolver.ts`, BR-1):
  exact pair, then agent wildcard, then action wildcard, then the scope default,
  then built-in rules (30 min / 24 h, permission-only, no auto-approve, no
  escalation).
- **Enforcement.**
  - New items get `expiresAt` from the effective policy.
  - Approve and reject require the policy's minimum role in addition to the
    permission. They read fresh, so a read error fails closed.
  - Approval claims the action atomically and runs the real mutation through the
    target module's tRPC procedure. Failures are stored as `executionError`. No
    rollback token is issued while rollbacks are simulated (#856).
- **Auto-approve** (`evaluateAutoApproval`). It runs only when all of these
  hold:
  - the policy enables it;
  - a real confidence is strictly above the threshold;
  - impact is present and not HIGH;
  - the action is not DELETE;
  - for `draft_message`, the channel is NOTE only;
  - the session requester holds the approve permission and the minimum role.

  The actor is `system:approval-policy`, and each decision is audit-logged with
  the policy id.

- **Escalation.** An in-process sweep (`approval-escalation-sweep.ts`) holds a
  transaction-scoped advisory lock, so replicas never double-fire. It escalates
  overdue items once to the policy target, notifies after commit, audit-logs
  each escalation with its policy id, and flips expired agent actions to
  EXPIRED.
- **UI.** The playbook page has one card per queue, a policy dialog (with a
  confirmation before auto-approve), per-agent overrides and an effective-rules
  view. It is read-only for non-admins.

### Consequences

- Good: tenants can tighten review (role, SLA, escalation) or opt into bounded
  automation per agent/action. Approved actions now really execute.
- Good: decisions are pure and unit-tested. The DB repeats the validator's
  invariants as CHECKs.
- Bad / accepted:
  - The sweep is in-process (`APPROVAL_SWEEP_INTERVAL_MS`). The events worker
    can't import the API's tool registry.
  - Draft confidence is client-supplied. This is bounded by BR-6: the requester
    must already be allowed to approve.
- Follow-ups:
  - #856 real compensating rollbacks;
  - #857 approver filtering;
  - #872 the case assignee default;
  - #883 a tenant-scoped action store.

  The draft optimistic lock (#874) was fixed on this branch.

## Links

- Spec and plan: `.specify/sprints/sprint-18/{specifications,planning}/PG-198-*`
- Owner rulings:
  `.specify/sprints/sprint-18/context/PG-198/PG-198-owner-ruling.md`
- Migrations: `packages/db/prisma/migrations/20261013120000_approval_policies`,
  `20261013120100_agent_actions_pending_sweep_idx`
- Related: ADR-006 (AI safety), ADR-069 (migration risk classes), ADR-074
  (module-settings pattern)
