---
name: full-pipeline
description:
  Autonomous state-machine that chains spec-session → plan-session → exec for a
  task. Runs the FULL pipeline (spec → plan → exec) in a single invocation. With
  Ralph, each iteration is a complete pipeline attempt — Ralph handles retries
  on failure.
---

# Full Pipeline Command (Ralph-Compatible)

**CRITICAL**: This command runs the FULL pipeline (all phases) in a single
invocation. Do NOT stop after one phase — chain spec → plan → exec sequentially
until the task is complete or a phase fails. **NEVER check Ralph loop status or
use it as a reason to stop** — Ralph is only for retries, the pipeline runs
independently.

## Usage

```bash
# Standalone (runs full pipeline: spec → plan → exec)
/full-pipeline <TASK_ID>

# With Ralph loop (retries on failure, verifies completion)
/ralph-wiggum:ralph-loop "/full-pipeline <TASK_ID>" --max-iterations 10 --completion-promise "PIPELINE COMPLETE"
```

## Pipeline Flow

On each invocation, detect the current state and run ALL remaining phases:

```
SPEC_PATH = .specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md
PLAN_PATH = .specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md
DELIVERY_PATH = .specify/sprints/sprint-{N}/execution/{TASK_ID}/
ATTESTATION_PATH = .specify/sprints/sprint-{N}/attestations/{TASK_ID}/attestation.json

1. Check CSV status for TASK_ID
2. Check which artifacts exist

IF status is "Completed" or "DONE":
   → Run Deliverable Verification → if PASS output promise, if FAIL re-run exec

THEN run all remaining phases in sequence:

IF SPEC_PATH does NOT exist            → PHASE 1: Run /spec-session
                                         (continue to Phase 2 on success, STOP on failure)
IF PLAN_PATH does NOT exist            → PHASE 2: Run /plan-session
                                         (continue to Phase 3 on success, STOP on failure)
IF status is NOT "Completed"           → PHASE 3: Run /exec
                                         (continue to verification on success, STOP on failure)

After all phases succeed → Run Deliverable Verification → if PASS output promise
```

## Iteration Budget Guide (with Ralph)

Since each iteration now runs the full pipeline, fewer iterations are needed:

| Task Type                      | Recommended --max-iterations |
| ------------------------------ | ---------------------------- |
| Simple page (404, legal)       | 3                            |
| Settings page (CRUD form)      | 5                            |
| CRM page (list+detail)         | 7                            |
| Complex feature (AI, workflow) | 10                           |

**See references/pipeline-phases.md** for: full phase instructions, deliverable
verification algorithm, error recovery table, resumability details, and
important notes.

## Completion Promise

Only output the promise after Deliverable Verification PASSES:

```
<promise>PIPELINE COMPLETE</promise>
```

**NEVER output the promise without running Deliverable Verification first.**

**MANDATORY pre-promise script** (IFC-220 lesson — agent skipped manual checks):

```bash
npx tsx tools/scripts/detect-phantom-completions.ts
```

If the task appears in `phantom_completions` → DO NOT output promise. Fix
missing artifacts first. This is deterministic enforcement — the script checks
every EVIDENCE/ARTIFACT path against disk.

## Follow-Up Tasks

When spec, plan, or exec discovers issues outside the current task's scope:

1. See `references/follow-up-task-protocol.md` for the full protocol
2. Blocking follow-ups pause the pipeline until resolved
3. Non-blocking follow-ups are tracked but don't pause the pipeline
4. The `/create-task` skill handles all task creation mechanics
5. Anti-spam checklist is MANDATORY before every follow-up creation

## Non-Negotiable Rules

1. Full pipeline per invocation — run ALL remaining phases (spec → plan → exec)
   sequentially in one invocation
2. Stop on failure only — if a phase fails, STOP and let Ralph retry the full
   pipeline
3. Trust the state machine — always detect phase from artifacts, never assume
4. Resume from where you left off — if spec already exists, skip to plan; if
   plan exists, skip to exec
5. Use the Skill tool to invoke /spec-session, /plan-session, /exec
6. NEVER manually set CSV to "Completed" — only /exec Phase 5 should do this
7. **NEVER check Ralph loop status** — Do NOT read `.claude/ralph-loops/` state
   files. Do NOT check if the Ralph loop is active, cancelled, or deactivated.
   Ralph is ONLY for retries on failure — the pipeline itself runs ALL phases
   regardless of Ralph status. Even if Ralph was cancelled or never started, you
   MUST continue to the next phase after each success.

## Related Skills

- `/spec-session` — Phase 1
- `/plan-session` — Phase 2
- `/exec` — Phase 3
- `/ralph-wiggum:ralph-loop` — retry driver on failure
