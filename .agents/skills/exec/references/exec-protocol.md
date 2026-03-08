# /exec Protocol Rules

## Pre-Execution

- **ALWAYS read the /exec skill instructions thoroughly BEFORE starting any phase**
- Phase 4.6 (Compliance Check) is MANDATORY — invoke `/compliance-check` skill
- All artifacts referenced in Sprint_plan.csv `Artifacts To Track` must exist (including `EVIDENCE:` prefixed paths)

## JSON Validation

- Validate JSON against schemas BEFORE writing — don't create then fix
- ALWAYS run schema validation after writing attestation.json and task-status JSON
- Schemas at `apps/project-tracker/docs/metrics/schemas/` use `additionalProperties: false`

## Hashing

Use `certutil -hashfile <path> SHA256` on Windows (not Get-FileHash).

## Attestation Field Rules

**attestation.json allowed fields:**
- `artifact_hashes`, `dependencies_verified`, `notes`

**NOT allowed:** `files_created`, `files_modified`, `coverage_metrics`, `plan_deliverables`, `completion_gates`, `schedule_metrics`, `completion_status`

**task-status.json validation_results fields:**
- `name`, `command`, `executed_at`, `exit_code`, `duration_ms`, `stdout_hash`, `passed`
- Names: "TypeScript", "Tests", "Lint", "Build"

## Enforcement Rules (NON-NEGOTIABLE)

1. **Commands Must Be Actually Executed** — no simulating, no skipping, no assuming exit 0
2. **All Completion Gates Must Pass** — cannot mark "Completed" when any gate is BLOCKED
3. **Plan Checkboxes Must Be Complete** — update plan file with checked boxes
4. **Attestation Must Be Accurate** — no fabricated results, actual exit codes only
5. **Hash Verification Is Mandatory** — missing file = cannot complete, hash mismatch = cannot complete
6. **No Stub-Only Implementations** — a file/procedure/route that exists but is not used by the runtime does not satisfy the requirement
7. **Legacy Bypass Paths Must Be Closed** — if the task replaces or hardens behavior, the old path must stop handling it
8. **Validation Matrix Is Binding** — every command listed in the plan's `## Validation Matrix` must run and pass
9. **Delivery Claims Must Match Reality** — never present a passing subset as the task's full validation state when another touched suite is failing
