# Pipeline Phases — Detailed Instructions

## Pipeline Flow (Full)

**CRITICAL**: Each invocation runs the FULL pipeline — all remaining phases in sequence. Do NOT stop after one phase. Only stop if a phase FAILS.

```
TASK_ID = $ARGUMENTS (first word only)
SPRINT_NUMBER = look up from Sprint_plan.csv

SPEC_PATH = .specify/sprints/sprint-{SPRINT_NUMBER}/specifications/{TASK_ID}-spec.md
PLAN_PATH = .specify/sprints/sprint-{SPRINT_NUMBER}/planning/{TASK_ID}-plan.md
DELIVERY_PATH = .specify/sprints/sprint-{SPRINT_NUMBER}/execution/{TASK_ID}/
ATTESTATION_PATH = .specify/sprints/sprint-{SPRINT_NUMBER}/attestations/{TASK_ID}/attestation.json

1. Read Sprint_plan.csv to find TASK_ID's sprint number and current status
2. Check which artifacts exist using Glob tool

IF status is "Completed" or "DONE":
   → Run DELIVERABLE VERIFICATION (see below) before outputting promise
   → If verification PASSES → Output: <promise>PIPELINE COMPLETE</promise> → STOP
   → If verification FAILS → Set status back to "In Progress", fall through to Phase 3

THEN run ALL remaining phases sequentially (do NOT stop between phases):

IF SPEC_PATH does NOT exist:
   → PHASE 1: Run /spec-session
   → On SUCCESS: continue immediately to Phase 2
   → On FAILURE: STOP (let Ralph retry the full pipeline)

IF PLAN_PATH does NOT exist:
   → PHASE 2: Run /plan-session
   → On SUCCESS: continue immediately to Phase 3
   → On FAILURE: STOP (let Ralph retry the full pipeline)

IF status is NOT "Completed":
   → PHASE 3: Run /exec
   → On SUCCESS: continue immediately to Deliverable Verification
   → On FAILURE: STOP (let Ralph retry the full pipeline)

After all phases succeed:
   → Run DELIVERABLE VERIFICATION
   → If PASSES → Output: <promise>PIPELINE COMPLETE</promise> → STOP
   → If FAILS → Set status back to "In Progress", re-run /exec
```

---

## Deliverable Verification (MANDATORY before promise output)

**NEVER output the completion promise without running this check first.**

Even if spec, plan, delivery, and attestation all exist, verify:

```
1. Parse PLAN_PATH for ALL "Files to Create:" and "Files to Modify:" paths
2. For EACH path, verify the file EXISTS on disk at that EXACT location
3. Count verified files — must equal plan's stated total
4. Check CSV "Artifacts To Track" column:
   - Every ARTIFACT: path must exist on disk
   - Every EVIDENCE: path must exist on disk
5. Check attestation.json exists and has verdict "COMPLETE"
6. Check context_ack.json exists (if listed in CSV artifacts)
7. PRD/ADR Governance check:
   - Read spec's "## Related Documents" section
   - For each PRD/ADR path listed (not N/A): verify file exists on disk
   - If task is PG-* or IFC-* with UI and no PRD exists → FAIL
   - If task introduces architecture/infrastructure and no ADR exists → FAIL

8. Check for unresolved blocking follow-ups:
   - Read `.specify/sprints/sprint-{N}/follow-ups/{TASK_ID}-follow-ups.json` if it exists
   - If any entry has `blocking: true` and `status: "open"` → FAIL
   - Message: "Blocking follow-up {FOLLOW_UP_ID} is still open"

IF any file is missing → FAIL (do not output promise)
IF file count < plan total → FAIL
IF any ARTIFACT/EVIDENCE from CSV is missing → FAIL
IF required PRD/ADR is missing → FAIL
IF blocking follow-up is open → FAIL
```

**Why this exists**: A previous exec session may have created all components but
missed a deliverable (e.g., file at wrong path, evidence file not created,
attestation hash omissions). Static checks (typecheck, tests) pass but the
deliverable tracker shows incomplete. Without this verification, the loop
exits prematurely with a false completion promise.

---

## Phase 1: Specification

1. Invoke the `/spec-session` skill with TASK_ID: use the Skill tool with `skill: "spec-session", args: "{TASK_ID}"`
2. Follow ALL spec-session instructions (context hydration, agent selection, STOA consensus)
3. On SUCCESS: **continue immediately to Phase 2** — do NOT stop
4. On FAILURE (STOA rejection, missing deps): fix the issue and STOP — Ralph will retry the full pipeline

**Success indicator**: `{TASK_ID}-spec.md` exists and CSV status is "Spec Complete"

---

## Phase 2: Planning

1. Invoke the `/plan-session` skill with TASK_ID: use the Skill tool with `skill: "plan-session", args: "{TASK_ID}"`
2. Follow ALL plan-session instructions (TDD decomposition, plan review, hexagonal layer order)
3. On SUCCESS: **continue immediately to Phase 3** — do NOT stop
4. On FAILURE (plan reviewer rejects): revise the plan and STOP — Ralph will retry the full pipeline

**Success indicator**: `{TASK_ID}-plan.md` exists and CSV status is "Plan Complete"

---

## Phase 3: Execution

1. Invoke the `/exec` skill with TASK_ID: use the Skill tool with `skill: "exec", args: "{TASK_ID}"`
2. Follow ALL exec instructions (TDD implementation, MATOP validation, compliance check)
3. On SUCCESS (PASS verdict): **continue immediately to Deliverable Verification** — do NOT stop
4. On FAILURE (MATOP fails or compliance check fails):
   - Read failure details from STOA verdicts
   - Fix the issues identified
   - STOP — Ralph will retry the full pipeline (re-runs /exec which re-validates)

**Success indicator**: CSV status is "Completed" and delivery report exists

---

## Phase 4: Completion

When all three phases are complete:
1. Verify final state: spec exists, plan exists, delivery exists, CSV status is "Completed"
2. Run **Deliverable Verification** (see above) — check ALL plan files exist at exact paths
3. Verify ALL CSV `Artifacts To Track` entries exist on disk (both ARTIFACT: and EVIDENCE: prefixed)
4. ONLY if ALL checks pass → Output exactly: `<promise>PIPELINE COMPLETE</promise>`
5. If ANY check fails → Do NOT output promise. Set status to "In Progress" and re-run /exec

---

## Error Recovery Table

Each invocation runs the full pipeline. Ralph retries the entire pipeline on failure:

| Failure | What Happens | Recovery |
|---------|--------------|----------|
| Spec STOA rejection | Spec file not created or marked invalid | Pipeline stops. Next Ralph iteration retries from spec |
| Plan review rejection | Plan file not created | Pipeline stops. Next iteration resumes from plan (spec already exists) |
| Exec test failures | Status stays "In Progress" | Pipeline stops. Next iteration resumes from exec (spec+plan exist) |
| Exec MATOP FAIL | Status set to "Failed" | Pipeline stops. Next iteration resumes from exec |
| Compliance check FAIL | Status stays "In Progress" | Pipeline stops. Next iteration resumes from exec |
| Blocking follow-up open | Cannot complete | Fix blocking task first, then re-run pipeline |
| Out-of-scope bug found | Follow-up created | Non-blocking: pipeline continues. Blocking: pipeline pauses |
| Max iterations hit | Ralph stops | Human reviews partial progress, runs manually |

---

## Resumability

If Ralph is cancelled mid-pipeline or hits max-iterations:
- All completed phases are preserved (spec, plan, partial implementation)
- Re-running `/full-pipeline TASK_ID` resumes from where it left off
- No work is lost — artifacts on disk determine the phase

---

## Iteration Budget Details

Since each iteration now runs the full pipeline (not just one phase), fewer iterations are needed. Each Ralph iteration = one full spec→plan→exec attempt:

| Task Type | Expected full-pipeline runs | Recommended --max-iterations |
|-----------|----------------------------|------------------------------|
| Simple page (404, legal) | 1-2 | 3 |
| Settings page (CRUD form) | 1-3 | 5 |
| CRM page (list+detail) | 2-5 | 7 |
| Complex feature (AI, workflow) | 3-7 | 10 |

---

## Important Notes

1. **Full pipeline per invocation** — Run ALL remaining phases (spec → plan → exec) in one invocation. Only stop on phase failure.
2. **Trust the state machine** — Always detect phase from artifacts, never assume. Resume from the first missing artifact.
3. **Stop on failure only** — If a phase fails, STOP the pipeline. Ralph will retry from the failed phase (earlier phases' artifacts are preserved).
4. **Skill invocation** — Use the Skill tool to invoke /spec-session, /plan-session, /exec
5. **No shortcuts** — Each phase must fully complete before advancing to the next
6. **Failed status** — If CSV shows "Failed", exec will attempt remediation
7. **NEVER output promise without verification** — Even if CSV says "Completed" and delivery exists, ALWAYS run Deliverable Verification first. A previous session may have left incomplete artifacts (missing evidence files, files at wrong paths, attestation hash omissions). False promises break the loop prematurely.
8. **Do NOT manually set CSV to "Completed"** — Only /exec Phase 5 should set this status after all gates pass. If you find a "Backlog" task with existing delivery artifacts, re-run /exec to properly validate.
