# MATOP: Evidence Format & Output Structure

## Output Directory Layout

### When called via `/exec` (Recommended)

```
.specify/<TASK_ID>/execution/<RUN_ID>/matop/
├── gate-selection.json       # Gates selected for execution
├── gates/                    # Gate execution logs
│   ├── turbo-typecheck.log
│   ├── turbo-build.log
│   └── ...
├── stoa-verdicts/            # STOA verdict files
│   ├── Foundation.json
│   ├── Security.json
│   └── ...
├── waivers.json              # Waiver records
├── evidence-hashes.txt       # SHA256 hashes
└── summary.json              # Machine-readable summary
```

The delivery report (`<TASK_ID>-delivery.md`) is in the parent `execution/<RUN_ID>/` folder.

### When called standalone

```
artifacts/reports/system-audit/<RUN_ID>/
├── gate-selection.json
├── gates/
├── stoa-verdicts/
├── summary.json
└── summary.md
```

**Note**: Use `/exec` for full implementation + validation. Use `/matop-execute` standalone for re-validation only (when code already exists).

## Coverage Metrics in Summary

Every MATOP summary MUST include before/after coverage:

```json
{
  "coverage_metrics": {
    "package": "apps/ai-worker",
    "threshold": 80,
    "before": {
      "file_count": 34,
      "lines": { "pct": 48.00, "covered": 1200, "total": 2500 },
      "captured_at": "2026-01-27T19:00:00.000Z"
    },
    "after": {
      "file_count": 35,
      "lines": { "pct": 48.32, "covered": 1240, "total": 2566 },
      "captured_at": "2026-01-27T19:30:00.000Z"
    },
    "delta": {
      "lines": "+0.32%",
      "improved": true
    }
  }
}
```

## Evidence Bundle Requirements (from Automation STOA)

Every MATOP run MUST produce:

- `summary.json` with resolved canonical paths
- `evidence-hashes.txt` with SHA256 for all artifacts
- `gate-selection.json` with execute/waiverRequired/skipped
- `stoa-verdicts/<STOA>.json` for each signing STOA

## Configuration Files

The MATOP orchestrator uses:

- `audit-matrix.yml` — Gate definitions and thresholds
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` — Task source of truth
- `tools/scripts/lib/stoa/` — STOA library implementation
- `apps/project-tracker/app/api/tasks/validation-summary/[taskId]/route.ts` — Task-to-package mapping

## Consequences of Invalid Validation

1. **UI shows incorrect status** — Task appears incomplete in dashboard
2. **Sprint metrics invalid** — Progress tracking is incorrect
3. **Attestation rejected** — Compliance audit fails
4. **Human review triggered** — Task flagged for manual inspection

The system is designed to catch invalid validations. Agents cannot bypass these checks.
