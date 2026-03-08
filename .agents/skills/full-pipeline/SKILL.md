---
name: full-pipeline
description: Autonomous state-machine that chains spec-session → plan-session → exec for a task. Designed to run inside a Ralph Wiggum loop for fully autonomous task execution. Runs ONE phase per invocation — Ralph handles iteration.
---

# Full Pipeline Command (Ralph-Compatible)

**CRITICAL**: This command runs ONE phase per invocation. Ralph handles iteration.

## Usage

```bash
# Standalone (runs one phase per invocation)
/full-pipeline <TASK_ID>

# With Ralph loop (chains all phases automatically)
/ralph-wiggum:ralph-loop "/full-pipeline <TASK_ID>" --max-iterations 40 --completion-promise "PIPELINE COMPLETE"
```

## Phase Detection Algorithm

On each invocation, detect the current phase from artifact existence:

```
SPEC_PATH = .specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md
PLAN_PATH = .specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md
DELIVERY_PATH = .specify/sprints/sprint-{N}/execution/{TASK_ID}/
ATTESTATION_PATH = .specify/sprints/sprint-{N}/attestations/{TASK_ID}/attestation.json

1. Check CSV status for TASK_ID
2. Check which artifacts exist

IF status is "Completed" or "DONE"     → Run Deliverable Verification → if PASS output promise, if FAIL re-run exec
IF SPEC_PATH does NOT exist            → PHASE 1: Run /spec-session → STOP
IF SPEC_PATH exists AND PLAN_PATH missing → PHASE 2: Run /plan-session → STOP
IF both exist AND status not "Completed" → PHASE 3: Run /exec → STOP
IF status is "Completed"               → Run Deliverable Verification → if PASS output promise
```

## Iteration Budget Guide

| Task Type | Recommended --max-iterations |
|-----------|------------------------------|
| Simple page (404, legal) | 15 |
| Settings page (CRUD form) | 20 |
| CRM page (list+detail) | 30 |
| Complex feature (AI, workflow) | 40 |

**See references/pipeline-phases.md** for: full phase instructions, deliverable verification algorithm, error recovery table, resumability details, and important notes.

## Completion Promise

Only output the promise after Deliverable Verification PASSES:
```
<promise>PIPELINE COMPLETE</promise>
```

**NEVER output the promise without running Deliverable Verification first.**

## Follow-Up Tasks

When spec, plan, or exec discovers issues outside the current task's scope:
1. See `references/follow-up-task-protocol.md` for the full protocol
2. Blocking follow-ups pause the pipeline until resolved
3. Non-blocking follow-ups are tracked but don't pause the pipeline
4. The `/create-task` skill handles all task creation mechanics
5. Anti-spam checklist is MANDATORY before every follow-up creation

## Non-Negotiable Rules

1. One phase per iteration — do NOT run multiple phases in one invocation
2. Trust the state machine — always detect phase from artifacts, never assume
3. STOP after each phase — let Ralph handle the loop, don't loop internally
4. Use the Skill tool to invoke /spec-session, /plan-session, /exec
5. NEVER manually set CSV to "Completed" — only /exec Phase 5 should do this

## Related Skills

- `/spec-session` — Phase 1
- `/plan-session` — Phase 2
- `/exec` — Phase 3
- `/ralph-wiggum:ralph-loop` — iteration driver
