---
name: exec-gates
description:
  Validates the mandatory completion gates before attestation. Sub-skill of
  /exec Phase 4.5. Every gate is binary — PASS or BLOCK. There is no WARN, SKIP,
  or partial credit.
---

# Exec Gates — Phase 4.5: Completion Gate Verification

**Called by**: `/exec` Phase 4.5 (mandatory, blocking) **Can also run
standalone**: Yes — for re-validation after fixing issues

## Gate Overview

The canonical gate contract lives in:

- `.Codex/skills/exec/references/phase4-completion-gates.md`

This skill must execute that gate contract exactly, including any newer gates
such as:

- Import reachability
- Runtime wiring and replacement verification
- Validation matrix verification
- Scoped coverage and dead-code checks

`references/gate-details.md` and `references/validation-commands.md` are helper
references only. If they conflict with the canonical `/exec` gate file, the
`/exec` gate file wins.

## Summary Display

After all required gates, render the summary format defined by
`.Codex/skills/exec/references/phase4-completion-gates.md`, including any active
runtime-wiring, validation-matrix, scoped-coverage, or task-conditional gates.

## Enforcement Rules (NON-NEGOTIABLE)

- **Rule 1**: No completion without passing all gates. Any BLOCKED gate → status
  stays "In Progress".
- **Rule 2**: All commands MUST be actually executed. FORBIDDEN: simulating
  results, skipping commands, marking gates passed without running them.
- **Rule 3**: Hash verification is mandatory for every artifact.
- **Rule 4**: Plan checkbox completion is required (100%).
- **Rule 5**: Attestation must reflect reality — fabricated attestation =
  critical violation.

## Deferred Work — Follow-Up Task Protocol

"Deferred" is NOT an acceptable completion state.

- **Option A (preferred)**: Complete the work now, re-run validation, then
  complete.
- **Option B (scope reduction)**: If work is genuinely out of scope:
  1. Run the **anti-spam checklist** from
     `full-pipeline/references/follow-up-task-protocol.md`:
     - Search codebase — does the issue actually exist? (False Deferral
       Anti-Pattern check)
     - Search Sprint_plan.csv — is there already a task for this?
     - Is this within current task's scope? If yes, fix it now, don't defer
     - Is the issue real and reproducible?
  2. If checklist passes, invoke `/create-task` for the deferred scope with
     `source_task: {TASK_ID}`, `source_phase: exec`, `blocking: false`
  3. Update current task's Sprint_plan.csv Definition of Done to exclude
     deferred work
  4. Record in follow-ups sidecar JSON at
     `.specify/sprints/sprint-{N}/follow-ups/{TASK_ID}-follow-ups.json` as
     non-blocking
  5. Proceed with completion gates for the reduced scope

## Pre-Completion Checklist

- [ ] Read attestation.json — verify `verdict === "COMPLETE"`
- [ ] Verify `validation_results` has `name` on all 4 items ("TypeScript",
      "Tests", "Lint", "Build")
- [ ] Verify `context_acknowledgment.files_read` uses `sha256` key (not `hash`)
- [ ] Read plan file — count checkboxes, verify 100%
- [ ] Run the validation matrix plus typecheck, test, lint, build as required —
      all exit 0
- [ ] Call validation-summary API — verify `canComplete === true`
- [ ] Only then: update Sprint_plan.csv and task JSON to "Completed"

## Related Skills

- `/exec` — parent skill (calls this at Phase 4.5)
- `/exec-attestation` — Phase 5, runs after all gates pass
- `/compliance-check` — Phase 4 compliance validation
