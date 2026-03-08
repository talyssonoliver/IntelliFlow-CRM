# Follow-Up Task Protocol

Central protocol for creating follow-up tasks when spec, plan, or exec discovers issues outside the current task's scope. Referenced by all pipeline phases.

## Classification: Blocking vs Non-Blocking

### Blocking Follow-Ups

The current task **cannot complete** until the follow-up is resolved. Pipeline outputs STOP.

- False dependency claims (attestation says "service wired" but it isn't)
- Missing infrastructure that the current task depends on
- Broken prerequisite (dependency task marked complete but deliverable is missing/broken)

### Non-Blocking Follow-Ups

Tracked separately; the current task **continues** after recording the follow-up.

- Out-of-scope bugs found during implementation
- Enhancement ideas discovered during code review
- Tech debt identified but not required for current task's DoD

---

## Anti-Spam Checklist (MANDATORY)

**ALL four checks must pass before creating a follow-up task.** This prevents false deferrals (see MEMORY.md "False Deferral Anti-Pattern") and duplicate task creation.

1. **Search codebase** — Does the issue actually exist? Read the relevant files, grep for the service/component. If the infrastructure already exists, **wire it now** instead of deferring.
2. **Search Sprint_plan.csv** — Is there already a task for this issue? Check by description and by the component/service name. If a task exists, reference it instead of creating a duplicate.
3. **Is this within the current task's scope?** — If fixing this issue is part of the current task's Definition of Done, fix it now. Do NOT create a follow-up for work you should be doing.
4. **Is the issue real and reproducible?** — Can you point to a specific file, line, or test failure? Speculative issues ("this might break later") are NOT valid follow-ups.

If ANY check fails, do NOT create a follow-up task. Either fix the issue in-scope or document it as a note in the current task's attestation.

---

## Invocation

Use the Skill tool to invoke `/create-task` from within a pipeline phase:

```
Skill("create-task", args: "<description>")
```

When invoking, include in the description:

- `source_task: {TASK_ID}` — the task that discovered the issue
- `source_phase: spec|plan|exec` — which pipeline phase found it
- `blocking: true|false` — whether this blocks the current task

**The `/create-task` user confirmation gate still applies.** The pipeline does NOT bypass user approval. The user will be asked to confirm before the task is created.

---

## Sidecar Tracking

After creating a follow-up, append an entry to the sidecar file:

```
.specify/sprints/sprint-{N}/follow-ups/{TASK_ID}-follow-ups.json
```

Where `{TASK_ID}` is the **current** (source) task, not the follow-up task.

### Schema

```json
{
  "source_task": "IFC-042",
  "follow_ups": [
    {
      "follow_up_id": "IFC-200",
      "blocking": true,
      "reason": "False attestation: IFC-040 claims NotificationService wired in container but it is not instantiated",
      "phase": "spec",
      "status": "open",
      "created_at": "2026-02-23T12:00:00Z"
    }
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `follow_up_id` | string | Task ID assigned by `/create-task` |
| `blocking` | boolean | Whether this blocks the source task |
| `reason` | string | Why the follow-up was created |
| `phase` | string | `spec`, `plan`, or `exec` |
| `status` | string | `open` or `resolved` |
| `created_at` | string | ISO-8601 timestamp |

If the sidecar file does not exist, create it with the `source_task` and an initial `follow_ups` array. If it exists, append to the array.

---

## Blocking Follow-Up Behavior

When a **blocking** follow-up is created:

1. Record it in the sidecar JSON with `blocking: true`
2. Output: **STOP** with message:
   ```
   Blocking follow-up {NEW_ID} created. Current task cannot complete until {NEW_ID} is done.
   ```
3. The pipeline halts the current phase. Ralph continues iterating, but phase detection will keep re-entering the same phase until the blocker is resolved.
4. Deliverable Verification (pipeline-phases.md step 8) will also FAIL if any blocking follow-up has `status: "open"`.

When a **non-blocking** follow-up is created:

1. Record it in the sidecar JSON with `blocking: false`
2. Log: `Non-blocking follow-up {NEW_ID} created for tracking. Continuing current task.`
3. The pipeline continues normally.

---

## Dedup Check

Before creating a follow-up, check if one already exists for the same issue:

1. Read the sidecar JSON at `.specify/sprints/sprint-{N}/follow-ups/{TASK_ID}-follow-ups.json`
2. If any entry in `follow_ups` has a matching `reason` (same dependency + same claim), do NOT create a duplicate
3. This is especially important for plan-session, which should check if spec-session already created a follow-up for the same dependency claim
