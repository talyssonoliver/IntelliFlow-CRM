# Compliance Check — Section 5: Context Acknowledgement Verification (BLOCKING)

**CRITICAL**: If the task's `Artifacts To Track` in Sprint_plan.csv contains
`EVIDENCE:...context_ack.json`, then `context_ack.json` MUST exist and be valid.
This catches tasks that skip the context acknowledgement phase entirely — a gap
that previously allowed PG-150 to be marked complete without this required
evidence file.

**How to validate:**

```
1. Read the task row from Sprint_plan.csv
2. Check if "Artifacts To Track" contains "EVIDENCE:" with "context_ack.json"
3. If NOT found → SKIP (not required for this task)
4. If found:
   a. Determine sprint number from CSV "Target Sprint" column
   b. Check file exists: .specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json
   c. Parse as JSON and validate structure:
      - task_id: must match {{task_id}}
      - files_read: must be non-empty array of {path, sha256} objects
      - invariants_acknowledged: must have >= 5 string entries
      - created_at: must be valid ISO-8601 timestamp
   d. Validate hashes are real:
      - NO sha256 may be all-zeros (0000...0000) — indicates fabricated hash
      - All sha256 must be exactly 64 hex characters
   e. Cross-reference FILE: prerequisites:
      - Parse task's "Pre-requisites" column for FILE: entries
      - Every FILE: prerequisite must appear in files_read[]
      - Report any FILE: prereqs missing from context_ack
```

**Validation reference**: `tools/scripts/lib/context-ack-gatekeeper.ts` contains
the `runContextAckGate()` function with full programmatic validation. The checks
above mirror its logic for manual compliance verification.

| Check                 | Requirement                                           |
| --------------------- | ----------------------------------------------------- |
| File exists           | context_ack.json present at expected attestation path |
| Structure valid       | task_id, files_read[], invariants (>=5), created_at   |
| No fake hashes        | Zero sha256 values that are all-zeros                 |
| Prerequisites covered | All FILE: prereqs from CSV appear in files_read[]     |

**PATH RECONCILIATION** (when file not found at expected path):

If `context_ack.json` is NOT found at
`.specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json`:

1. **Check for prefixed filename**: Look for `{{task_id}}-context_ack.json` in
   the same directory.
   - If found → report: "Wrong filename: found `{{task_id}}-context_ack.json`,
     expected plain `context_ack.json`"
   - **FAIL** — the file must be renamed
2. **Check for wrong sprint path**: Search all sprint directories for
   `context_ack.json` under `attestations/{{task_id}}/`:
   - `find .specify/sprints -path "*{{task_id}}*context_ack*" 2>/dev/null`
   - If found at a different sprint → report: "Sprint path mismatch: file at
     sprint-X but Target Sprint is {N}"
   - **FAIL** — the file or CSV path must be corrected
3. **Check for embedded context_ack**: Read the attestation.json in the same
   directory.
   - If it contains a `context_acknowledgment` block → report: "context_ack
     embedded in attestation.json, not extracted to standalone file"
   - **FAIL** — the block must be extracted to a separate file

This reconciliation prevents the three known failure modes (sprint mismatch,
filename drift, embedded-vs-standalone).

**BLOCKING RULE:**

- context_ack.json missing when required → **FAIL**
- Fake (all-zero) hashes detected → **FAIL**
- Fewer than 5 invariants → **FAIL**
- FILE: prerequisites not covered → **FAIL**
- Wrong filename (prefixed instead of plain) → **FAIL**
- Wrong sprint path → **FAIL**
- Embedded but not extracted → **FAIL**
