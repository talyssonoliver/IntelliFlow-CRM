# PG-198 — open questions for the owner (spec-session paused, 2026-10-13)

The spec cannot be written until these are answered: each one changes what gets
built. R1 (router in `modules/agent/`) and R2 (never-downgrade is PG-199) are
already ruled and recorded in `PG-198-owner-ruling.md`; they are not re-asked.

## What the code actually has (verified 2026-10-13)

There is no approval-policy backend anywhere. There are TWO separate approval
queues:

1. **Agent tool actions** (IFC-139). `AgentAction` rows
   (`packages/db/prisma/schema.prisma:1598`) written by
   `apps/api/src/agent/prisma-action-store.ts:55`. Five tools need approval:
   `create_case`, `create_appointment`, `update_case`, `update_appointment`,
   `draft_message`. Every one hard-codes `APPROVAL_EXPIRY_MS = 30 min`
   (`apps/api/src/agent/tools/create.ts:32`, `update.ts:32`,
   `draft-message.ts:30`). Approve/reject: `agent.approveAction` /
   `agent.rejectAction` (`apps/api/src/modules/agent/agent.router.ts:350`), gated
   by the `agent:tool-approval` permission. UI: `/agent-approvals/preview`
   ("Tool Actions").
2. **AI auto-response email drafts** (IFC-029). `AutoResponseDraft`
   (`schema.prisma:3398`), `autoResponse` router. This is the main
   `/agent-approvals` queue. It already has its own approver, per-draft
   `expiryHours` and a manual `escalate` (to a named user, with notification).

Two defects found while checking (pre-existing, will be tracked as red flags
whatever you decide):

- **Approved agent actions are never executed.**
  `apps/api/src/agent/approval-workflow.ts:229-246` ignores `inputToExecute` and
  returns a canned "Action executed successfully" with a random `entityId`.
- **The stored "confidence" is not a confidence.** `prisma-action-store.ts:61`
  writes `confidenceScore` from the action's *impact* (HIGH impact = 90,
  LOW = 30). An "auto-approve above 80 % confidence" rule would auto-approve
  exactly the HIGH-impact actions.

## Q1 — Which approvals do the policies govern?

- **A (recommended)** — agent tool actions only (queue 1). "Per-agent override"
  = per tool (`create_case`, `draft_message`, …). The page says plainly that
  email auto-responses keep their own per-draft settings. Smallest honest scope.
- **B** — both queues. One policy model drives both the tool actions and the
  auto-response drafts (expiry, approver, escalation). Roughly doubles the
  wiring and touches the IFC-029 domain aggregate.
- **C** — auto-response drafts only.

## Q2 — How much is enforced in this PR?

- **A (recommended)** — wire now: **approval timeout SLA** (sets `expiresAt` on
  new pending actions instead of the fixed 30 min) and **required reviewer**
  (see Q3; enforced in approve/reject on top of the existing permission). Store
  and show, but declare as a follow-up (playbook §8 category 2):
  **auto-approve threshold** (off by default, blocked on the two defects above)
  and **escalation path** (needs a scheduled sweep + notification). IFC-310/311/312
  are contacts/accounts-only, so the follow-up is one new row, "agent approval
  policy runtime: auto-approve + escalation", depending on a fix for the
  never-executed defect.
- **B** — wire all four now, including a real executor, a real confidence
  signal and an escalation scheduler. Much bigger; risks the parallel lanes.
- **C** — store everything, wire nothing; all four become follow-ups.

## Q3 — What is a "required reviewer"?

- **A (recommended)** — a minimum role allowed to decide (e.g. MANAGER or
  ADMIN), per policy, on top of the `agent:tool-approval` permission.
- **B** — a named list of users.
- **C** — a number of approvals required (N reviewers must approve).

## Q4 — Two DoD items do not fit this page

The row's DoD copies the generic playbook: "TagsTab via forwardRef" and
"colorToken CHECK constraint". Approval policies have no tags and no colours.

- **A (recommended)** — record both as N/A in the spec and the attestation with
  this reason; keep every other DoD item.
- **B** — add a colour token to each policy (for list chips) with the CHECK
  constraint, and still mark TagsTab N/A.
- **C** — something else.

## Answer

Owner (Talysson), 2026-10-13, AskUserQuestion modal relayed by the Lane A runner:

- **Q1 = B. Both queues.** Policies govern agent tool actions AND AI auto-response email drafts.
- **Q2 = B. Enforce all four now:** approval timeout, required reviewer, auto-approve threshold (default
  OFF) and escalation. This needs a real executor for approved agent actions (replacing the canned success
  at approval-workflow.ts:229-246), a real confidence score (not impact-derived, prisma-action-store.ts:61),
  and an escalation scheduler. Still file both existing bugs as red flags (gh issue + debt ledger +
  findings doc) and reference them from the fixing commits.
- **Q3 = A. Minimum role** allowed to approve, on top of the existing approval permission.
- **Q4 = B. Add a colour token per policy** (list chips) with the colorToken CHECK constraint. TagsTab stays
  N/A with the reason recorded.

