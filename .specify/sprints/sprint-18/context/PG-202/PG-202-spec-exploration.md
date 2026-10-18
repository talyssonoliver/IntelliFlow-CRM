# PG-202 — /spec-exploration (Phase 0.75)

- **When:** the clock read `2026-10-17T14:45:48Z` (`date -u`) just before the six Explore sub-agents were launched in
  parallel; all six had returned by `2026-10-17T15:58:59Z` (the clock read when the owner ruling was recorded; the
  last explorer returned shortly before that).
- **How:** one `subagent_type: Explore` sub-agent per spec agent (read-only). Each read its own area, grepped and
  globbed, and cited file:line. Every agent read well over 2 files (13–37 tool calls each). The verification checklist
  in `.claude/skills/spec-exploration/SKILL.md` passes.

| Agent | Main files read | Headline result |
|---|---|---|
| backend-architect | router.ts, appointment-settings.router.ts, case-types.router.ts, appointments.router.ts, CheckConflicts.ts, ConflictDetector.ts, container.ts | `modules/calendar/` exists (calendar.router.ts); no availability router; `findNextSlot` hardcodes 9-17 (:1152-1153); `create` hardcodes 7-19 via `assertWithinBusinessHours` (:196-197, :333-358); no daily cap anywhere |
| data-engineer | schema.prisma, 6 recent migrations, db/src/index.ts, agent-autonomy-policy.md, timezone-utils (web + api) | no working-hours/closure tables; `AppointmentSettings` holds buffers + `defaultTimezone @default("UTC")`; RLS `DO $$` pattern; new tables are Class A; weekly hours must be local wall-clock + IANA zone |
| frontend-lead | availability stub, calendar layout/shell, calendar-settings/**, sidebar calendar.ts, CalendarSettingsPanel.tsx, case-types UI, TimezoneSelector, TimezoneProvider | route already reachable (sidebar `calendar.ts:15-17` + panel `CalendarSettingsPanel.tsx:23-29`); no date/time picker component — native inputs; reuse PageHeader, shared SectionHeader, TimezoneSelector, EmptyState |
| domain-expert | ConflictDetector.ts, Buffer.ts, CheckConflicts.ts, schema (User/Appointment/Calendar), HolidayCalendar.ts, FLOW-019 | domain hours are whole-hour integers in server-local time with a hardcoded weekend skip (:308-309, :337-338); per-tenant vs per-user ambiguous → owner question |
| test-engineer | case-types tests (router/validator/integration/web), app-router smoke, reconciliation tests, calendar tests, vitest configs, lighthouse playbook | `useTx` $transaction mock; cross-tenant NOT_FOUND shape; a new top-level router bumps ui-flow-mapping + information-architecture counts; no new page.tsx so page counts unchanged; no `process.env.TZ` pinning in repo |
| a11y-expert | switch/label/input/form/select primitives, CaseTypeDialog, ResolutionChecklistEditor, PG-204 a11y reviews, BufferRemindersTab, TimezoneSelector, WCAG/VPAT docs | copy ResolutionChecklistEditor list pattern; error text `text-red-700 dark:text-red-300` (never `text-destructive` / `text-red-600`); WCAG 1.9.0 + VPAT 1.10.0 rows |

## Discrepancies (DoD vs code) found and how they are resolved

- **D1** Buffers + timezone already exist in `AppointmentSettings` (schema.prisma:2389-2395). → Owner Q2 = A: reuse the
  same columns; editing moves to `/calendar/availability`.
- **D2** "Store UTC in DB" cannot hold for recurring weekly hours (DST drift). → Weekly hours stored as minutes-of-day
  + tenant IANA zone; closures as calendar dates; instants stay UTC. Recorded in ADR-081.
- **D3** Three different hard-coded working-hours rules (findNextSlot 9-17, create 7-19, ConflictDetector 9-17
  server-local). → Owner Q3 = B: saved availability replaces them in findNextSlot and at create (create part is
  projects-64 territory; Aurora notified before any change).
- **D4** Per-tenant vs per-user ambiguity. → Owner Q1 = A: firm-wide.
- **D5** DoD boilerplate items with no availability subject: TagsTab via forwardRef, colorToken CHECK, AI defaults
  FALSE. → No tags, colours or AI columns are introduced; each is declared N/A with reason in the spec (same
  treatment PG-204 gave "AI defaults FALSE").
- **D6** `defaultTimezone` default is `UTC` while the system default is `Europe/London` (ADR-044), and the validator
  only checks `min(1)` (appointment-settings.ts:44). → The availability validator checks a real IANA zone; changing
  the column default is out of scope (Class B-ish data semantics), filed as a finding.
- **D7** `appointment_settings` RLS policy has no `WITH CHECK` (20260419200100 migration:30). → Pre-existing; finding
  + issue, not changed here.
- **D8** Stale registry entries `/calendar/new`, `/calendar/[id]` in page-registry.md / ui-flow-mapping.md with no
  page on disk. → Pre-existing; finding.
- **D9** `appointments.router.ts` `findNextSlot` / `checkAvailability` have no web caller. → findNextSlot still gets
  the settings wiring (owner Q3); appointment create is the user-facing consumer.

## Mandatory co-artifacts detected (rule 1/2)

PG-* task replacing a stub page at the same URL (no new page.tsx): PAGE_MAP_AND_FLOWS.md, sitemap.md, page-registry.md
(no entry today — add one), navigation-reachability-audit.md (panel column), complete-dependency-chains.md,
ui-flow-mapping.md + information-architecture.md (router/procedure counts if a router key or procedures are added).
