# Session Context Snapshot
_Generated: 2026-07-17T08:33:38.899Z • Branch: main_

> Auto-generated from `apps/project-tracker/docs/metrics/`. **Do not edit by hand** — regenerate with `npx tsx apps/project-tracker/scripts/generate-context.ts`.

## Where We Left Off

Active sprint: **Sprint 18** (sprint-18) — 81% complete (54/67 tasks). 2 task(s) in progress, 0 open blocker(s) across the registry. Registry last updated 3s ago; 597 total tasks across the project.

## Project Health

- **Progress:** 448/597 tasks completed (75.04%) — 147 backlog, 0 blocked, 2 in progress.
- **Focus band:** Sprints 18, 19, 20, 21 carry the earliest remaining backlog.
- **Evidence issues:** 25 completed without attestation; 5 attested but CSV not updated.
- _Source: `docs/CURRENT_STATE_REPORT.md` (0s ago) — full sprint-by-sprint breakdown._

## Active Tasks (IN_PROGRESS)

- **[IFC-257]** Contact Detail Action Button Wiring. 18 buttons without onClick handlers: Email (1133), Log Call (1139), Log Activity submit (1426), Add Deal (1872), Create Ticket (1917), Upload (1958), Add Note (2007, 2214), View Map (1341), Play Recording (969), Download (1039), Reply/React/Add Note/Share activity actions (1076-1099), toolbar buttons (1410/1415/1420). Zero useMutation calls on entire page (F-04, F-05, F-06, F-23). Need: add logActivity mutation, wire compose/call to existing components, wire action buttons. Audit: docs/audit/contact-detail-wiring-audit.md §11,§16. — started 1mo ago, Frontend Dev (STOA-Quality)
  - artifacts: 1 created / 0 missing
- **[AUTOMATION-003]** Standardize attestation provenance fields (exec-attestation emits; schema declares; exec-preflight gate enforces; orchestrator DoD requires) — started 16d ago, AI Specialist (STOA-Intelligence)
  - artifacts: 11 created / 0 missing

## Recently Completed (last 5)

- **IFC-309** — 16d ago (15m)
- **PG-200** — 17d ago (15m)
- **IFC-234** — 17d ago (120m)
- **PG-058** — 17d ago (15m)
- **IFC-215** — 17d ago (15m)

## Next Up (unblocked)

- **DOC-015** (sprint 18) — Docs Integrity Reconciliation - Regenerate and sync conflicting design-document route tota
- **IFC-211** (sprint 18) — Goal Settings RBAC - Role-based permissions for daily goal management (manager team goals 
- **IFC-212** (sprint 18) — Wire API container to QueueAIService for BullMQ-backed lead scoring

## Git Activity

- **Branch:** `main` (4 dirty file(s))
- **Dirty preview:** `artifacts/reports/current-state-report.json`, `artifacts/reports/spec-tracker.json`, `docs/CURRENT_STATE_REPORT.md`, `.claude/scratchpad/`
- **Last 10 commits:**
  - `778635983` feat(PG-191): task settings module page + tRPC router (#575) — Talysson Da Silva Oliveira, 13 hours ago
  - `9d5cd9528` feat(automation-003): standardize attestation provenance fields (#566) — Talysson Da Silva Oliveira, 2 weeks ago
  - `101830658` chore(orchestrator): encode iteration-2 fleet findings + CSV-flip script (#565) — Talysson Da Silva Oliveira, 2 weeks ago
  - `cc4f29370` chore(sprint-18): mark IFC-309, PG-200 completed after fleet iteration 2 (#564) — Talysson Da Silva Oliveira, 2 weeks ago
  - `15f789404` feat(PG-200): report templates module settings page (#563) — Talysson Da Silva Oliveira, 2 weeks ago
  - `89f8851cd` feat(IFC-309): server-side Terms Acceptance — immutable audit record + tRPC + UI (#562) — Talysson Da Silva Oliveira, 3 weeks ago
  - `7360b207a` feat(ifc-234): wire settings team+integrations pages to real tRPC data (#560) — Talysson Da Silva Oliveira, 3 weeks ago
  - `9359c7e1c` chore(orchestrator): encode 7 fleet findings into dispatch prompt + DoD (#558) — Talysson Da Silva Oliveira, 3 weeks ago
  - `21f44cc50` chore(sprint-18): mark IFC-247, IFC-215, PG-188 completed after fleet merge (#551) — Talysson Da Silva Oliveira, 3 weeks ago
  - `d3905b317` feat(PG-188): billing settings page - org details, tax ID, invoice contact (#547) — Talysson Da Silva Oliveira, 3 weeks ago

## Key File References

- Sprint plan CSV: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Task registry: `apps/project-tracker/docs/metrics/_global/task-registry.json`
- Active sprint metrics: `apps/project-tracker/docs/metrics/{active_sprint}/`
- This snapshot: `docs/SESSION_CONTEXT.md`
- Full state report: `docs/CURRENT_STATE_REPORT.md` (deep sprint-by-sprint reference)
- Refresh: `npx tsx apps/project-tracker/scripts/generate-context.ts` or POST `/api/context`
