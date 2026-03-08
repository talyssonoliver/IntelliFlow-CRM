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

## Attestation Location

```
.specify/sprints/sprint-{N}/attestations/<TASK_ID>/attestation.json
```

## Workflow

1. Run the validation matrix plus build commands (typecheck, tests, lint, build as applicable) — capture exit codes and durations
2. Calculate SHA256 hashes for all created/modified artifacts
3. Create `attestation.json` with actual results
4. Verify API returns correct status:
   ```bash
   curl http://localhost:3002/api/tasks/validation-summary/<TASK_ID>
   ```

## Critical Field Rules (Quick Reference)

| Field | Rule |
|-------|------|
| `validation_results[].name` | REQUIRED. Use EXACTLY: "TypeScript", "Tests", "Lint", "Build" |
| `context_acknowledgment.files_read[].sha256` | Use `sha256` key (NOT `hash`). Real 64-char hex. |
| `verdict` | Must be `"COMPLETE"` to allow task completion |
| `artifact_hashes` | Use this (NOT `files_created` or `files_modified`) |

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
