# Compliance Check — Output Format & Decision Tree

## Output Template

After running all checks, output:

```markdown
## Compliance Check Results

**Task**: {{TASK_ID}} **Checked At**: {{ISO_TIMESTAMP}}

### Design Compliance

{{#if ui_task}} | Check | Status | Notes | |-------|--------|-------| | Brand
Colors | {{status}} | {{notes}} | | Typography | {{status}} | {{notes}} | |
Components | {{status}} | {{notes}} | | Responsive | {{status}} | {{notes}} | |
Accessibility | {{status}} | {{notes}} | {{else}} N/A - Not a UI task {{/if}}

### Source of Truth

| Check           | Status     | Details            |
| --------------- | ---------- | ------------------ |
| Sprint_plan.csv | {{status}} | {{current_status}} |

### Plan Deliverables

| Check                        | Status     | Details                            |
| ---------------------------- | ---------- | ---------------------------------- |
| Files exist at planned paths | {{status}} | {{verified_count}}/{{total_count}} |
| Attestation covers all files | {{status}} | {{attested_count}}/{{total_count}} |
| No path deviations           | {{status}} | {{deviation_details}}              |

### Context Acknowledgement

| Check                 | Status     | Details                                                               |
| --------------------- | ---------- | --------------------------------------------------------------------- |
| Required              | {{yes_no}} | EVIDENCE:context_ack in CSV Artifacts To Track                        |
| File exists           | {{status}} | .specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json |
| Structure valid       | {{status}} | task_id, files_read, invariants (>=5)                                 |
| No fake hashes        | {{status}} | {{fake_hash_count}} all-zero hashes found                             |
| FILE: prereqs covered | {{status}} | {{covered_count}}/{{total_prereqs}}                                   |

### CSV vs Plan Artifact Tracking

| Check                         | Status     | Details                                 |
| ----------------------------- | ---------- | --------------------------------------- |
| Plan files tracked in CSV     | {{status}} | {{tracked_count}}/{{plan_total}}        |
| Untracked + missing from disk | {{status}} | {{untracked_missing_count}} files       |
| Untracked + exists on disk    | {{status}} | {{untracked_exists_count}} files (WARN) |

### Validation Summary

| Check            | Status     | Details               |
| ---------------- | ---------- | --------------------- |
| Tests            | {{status}} | {{test_results}}      |
| Typecheck        | {{status}} | {{typecheck_results}} |
| Linter           | {{status}} | {{lint_results}}      |
| Validators Build | {{status}} | {{build_results}}     |

### Key Objectives

| Objective       | Status     | Notes     |
| --------------- | ---------- | --------- |
| Code Quality    | {{status}} | {{notes}} |
| Integration     | {{status}} | {{notes}} |
| Security        | {{status}} | {{notes}} |
| Performance     | {{status}} | {{notes}} |
| Availability    | {{status}} | {{notes}} |
| Maintainability | {{status}} | {{notes}} |
| Documentation   | {{status}} | {{notes}} |

### Architecture Compliance

| Layer Modified | Compliant  | Notes     |
| -------------- | ---------- | --------- |
| Domain         | {{status}} | {{notes}} |
| Validators     | {{status}} | {{notes}} |
| Application    | {{status}} | {{notes}} |
| Adapters       | {{status}} | {{notes}} |
| API            | {{status}} | {{notes}} |
| Frontend       | {{status}} | {{notes}} |

### Accessibility Doc Gate

{{#if route_task}} | Check | Status | Details | |-------|--------|---------| |
Applicability | {{status}} | {{route_count}} route(s) detected | | Conformance
Statement Scope | {{status}} | {{scope_details}} | | Conformance Statement
Metrics | {{status}} | {{metrics_details}} | | VPAT Route Count | {{status}} |
{{vpat_details}} | | Document Control (Conformance) | {{status}} |
{{conformance_dc}} | | Document Control (VPAT) | {{status}} | {{vpat_dc}} | |
Route Reconciliation | {{status}} | {{reconciliation_info}} | {{else}} N/A -
Task does not add or modify routes {{/if}}

---

**Overall Verdict**: {{PASS | FAIL | WARN}}

{{#if verdict == 'FAIL'}}

### Blocking Issues

{{#each blocking_issues}}

- {{this}} {{/each}}

**Task CANNOT be marked as Completed until issues are resolved.** {{/if}}

{{#if verdict == 'WARN'}}

### Warnings

{{#each warnings}}

- {{this}} {{/each}}

**Task can be marked Completed, but warnings should be addressed.** {{/if}}
```

## Decision Tree

```
Start Compliance Check
│
├─ Is this a UI task (PG-*, IFC-090, IFC-091, contains "page", "component")?
│   ├─ Yes → Run Design Compliance checks
│   └─ No → Skip Design Compliance
│
├─ Verify plan deliverables (BLOCKING - Section 4)
│   ├─ Parse plan file for ALL "Files to Create/Modify" paths
│   ├─ Verify each file exists at EXACT planned path
│   ├─ Verify attestation artifact_hashes covers ALL files
│   └─ Any missing/deviated → FAIL (do not continue)
│
├─ Verify context_ack.json (BLOCKING - Section 5)
│   ├─ Check if EVIDENCE:context_ack.json in CSV "Artifacts To Track"
│   ├─ If required: verify file exists, structure valid, no fake hashes
│   ├─ Verify FILE: prereqs from CSV are all in files_read[]
│   └─ Missing/invalid when required → FAIL
│
├─ Cross-reference CSV artifacts vs plan (BLOCKING - Section 6)
│   ├─ Extract all plan file paths
│   ├─ Check each against CSV "Artifacts To Track"
│   ├─ Plan file missing from disk AND missing from CSV → FAIL
│   └─ Plan file exists but not in CSV → WARN (add to CSV)
│
├─ Identify affected packages from task artifacts
│   └─ Run focused tests/typecheck/lint on those packages only
│
├─ Check architecture compliance
│   └─ Verify no cross-layer violations
│
├─ Does task plan include new/modified apps/web/src/app/**/page.tsx? (Section 11)
│   ├─ No → Skip Accessibility Doc Gate
│   └─ Yes → Verify conformance statement + VPAT updated
│       ├─ Route in Section 2 scope → Check counts and Document Control
│       └─ Any check FAIL → FAIL (blocking)
│
├─ Aggregate results
│   ├─ All PASS → Verdict: PASS
│   ├─ Any FAIL → Verdict: FAIL
│   └─ Only WARN → Verdict: WARN
│
└─ Output results table
```

## Performance Notes

- **ALWAYS use focused package filters** (`--filter <package>`)
- **NEVER run full `pnpm test`** (takes ~10 minutes)
- Typical focused check: <30 seconds
- Full compliance check: <2 minutes
