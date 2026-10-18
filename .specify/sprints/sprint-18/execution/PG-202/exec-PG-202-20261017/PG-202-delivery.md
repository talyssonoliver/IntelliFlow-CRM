# Delivery Report: PG-202

**Run ID**: exec-PG-202-20261017
**Date**: 2026-10-18T09:27:09Z (head `188323b41`)
**Task**: PG-202 - Module Settings - Availability (`/calendar/availability`)
**Attestation verdict**: NEEDS_HUMAN (Lighthouse; Class A migration gates 4/7/10-prod)

## Implementation Summary

Firm-wide availability (weekly hours in the firm timezone, all-day closures, default buffers, optional daily cap) replaces
the `/calendar/availability` stub. It is enforced at appointment create and reschedule and in `findNextSlot` for firms that
save it; firms that never save keep the legacy rules (pinned by a characterization test). The design is in the spec,
ADR-081 and the owner ruling (Q1-Q7). The full narrative, behaviour changes and NEEDS_HUMAN list are in `matop/pr-body.md`.

### Files Created (35)

| File | Lines | Purpose |
|---|---|---|
| `apps/api/src/modules/calendar/__tests__/availability-enforcement.test.ts` | +511 | test |
| `apps/api/src/modules/calendar/__tests__/availability.router.test.ts` | +436 | test |
| `apps/api/src/modules/calendar/__tests__/availability.test-utils.ts` | +112 | test |
| `apps/api/src/modules/calendar/availability-enforcement.ts` | +303 | Loader, legacy rule, booking assertion, batched next-slot search |
| `apps/api/src/modules/calendar/availability.router.ts` | +177 | calendar.availability get / update / resetToDefaults |
| `apps/api/src/modules/legal/__tests__/appointments.availability-boundary.test.ts` | +33 | test |
| `apps/api/src/modules/legal/__tests__/appointments.legacy-hours.characterization.test.ts` | +176 | test |
| `apps/api/src/modules/legal/appointment-settings.defaults.ts` | +30 | Shared settings defaults and reset fields |
| `apps/web/src/app/calendar/availability/AvailabilityContent.tsx` | +342 | Availability page (draft, save, reset, conflict, read-only) |
| `apps/web/src/app/calendar/availability/AvailabilityLoading.tsx` | +53 | Skeleton mirroring the bento |
| `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.actions.test.tsx` | +278 | test |
| `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.test.tsx` | +229 | test |
| `apps/web/src/app/calendar/availability/__tests__/AvailabilityLoading.test.tsx` | +25 | test |
| `apps/web/src/app/calendar/availability/__tests__/availability-draft.test.ts` | +314 | test |
| `apps/web/src/app/calendar/availability/__tests__/availability-fixtures.ts` | +45 | test |
| `apps/web/src/app/calendar/availability/__tests__/page.test.tsx` | +20 | test |
| `apps/web/src/app/calendar/availability/availability-draft.ts` | +380 | Draft model, conversions, client validation |
| `apps/web/src/app/calendar/availability/components/AvailabilityBanners.tsx` | +101 | Notes, validation summary, server error banner |
| `apps/web/src/app/calendar/availability/components/BuffersCapCard.tsx` | +144 | Buffers and daily limit |
| `apps/web/src/app/calendar/availability/components/ClosuresList.tsx` | +195 | All-day closures list (forwardRef openCreate) |
| `apps/web/src/app/calendar/availability/components/TimezoneCard.tsx` | +88 | Firm timezone card |
| `apps/web/src/app/calendar/availability/components/WeeklyHoursCard.tsx` | +248 | Weekly hours editor |
| `apps/web/src/app/calendar/availability/components/__tests__/BuffersCapCard.test.tsx` | +103 | test |
| `apps/web/src/app/calendar/availability/components/__tests__/ClosuresList.test.tsx` | +161 | test |
| `apps/web/src/app/calendar/availability/components/__tests__/TimezoneCard.test.tsx` | +151 | test |
| `apps/web/src/app/calendar/availability/components/__tests__/WeeklyHoursCard.test.tsx` | +177 | test |
| `apps/web/src/app/calendar/calendar-settings/components/AvailabilityPointer.tsx` | +17 | Calendar Settings pointer to Availability |
| `packages/db/prisma/migrations/20261017130000_availability/migration.sql` | +90 | Class A migration: availability tables, settings columns, RLS |
| `packages/domain/src/legal/appointments/AvailabilityPolicy.ts` | +491 | Pure availability rules: hours, closures, cap, midnight, DST, candidate generation |
| `packages/domain/src/legal/appointments/__tests__/AvailabilityPolicy.test.ts` | +650 | test |
| `packages/domain/src/legal/appointments/__tests__/availability-roles.test.ts` | +21 | test |
| `packages/domain/src/legal/appointments/availability-roles.ts` | +14 | Admin/manager write roles |
| `packages/validators/src/__tests__/availability.test.ts` | +286 | test |
| `packages/validators/src/availability.ts` | +179 | Zod schemas and the AvailabilityDto |
| `tests/integration/availability.test.ts` | +416 | test |

### Files Modified (39)

| File | Changes | Reason |
|---|---|---|
| `apps/api/src/__tests__/app-router.smoke.test.ts` | +14 / -0 | |
| `apps/api/src/agent/__tests__/approved-action-executor.test.ts` | +37 / -0 | |
| `apps/api/src/modules/calendar/calendar.router.ts` | +4 / -0 | |
| `apps/api/src/modules/legal/__tests__/appointment-settings.router.test.ts` | +31 / -7 | |
| `apps/api/src/modules/legal/__tests__/appointments.router.caller.test.ts` | +305 / -2 | |
| `apps/api/src/modules/legal/__tests__/legal-module-entitlement.test.ts` | +14 / -0 | |
| `apps/api/src/modules/legal/appointment-settings.router.ts` | +16 / -25 | |
| `apps/api/src/modules/legal/appointments.router.ts` | +42 / -57 | |
| `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | +1 / -1 | |
| `apps/project-tracker/docs/metrics/_global/Sprint_plan_I.csv` | +1 / -1 | |
| `apps/web/src/app/appointments/new/__tests__/page.onsuccess.test.tsx` | +23 / -1 | |
| `apps/web/src/app/appointments/new/page.tsx` | +12 / -1 | |
| `apps/web/src/app/calendar/availability/page.tsx` | +14 / -11 | |
| `apps/web/src/app/calendar/calendar-settings/CalendarSettingsContent.tsx` | +17 / -11 | |
| `apps/web/src/app/calendar/calendar-settings/__tests__/BufferRemindersTab.test.tsx` | +86 / -57 | |
| `apps/web/src/app/calendar/calendar-settings/__tests__/CalendarIntegrationTab.test.tsx` | +26 / -21 | |
| `apps/web/src/app/calendar/calendar-settings/__tests__/CalendarSettingsContent.test.tsx` | +60 / -8 | |
| `apps/web/src/app/calendar/calendar-settings/components/BufferRemindersTab.tsx` | +28 / -40 | |
| `apps/web/src/app/calendar/calendar-settings/components/CalendarIntegrationTab.tsx` | +7 / -24 | |
| `apps/web/src/components/appointments/AppointmentDetail.tsx` | +60 / -14 | |
| `apps/web/src/components/appointments/AppointmentForm.tsx` | +65 / -43 | |
| `apps/web/src/components/appointments/__tests__/AppointmentDetail.test.tsx` | +76 / -0 | |
| `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx` | +97 / -0 | |
| `apps/web/src/components/aurora-landing/sections/__tests__/InboxCalendarSection.test.tsx` | +3 / -2 | |
| `apps/web/src/components/settings/ModuleSettingsLayout.tsx` | +7 / -1 | |
| `apps/web/src/components/settings/TimezoneSelector.tsx` | +14 / -9 | |
| `apps/web/src/components/settings/__tests__/ModuleSettingsLayout.test.tsx` | +23 / -1 | |
| `apps/web/src/components/settings/__tests__/TimezoneSelector.test.tsx` | +10 / -0 | |
| `packages/application/src/usecases/scheduling/CheckConflicts.ts` | +58 / -0 | |
| `packages/application/src/usecases/scheduling/__tests__/CheckConflicts.test.ts` | +140 / -1 | |
| `packages/db/prisma/schema.prisma` | +58 / -21 | |
| `packages/db/src/index.ts` | +2 / -0 | |
| `packages/domain/src/index.ts` | +2 / -0 | |
| `packages/domain/src/legal/appointments/Buffer.ts` | +4 / -2 | |
| `packages/ui/__tests__/confirmation-dialog.test.tsx` | +11 / -0 | |
| `packages/ui/src/components/confirmation-dialog.tsx` | +4 / -1 | |
| `packages/validators/src/__tests__/appointment-settings.test.ts` | +12 / -1 | |
| `packages/validators/src/appointment-settings.ts` | +10 / -0 | |
| `packages/validators/src/index.ts` | +1 / -0 | |

Reasons for the modified files are in the plan's Steps 13-17 and the findings doc (F1-F23).

## TDD Log

Every layer went RED before GREEN; logs are in `tdd/` (each records `date -u`, head, command, exit):

- characterization-legacy (GREEN on the legacy code, then kept green after the swap)
- red-domain → green-domain; red-application → green-application; red-validators → green-validators
- red-api-calendar / red-api-wiring → green-api-calendar / green-api-wiring; red-integration → green-integration
- red-web → green-web-availability, green-web-surfaces; red/green-ui-confirmation-dialog
- refactor-rerun (all Step 1-8 commands after the sonar-guard refactor)
- Review-driven pairs: dst-fold, dst-slots, web-allday, application-existing-buffer, web-inflight-save (codex),
  api-nextslot-timezone (STOA-Domain), db-schema-text (/code-review), api-nextslot-batches (codex run 7)

## Acceptance Criteria Validation

The plan's AC traceability table maps AC-001..AC-027 and NF-001..NF-004 to steps; the STOA-Quality re-check opened 6+ ACs
and found real tests for each. Definition-of-done items:

- [x] Availability at /calendar/availability: working hours per weekday, timezone, buffers before/after, max daily bookings, unavailable date ranges (AvailabilityContent + WeeklyHoursCard, TimezoneCard, BuffersCapCard, ClosuresList; calendar.availability router; web 12955 passed)
- [x] TIMEZONE-REFACTOR-AWARE: instants UTC, wall-clock rules in the firm zone (ADR-081) (AvailabilityPolicy toZonedParts/localToUtc, DST fold/gap tests; appointment instants unchanged (UTC))
- [x] Follows docs/planning/module-settings-playbook.md (.specify/sprints/sprint-18/execution/PG-202/exec-PG-202-20261017/matop/design-check-availability.md)
- [x] Enforced at booking (owner Q3 = B): create, reschedule, findNextSlot (appointments.router.ts create/reschedule -> assertAppointmentWithinAvailability; findNextSlot -> findNextSlotWithinAvailability; characterization keeps legacy for unconfigured firms)
- [ ] Lighthouse >= 90 (GATE:lighthouse-gte-90) (NEEDS_HUMAN, artifacts/lighthouse/PG-202/waiver-evidence.md)

## KPIs

| KPI | Target | Actual | Met |
|---|---|---|---|
| Domain new files coverage (AvailabilityPolicy, availability-roles, Buffer) | >= 95% | statements 99.55%, branches 97.41%, functions 100.0%, lines 100.0% | yes |
| Application CheckConflicts.ts (new findFirstFreeCandidate lines) | > 90% | file: statements 91.8%, branches 70.0% (pre-existing legacy branches); the 25 changed lines are 100% covered (diff coverage) | yes |
| Validators new files coverage (availability.ts, appointment-settings.ts) | > 90% | statements 100.0%, branches 97.36% | yes |
| API new files coverage (availability.router, availability-enforcement, calendar.router, settings defaults) | > 90% | statements 97.4%, branches 92.59%, lines 99.29% | yes |
| Web scoped coverage (apps/web thresholds: statements/lines/functions >= 90%, branches >= 80%) | stmts>=90 br>=80 fn>=90 lines>=90 | statements 90.71%, branches 85.02%, functions 84.16%, lines 91.61%. Every new web file is >= 93% functions; the scoped function average is pulled down by pre-existing untested handlers in touched files (AppointmentDetail 41%, appointments/new page 57%, CalendarIntegrationTab 75%, AppointmentForm 78%). Changed web lines are covered by the 96.2% diff coverage | no |
| Diff coverage on changed lines (Sonar new_coverage mirror) | >= 80% | 96.2% (1131/1176) | yes |
| First-load JS vs /cases/case-types (NF-003) | no larger than the reference page | 871.0 KB vs 876.7 KB gzip | yes |
| Lighthouse >= 90 on /calendar/availability (GATE:lighthouse-gte-90, AC-025) | >= 90 all categories | NEEDS_HUMAN: the Path A attempt measured the global error page (no Supabase URL compiled: perf 0.93, a11y 0.90, best-practices 0.93, SEO 0.66), so no score measures this page. An authenticated run needs a non-production Supabase (no LHCI_TEST_* credentials). Owner direction: automate without spending hosted free quota (gh #527) | no |

## Validation Commands (all executed in this session)

| Name | Command | Exit | Detail |
|---|---|---|---|
| TypeScript | `pnpm --filter @intelliflow/domain typecheck && pnpm --filter @intelliflow/application typecheck && pnpm --filt` | 0 | tsc --noEmit for domain, application, validators, api, web (next typegen) and ui |
| Tests | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-202 -- pnpm --dir apps/web exec vitest run` | 0 | web full suite: 12955 passed (12955) |
| Lint | `pnpm --filter @intelliflow/domain lint && pnpm --filter @intelliflow/application lint && pnpm --filter @intell` | 0 | eslint for domain, application, validators, api, web + CI=1 sonar guard over the branch di |
| Build | `pnpm --filter @intelliflow/domain build && pnpm --filter @intelliflow/application build && pnpm --filter @inte` | 0 | domain, application, validators, db, api (tsup) and web (next build --webpack, /calendar/a |

Further gates (codex, /code-review, /sonarqube-fix, knip, architecture, a11y, STOA x4, compliance) are listed with logs in
the attestation's `gate_results` and in `matop/compliance/compliance-report.md`.

## NEEDS_HUMAN

1. Apply migration `20261017130000_availability` to production before the API ships (Class A gates 4, 7, 10-prod).
2. Lighthouse for `/calendar/availability`: needs a non-production Supabase; the owner directs automation without hosted
   quota (gh #527). Evidence: `artifacts/lighthouse/PG-202/waiver-evidence.md`.
