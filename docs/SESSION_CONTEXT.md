# Session Context Snapshot
_Generated: 2026-10-30T11:16:36.781Z • Branch: feat/pg-208-task-automation_

> Auto-generated from `apps/project-tracker/docs/metrics/`. **Do not edit by hand** — regenerate with `npx tsx apps/project-tracker/scripts/generate-context.ts`.

## Where We Left Off

Active sprint: **Sprint 0** (sprint-0) — 100% complete (32/32 tasks). 18 task(s) in progress, 0 open blocker(s) across the registry. Registry last updated 4s ago; 626 total tasks across the project.

## Project Health

- **Progress:** 441/626 tasks completed (70.45%) — 167 backlog, 0 blocked, 18 in progress.
- **Focus band:** Sprints 15, 18, 19, 20 carry the earliest remaining backlog.
- **Evidence issues:** 22 attested but CSV not updated; 9 sprint path mismatches.
- _Source: `docs/CURRENT_STATE_REPORT.md` (0s ago) — full sprint-by-sprint breakdown._

## Active Tasks (IN_PROGRESS)

- **[EP-001-AI]** EasyPanel Internal Tools Deployment (Push-based OTLP Pipeline) — started 24d ago, DevOps + Claude Code (STOA-Automation)
  - artifacts: 0 created / 0 missing

## Recently Completed (last 5)

- **IFC-160** — 6mo ago (15m)
- **ANALYTICS-001** — 6mo ago (15m)
- **EXC-SEC-001** — 6mo ago (15m)
- **ENG-OPS-001** — 6mo ago (15m)
- **PM-OPS-001** — 6mo ago (15m)

## Next Up (unblocked)

- **IFC-056** (sprint 18) — Team Upskilling Program
- **IFC-234** (sprint 18) — Settings Pages Wiring - 4 settings pages with hardcoded data and inert buttons. Team: hard
- **PG-206** (sprint 18) — Module Settings - Storage Policies (/documents/(list)/storage-policies)

## Git Activity

- **Branch:** `feat/pg-208-task-automation` (380 dirty file(s))
- **Dirty preview:** `.env.example`, `.specify/sprints/sprint-18/attestations/PG-203/attestation.json`, `.specify/sprints/sprint-18/attestations/PG-203/context_ack.json`, `.specify/sprints/sprint-18/attestations/PG-203/task-tracking.json`, `.specify/sprints/sprint-18/context/PG-203/PG-203-hydrated-context.json` …
- **Last 10 commits:**
  - `c2e62a2f8` chore(tasks): resolve the schedule timezone debt entry now fixed in the pg-208 pr (pg-208) — Talysson Oliveira, 10 hours ago
  - `42127081a` fix(tasks): make a schedule slot claim lose when the schedule was edited after the due read (pg-208) — Talysson Oliveira, 10 hours ago
  - `28e3c906e` fix(tasks): write automation settings under a tenant lock so a re-enable is always stamped (pg-208) — Talysson Oliveira, 10 hours ago
  - `0bde34ef4` chore(tasks): merge main into pg-208 after the cuid record id fix (pg-208) — Talysson Oliveira, 11 hours ago
  - `7ba4ce7e7` fix(ai-worker): accept cuid record ids in job and queue schemas (#1095) — Talysson Oliveira, 11 hours ago
  - `d2b76df75` fix(tasks): keep a scheduled run on the timezone it was admitted under (pg-208) — Talysson Oliveira, 12 hours ago
  - `5d3af99b9` chore(tasks): merge main into pg-208 after ifc-074 and log the paused webhook runs debt (pg-208) — Talysson Oliveira, 12 hours ago
  - `672f986e5` fix(tasks): retry a task create unlinked only when its record link is refused (pg-208) — Talysson Oliveira, 15 hours ago
  - `e90716237` feat(observability): ship ifc-074 api logs to loki, per-datasource evidence and mttd live proxy (#1073) — Talysson Oliveira, 16 hours ago
  - `e6f678441` fix(tasks): stop cross-tenant webhook throttling and align task access in automation (pg-208) — Talysson Oliveira, 17 hours ago

## Key File References

- Sprint plan CSV: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Task registry: `apps/project-tracker/docs/metrics/_global/task-registry.json`
- Active sprint metrics: `apps/project-tracker/docs/metrics/{active_sprint}/`
- This snapshot: `docs/SESSION_CONTEXT.md`
- Full state report: `docs/CURRENT_STATE_REPORT.md` (deep sprint-by-sprint reference)
- Refresh: `npx tsx apps/project-tracker/scripts/generate-context.ts` or POST `/api/context`
