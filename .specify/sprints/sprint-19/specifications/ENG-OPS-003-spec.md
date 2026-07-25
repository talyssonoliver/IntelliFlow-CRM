# ENG-OPS-003 Specification: Harness Hardening Gaps #1–#4 + OSV PRs A/B

**Task**: ENG-OPS-003 — retroactive umbrella for the 8 untracked harness PRs
**Sprint**: 19 **Status**: Spec Complete **Date**: 2026-07-25 **Agents**:
devops-lead (load-bearing), security-lead, test-engineer

---

## Problem

Eight CI / security / E2E-harness PRs merged to `main` on 2026-07-24 with **no
registered task ID**: #623, #625, #627, #628, #629, #630, #631, #634. Each
passed the non-bypassable pre-ship gate and merged green, but none produced a
spec, plan, or attestation. None appears in `Sprint_plan.csv` or the sprint
metrics tree.

The defect is **provenance, not correctness**. The repo cannot answer, from
itself, why these changes exist or who judged them done.

Root cause: the orchestrator dispatched them as ad-hoc prompts, never having
read `docs/operations/sprint-18-orchestrator-prompt.md` — so neither the
pipeline invocation template nor the 6-gate definition of done was applied.

---

## Scope

### In scope

1. A ledger mapping each of the 8 PRs → merge SHA → gap → change → verification
   basis.
2. A registered CSV task so the window is visible in the sprint plan.
3. This spec, a plan, and an attestation, so ENG-OPS-003 itself satisfies the
   gates its subjects skipped.
4. The audit record, including the ENG-OPS-002.R16 collision warning.

### Explicitly out of scope

- **Any code change.** All 8 PRs are merged and green. Re-opening them is not
  the remediation; recording them is. If this task produced a code diff, it
  would be mis-scoped.
- **Retro-registering 8 individual tasks.** See the registration decision below.
- **Fixing ENG-OPS-002.R16.** That branch has a separate owner (orchestrator
  Global Rule 11: a branch/worktree is an exclusive single-writer resource). It
  is documented, not touched.

---

## Registration decision — one umbrella, not eight tasks

| Option                    | Verdict                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 8 individual retro tasks  | ❌ Inflates Sprint-19 counts with work that was never scoped, estimated, or scheduled; distorts velocity/burndown |
| Fold into ENG-OPS-002.R16 | ❌ R16's scope is *Sprint-18 tasks CSV-marked Completed without attestation*. These have **no task ID at all** and are Sprint-19 harness work — a different defect class |
| **One umbrella task**     | ✅ The 8 share one root cause and one remediation. The governance unit is the **merge window**, not each PR      |

---

## Acceptance Criteria

| #   | Criterion                                                                    | Verification                             |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| AC1 | All 8 untracked PRs enumerated with merge SHA and merge timestamp            | ledger table; cross-checked against `gh pr list` over the window rather than a handed-over list |
| AC2 | Each entry states the gap it closes and its verification basis               | ledger table                             |
| AC3 | ENG-OPS-003 exists in `Sprint_plan.csv` with evidence pointers               | CSV row + splits regenerated             |
| AC4 | ENG-OPS-003 has spec + plan + attestation                                    | this file, `-plan.md`, `attestation.json` |
| AC5 | Zero production code changed                                                 | `git diff --stat` — docs/`.specify`/CSV only |
| AC6 | The R16 collision is recorded before it can silently regress `main`          | audit doc §collision warning             |

---

## Enumeration method (AC1)

The supplied target list contained 7 PRs. The window was re-enumerated
independently:

```
gh pr list --state merged --json number,title,mergedAt,mergeCommit \
  --jq '.[] | select(.mergedAt > "2026-07-23")'
```

This surfaced **#627** (`fd8f78c2f`, "source nightly E2E PG password from a
secret"), absent from the supplied list. The untracked set is **8**, not 7.
Trusting the handed-over list would have left one PR permanently invisible —
which is the same class of error the task exists to fix.

---

## Non-goal: pretending this was a pipeline run

ENG-OPS-003 is a governance backfill. Its spec and plan are honest about being
authored **after** the subject PRs merged. The retrospective spec/plan for
IFC-033 and PG-206 carry the same explicit label. Backdating them would trade a
recorded process failure for an unrecorded evidence failure — strictly worse.
