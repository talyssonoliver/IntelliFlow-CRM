# Fix Incomplete Tasks — Verification & Summary

## Step 3: Summary Report

After processing all tasks, display:

```
╔══════════════════════════════════════════════════════════════╗
║  FIX INCOMPLETE TASKS — SUMMARY                             ║
╠══════════════════════════════════════════════════════════════╣
║  Total analyzed:           36                                ║
║  Fully repaired:           28                                ║
║  Code implemented:          5 (had missing implementation)   ║
║  Checkboxes fixed:         42 (were done but unchecked)      ║
║  Attestations created:     30 (were missing)                 ║
║  Validations added:       120 (4 per task × 30)              ║
║  Could not fix:             3 (blocked — see details)        ║
╚══════════════════════════════════════════════════════════════╝
```

For tasks that could not be fixed, log why:
```
BLOCKED tasks:
  IFC-039: Dependencies IFC-037, IFC-038 not completed
  IFC-061: Tests failing — 3 test suites with errors (needs manual review)
  IFC-095: Missing Prisma model — schema change required
```

## Dry Run Mode

When `--dry-run` is specified:

1. Analyze each task (read plan, check files, count checkboxes)
2. Report what WOULD be done, but make NO changes
3. Output a table:

```
DRY RUN RESULTS:
| Task ID   | Steps    | Files    | Attestation | Issues                          |
|-----------|----------|----------|-------------|---------------------------------|
| PG-146    | 50/51    | 10/10   | MISSING     | 1 unchecked step, no attestation |
| PG-141    | 45/45    | 26/27   | MISSING     | 1 missing file, no attestation   |
| IFC-026   | 0/60     | 10/10   | EXISTS      | 60 unchecked steps, 0/4 validations |
```

## Related Skills

- `/exec` — Full task execution protocol (spec → plan → implement → validate → attest)
- `/exec-gates` — Standalone gate verification (7 gates)
- `/exec-attestation` — Attestation creation structure
- `/compliance-check` — Final compliance validation
- `/code-review` — Code quality analysis
