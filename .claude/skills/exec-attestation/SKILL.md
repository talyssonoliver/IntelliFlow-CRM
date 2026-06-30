---
name: exec-attestation
description: Creates the attestation.json evidence file after all completion gates pass. Sub-skill of /exec Phase 5. Only run after /exec-gates returns PASS for all required gates.
---

# Exec Attestation — Phase 5: Create Attestation

**Called by**: `/exec` Phase 5 (mandatory — only after `/exec-gates` passes)
**Can also run standalone**: Yes — to regenerate attestation after fixes

## Prerequisites

- `/exec-gates` must have returned PASS (all required gates passed)
- Validation matrix commands and build commands must have been run with actual results


## Gate 4b Precondition (BLOCKING)

`attestation.json` MUST NOT be written if the most recent Gate 4b run for
this task was BLOCK.

Before writing the attestation, verify Gate 4b passes:

```bash
node tools/scripts/exec-preflight/check-worktree-landed.mjs <TASK_ID> <SPRINT>
```

Gate 4b is BLOCK when any of the following are true:
- The working tree has uncommitted edits (`git status --porcelain` non-empty)
- The branch name does not match `^agent/[A-Z]+-\d+(-.+)?---
name: exec-attestation
description: Creates the attestation.json evidence file after all completion gates pass. Sub-skill of /exec Phase 5. Only run after /exec-gates returns PASS for all required gates.
---

# Exec Attestation — Phase 5: Create Attestation

**Called by**: `/exec` Phase 5 (mandatory — only after `/exec-gates` passes)
**Can also run standalone**: Yes — to regenerate attestation after fixes

## Prerequisites

- `/exec-gates` must have returned PASS (all required gates passed)
- Validation matrix commands and build commands must have been run with actual results


- The branch has zero commits beyond origin/main
- The branch has not been pushed to the remote

If Gate 4b BLOCKs, **do not write attestation.json**. Commit and push the work
first, then re-run Gate 4b and only proceed to attestation when it exits 0.

Rationale: IFC-227, IFC-031, PG-053, and PG-054 were permanently lost because
attestation was written against worktree-only state that was never pushed.
Writing attestation before the branch is on the remote creates the illusion of
completion against state that can be silently discarded.

Gate reference: `.claude/skills/exec/references/phase4-completion-gates.md` Gate 4b.
Recovery: `docs/runbooks/gate-4b-recovery.md`.

## Attestation Location

```
.specify/sprints/sprint-{N}/attestations/<TASK_ID>/attestation.json
```

## Workflow

1. Run the validation matrix plus build commands (typecheck, tests, lint, build as applicable) — capture exit codes and durations
2. Calculate SHA256 hashes for all created/modified artifacts
3. Create `attestation.json` (AND `attestation-latest.json`) with actual results — **including the REQUIRED provenance block** (`spec_session_consensus`, `plan_reviewer_verdict`, `plan_reviewer_agent`, `plan_reviewer_marker`, `spec_path`, `plan_path`; sourced from the real run — see `references/attestation-format.md` → "Provenance Block (REQUIRED)").
4. **MANDATORY: Validate against the schema before proceeding**:
   ```bash
   npx tsx tools/scripts/validate-schemas.ts
   ```
   If this reports errors on your attestation, fix the shape — do NOT proceed. Common failure: `kpi_results`/`gate_results` written as objects instead of arrays (see attestation-format.md "MUST be arrays, NEVER objects" section). 18 historical attestations slipped through because the validator's glob was misconfigured — that's fixed now, so any shape drift WILL be caught.
4b. **MANDATORY: Provenance gate self-check** — the attestation now exists, so run:
   ```bash
   node tools/scripts/exec-preflight/check-attestation-provenance.mjs <TASK_ID>
   ```
   It MUST exit 0. It BLOCKs (exit 1) if the provenance block is missing (on a PG-/IFC- task), non-affirmative, or not cross-validated — it confirms `plan_path` exists on disk and carries the `<!-- plan-reviewer: subagent -->` marker, and that `spec_path` exists. If it BLOCKs, fix the provenance block (or rerun the plan-reviewer) — do NOT finish the task.
5. Verify API returns correct status:
   ```bash
   curl http://localhost:3002/api/tasks/validation-summary/<TASK_ID>
   ```

## Critical Field Rules (Quick Reference)

| Field | Rule |
|-------|------|
| `validation_results[].name` | REQUIRED. Use EXACTLY: "TypeScript", "Tests", "Lint", "Build" |
| `kpi_results` | MUST be an array of `{kpi, target, actual, met}`. NEVER an object dictionary. |
| `gate_results` | MUST be an array of `{gate_id, passed, ...}`. NEVER an object dictionary. |
| `context_acknowledgment.files_read[].sha256` | Use `sha256` key (NOT `hash`). Real 64-char hex. |
| `verdict` | Must be `"COMPLETE"` to allow task completion |
| `artifact_hashes` | Use this (NOT `files_created` or `files_modified`) |
| `nav_wiring_confirmed` | REQUIRED `true` when `artifact_hashes` contains any `apps/web/src/app/**/page.tsx`. Verified at exec time by Gate 12 (`check-nav-wiring.mjs`). Guard 5 — PG-180 lesson. |
| `lighthouse_waiver_approved_by` | REQUIRED when a Lighthouse KPI has `met: false` AND the sprint already has another such waiver. Value is the human name/email accepting the risk. Verified by Gate 13 (`check-lighthouse-waiver.mjs`). Guard 4 — PG-180/PG-189 precedent chain. |
| provenance block (`spec_session_consensus`, `plan_reviewer_verdict`, `plan_reviewer_agent`, `plan_reviewer_marker`, `spec_path`, `plan_path`) | REQUIRED. `plan_reviewer_verdict` is an enum (`APPROVED`\|`APPROVED_WITH_CHANGES`\|`REJECTED`). `spec_path`/`plan_path` MUST be repo-relative. Verified post-write by `check-attestation-provenance.mjs` (AUTOMATION-003) which cross-checks the `plan_path` file for the `<!-- plan-reviewer: subagent -->` marker. |

## Forbidden marketing phrases

Do NOT write `"runtime-ready"`, `"every new code path has a real production caller"`, or `"route is reachable"` in the `notes` field unless the attestation also includes either:

- `nav_wiring_confirmed: true` (for route-creating tasks), OR
- a concrete sidebar config path + line number in the same `notes` block.

These phrases were used by PG-180 to make an unreachable page look reachable. Guard 6 — PG-180 lesson, 2026-04-20.

**See references/attestation-format.md** for the full JSON template, all field rules, forbidden fields, and verdict value table.

## Why This Is Required

The validation-summary API reads `validation_results` from this file to display:
- typecheck status (pass/fail/pending)
- tests status (pass/fail/pending)
- lint status (pass/fail/pending)
- build status (pass/fail/pending)

Without `attestation.json`, the UI shows all validations as "pending" even if they passed.

## Related Skills

- `/exec-gates` — must pass before running this
- `/exec-metrics` — records task JSON alongside this
- `/exec` — parent skill
