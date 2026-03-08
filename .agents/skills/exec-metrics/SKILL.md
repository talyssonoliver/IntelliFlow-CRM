---
name: exec-metrics
description: Records mandatory task metrics at session start and end. Sub-skill of /exec called at Phase 0 (session start) and Phase 6+ (session end). Enables the project-tracker dashboard to display accurate task analytics.
---

# Exec Metrics — Session Start/End Metrics Recording

**Called by**: `/exec` at session start (Phase 0) and session end (Phase 6+)
**Can also run standalone**: Yes — to record/fix metrics after the fact

## Task JSON Location

```
apps/project-tracker/docs/metrics/sprint-{N}/phase-*/TASK-ID.json
```

## Session Start — Quick Reference

Fields to update when starting:
1. `started_at` — ISO 8601 timestamp
2. `status` — "In Progress"
3. `status_history` — add entry with timestamp and note
4. `execution.started_at` — timestamp when implementation begins
5. `execution.executor` — "Codex /exec"
6. `execution.agents` — list of STOAs selected

## Session End — Quick Reference

Fields to record when finishing:
1. `completed_at` — ISO 8601 timestamp
2. `actual_duration_minutes` — calculated from started_at
3. `status` — "Completed", "Failed", or "Needs Human"
4. `status_history` — add final entry
5. `execution.completed_at`, `execution.duration_minutes`, `execution.last_error`
6. `artifacts.created` — all files with SHA256 hashes
7. `artifacts.missing` — any expected artifacts not created
8. `validations` — all 4 commands with results
9. `kpis` — all KPIs with target vs actual

**See references/metrics-format.md** for complete JSON examples (start update, success end, failed end), SHA256 hash commands, and display formats.

## SHA256 Hash Calculation

```bash
# Windows
certutil -hashfile path/to/file.ts SHA256

# Linux/Mac
sha256sum path/to/file.ts | cut -d' ' -f1
```

## Why This Is Required

Complete metrics enable the project-tracker dashboard to display accurate task analytics. Without metrics, the dashboard shows no data for completed tasks.

## Related Skills

- `/exec` — parent skill
- `/exec-attestation` — creates attestation.json (separate from task JSON)
- `/exec-gates` — gates must pass before end metrics are recorded as "Completed"
