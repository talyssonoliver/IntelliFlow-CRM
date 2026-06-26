---
name: dispatch-task
description: Generate the full per-task agent prompt for a Sprint task deterministically (worktree provisioning + gates + gotchas + the /loop /full-pipeline run + merge discipline), instead of hand-writing it each time. Used by the orchestrator agent to dispatch one task-executor per task.
---

# Dispatch Task — deterministic per-task agent prompt

Stop hand-writing a full worktree-agent prompt for every task (that is where the
"mistakes and mismatches" creep in — wrong `--max-iterations`, a missing gotcha,
a stale persona, a forgotten DB-target warning, or dispatching an already-merged
task). This skill produces the prompt **deterministically** from data.

## Usage

```bash
node tools/scripts/generate-task-prompt.mjs <TASK-ID> [--main-sha <sha>] [--slot <n>] [--total <n>]
```

**The stdout IS the prompt.** Hand it verbatim to a fresh `task-executor` agent
session running in its own worktree. Do not edit it by hand — re-run the script
if something is wrong (fix the data, not the output).

## What it does

1. Reads `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` for the
   task's sprint, description, dependencies, and status.
2. Reads `docs/operations/task-assignment-matrix.json` for the **persona**
   (load-bearing reviewer/lens), **STOA** skill, **task skills**, and
   **`--max-iterations`** (15 simple / 20 settings / 30 CRM / 40 complex-AI).
3. **Resolves real status from git, NOT the CSV** (the CSV is stale in both
   directions): `git log origin/main --grep=<ID>` filtered for feature commits.
   - Code already on main → **exit 3**, prints a REFUSE + reconcile-and-attest
     plan (do NOT run `/full-pipeline` for merged work).
   - CSV says "Completed" but no commit on main → dispatches anyway with a loud
     **STALE CSV** warning.
4. Emits the full prompt: PROVISION (worktree, local test DB :5433, never prod
   Supabase) → GATE (`pre-ship.mjs`) → the 8 hard-won GOTCHAS → the
   `/loop "/full-pipeline <ID>"` run line with the correct `--max-iterations` →
   VALIDATE → MERGE DISCIPLINE (where the PR # is born) → ESCALATE rules.

## Exit codes

| Code | Meaning | Orchestrator action |
|------|---------|---------------------|
| 0 | Prompt emitted | Dispatch a `task-executor` with this prompt |
| 3 | Already on main | Do reconcile-and-attest, do NOT dispatch a build |
| 1 | Task/matrix not found | Fix the task ID or the matrix |

## Keeping the matrix correct

`docs/operations/task-assignment-matrix.json` mirrors
`docs/operations/sprint-18-orchestrator-prompt.md` §C. When a task's persona /
STOA / max-iter changes, edit the JSON (the generator reads it), then keep the
prose §C in sync. Mark a task `"done": true` only after you have **verified the
merge via git** — but the generator's own git check is the real safety net.

## Related

- `/full-pipeline` — the build engine the generated prompt wraps
- `.claude/agents/orchestrator.md` — the agent that calls this skill per task
- `.claude/agents/task-executor.md` — the Tier-C agent that runs the generated prompt
