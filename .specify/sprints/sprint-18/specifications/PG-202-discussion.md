# PG-202 — Spec Session Discussion Log

Task: PG-202 — Module Settings - Availability (`/calendar/availability`). Sprint 18. Persona: frontend-lead.
Session lead: PG-202 lane (Claude Code, Opus 5.5). Started 2026-10-17T14:43:24Z (CSV → Specifying).

Owner ruling + coordinator clearance: `.specify/sprints/sprint-18/context/PG-202/PG-202-owner-ruling.md`.
Exploration record: `.specify/sprints/sprint-18/context/PG-202/PG-202-spec-exploration.md`.

---

## Phase 0.75 — Exploration findings (6 Explore agents, 2026-10-17 14:45Z–15:58Z)

### backend-architect
- `apps/api/src/router.ts`: `caseTypes` :153, `appointmentSettings` :154, `calendar: calendarRouter` :238,
  `calendarWebhooks` :241. `apps/api/src/modules/calendar/` exists: `calendar.router.ts` (136 lines, list/create/
  update/delete on plain `tenantProcedure`), `calendar-webhook.router.ts`, `calendar-webhook.service.ts`, `__tests__/`.
- `apps/api/src/modules/legal/appointment-settings.router.ts` (61 lines): plain `tenantProcedure`, no role check, not
  LEGAL-gated (shared with core Calendar, comment :4-8). `DEFAULT_APPOINTMENT_SETTINGS` :10-20 (buffers 0, timezone
  'UTC'). `get` lazy-creates :27-38; `update` upserts and spreads input :40-50; `resetToDefaults` :52-60. No
  `$transaction` (single-row writes).
- Validator `packages/validators/src/appointment-settings.ts`: shape :35-45, buffers 0-240, `defaultTimezone:
  z.string().min(1)` (:44, not IANA-validated); `superRefine(durationConsistency)` :3-33; partial update :49-51.
- PG-204 `case-types.router.ts`: `moduleTenantProcedure('LEGAL')` :30/:34 (do NOT copy — calendar is core);
  `assertCaseTypeAdmin` :90-96 + `canEdit` :184; `prismaCode()` + P2002→CONFLICT :98-112; `$transaction` callback form
  :233/:262/:312/:349; `writeChecklist` deleteMany+createMany in tx, no skipDuplicates :135-151; ownership via
  `findFirst({id, tenantId})` :114-121 or `updateMany/deleteMany` count===0 → NOT_FOUND :269-276/:318-323;
  `assertTenantContext(ctx)` :161; header :6-9 says `prismaWithTenant` does NOT inject tenantId — pass explicitly.
- `appointments.router.ts`: `checkAvailabilitySchema` :151-156, `findNextSlotSchema` :158-165 (local, not in
  validators); `checkAvailability` :1108-1133; `findNextSlot` :1141-1177 hardcodes `workingHoursStart: 9,
  workingHoursEnd: 17` :1152-1153. No web caller of either (grep apps/web: none).
- `CheckConflicts.ts`: `FindNextSlotInput` :49-59 (whole-hour ints, no tz/weekday map); findNextSlot :190-242.
- `ConflictDetector.ts`: `checkAvailability` :223-290 pure gap-finding; `findNextAvailableSlot` :295-376 defaults 9/17
  :308-309, server-local `setHours/getDay` :317-372, weekend skip `getDay()===0||6` :337-338; buffer added to
  duration :313.
- Create: `appointments.router.ts:509` `create` calls `assertWithinBusinessHours(start, end, input.timezone)` :513;
  helper :333-358 with `BUSINESS_HOURS_START = 7`, `BUSINESS_HOURS_END = 19` :196-197, `getLocalHour` :316 (Intl,
  tz-aware); then `scheduleAppointmentUseCase.execute` :521. Reschedule via `rescheduleAppointmentUseCase` :789.
  No daily booking limit anywhere.
- `container.ts`: `CheckConflictsUseCase` imported :86, built :640 with only the appointment repository, exported :808.

### data-engineer
- Schema: Tenant reverse relations `@ignore` (caseTypes :189, appointmentSettings :190). `User.timezone String?
  @default("Europe/London")` :482. Appointment :2083-2139 (`timezone String?` :2089, buffers :2096-2097, `organizerId`
  no FK :2123). CaseType :2343-2364 (`@@unique([tenantId, id])` :2361). AppointmentSettings :2383-2402 (`tenantId
  @unique`, buffers :2389-2390, `defaultTimezone @default("UTC")` :2395) — no `@@unique([tenantId, id])`.
  AgentAvailability :4364-4383 (support-agent presence, unrelated). No working-hours/holiday/blackout/@db.Time models.
- Newest migration `20261016120100_agent_actions_pending_sweep_idx`; `20261017130000` sorts after it.
- PG-204 migration layout: header with Class A bullets + forward-only recovery plan (1-21); named CHECKs; Prisma vs
  SQL-only indexes; composite FK; RLS block `ENABLE ROW LEVEL SECURITY` + `DO $$ BEGIN CREATE POLICY …
  USING/WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)) EXCEPTION WHEN duplicate_object …`.
- `packages/db/src/index.ts` export-type allowlist :23-101; `AppointmentSettings` :99.
- Autonomy policy Class A :36-72 (10 gates :52-63). New tables with no data copied = Class A; ADD COLUMN nullable =
  metadata-only.
- Times of day elsewhere: `ReportSchedule.timeOfDay String?` :4777, `NotificationPreference.quietHoursStart/End` "HH:MM"
  :5346-5347 with `quietHoursDays Int[]` 0=Sunday :5349 — unchecked strings. Recommend integer minutes + CHECKs.
- `appointment_settings` RLS (20260419200100 :30) has no `WITH CHECK`.

### frontend-lead
- Stub `availability/page.tsx:1-16`. `calendar/layout.tsx` server layout; `_layout-shell.tsx` :26 `isCalendarSettingsPage`
  → settings sidebar mode :28-35; content padding :63-64.
- Sidebar `configs/calendar.ts:5-19` already lists availability; `isCalendarSettingsPage` :21-28. Panel
  `CalendarSettingsPanel.tsx:23-29` ("Working hours & booking rules"). No nav change needed.
- `calendar-settings/CalendarSettingsContent.tsx` uses deprecated `ModuleSettingsLayout` (:7-10, :195-205); dirty/save
  pattern `mapSettings` :24, `normalize` :54, `isDirty` :108-111, onSuccess refresh :81-95. `BufferRemindersTab`
  edits buffers (:36-70) + reminder; `CalendarIntegrationTab` edits timezone (:13, :37) + primary calendar + sync.
- PG-204 UI: page shell `case-types/page.tsx:9-19` (Suspense + Loading); `CaseTypesContent.tsx` imports :12-17,
  auth gate :38-39, error state :123-133, PageHeader :141-150, `<output aria-live>` :152-154, read-only note
  :156-160, bento `grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5` :162, cards `lg:col-span-8`/`4 p-4 sm:p-5`,
  SectionHeader `headingLevel={2}` + `<Button size="sm">` action :164-183. Loading :7-31.
- EmptyState usage `<EmptyState entity="rules" phase="passive" size="sm" className="py-4 px-3 gap-2" />`
  (TerritoryList :270, CaseTypeList :130-134). Entities include `appointments`, `rules`.
- `useTimezoneContext()` (`TimezoneProvider.tsx:31-56, :106-108`): timezone, browserTimezone, timezoneAbbr,
  timezoneLabel, formatDate/Time/DateTime/DateShort/ISODate/TimeRange. Mounted globally (`providers.tsx:359`).
- `TimezoneSelector.tsx:117` props {value,onChange,disabled,id,invalid,describedBy} — REUSE.
- No date/time picker components; native `<Input type="time">` / `type="date"` is the codebase pattern
  (QuietHoursScheduler :120-161 incl. weekday toggles with aria-pressed).
- Registries: sitemap.md:203, PAGE_MAP_AND_FLOWS.md:226 exist; page-registry.md has NO entry; reachability audit :232
  (panel column `--` though panel links); ui-flow-mapping `/calendar/*` :331-333, :715; WCAG statement :51.
- Stale: `/calendar/new`, `/calendar/[id]` listed (page-registry :1152-1173, ui-flow-mapping :332-333) but not on disk.
- `InboxCalendarSection.test.tsx:47-51` comment says availability is a stub (negative assertion still passes).

### domain-expert
- Domain folder `legal/appointments/` has no WorkingHours/Availability VO. `Buffer` VO 0-240 (:42-64). `TimeSlot.withBuffer`
  :117-124. Events list has no availability event.
- `ScheduleAppointment.ts:107-112` conflicts only; `forceOverrideConflicts` :51.
- `HolidayCalendar.ts` (deadlines) firm-level, in-memory, court-deadline use only.
- FLOW-019 :35-49 mentions participant availability / non-existent `availability-checker.service.ts`.
- docs: sitemap :203 "Working hours, time zones, booking windows"; PAGE_MAP :226.

### test-engineer
- API test pattern (`case-types.router.test.ts`): `prismaMock` deep mock (`test/setup.ts:110`); `useTx` :57-77;
  callers via `createAdminContext()` / `createTestContext()` (USER) / `createManagerContext()`; cross-tenant
  NOT_FOUND :245-252; smuggled tenantId :191; `prismaError(code)` :79-85.
- Validator pattern `valid(overrides)` + `issues()` + `it.each` (case-types.test.ts :17-80).
- Integration `tests/integration/case-types.test.ts`: `describeDb` gate :87-92, per-run prefix :94-100,
  `ensureMigrationSql()` :67-85 (CI uses db push), RLS check skips without `authenticated` role :405-425.
- Web pattern (`CaseTypesContent.test.tsx`): jsdom pragma, `vi.hoisted`, `vi.mock('@/lib/trpc')`, axe-core.
- Smoke test block per router (`app-router.smoke.test.ts:177-186`). Sub-router under `calendar` adds no top-level key.
- Router-count tests: `ui-flow-mapping-reconciliation.test.ts:44-93` ↔ `docs/design/ui-flow-mapping.md:5-6`
  ("69 (403 procedures)"); `ia-reconciliation.test.ts:45-69` ↔ `information-architecture.md:4`. Page counts (214)
  unchanged because the page exists.
- `legal-module-entitlement.test.ts:33-44`: appointment + appointment-settings stay on plain tenantProcedure; do not
  add availability to LEGAL_ROUTERS.
- Clock pinning: `vi.useFakeTimers(); vi.setSystemTime(NOW)` (cases.router.case-types.test.ts:21, :72-78); no
  `process.env.TZ` pinning in repo → pass explicit IANA zones.
- Web test script is watch mode → `pnpm --filter @intelliflow/web exec vitest run <path>`.
- Lighthouse: Path A measures error/login page on authenticated routes; PG-204/PG-201 left it NEEDS_HUMAN.

### a11y-expert
- Primitives: Switch needs external name; Input adds no aria; FormMessage/FormLabel use `text-destructive` (fails).
- Copy `ResolutionChecklistEditor.tsx` list pattern (fieldset/legend :98-99, `<output aria-live>` :104-106, row
  aria-labels with position :110/:124, per-row error ids :111/:130, 44px icon buttons :137/:166, aria-disabled at limit
  :189, focus after add :70 / remove :80 in useEffect :47-56).
- Error text `text-red-700 dark:text-red-300` (PG-204 F1); never `text-destructive` or `text-red-600`.
- EmptyState interactive variant has tabIndex=0 + h3 (empty-state.tsx:400-409, :425) — check heading order.
- BufferRemindersTab gaps: no describedby/help/error; null-for-number bug :21.
- Governance: WCAG statement 1.9.0 row, VPAT 1.10.0 row.

---

## Owner ruling (2026-10-17T15:58:59Z) and Aurora clearance (2026-10-17T16:00:24Z)

See `PG-202-owner-ruling.md`. Summary: Q1 firm-wide; Q2 reuse AppointmentSettings buffers + timezone, editing moves to
Availability; Q3 enforce in findNextSlot + appointments create/reschedule (Aurora cleared option (a) with 5
boundaries); Q4 all-day closures + optional reason. No saved availability → legacy behaviour per path.
ADR-081 drafted (`docs/architecture/adr/ADR-081-tenant-availability.md`, Proposed).

---

## Round 1 — ANALYSIS (6 agents: pg202-backend-architect, -data-engineer, -frontend-lead, -domain-expert, -test-engineer, -a11y-expert; spawned 2026-10-17T16:01Z, all returned by 2026-10-17T16:06:02Z)

### backend-architect
- Sub-router `calendar.availability` (calendar at router.ts:238) — no new top-level key; the procedure count still
  changes, so the ui-flow-mapping / IA reconciliation tests must be re-run.
- Procedures: `get` (no lazy-create of availability rows; returns weeklyHours, closures, maxDailyBookings, buffers,
  timezone, canEdit, isConfigured), `update` (one $transaction: replace hours + closures, upsert settings fields),
  `resetToDefaults` (back to legacy, not seeding 9-17 rows).
- RBAC: roles via trpc.ts:287 (isAdmin), :416 (['ADMIN','MANAGER']); recommends admin/manager writes.
- Reschedule `:783` calls `assertWithinBusinessHours(newStart, newEnd)` at :787 with NO timezone (UTC). Caller census:
  helper defined :333, called :513 and :787 only; constants :196-197. Web `AppointmentForm.tsx:119-137` duplicates 7-19.
- Concerns: cap statuses (enum schema.prisma:2181-2188); cap query uses appointments indexes [tenantId] and
  [startTime, endTime] (:2129-2135); cap race (check-then-insert, :521) is best-effort unless locked;
  forceOverrideConflicts (:538, :796) is conflict-only; findNextSlot via filter-and-retry bounded by maxDaysAhead;
  invalid IANA zone → RangeError → 500.

### data-engineer
- `appointment_settings` + `maxDailyBookings INTEGER NULL CHECK (NULL OR 1..500)` + `availabilityConfiguredAt
  TIMESTAMP(3) NULL` (distinguishes never-configured from closed-every-day; not a Boolean toggle).
- `availability_hours` (id, tenantId, weekday SMALLINT 0=Sun, startMinute, endMinute, createdAt; CHECKs weekday 0-6,
  start >= 0, end <= 1440, start < end; UNIQUE(tenantId, weekday, startMinute); index (tenantId, weekday)).
- `availability_closures` (id, tenantId, startDate DATE, endDate DATE, reason VARCHAR(200); CHECK end >= start, reason
  NULL or non-blank; UNIQUE(tenantId, startDate, endDate); index (tenantId, startDate)).
- FK to tenants ON DELETE CASCADE (not to appointment_settings: lazy row, no composite unique). RLS DO $$ block with
  WITH CHECK. Prisma `AvailabilityHour`, `AvailabilityClosure`; db barrel next to :99. Class A (new tables + nullable
  no-default columns, metadata-only). Zod caps: 6 ranges/day, 200 closures, closure ≤ 366 days.
- btree_gist exists (20260530000000_appointment_no_overlap_exclusion:20) but db push ignores EXCLUDE (:8-11) → Zod
  overlap rejection + DB uniques/CHECKs; integration test calls ensureMigrationSql().
- appointment-settings `update` spreads input → must not accept the new fields; availability gets its own router.

### frontend-lead
- PageHeader (Dashboard / Calendar / Availability) + 12-col bento: Weekly hours 8 / Timezone 4 / Buffers + cap 4 /
  Closures 8; Card p-4 sm:p-5; SectionHeader headingLevel 2; AvailabilityLoading mirrors the bento; Suspense shell.
- Closures EmptyState `entity="appointments" phase="passive" size="sm"`; "Add Closure" `<Button size="sm">` in header.
- Hours are firm-zone wall-clock minutes: never converted; show a note when the viewer zone ≠ firm zone; closure dates
  are YYYY-MM-DD strings, not instants (no context formatDate on them).
- calendar-settings: remove the buffer inputs (keep the reminder), replace the timezone select with a read-only value +
  link; stop sending buffer/timezone in the save payload (stale-overwrite risk, update spreads input).
- forwardRef: `ClosuresList` forwardRef handle `{ openCreate }` called from the header button = honest equivalent of
  "TagsTab via forwardRef". Bundle: @intelliflow/ui + existing shared components + native inputs only.

### domain-expert
- The legacy check tests start hour and end hour independently, never the dates (:333-358): 18:00 → 08:00 next day
  passes.
- Rules: fit inside ONE merged range of the firm-local start day (touching ranges merged); end on the same local day
  (or exactly 24:00 when a range ends at 1440); closures test local start and end dates; cap tenant-wide per
  firm-local start day counting SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED (exclude CANCELLED, NO_SHOW); reschedule
  excludes itself; NULL = unlimited; buffers do not count toward hours; firm zone only (input.timezone ignored by the
  rule); forceOverrideConflicts does NOT bypass availability.
- Pure `packages/domain/src/legal/appointments/AvailabilityPolicy.ts` returning violation codes (OUTSIDE_HOURS,
  CLOSED_DATE, DAILY_CAP_REACHED, SPANS_MIDNIGHT); the API helper loads data + maps to TRPCError; findNextSlot reuses
  it. `CAP_COUNTED_STATUSES` derived from APPOINTMENT_STATUSES (AppointmentEvents.ts:7-14). No domain event.

### test-engineer
- No existing test asserts the 7-19 rejection (the message appears only in the router). Caller test `now=2026-04-14`
  (Tue) :80; reschedule block :315-410; findNextSlot :666-712. calendar-settings tests that change:
  BufferRemindersTab.test.tsx:16-17,41,62,69; CalendarIntegrationTab.test.tsx:40,152-153,173;
  CalendarSettingsContent.test.tsx:96-101.
- New: availability-enforcement.test.ts, availability.router.test.ts, validators availability.test.ts, appointments
  caller additions (create/reschedule blocked; cross-tenant: tenant A Mon-Fri 09-12, tenant B unconfigured → Sat 15:00
  allowed), tests/integration/availability.test.ts (CHECKs, RLS), AvailabilityContent.test.tsx (axe).
- DST: London 2026-03-29 / 2026-10-25, New York 2026-03-08 / 2026-11-01; explicit IANA zones; pin the clock per call.
- Deep-mock Prisma returns undefined → the helper must treat it as legacy (and test it).

### a11y-expert
- Each weekday a fieldset with a full-day legend; Switch "Monday open" + describedby summary; ranges as a list with
  positional names ("Monday range 1 start"); Remove/Add names; aria-invalid + describedby errors in
  text-red-700/dark:text-red-300; focus first invalid on failed save; one live region for add/remove; Timezone Label +
  TimezoneSelector id; number inputs with help text and an explicit "no limit" for the cap; closures labelled per row;
  stable Save label; calendar-settings link text "Manage working hours, buffers and timezone in Availability"; axe zero
  violations (default/error/empty/read-only); no hideOnMobile on Save (page-header.tsx:153); 44px targets.

## Lead resolutions after Round 1 (input to Round 2)

- **Q5 owner ruling (2026-10-17):** writes ADMIN + MANAGER only (FORBIDDEN otherwise); reads any tenant user; read-only
  UI for others.
- **Save model:** ONE page-level draft (hours + timezone + buffers + cap + closures) saved by one `update` in one
  $transaction. Rationale: one consistent write, no half-saved state, no extra procedures. The closures list keeps a
  forwardRef `openCreate` handle for the header "Add Closure" button (adds a draft row).
- **Unconfigured draft:** when `availabilityConfiguredAt` is NULL the UI prefills the legacy effective rule
  (07:00-19:00 every day), so a first save that only adds a closure does not silently close the firm.
- **Legacy path** (unconfigured tenant) stays identical to today: create uses 07-19 with `input.timezone`, reschedule
  07-19 in UTC, findNextSlot 9-17 weekdays (Aurora boundary 4). The cross-midnight gap is fixed only in the configured
  path; the legacy gap is recorded as a finding.
- **appointmentSettings router:** the update schema stops accepting buffers + timezone (Zod strips unknown keys);
  `resetToDefaults` stops resetting them. The calendar-settings UI stops editing/sending them.
- **No new appointments index** (populated table; Class A forbids a blocking index) — the cap query uses the existing
  indexes; finding filed.
- **Cap race:** best-effort, documented in ADR-081 and the spec.

## Round 2 — PROPOSAL (same 6 agents; requested 2026-10-17T16:06:37Z, all written by 2026-10-17T16:08:59Z; verbatim)

<details><summary>backend-architect</summary>

# PG-202 Round 2 PROPOSAL: backend-architect

Verified inputs: discussion R1 + lead resolutions (:130-218), case-types.router.ts, case-type-defaults.ts, territory-constants.ts:273, appointments.router.ts (:333-358, :509-540, :783-798, :1141-1177), appointment-settings.router.ts, packages/validators/src/appointment-settings.ts, security/tenant-context.ts, trpc.ts:287/:416.

## 1. availability.router.ts (apps/api/src/modules/calendar/availability.router.ts)

Registered inside calendarRouter (calendar.router.ts:16): `availability: availabilityRouter`. router.ts:238 unchanged.

Imports follow case-types.router.ts:30-31: `createTRPCRouter`, plain `tenantProcedure` from '../../trpc' (NOT moduleTenantProcedure; calendar is core, legal-module-entitlement.test.ts:33-44), `assertTenantContext` from '../../security/tenant-context'.

### RBAC helper
Pattern copied from case-types.router.ts:90-96 (`assertCaseTypeAdmin` + `isCaseTypeAdminRole`).
- Do NOT reuse `isCaseTypeAdminRole` directly (case-type-named; and CASE_TYPE_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES = ['ADMIN','MANAGER','OWNER','SUPER_ADMIN'], territory-constants.ts:273, wider than the owner's Q5 "ADMIN + MANAGER").
- OWNER/SUPER_ADMIN are documented forward-compatible strings (case-type-defaults.ts:36-38) and are not in ROLE_HIERARCHY (tenant-context.ts:51-56), so no current user has them. Recommendation: add `AVAILABILITY_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES` + `isAvailabilityAdminRole()` in the domain AvailabilityPolicy module (same shape as case-type-defaults.ts:40-46) so there is still one role list and the name is honest. Same effective set as case types today. If the owner wants strictly ADMIN+MANAGER, use `['ADMIN','MANAGER'] as const` instead (trpc.ts:416 precedent). Flag for lead: confirm which; default = reuse ACCOUNT_OWNER_ADMIN_ROLES.
- Note: after adding a domain export, `pnpm --filter @intelliflow/domain build` is required (packages/domain/CLAUDE.md "Stale Dist Fix").
- Local `assertAvailabilityAdmin(ctx)` throws `FORBIDDEN` 'Only administrators and managers can change availability.'

### Procedures
All start with `assertTenantContext(ctx); const tenantId = ctx.tenant.tenantId;` (case-types.router.ts:220,222). Every query passes tenantId explicitly (header note: prismaWithTenant does not inject it; case-types.router.ts:116 pattern `findFirst({where:{id, tenantId}})`).

- `get` (tenantProcedure.query, any role): reads in parallel `appointmentSettings.findUnique({where:{tenantId}})`, `availabilityHour.findMany({where:{tenantId}, orderBy:[{weekday:'asc'},{startMinute:'asc'}]})`, `availabilityClosure.findMany({where:{tenantId}, orderBy:{startDate:'asc'}})`. NO lazy create of settings or availability rows (differs from appointment-settings.router.ts:33-37 which lazy-creates; availability must keep "unconfigured" detectable). If settings row is absent use DEFAULT values (buffers 0, tz 'UTC', cap null) without writing. Returns `AvailabilityDto` (below), `canEdit: isAvailabilityAdminRole(ctx.user?.role)` (case-types.router.ts:184).
- `update` (mutation): `assertAvailabilityAdmin`; input `updateAvailabilitySchema` (Zod already rejects overlaps, caps 6 ranges/day, 200 closures, closure <= 366 days, IANA tz via Intl). One `$transaction(async tx => ...)` (case-types.router.ts:233,262 callback form):
  1. `tx.availabilityHour.deleteMany({where:{tenantId}})`; `createMany` if non-empty, NO skipDuplicates (writeChecklist, :141-150).
  2. same for `availabilityClosure`.
  3. `tx.appointmentSettings.upsert({where:{tenantId}, create:{tenantId, ...DEFAULT_APPOINTMENT_SETTINGS-equivalent, defaultBufferBeforeMinutes, defaultBufferAfterMinutes, defaultTimezone, maxDailyBookings, availabilityConfiguredAt: now}, update:{same fields, availabilityConfiguredAt: now}})`. availabilityConfiguredAt is set on every save (a saved all-closed week is "configured"; unconfigured means NULL).
  4. return the fresh DTO via a shared `readAvailability(tx|prisma, tenantId)` function (also used by `get`).
  Note on DEFAULT_APPOINTMENT_SETTINGS: it is a private const in appointment-settings.router.ts:10-20. Export it (or move to a shared `appointment-settings.defaults.ts`) so the create branch of the upsert supplies the NOT NULL columns (durations, reminder). Minimal change: add `export` to the const; avoids a second copy of defaults.
  P2002 -> CONFLICT: copy `prismaCode()` (:98-101). The UNIQUE(tenantId, weekday, startMinute) and UNIQUE(tenantId, startDate, endDate) can only trip if Zod overlap check is bypassed or two admins save concurrently between delete and insert; map to CONFLICT 'Availability was changed by someone else. Reload and try again.' Wrap the whole $transaction in try/catch, rethrow non-P2002 (rethrowNameConflict shape, :104-112). Two concurrent saves: the second's deleteMany blocks on row locks only for existing rows; unique violation on the insert is the real signal, so P2002 -> CONFLICT is genuinely reachable.
- `resetToDefaults` (mutation): admin-gated; $transaction: deleteMany hours + closures (tenantId), then if a settings row exists `updateMany({where:{tenantId}, data:{maxDailyBookings:null, availabilityConfiguredAt:null}})` (updateMany avoids creating a row, and count 0 is fine). Does NOT touch buffers/timezone/durations/reminder/primaryCalendar (they are single-source columns that other pages edit; the lead resolution says reset only own fields). Hmm: buffers+timezone are edited on Availability now, so reset on this page should return them to defaults too: set defaultBufferBeforeMinutes:0, defaultBufferAfterMinutes:0, defaultTimezone:'UTC' in the same updateMany. Proposed: reset sets those three plus the two availability columns. Returns the DTO (unconfigured state). Result: tenant is back to legacy behaviour.

### DTO (packages/validators/src/availability.ts, mirrored in router return types explicitly, no casts; memory: TS2589 explicit contracts)
```ts
AvailabilityRangeDto  { startMinute: number; endMinute: number }          // local minutes, 0..1440
AvailabilityDayDto    { weekday: 0|1|2|3|4|5|6; ranges: AvailabilityRangeDto[] }  // 0 = Sunday; empty = closed
AvailabilityClosureDto{ id: string; startDate: string; endDate: string; reason: string | null } // 'YYYY-MM-DD', inclusive
AvailabilityDto {
  isConfigured: boolean;               // availabilityConfiguredAt != null
  timezone: string;                    // IANA
  days: AvailabilityDayDto[];          // always 7 entries, Sun..Sat
  bufferBeforeMinutes: number;         // 0..240
  bufferAfterMinutes: number;          // 0..240
  maxDailyBookings: number | null;     // 1..500, null = no limit
  closures: AvailabilityClosureDto[];
  canEdit: boolean;
}
UpdateAvailabilityInput = Omit<AvailabilityDto,'isConfigured'|'canEdit'|'closures'> & { closures: Omit<AvailabilityClosureDto,'id'>[] }
```
Rows -> DTO: `days` is built by grouping the flat rows into 7 buckets.

## 2. availability-enforcement.ts (apps/api/src/modules/calendar/availability-enforcement.ts)

Loads data + maps policy violations to TRPCError. Pure rules live in domain `AvailabilityPolicy.ts` (domain-expert R1 :179-181); this file imports the policy and does I/O only. No new container.ts wiring: helper takes the Prisma client as argument like the router does with ctx.prismaWithTenant (check: appointments.router.ts already uses `ctx.prismaWithTenant` at :549,:807; container.ts is only touched for use-cases, none added). Verify at implementation: no container.ts / context.ts change needed.

```ts
export type TenantAvailability =
  | { configured: false }
  | { configured: true; timezone: string; days: AvailabilityDayDto[]; closures: {startDate:string;endDate:string}[]; maxDailyBookings: number | null };

export async function loadTenantAvailability(prisma: AvailabilityPrisma, tenantId: string): Promise<TenantAvailability>
// 1 settings findUnique({where:{tenantId}, select:{availabilityConfiguredAt, defaultTimezone, maxDailyBookings}}).
// Returns {configured:false} when row missing, availabilityConfiguredAt null, OR the result is not an object
// (deep-mock prisma returns undefined, test-engineer R1 :192). Only when configured: findMany hours + closures (explicit tenantId).

export async function assertAppointmentWithinAvailability(
  prisma: AvailabilityPrisma,
  args: { tenantId: string; start: Date; end: Date; legacyTimezone?: string; excludeAppointmentId?: string }
): Promise<void>
```
Behaviour:
1. `const a = await loadTenantAvailability(...)`.
2. `!a.configured` -> `assertLegacyBusinessHours(start, end, legacyTimezone)`: the current 7-19 logic MOVED verbatim out of appointments.router.ts:316-358 (getLocalHour + assertWithinBusinessHours + constants :196-197), same message text. Legacy path stays byte-identical (Aurora boundary 4). create passes `input.timezone`, reschedule passes undefined (UTC) = identical to today.
3. configured -> `evaluateAvailability(policyInput)` (domain, pure) for hours/closures/midnight; if it passes and `maxDailyBookings != null`, count: `prisma.appointment.count({where:{tenantId, startTime:{gte: dayStartUtc, lt: dayEndUtc}, status:{in: CAP_COUNTED_STATUSES}, ...(excludeAppointmentId ? {id:{not: excludeAppointmentId}}:{})}})` where dayStartUtc/dayEndUtc are the UTC instants of firm-local midnight of start's local day and the next local day (computed in the domain helper with Intl, DST-safe: 23/25h days). Then policy `capReached(count, max)`.
4. Violation -> `TRPCError({code:'BAD_REQUEST', message})`: OUTSIDE_HOURS 'Appointments must fit inside the firm's working hours for that day.'; CLOSED_DATE 'The firm is closed on that date.' (include reason? omit: reason is admin free text, still tenant-scoped, but keep message static; revisit with security-lead); SPANS_MIDNIGHT 'Appointments cannot run past midnight.'; DAILY_CAP_REACHED 'The daily booking limit for that day has been reached.' Messages are the stable contract the UI/tests assert on.
5. Invalid stored tz: `isValidIanaTimeZone` guard in the loader; if invalid, throw INTERNAL_SERVER_ERROR? Better: treat as unconfigured-with-log? A silent legacy fallback contradicts "never silently open". Proposal: Zod validates on write, DB values should be valid; defensive catch of RangeError -> TRPCError PRECONDITION_FAILED 'Firm timezone setting is invalid. An administrator must fix it in Availability.'
6. `forceOverrideConflicts` is never read here (domain-expert :177-178).

Cap race: best-effort (lead resolution :218). No lock.

Query cost: one settings read per booking always; when configured +2 small reads (<= ~42 hour rows, <= 200 closures) and, only if cap set, one indexed count using existing [tenantId] (schema.prisma:2129) + [startTime,endTime]; planner picks one. Could run the 3 reads with Promise.all.

## 3. appointments.router.ts swap (only these hunks)

- Add import: `import { assertAppointmentWithinAvailability, loadTenantAvailability, ... } from '../calendar/availability-enforcement';`
- create :512-513:
```diff
-    // Reject appointments outside business hours (07:00 – 19:00).
-    assertWithinBusinessHours(input.startTime, input.endTime, input.timezone);
+    // Firm availability (hours, closures, daily cap); unconfigured tenants keep 07:00-19:00.
+    await assertAppointmentWithinAvailability(ctx.prismaWithTenant, {
+      tenantId: ctx.user.tenantId,
+      start: input.startTime,
+      end: input.endTime,
+      legacyTimezone: input.timezone,
+    });
```
- reschedule :786-787:
```diff
-    assertWithinBusinessHours(input.newStartTime, input.newEndTime);
+    await assertAppointmentWithinAvailability(ctx.prismaWithTenant, {
+      tenantId: ctx.user.tenantId,
+      start: input.newStartTime,
+      end: input.newEndTime,
+      excludeAppointmentId: input.id,
+    });
```
  Note both tenant source: existing code uses `ctx.user.tenantId` for the use cases (:531, :791); keep that, do not mix with `ctx.tenant.tenantId`.
  Cross-tenant guard on reschedule: `input.id` in the cap exclude is only an exclusion on a count already tenant-filtered, so a foreign id leaks nothing.
- Remove `getLocalHour`, `assertWithinBusinessHours`, `BUSINESS_HOURS_*` (:196-197, :316-358) from the router (census: no other API callers). They move into availability-enforcement.ts as the legacy branch (private). Keep the router `tenantProcedure` shadow (:307) untouched.
- NOT touched: attendeeIds/linkedCaseIds/clientId/assignedTo (:517-538), use-case ids, cases.router.ts.
- Doc comment :1139 and the reschedule comment :786 updated.
- Web AppointmentForm.tsx:119-137 client-side 7-19 pre-check: out of backend scope; flag to frontend-lead. For configured tenants it would wrongly block 06:00 slots if hours are wider; and wrongly allow narrower ones (server catches). Recommend frontend drops the client check or reads `calendar.availability.get`.

Order matter: the availability check runs before `assertLegalEntitlement` (:517) as the legacy check did; unchanged order.

## 4. findNextSlot (appointments.router.ts:1141-1177)

Domain loop (ConflictDetector.findNextAvailableSlot, per discussion :34-35) only supports whole-hour start/end and server-local weekday skipping; not rewritten.
- Load `availability = await loadTenantAvailability(ctx.prismaWithTenant, tenantId)` first.
- Unconfigured: today's call, unchanged (9/17, weekends skipped).
- Configured: filter-and-retry.
```ts
let cursor = input.startFrom; const horizon = addDays(input.startFrom, input.maxDaysAhead);
for (attempt < MAX_ATTEMPTS /* 50 */ && cursor < horizon) {
  const r = await container.checkConflictsUseCase.findNextSlot({ ...same, startFrom: cursor, maxDaysAhead: remainingDays, workingHoursStart: minOpenHour, workingHoursEnd: maxCloseHour });
  if (failure) throw map...; slot = r.value.slot; if (!slot) return {slot:null,...};
  const verdict = evaluateSlotAgainstAvailability(availability, slot, countFor(slot day));  // domain pure + one count per candidate day (cache per local date)
  if (verdict.ok) return slot;
  cursor = verdict.nextCandidateFrom;   // policy returns the start of the next local open range/day (or slot.end) so progress is guaranteed
}
return { slot: null, searchDurationMs };
```
  `minOpenHour/maxCloseHour` = floor(min startMinute/60)/ceil(max endMinute/60) across open days (0/24 clamp, no open days -> return null immediately). Guarantee of progress: `nextCandidateFrom` must be strictly > cursor; assert in code, break otherwise. Attempts bounded (50) and the call result documents `slot:null` when exhausted. Weekend skipping in the domain (ConflictDetector.ts:337-338) can hide a configured Saturday: known limitation for v1 (domain not rewritten); record as a finding and in ADR-081, or add an optional `skipWeekends` flag to FindNextSlotInput (CheckConflicts.ts:49-59) defaulting true. Proposal: add that optional input field, pass false when configured, one-line domain change, backward compatible. Needs domain-expert agreement (touches the domain, not Aurora-forbidden). Also server-local `getDay/setHours` (ConflictDetector.ts:317-372) are not firm-timezone aware; filter-and-retry corrects results, never widens them.
  Buffers: when `input.bufferMinutesBefore/After` are omitted, fall back to the tenant defaults? Currently the router passes the input as is (:1150-1151); keep, do not add scope.
  Runtime consumer note: no web caller of findNextSlot today (discussion :29-30); it is tested via the router caller only.

## 5. appointmentSettings router + validator

- packages/validators/src/appointment-settings.ts: split `appointmentSettingsShape` so `updateAppointmentSettingsSchema` is built from `.omit({ defaultBufferBeforeMinutes:true, defaultBufferAfterMinutes:true, defaultTimezone:true })`, then `.partial().superRefine(durationConsistency)`. Zod object default strips unknown keys (lead resolution :214), so an old client sending them is silently ignored instead of 400 (compat for stale tabs). Keep `appointmentSettingsSchema` (full shape) exported for DTO/get typing; add `UpdateAppointmentSettingsInput` re-derived. Rebuild validators (`pnpm --filter @intelliflow/validators build`, validators/CLAUDE.md).
- appointment-settings.router.ts:
  - `update` (:40-50): unchanged code, but because input no longer carries the three columns, `update: input` cannot overwrite them. `create:` branch still spreads DEFAULT_APPOINTMENT_SETTINGS (:46) so first-row creation sets buffers 0/UTC: acceptable.
  - `resetToDefaults` (:52-60): build `RESET_FIELDS` = DEFAULT minus the three columns; `update: { ...RESET_FIELDS, primaryCalendarId: null }`. Create branch keeps full defaults.
  - `get` unchanged: still returns buffers/timezone (the calendar-settings UI and other readers).
- Stale reader/writer census to do at implementation: grep web for `appointmentSettings.update`/`defaultTimezone` callers (calendar-settings tab components per frontend R1) and the BufferRemindersTab/CalendarIntegrationTab tests listed by test-engineer (:185-187).

## 6. Files

Create:
- apps/api/src/modules/calendar/availability.router.ts: get/update/resetToDefaults.
- apps/api/src/modules/calendar/availability-enforcement.ts: loader + assertion + moved legacy check.
- packages/validators/src/availability.ts (+ barrel export): schemas/DTO types/limits; derive limits from domain constants.
- packages/domain/src/legal/appointments/AvailabilityPolicy.ts (+ barrel): pure rules, `AVAILABILITY_LIMITS`, `CAP_COUNTED_STATUSES`, role constant/helper (domain-expert owns the rules; backend consumes).
- Tests (test-engineer owns): availability-enforcement.test.ts, availability.router.test.ts, validators availability.test.ts, integration availability.test.ts.
Modify:
- apps/api/src/modules/calendar/calendar.router.ts: add `availability: availabilityRouter` (+ import) inside createTRPCRouter({...}) at :16.
- apps/api/src/modules/legal/appointments.router.ts: two call swaps, import, remove legacy helper/constants, findNextSlot filter-and-retry, comments.
- apps/api/src/modules/legal/appointment-settings.router.ts: reset fields; export DEFAULT_APPOINTMENT_SETTINGS (or relocate).
- packages/validators/src/appointment-settings.ts: update schema omits the 3 columns. packages/validators/src/index.ts barrel.
- packages/domain/src/legal/appointments/CheckConflicts.ts (FindNextSlotInput optional `skipWeekends`) and ConflictDetector.ts: only if domain-expert/lead approve.
- docs: ui-flow-mapping.md:5-6 and information-architecture.md:4 procedure counts + their reconciliation tests (re-run), app-router.smoke.test.ts:177-186 (add `calendar.availability` block).
- db (data-engineer): schema.prisma, migration, db barrel (db/src/index.ts near :99).
No change: router.ts, container.ts, context.ts (verify with a grep at implement time per apps/api/CLAUDE.md "Container Wiring": nothing new is instantiated; the helper receives prisma as an argument).

## 7. Runtime Consumer (anti-orphan)

- `calendar.availability.get` / `update` / `resetToDefaults`: called by the new AvailabilityContent page (apps/web/src/app/calendar/availability, frontend-lead) via tRPC client; `get` also by the calendar-settings link text if it shows a summary.
- `assertAppointmentWithinAvailability`: called by appointments.create and appointments.reschedule (the web AppointmentForm/Reschedule dialogs and any API client). Retires: private `assertWithinBusinessHours` and `BUSINESS_HOURS_*` in appointments.router.ts (legacy branch preserved inside the helper for unconfigured tenants only).
- `loadTenantAvailability` + policy filter: called by appointments.findNextSlot. Retires the hard-coded 9/17 for configured tenants only.
- `AppointmentSettings.defaultBufferBefore/After/defaultTimezone`: single source; read by availability.get/update; no longer written by appointmentSettings.update/reset.
- Producer/consumer check for `availabilityConfiguredAt`: written by availability.update, cleared by resetToDefaults, read only by loadTenantAvailability and availability.get.isConfigured.

## 8. Risks / open items for the lead
1. Role set: ACCOUNT_OWNER_ADMIN_ROLES (includes OWNER, SUPER_ADMIN) vs literal ADMIN+MANAGER. Default proposed: reuse the shared constant under a new availability-named helper.
2. DEFAULT_APPOINTMENT_SETTINGS export/relocation (needed by upsert create branch).
3. findNextSlot weekend skip lives in domain (ConflictDetector.ts:337-338): optional `skipWeekends` input vs documented limitation.
4. Closure `reason` is not echoed in booking errors (static messages).
5. Invalid stored timezone -> PRECONDITION_FAILED rather than silent legacy fallback.
6. Cap is best-effort under concurrency; reschedule into the same day as itself excludes itself.
7. The `ctx.prismaWithTenant` type in the helper: define a structural `AvailabilityPrisma = Pick<PrismaClient,'appointmentSettings'|'availabilityHour'|'availabilityClosure'|'appointment'>` so tx and client both fit and tests can pass a mock.

</details>

<details><summary>data-engineer</summary>

# PG-202 Round 2 PROPOSAL — data-engineer

Sources copied from: `packages/db/prisma/migrations/20261013120000_case_types/migration.sql` (header, NOT VALID/VALIDATE, RLS DO-block),
`packages/db/prisma/schema.prisma:2343-2364` (CaseType model style), `:189-190` (Tenant @ignore relations),
`tests/integration/case-types.test.ts:67-85` (ensureMigrationSql), `docs/operations/agent-autonomy-policy.md:36-72` (gates).

## 1. Migration `packages/db/prisma/migrations/20261017130000_availability/migration.sql`

```sql
-- PG-202: tenant availability — weekly working hours, all-day closures and a daily booking cap (ADR-081).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * appointment_settings: two NULLABLE columns with no default -> metadata-only on PG 11+, no table
--     rewrite, no backfill, no existing row changes. "availabilityConfiguredAt" NULL = never configured
--     = legacy booking rules; the application reads NULL as "unchanged behaviour".
--   * appointment_settings CHECK on "maxDailyBookings" is added NOT VALID then validated. Every existing
--     row holds NULL (a CHECK passes on NULL), so the validating scan cannot fail and is short.
--   * Two NEW tables with their own constraints, indexes, FKs and RLS policies. No data is copied.
--   * No new index on a populated table (appointments is untouched; the daily-cap count uses its
--     existing indexes).
--
-- Recovery plan: forward-only. Operational rollback = clear "availabilityConfiguredAt" (the
-- availability.resetToDefaults procedure) and every booking path returns to its legacy rule with the
-- new tables left in place. A down-migration (DROP CONSTRAINT, DROP COLUMN x2, DROP TABLE x2) is
-- Class C — human-only, never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow.

-- ── appointment_settings: cap + configured marker ──────────────────────────
ALTER TABLE "appointment_settings" ADD COLUMN     "maxDailyBookings" INTEGER;
ALTER TABLE "appointment_settings" ADD COLUMN     "availabilityConfiguredAt" TIMESTAMP(3);

ALTER TABLE "appointment_settings" ADD CONSTRAINT "appointment_settings_maxDailyBookings_check"
    CHECK ("maxDailyBookings" IS NULL OR "maxDailyBookings" BETWEEN 1 AND 500) NOT VALID;
ALTER TABLE "appointment_settings" VALIDATE CONSTRAINT "appointment_settings_maxDailyBookings_check";

-- ── availability_hours ─────────────────────────────────────────────────────
-- Local wall-clock minutes-of-day in appointment_settings."defaultTimezone"; weekday 0 = Sunday.
CREATE TABLE "availability_hours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "startMinute" SMALLINT NOT NULL,
    "endMinute" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "availability_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "availability_hours_startMinute_check" CHECK ("startMinute" >= 0),
    CONSTRAINT "availability_hours_endMinute_check" CHECK ("endMinute" <= 1440),
    CONSTRAINT "availability_hours_range_check" CHECK ("startMinute" < "endMinute")
);

-- ── availability_closures ──────────────────────────────────────────────────
-- All-day, inclusive calendar dates in the firm timezone (DATE, never an instant).
CREATE TABLE "availability_closures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_closures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "availability_closures_range_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "availability_closures_reason_check" CHECK ("reason" IS NULL OR btrim("reason") <> '')
);

-- ── Indexes (Prisma-declared) ──────────────────────────────────────────────
CREATE UNIQUE INDEX "availability_hours_tenantId_weekday_startMinute_key" ON "availability_hours"("tenantId", "weekday", "startMinute");
CREATE INDEX "availability_hours_tenantId_weekday_idx" ON "availability_hours"("tenantId", "weekday");
CREATE UNIQUE INDEX "availability_closures_tenantId_startDate_endDate_key" ON "availability_closures"("tenantId", "startDate", "endDate");
CREATE INDEX "availability_closures_tenantId_startDate_idx" ON "availability_closures"("tenantId", "startDate");

-- ── Foreign keys ───────────────────────────────────────────────────────────
-- To tenants, not appointment_settings: that row is lazily created and has no (tenantId, id) target.
ALTER TABLE "availability_hours" ADD CONSTRAINT "availability_hours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "availability_closures" ADD CONSTRAINT "availability_closures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261013120000_case_types) ──
ALTER TABLE "availability_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_closures" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "availability_hours_tenant_isolation" ON "availability_hours"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "availability_closures_tenant_isolation" ON "availability_closures"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Notes:
- Index names are Prisma defaults (`<table>_<cols>_key` / `_idx`; longest is 52 chars, under the 63 limit) so `prisma migrate diff` shows no drift.
- A second timestamp (`20261017130100`) is not needed: nothing here must run after a separate step. Reserve it only if review splits RLS out.
- Every CHECK is named and SQL-only (Prisma cannot express them); they are what the integration test must see.

## 2. Prisma (`packages/db/prisma/schema.prisma`)

Tenant (next to `:189-190`):
```prisma
  availabilityHours         AvailabilityHour[]        @ignore // PG-202
  availabilityClosures      AvailabilityClosure[]     @ignore // PG-202
```

AppointmentSettings (inside `:2383-2402`, after `defaultTimezone`):
```prisma
  /// PG-202 — NULL = no daily cap. CHECK 1..500 lives in SQL (appointment_settings_maxDailyBookings_check).
  maxDailyBookings           Int?
  /// PG-202 — NULL = availability never saved; every booking path keeps its legacy rule (ADR-081).
  availabilityConfiguredAt   DateTime?
```

New models (after AppointmentSettings):
```prisma
/// PG-202 — firm-wide weekly working hours: local minutes-of-day in AppointmentSettings.defaultTimezone.
/// weekday 0 = Sunday. CHECKs (weekday 0-6, 0 <= start < end <= 1440) are SQL-only.
model AvailabilityHour {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  weekday     Int      @db.SmallInt
  startMinute Int      @db.SmallInt
  endMinute   Int      @db.SmallInt
  createdAt   DateTime @default(now())

  @@unique([tenantId, weekday, startMinute])
  @@index([tenantId, weekday])
  @@map("availability_hours")
}

/// PG-202 — all-day closure, inclusive calendar dates in the firm timezone. DATE columns: Prisma reads/writes
/// a JS Date at 00:00:00Z — convert with the YYYY-MM-DD string at the validator boundary, never via local time.
model AvailabilityClosure {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  reason    String?  @db.VarChar(200)
  createdAt DateTime @default(now())

  @@unique([tenantId, startDate, endDate])
  @@index([tenantId, startDate])
  @@map("availability_closures")
}
```

## 3. `packages/db/src/index.ts`

Add `AvailabilityHour,` and `AvailabilityClosure,` to the export-type allowlist directly after `AppointmentSettings,` (`:99`). Check `src/index.ts` for any runtime model-name list (tenant-scoped model registry) and add both there if one exists — backend/test to confirm by grep `AppointmentSettings` across `packages/db/src`.

## 4. Class A gates (docs/operations/agent-autonomy-policy.md:52-63)

| # | Gate | Evidence | Local / needs human |
|---|---|---|---|
| 1 | Independent SQL review | A distinct review agent (stoa-domain or plan-reviewer) reads migration.sql only, signs off in the attestation | Local |
| 2 | Expand/contract | Old code ignores the new columns/tables (Prisma selects by name; no NOT NULL added); new code treats NULL `availabilityConfiguredAt` as legacy. Test: availability enforcement with unconfigured/undefined Prisma result = legacy | Local (unit) |
| 3 | Real-DB integration | `tests/integration/availability.test.ts` against `localhost:5433` (use 127.0.0.1; `DATABASE_TEST_URL`, never `.env.local`); Node 22 | Local |
| 4 | Staging migration + app verification | Needs a staging DB I cannot reach from this lane. Local substitute: fresh DB `migrate deploy` of the full chain | NEEDS_HUMAN (staging) unless owner names a staging target |
| 5 | Tenant isolation + auth | New integration cases (RLS blocks tenant B reading/writing A's rows, composite-less FK cascade) + existing `tests/integration/rls-tenant-isolation.test.ts` re-run; router tests for ADMIN/MANAGER-only writes and cross-tenant negative | Local (RLS check skips without `authenticated` role, same as case-types :405-425; record the skip) |
| 6 | Lock/plan/perf note | ADD COLUMN nullable = metadata-only; CHECK NOT VALID + VALIDATE = SHARE UPDATE EXCLUSIVE on a tiny one-row-per-tenant table; new tables take no lock on existing ones except FK to tenants (SHARE ROW EXCLUSIVE on `tenants` for the FK add, instantaneous, tables empty); cap query uses existing appointments indexes `[tenantId]`, `[startTime,endTime]` (schema :2129-2135); `EXPLAIN` captured in test for the daily-count query | Local |
| 7 | Snapshot / forward recovery | Migration header recovery plan; Supabase PITR/snapshot reference | Header is local; the snapshot id is NEEDS_HUMAN at prod time |
| 8 | Feature off without schema revert | `availability.resetToDefaults` clears `availabilityConfiguredAt` (+ deletes rows, cap NULL) => legacy rules in create, reschedule, findNextSlot. Tested | Local |
| 9 | Prod uses `migrate deploy` | PR body states the command `pnpm --filter @intelliflow/db db:migrate`; no `db push` in deploy workflow; guard hook untouched | Local (statement) + prod run is the gated workflow |
| 10 | Post-migration schema + smoke | Query `information_schema` for 2 columns/2 tables/9 named constraints/2 policies; smoke: `calendar.availability.get` returns `isConfigured:false`, create appointment in legacy window still succeeds | Local script; the prod run is NEEDS_HUMAN |

So: gates 1,2,3,5,6,8,9 evidenced locally; 4, 7 (snapshot id) and the prod half of 10 are human/prod steps. Per policy Class A is autonomous only after all 10; therefore the PR can merge but the production migration waits on 4/7/10 evidence — flag in PR body.

## 5. Integration test `tests/integration/availability.test.ts` — `ensureMigrationSql` scope

Mirror `case-types.test.ts:67-85`:
1. Shared-table columns, idempotent: `ALTER TABLE "appointment_settings" ADD COLUMN IF NOT EXISTS "maxDailyBookings" INTEGER` and `... "availabilityConfiguredAt" TIMESTAMP(3)`.
2. Probe `pg_constraint` for `availability_hours_range_check` (db push creates tables/indexes/FKs but not CHECKs or RLS). If present, return.
3. Otherwise `DROP TABLE IF EXISTS "availability_hours","availability_closures" CASCADE`, then replay every statement of migration.sql via `splitStatements`, skipping the `ALTER TABLE "appointment_settings" ADD COLUMN` statements (done in step 1). The `appointment_settings` CHECK is added in a guarded form: `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='appointment_settings_maxDailyBookings_check') THEN ALTER TABLE ... END IF` (the test supplies this wrapper; the migration file stays plain).
4. `splitStatements` must handle the two `DO $$ ... $$` blocks (reuse the helper from case-types; verify it does).
Assertions: each CHECK rejects its bad row (weekday 7, start>=end, end 1441, start -1, endDate<startDate, blank reason, cap 0 and 501); both uniques reject duplicates; tenant delete cascades; RLS cross-tenant read/write blocked when `authenticated` role exists; cap NULL accepted; per-run id prefix and cleanup as case-types :94-100. Use fixed-looking placeholder tenant ids, `*.example.invalid` emails, no secrets.

## 6. Open points for the lead
- DATE round-trip: closures cross the API as `YYYY-MM-DD` strings; the router converts with `new Date(`${s}T00:00:00.000Z`)` and back via `toISOString().slice(0,10)`; add a unit test (a UTC+13 server TZ must not shift the day).
- Cap race (check-then-insert) stays best-effort; a DB guarantee would need an advisory lock or trigger on populated `appointments` — out of Class A scope.
- `appointment-settings.update` Zod strips buffers/timezone, but its `upsert` create-path still defaults them; availability.update must upsert settings with `{ update: {...}, create: {tenantId, ...defaults} }` so first save with no settings row works.

</details>

<details><summary>frontend-lead</summary>

# PG-202 Round 2 - Frontend proposal (frontend-lead)

Tags: REUSES = import unchanged; EXTENDS = edit existing shared file; COMPOSES = new file built from shared parts; NEW = no shared equivalent.
All paths relative to apps/web/src unless noted.

## 1. Files and tags

| File | Tag | Justification / runtime consumer |
|---|---|---|
| app/calendar/availability/page.tsx | MODIFY (stub -> server shell) | Suspense + AvailabilityLoading + AvailabilityContent, copying cases/(list)/case-types/page.tsx. Consumer: Next router (sidebar link configs/calendar.ts:5-19). |
| app/calendar/availability/AvailabilityContent.tsx | NEW | Page state owner; only consumer is page.tsx. |
| app/calendar/availability/AvailabilityLoading.tsx | COMPOSES (Card, Skeleton) | Mirrors the bento 8/4 + 4/8; consumer: page.tsx fallback and AvailabilityContent while loading. |
| app/calendar/availability/availability-draft.ts | NEW | Pure helpers: toDraft(dto), toUpdateInput(draft), normalize(draft), PREFILL_LEGACY (07:00-19:00 x7). Consumer: AvailabilityContent. Keeps the component thin and unit-testable. |
| .../components/WeeklyHoursCard.tsx | COMPOSES (Card, SectionHeader, Switch, Input type=time, Button) | 7 weekday fieldsets. Consumer: AvailabilityContent. |
| .../components/ClosuresList.tsx | COMPOSES (EmptyState entity="appointments", Input type=date, Button) + forwardRef handle {openCreate} | Mirrors CaseTypeList.tsx:23,101,115 and ResolutionChecklistEditor list a11y. Consumer: AvailabilityContent (header Add Closure calls ref.current?.openCreate()). |
| .../components/BuffersCapCard.tsx | COMPOSES (Card, SectionHeader, Input type=number, Label) | Buffer before/after + max daily bookings with explicit "No limit" checkbox. Consumer: AvailabilityContent. |
| .../components/TimezoneCard.tsx | COMPOSES (components/settings/TimezoneSelector REUSES) | Selector + viewer-zone note via useTimezoneContext(). Consumer: AvailabilityContent. |
| components/shared/page-header.tsx | REUSES | Breadcrumbs Dashboard / Calendar / Availability; Save / Reset in `actions`. Do not set hideOnMobile (page-header.tsx:153). |
| components/shared/section-header.tsx | REUSES | headingLevel={2}. |
| components/settings/TimezoneSelector.tsx | REUSES | Props id/invalid/describedBy already exist (:23-33). No change. |
| @intelliflow/ui ConfirmationDialog (packages/ui/src/components/confirmation-dialog.tsx:17-38) | REUSES | Reset confirmation. It takes description as a string, so the reset-vs-kept text is one sentence block, no JSX. Consumer: AvailabilityContent. |
| @intelliflow/ui EmptyState | REUSES | entity="appointments" phase="passive" size="sm" className="py-4 px-3 gap-2", no CTA inside. |
| @intelliflow/validators availability schema (shared) | REUSES | hasConflict / field errors come from safeParse of toUpdateInput(draft), so client and server agree. If its error paths differ from draft rows, AvailabilityContent maps paths to row ids. |
| Time/day-of-week row primitives | NEW but NOT shared | Do not extract QuietHoursScheduler pieces: it stores "HH:MM" strings and 0=Sunday day arrays, different data model; copy the aria-pressed pattern only. A shared extraction is out of scope. |

No new shared UI component, no new package dependency (L11). Native `<input type="time|date|number">`.

## 2. AvailabilityContent behaviour

- Auth gate and query as CaseTypesContent.tsx:38-43: `useRequireAuth`, `trpc.calendar.availability.get.useQuery(undefined,{enabled})`. Loading -> AvailabilityLoading; error -> role="alert" text-red-700 dark:text-red-300 + Retry (CaseTypesContent.tsx:123-133).
- Draft: `{ weeklyHours: Record<0..6,{ranges:{startMinute,endMinute}[]}>, timezone, bufferBefore, bufferAfter, maxDailyBookings|null, closures:{key,startDate,endDate,reason}[] }`. Closure rows carry a client `key` (stable React key), stripped in toUpdateInput.
- Unconfigured (`isConfigured=false`): draft = PREFILL_LEGACY hours (07:00-19:00 every day), server buffers/timezone, no closures. Show an info note: "Availability is not configured yet. Until you save, bookings use the default 07:00-19:00 rule." After the first save the note disappears. isDirty compares against the prefilled snapshot, so merely opening the page is not dirty.
- Snapshot/isDirty: `normalize()` = JSON.stringify of draft with ranges sorted by start, closures sorted by startDate/endDate and `key` omitted, `reason ''` -> null, `maxDailyBookings` undefined/'' -> null (playbook section 3 rule 2). Compare local vs initialSnapshot. After `update` success: set both from the mutation response and invalidate `calendar.availability.get`.
- hasConflict: `safeParse(toUpdateInput(draft))` fails. Save disabled when `!canEdit || !isDirty || isSaving || hasConflict`. Button label stable "Save Changes" (also while saving, aria-busy). Errors are shown inline per row only after the first failed save attempt OR on blur of the field (avoids red on a fresh prefill); on a failed attempt focus the first invalid control.
- Client-only checks the schema may not express (also in the shared schema if backend agrees): overlapping/touching ranges, end<=start, closure end<start, closure > 366 days, >6 ranges/day, >200 closures, duplicate closures. If the validator lacks any, the draft layer must not invent a looser rule.
- Reset: `ConfirmationDialog` (destructive). Title "Reset availability?". Description: "This clears your saved working hours, closures and daily booking limit, so bookings go back to the default 07:00-19:00 rule. Your timezone and buffer times are kept." This text MUST match what backend `resetToDefaults` does (it goes back to legacy, not seeding 9-17; Q for backend: does reset keep buffers/timezone? If it resets them too, change the text accordingly). On success: toast, announcement, snapshot refresh from response.
- Save errors: toast destructive with `error.message`; FORBIDDEN -> "Only administrators and managers can change availability." One `<output aria-live="polite" className="sr-only">` for add/remove/save announcements.
- Read-only (`canEdit=false`): note id `availability-read-only-note` (same copy style as CaseTypesContent.tsx:156-160); all inputs/Switches/buttons `disabled` with aria-describedby to the note; Save and Reset hidden-from-action-bar is NOT used, they stay but disabled so layout is stable. The server is authoritative.
- Viewer zone note (TimezoneCard): `const {timezone: viewerZone, timezoneLabel} = useTimezoneContext()`; when `viewerZone !== draft.timezone` render "Hours are in {draft.timezone}. Your own timezone is {timezoneLabel}." Hours are never converted. Helper under the selector: "Changing the timezone keeps the times shown but applies them in the new zone."
- Closure dates are `YYYY-MM-DD` strings; display via a small local formatter using `Intl.DateTimeFormat('en-GB',{timeZone:'UTC', ...})` on `new Date(str+'T00:00:00Z')` so no viewer-zone shift; never `useTimezoneContext().formatDate`.
- Unsaved-changes guard: `beforeunload` while isDirty (single listener, cleaned up).

## 3. Component details

WeeklyHoursCard (lg:col-span-8): list of 7 `<fieldset>` (legend "Monday" etc., Monday-first display, stored weekday 0=Sunday). Per day: Switch aria-label "Monday open" with aria-describedby summary text ("09:00-17:00" or "Closed"); when on, ranges `<ul>`; each `<li>` has two time inputs labelled "Monday range 1 start/end" plus Remove button ("Remove Monday range 1", 44px target, disabled when it is the only range -> turn the Switch off instead); "Add range" button per day (`<Button size="sm">` Title Case "Add Range"), aria-disabled at 6 ranges. Turning the Switch on seeds one range 09:00-17:00 (unless prefill exists); off keeps the ranges in draft memory? No: off sends zero ranges (backend: no rows = closed), and re-on re-seeds 09:00-17:00. Time values converted minute<->"HH:MM" in availability-draft.ts; "24:00" = 1440 is shown as end "00:00"? Native time inputs cannot express 24:00, so range ending at midnight needs a decision (see Questions). Focus moves to the new range's start input after Add and to the Add button after Remove (effect pattern, ResolutionChecklistEditor :47-56).

ClosuresList (lg:col-span-8): header action `<Button size="sm">Add Closure</Button>` -> openCreate() appends a draft row (start/end = today in firm zone is unnecessary; start empty) and focuses its start input. Rows: fieldset legend "Closure 1", Start date, End date (min = start), Reason (optional, maxLength 200, counter via describedby), Remove button with positional name. Sorted by startDate on display only. Empty -> EmptyState (no CTA inside). Heading order: EmptyState sm renders h3 under the Card's h2 (verify in test; if it renders a different level, pass headingLevel/or accept per EmptyState API).

BuffersCapCard (lg:col-span-4): Buffer before / after (0-240, step 5), Max daily bookings (1-500) with a "No daily limit" Checkbox; checking it nulls the number and disables the input. Help text per field via aria-describedby; number parsing: '' stays '' in local string state and maps to the previous valid value on blur (avoid the BufferRemindersTab.tsx:21 null-for-number bug).

TimezoneCard (lg:col-span-4): Label htmlFor + TimezoneSelector id; invalid when the zone is empty; viewer note as above.

Grid order (DOM order = reading order): Weekly hours 8 | Timezone 4 | Closures 8 | Buffers+cap 4. Rationale: matches the Round 1 layout; row 1 = hours+tz, row 2 = closures+buffers. (Lead's Round 1 said Buffers 4 next to Closures 8 - same.)

## 4. calendar-settings changes

- BufferRemindersTab.tsx: `BufferSettings` becomes `{ defaultReminderMinutes: number|null }`; delete the two buffer inputs (:34-60); add a link paragraph "Manage working hours, buffers and timezone in Availability" -> /calendar/availability (next/link). Fix the `null`-for-number bug (:21) for the remaining field (blank -> null is correct for the nullable reminder; keep).
- CalendarIntegrationTab.tsx: `CalendarIntegrationSettings` drops `defaultTimezone`; delete the Select (:92-111) and the `getAvailableTimezones` import (:13); show the same link text and read-only "Firm timezone: {value}" only if CalendarSettingsContent passes a read-only `firmTimezone` prop (optional; I recommend showing it, one prop, no editing).
- CalendarSettingsContent.tsx: `mapSettings` (:24-52), the `LocalSettings` type, `normalize` (:54-66) and the `updateMutation.mutateAsync` payload (:116-120) stop carrying defaultBufferBefore/After and defaultTimezone. The backend update schema strips them anyway, but the client must not rely on that. Reset toast text (:134-137) unchanged; check it does not claim buffers/timezone are reset. Description (:197) "Configure default durations, buffers, reminders, and calendar integrations." -> "durations, reminders and calendar integrations".
- Tests to update (from test-engineer): BufferRemindersTab.test.tsx:16-17,41,62,69; CalendarIntegrationTab.test.tsx:40,152-153,173; CalendarSettingsContent.test.tsx:96-101.
- The page stays on deprecated ModuleSettingsLayout: migrating it is out of scope (note in spec).

## 5. AppointmentForm.tsx:118-138 client-side 07-19 duplicate

Facts: lines 118-138 hard-code 07:00-19:00 on the local datetime string (no timezone, no weekday); the comment claims parity with the server. After PG-202 the server rule is the firm's availability, so a configured tenant with 06:00 opening or Saturday hours would be blocked client-side by a stale rule, and a tenant open until 20:00 could never book 19:30 from this form.

Proposal (smallest safe change, does not touch attendee/client/assignee/conflict logic):
1. Delete the `BUSINESS_HOURS_*` constants, `isOutsideBusinessHours`, and the two `if` blocks that set `startTime`/`endTime` errors (lines 118-138). Keep :112-117 (required, end after start) and :139 (type).
2. Surface the server rejection: the parent's `onSubmit` rejection message (TRPCError from `assertAvailability`, with the violation code, e.g. OUTSIDE_HOURS / CLOSED_DATE / DAILY_CAP_REACHED / SPANS_MIDNIGHT) must be shown inline. Need to check how the new/edit page handles `create` errors today (not yet read); if it only toasts, map the availability error to `errors.startTime` via an optional `serverError` handling already present in the form, or a toast with the message. Requires backend: the error message must be user-readable and carry a stable code in `error.data` or `cause` (Question B2).
3. Optional (not in this PR unless backend adds a cheap read): pre-validation using `calendar.availability.get` data. Rejected for now: it would duplicate AvailabilityPolicy on the client and the form has no firm-zone logic. Record as follow-up.
4. Tests: AppointmentForm test cases asserting "Start must be between 07:00 and 19:00" must be changed to assert that no client hours error appears and that a server error is rendered. Need to grep for them (not done in this read-only round).
Risk: unconfigured tenants lose the instant client-side 7-19 hint; they still get the server error. Acceptable and consistent with "server authoritative"; flag in PR body.
This edit is inside Aurora's boundary 1? It is a web file, not appointments.router.ts, and touches no tenant-ownership fields, so it is within PG-202 scope; mention it to Aurora in the PR body.

## 6. Docs / registries

- docs/design/page-registry.md: add /calendar/availability entry (currently missing). 
- docs/design/sitemap.md:203 and PAGE_MAP_AND_FLOWS.md:226: update description (working hours, closures, timezone, buffers, daily cap; ADMIN/MANAGER write).
- Reachability audit ~:232 (panel column "--" though CalendarSettingsPanel links it): fix.
- docs/design/ui-flow-mapping.md /calendar/* rows (:331-333, :715): add the new procedure count only via the reconcile tests the test lane owns.
- WCAG statement 1.9.0 row and VPAT 1.10.0 row (a11y-expert).
- apps/web/src/app/calendar/__tests__ / InboxCalendarSection.test.tsx:47-51: update stale "stub" comment.
- docs/planning/prd-module-settings.md: PG-202 Addendum (playbook section 13/14); module-settings-playbook section 8: per-Boolean categories - PG-202 has no Boolean policy toggles (the "No daily limit" checkbox is UI-only; maxDailyBookings null = unlimited, wired now in AvailabilityPolicy).
- Stale /calendar/new and /calendar/[id] registry rows: out of scope, file as finding.

## 7. Tests (web)

- AvailabilityContent.test.tsx: jsdom, vi.hoisted trpc mock, axe on default / error / empty closures / read-only / unconfigured-prefill; dirty tracking (prefill not dirty; edit -> dirty; save -> snapshot refresh; reset confirm text enumerates reset vs kept; reset calls resetToDefaults only); conflict disables Save; FORBIDDEN toast; viewer-zone note shown only when zones differ; closure date shown without a day shift for a western viewer zone (mock timezone context).
- availability-draft.test.ts: minute<->HH:MM, normalize stability, PREFILL_LEGACY, toUpdateInput strips keys, reason ''->null.
- WeeklyHoursCard / ClosuresList tests: add/remove/focus, aria names, 6-range and 200-closure limits, forwardRef openCreate.
- AvailabilityLoading.test.tsx (shape parity), page.test.tsx.
- Updated calendar-settings tests (section 4) and AppointmentForm tests (section 5).
- Run with `pnpm --filter @intelliflow/web exec vitest run <path>`; coverage scoped with --coverage.include.

## 8. Questions for the lead / backend

B1. Range ending at midnight (1440): native time input cannot show 24:00. Options: (a) cap UI end at 23:59 and let 1440 be unreachable (simple; closes at 23:59 effectively), (b) represent "24:00" via a "Until midnight" checkbox per range. Recommend (a) for this PR; backend schema still allows 1440. Needs lead decision.
B2. Does the availability violation error carry a stable code (e.g. `cause`/`data.availabilityCode`) and a human message with the firm-local hours or date? Needed for section 5 step 2.
B3. Does `resetToDefaults` keep buffers + timezone and closures? The dialog text depends on it (section 2). Recommend: clears hours, closures, cap and availabilityConfiguredAt; keeps buffers/timezone (they are AppointmentSettings columns shared with other flows).
B4. `get` response shape: confirm `isConfigured`, `canEdit`, `weeklyHours` as per-weekday ranges or flat rows (draft layer adapts either way), closures dates as `YYYY-MM-DD` strings (not Date).
B5. Unconfigured first save that leaves the prefilled hours untouched but adds a closure: is saving 07-19 x7 rows OK (it is, and sets availabilityConfiguredAt)? Confirm that the cap/legacy paths then switch to the configured rule (domain-expert: configured path fixes cross-midnight), which is a behaviour change users should be told about in the unconfigured note.

## 9. Concerns

- DOM/visual order vs Save placement: Save/Reset live in PageHeader actions; on mobile they must not be hidden (no hideOnMobile).
- One draft means a large closures list plus hours is saved atomically: a FORBIDDEN or validation failure keeps the whole draft; no data loss.
- Unsaved edits to closures are no longer "immediate" (supersedes my Round 1 recommendation); the helper line I proposed is replaced by the single dirty indicator: show "Unsaved changes" text next to Save when isDirty (aria-live not needed, stable label).
- Prefill of 07:00-19:00 x7 is a lie if the tenant later saves nothing; the unconfigured note must be visible and persistent until the first save.
- Switch off then on loses custom ranges for that day (draft only); acceptable, or keep ranges in a hidden draft map (extra complexity; not recommended).
- Timezone change when closures exist: closure dates are calendar dates, so they apply in the new zone; helper text covers it.
- Form import: AppointmentForm change must not alter conflict-check or attendee behaviour; limit the diff to lines 118-138.

</details>

<details><summary>domain-expert</summary>

# PG-202 Round 2 PROPOSAL: domain-expert (AvailabilityPolicy)

File: `packages/domain/src/legal/appointments/AvailabilityPolicy.ts`. Pure functions and const arrays. No Prisma, no
`apps/*`, no I/O, no `Date.now()`. The only runtime dependency is the built-in `Intl`.

## Conventions followed
- `packages/domain/CLAUDE.md`: zero infrastructure deps, DRY const arrays (`as const`, type derived from the array),
  rebuild the domain after changing the barrel (stale `dist`).
- Existing error pattern: `Buffer.ts:4-10` (`class X extends DomainError { readonly code = '...' }`, `DomainError` at
  `shared/Result.ts:75`). Existing const-array pattern: `AppointmentEvents.ts:7-26`.
- Barrel: add after `packages/domain/src/index.ts:80` the line `export * from './legal/appointments/AvailabilityPolicy';`.
  I grepped `packages/**/*.ts`: none of `WeeklyRange, Closure, Weekday, AvailabilityRules, mergeRanges, toZonedParts,
  localToUtc, isValidTimezone, InvalidTimezoneError` is exported elsewhere, so no barrel collision.
- Not a `ValueObject` class: the rule is stateless and the inputs are plain rows from three tables. Functions plus
  readonly types are simpler and trivially testable. This is a deliberate departure from `Buffer`/`TimeSlot`.

## Types and constants

```ts
import type { AppointmentStatus } from './AppointmentEvents';
import { DomainError } from '../../shared/Result';

/** 0 = Sunday ... 6 = Saturday (same as the DB column and NotificationPreference.quietHoursDays). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MINUTES_PER_DAY = 1440;

/** Shared limits: validators and the DB CHECKs derive from these (DRY). */
export const AVAILABILITY_LIMITS = {
  maxRangesPerWeekday: 6,
  maxClosures: 200,
  maxClosureDays: 366,
  maxDailyBookings: 500,
  maxReasonLength: 200,
} as const;

/** Statuses that consume a daily-cap slot. CANCELLED and NO_SHOW free it. */
export const CAP_COUNTED_STATUSES = [
  'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED',
] as const satisfies readonly AppointmentStatus[];
export type CapCountedStatus = (typeof CAP_COUNTED_STATUSES)[number];

export const AVAILABILITY_VIOLATION_CODES = [
  'INVALID_INTERVAL',   // end <= start (defensive; Zod already guards at the router)
  'INVALID_TIMEZONE',   // firm zone is not a valid IANA zone
  'SPANS_MIDNIGHT',     // local end date differs from local start date (24:00 exception below)
  'CLOSED_DATE',        // start or end local date falls in a closure
  'OUTSIDE_HOURS',      // not inside ONE merged range of the start weekday (also "closed that weekday")
  'DAILY_CAP_REACHED',  // sameDayCount >= maxDailyBookings
] as const;
export type AvailabilityViolationCode = (typeof AVAILABILITY_VIOLATION_CODES)[number];

export interface WeeklyRange { readonly weekday: Weekday; readonly startMinute: number; readonly endMinute: number } // 0 <= start < end <= 1440
export interface Closure { readonly startDate: string; readonly endDate: string }  // 'YYYY-MM-DD', inclusive, startDate <= endDate
export interface AvailabilityRules {
  readonly timezone: string;                    // AppointmentSettings.defaultTimezone
  readonly weeklyRanges: readonly WeeklyRange[];// may be unsorted/touching; empty weekday = closed that weekday
  readonly closures: readonly Closure[];
  readonly maxDailyBookings: number | null;     // null = unlimited
}
export interface ZonedParts { date: string; weekday: Weekday; minuteOfDay: number; second: number; ms: number }

export class InvalidTimezoneError extends DomainError {
  readonly code = 'INVALID_TIMEZONE';
  constructor(timezone: string) { super(`Invalid timezone: ${timezone}`); }
}

export type AvailabilityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: AvailabilityViolationCode; readonly message: string };
```

## Functions

```ts
export function isValidTimezone(timezone: string): boolean;
// try { new Intl.DateTimeFormat('en-GB', { timeZone }) } catch { false }. Empty string -> false.
// Used by the validators (save-time check) and by evaluate. 'UTC' is valid.

export function toZonedParts(instant: Date, timezone: string): ZonedParts;
// Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year/month/day/hour/minute/second numeric,
// weekday: 'short' }).formatToParts(instant). hourCycle 'h23' avoids the "24" midnight quirk handled by hand at
// appointments.router.ts:324-326. Throws InvalidTimezoneError. Formatters cached per zone in a module Map
// (bounded by the number of valid IANA zones). Invalid Date -> throws RangeError (caller bug).

export function localToUtc(date: string, minuteOfDay: number, timezone: string): Date;
// Wall clock -> instant. DST gap (nonexistent time): resolves to the first instant AFTER the gap (shift forward).
// DST overlap (ambiguous time): resolves to the EARLIER occurrence. Implementation: probe offset at (guess - 24h)
// and (guess + 24h) via toZonedParts, test both candidates, pick by the rule above. 1440 = next day 00:00.

export function localDayBoundsUtc(date: string, timezone: string): { startUtc: Date; endUtc: Date };
// Half-open [startUtc, endUtc) = [first instant whose local date >= date, first instant whose local date >= date+1).
// Binary search over minutes inside a +/-14h window of UTC midnight (predicate: local date string >= date).
// Day length is therefore 23h or 25h on DST days; it is NOT assumed to be 24h. endUtc of day N === startUtc of day N+1.
// This is the cap-count window: the caller counts appointments with startTime >= startUtc AND < endUtc.

export function mergeRanges(ranges: readonly WeeklyRange[]): WeeklyRange[];
// Per weekday: drop invalid (start >= end) entries, sort by start, merge when next.start <= current.end
// (touching 09-12 + 12-17 -> 09-17; gaps kept). Result sorted by (weekday, start). Pure, input not mutated.

export function evaluateAvailability(input: {
  rules: AvailabilityRules; start: Date; end: Date;
  sameDayCount?: number;   // appointments counted by CAP_COUNTED_STATUSES in the start day window, EXCLUDING the one being rescheduled
}): AvailabilityResult;

export function capCountWindow(rules: Pick<AvailabilityRules, 'timezone'>, start: Date): { startUtc: Date; endUtc: Date };
// = localDayBoundsUtc(toZonedParts(start, tz).date, tz). Convenience so the API computes the window with the same code.

export function nextCandidateStart(input: {
  rules: AvailabilityRules; from: Date; durationMinutes: number;
  stepMinutes?: number;    // default 60 (parity with the legacy whole-hour search)
  maxDaysAhead: number;    // bounded search, caller-supplied (findNextSlot already has maxDaysAhead)
}): Date | null;
// Earliest instant >= from that (a) lies on a non-closed local day, (b) sits inside a merged range of that weekday,
// (c) is aligned to stepMinutes on the LOCAL minute-of-day grid, (d) leaves room for durationMinutes inside the same range,
// (e) ends on the same local day. Ignores the cap and conflicts (caller concerns). Null when none within maxDaysAhead.
```

## evaluateAvailability: order and semantics
1. `end <= start` -> `INVALID_INTERVAL`.
2. `!isValidTimezone` -> `INVALID_TIMEZONE` (no `RangeError` escapes, so the API returns a 4xx, not the 500 flagged by backend).
3. `s = toZonedParts(start)`, `e = toZonedParts(end)`. Effective end:
   - same local date: `endMinute = e.minuteOfDay + (e.second > 0 || e.ms > 0 ? 1 : 0)` (ceil: 17:00:30 does not fit a 17:00 range).
   - `e.date === s.date + 1` and `e.minuteOfDay === 0` and seconds/ms zero: `endMinute = 1440`, effective end date = start date
     (the appointment does not occupy the next day, so a closure on the next day does not reject it).
   - anything else: `SPANS_MIDNIGHT`. Start uses floor (minuteOfDay) because seconds past the minute cannot move it out of a range.
4. Closures: reject `CLOSED_DATE` if `s.date` or the effective end date lies in any `[startDate, endDate]` (string comparison on
   zero-padded `YYYY-MM-DD` is safe). Checked before hours so "closed" wins over "outside hours" (more actionable message).
5. Hours: `mergeRanges` then require one merged range of `s.weekday` with `start >= range.start && endMinute <= range.end`
   -> else `OUTSIDE_HOURS`. A weekday with no ranges is closed (same code; message says "closed on <weekday>").
6. Cap: if `maxDailyBookings !== null`: `sameDayCount === undefined` is a programming error -> throw (fail loud, not silent allow);
   `sameDayCount >= maxDailyBookings` -> `DAILY_CAP_REACHED`. The cap is evaluated last so hours/closure errors surface first.
7. `{ ok: true }`.

Messages are plain English and carry only the firm-local date, weekday or time, never ids or tenant names. The API helper maps every
code to `TRPCError BAD_REQUEST` (`INVALID_TIMEZONE`: same code, message "The firm timezone is invalid. Fix it in Calendar > Availability.").

## Edge semantics
- **DST spring-forward**: rules are wall-clock, evaluation uses the local parts of the two instants, so a gap never needs
  special casing in `evaluateAvailability`. London 2026-03-29: 01:00-02:00 does not exist; a 00:30Z..01:30Z appointment has local
  02:30..? (BST) and is judged on those values. `localToUtc` gap rule only matters for `nextCandidateStart`.
- **DST fall-back**: an ambiguous local time is accepted for either instant; `localToUtc` picks the earlier. London 2026-10-25 and
  New York 2026-11-01 are the tests. Day windows are 25h for these days.
- **24:00**: a range with `endMinute = 1440` is the only way an appointment may end at the next local midnight (step 3).
  A range starting at 0 and one ending at 1440 on adjacent days are NOT merged across days (a booking cannot span midnight anyway).
- **Invalid zone**: `isValidTimezone` false everywhere returns/throws a typed error, never `RangeError`. Note `Intl` accepts case-variant
  and alias names (`utc`, `Etc/GMT+1`); the validator additionally normalizes via `new Intl.DateTimeFormat(..).resolvedOptions().timeZone`
  at save time so the stored string is canonical.
- **Zero seconds**: appointments created by the UI have zero seconds; the ceil rule only matters for API callers.

## Domain tests (colocated, like `Buffer.test.ts`)
`packages/domain/src/legal/appointments/__tests__/AvailabilityPolicy.test.ts` (target >95% per stoa-domain) with:
per-weekday hours, touching merge, gap not merged, closed weekday, 24:00 end, SPANS_MIDNIGHT (the legacy 18:00 -> 08:00 case),
closure on start/end/range/inclusive bounds, closure next-day exemption for 24:00 end, cap boundary (count = cap-1 ok, = cap fails,
null unlimited, undefined with cap set throws), `CAP_COUNTED_STATUSES` subset of `APPOINTMENT_STATUSES` and excludes
CANCELLED/NO_SHOW, invalid zone (`INVALID_TIMEZONE`), `INVALID_INTERVAL`, `toZonedParts`/`localDayBoundsUtc` for Europe/London
(2026-03-29, 2026-10-25), America/New_York (2026-03-08, 2026-11-01), Asia/Kolkata (half-hour offset), Pacific/Auckland (date
ahead of UTC); `localToUtc` gap and overlap; `nextCandidateStart` (skips closure, skips weekday gap, wraps to next week,
alignment to step, null at horizon, duration that does not fit the range). Explicit IANA zones and explicit instants, no
`process.env.TZ`, no wall clock (the repo pins neither; time-bomb lesson). No separate `.b11` file needed.

## API consumption (for backend-architect)
- `availability-enforcement.ts` loads `AppointmentSettings` + hours + closures, builds `AvailabilityRules`, and if
  `availabilityConfiguredAt` is NULL stays on the legacy path (policy has NO legacy knowledge, so legacy stays byte-identical).
- Cap count: only when `maxDailyBookings != null`: `capCountWindow` then `appointment.count({ tenantId, status in CAP_COUNTED_STATUSES,
  startTime >= startUtc, startTime < endUtc, id != self })`.
- findNextSlot, configured path: do NOT feed rules into `ConflictDetector.findNextAvailableSlot` (server-local `setHours/getDay`,
  `ConflictDetector.ts:317-372`). Loop: `nextCandidateStart` -> conflict check for that single slot -> cap check for that day
  (one grouped count for the horizon is a possible optimisation) -> on cap-full or conflict advance `from` (cap-full: `localDayBoundsUtc(day).endUtc`).
- After adding the barrel export run `pnpm --filter @intelliflow/domain build` before API tests (stale dist).

## Open points for Round 3 (not blocking)
- Legacy cross-midnight gap stays unfixed per lead resolution; recorded as a finding.
- The cap remains a best-effort check-then-insert (ADR-081 documents it).

</details>

<details><summary>test-engineer</summary>

# PG-202 Round 2 PROPOSAL (test-engineer): complete test plan

Based on discussion.md lines 130-218 (Round 1 + lead resolutions) and repo reads. Nothing was run.

## 0. Shared conventions
- Clock: every date-dependent test calls `vi.useFakeTimers(); vi.setSystemTime(NOW)` in beforeEach and `vi.useRealTimers()` in afterEach. NOW = 2026-04-13T09:00:00Z (Mon). No `process.env.TZ` pinning; always explicit IANA zones.
- Factories, not shared fixtures: `makeHours(weekday, ranges)`, `makeConfig(overrides)`, `makeClosure(start,end,reason?)` in `packages/domain/src/legal/appointments/__tests__/availability.fixtures.ts` (domain) and a local `availabilityRows()` in the API test. No mutable module-level state.
- Never use text shaped like secrets in fixtures (CLAUDE.md rule); no hosts, only plain strings.
- Test names are the acceptance trace: prefix with the AC id the spec assigns (AC-0xx) once the spec exists.

## 1. New test files and named cases

### 1.1 `packages/domain/src/legal/appointments/__tests__/AvailabilityPolicy.test.ts` (target >95% lines+branches)
Per-weekday hours
- open Mon-Fri 09:00-17:00 in Europe/London: Tue 10:00-11:00 passes (returns `[]`)
- Saturday (no ranges) returns `OUTSIDE_HOURS`; Sunday likewise
- different hours per day: Mon 09-12, Wed 13-18; Wed 10:00 fails, Wed 13:00 passes
- two ranges per day (09-12, 14-17): fits range 1, fits range 2, spans the gap fails
- touching ranges (09-12, 12-17) are merged: 11:00-13:00 passes
- start exactly at open passes; start 1 minute before open fails; end exactly at close passes; end 1 minute after close fails
- zero-length / end <= start returns a defined violation (not a throw) or is documented as precondition (see Questions)
Midnight and 24:00
- range ending 1440: 23:00-24:00 local passes (end is next-day 00:00 local, exactly)
- 23:00 to 00:30 next day returns `SPANS_MIDNIGHT` even if both days have ranges (configured path fixes legacy gap, 18:00 -> 08:00 next day)
- end 00:00 next day with last range ending 1440 passes; with last range ending 1020 fails
Closures
- single-day closure on start date -> `CLOSED_DATE`
- inclusive range: first day, middle, last day fail; day before and day after pass
- closure tested on BOTH local start date and local end date (booking that starts open day and ends closed day returns CLOSED_DATE)
- closure date compared in firm zone, not UTC: closure 2026-04-14 and booking 2026-04-13T23:30Z in Pacific/Auckland (local Apr 14) is closed; same instant in Europe/London (local Apr 14 00:30, outside hours anyway) assert exact code
- closure plus outside hours returns both codes in documented order (or the first by priority; match the spec)
Daily cap
- cap 3 with 2 existing: passes; with 3 existing: `DAILY_CAP_REACHED`; cap null = unlimited with 1000 existing
- cap day is firm-local start day: booking at 23:30 local with existing on the next local day does not count
- excluded statuses: CANCELLED and NO_SHOW not counted; SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED counted (`it.each` over `APPOINTMENT_STATUSES`; guard test that `CAP_COUNTED_STATUSES` plus the excluded set equals the full enum, so a new enum value fails the test)
- reschedule: `excludeAppointmentId` removes itself; rescheduling within a full day passes, moving INTO a full day fails
Timezone / DST (explicit zones)
- Europe/London 2026-03-29 (spring forward 01:00->02:00): rule Sun 00:00-24:00; 09:00 local = 08:00Z passes; booking 01:30Z (= 02:30 BST) maps to the right local hour
- Europe/London 2026-10-25 (fall back): 01:30 local occurs twice; both instants (00:30Z and 01:30Z) evaluate to local 01:30 and give the same verdict; 09:00 local = 09:00Z
- America/New_York 2026-03-08: instants 06:59Z and 07:00Z straddle the gap; local 03:00 is 07:00Z; rule 09-17 holds at 13:00Z (09:00 EDT)
- America/New_York 2026-11-01: 05:30Z and 06:30Z both local 01:30; 09:00 local is 14:00Z
- 09:00-17:00 rule gives 09:00-17:00 LOCAL the week before and after each transition (assert UTC equivalents shift by 1h)
- close-time booking on a transition day (17:00 local end passes, 17:01 fails)
- midnight "24" Intl normalisation: instant at local 00:00 reports hour 0, not 24
- invalid IANA zone: policy throws a typed error (or returns a defined violation), never RangeError leaking; test with `'Not/AZone'`
Legacy / unconfigured
- if the policy has a pure `legacyRule()` or `isConfigured=false` branch, test that it returns "no config" and the caller decides (no verdict from policy)
Purity
- the module imports nothing from infra (assert via an import-boundary test or rely on the domain `no-infra` lint; name it `AvailabilityPolicy has no infra imports`)
Property test (fast-check if already a dependency in domain; otherwise skip): for random intervals within one open range the policy returns `[]`; for random intervals fully outside, never `[]`. Seed pinned.

### 1.2 `packages/validators/src/__tests__/availability.test.ts` (>95%)
Pattern: `valid(overrides)` + `issues()` + `it.each` as in case-types.test.ts:17-80. Assert `issue.path` for each superRefine failure.
- valid full config passes; empty weekly hours (closed all week) passes (configured but closed is legal)
- weekday 0-6 boundaries: -1 and 7 fail; non-integer fails
- startMinute/endMinute: 0 and 1440 pass; -1 and 1441 fail; non-integer fails; start == end and start > end fail with path `['weeklyHours', i, 'ranges', j, 'endMinute']`
- overlap: [540,720] + [700,900] same weekday fails with path of the later range; touching [540,720] + [720,900] passes (matches DB UNIQUE/merge semantics, state explicitly); duplicate identical ranges fail (maps to UNIQUE(tenantId, weekday, startMinute)); overlap on different weekdays passes; unsorted input overlap still detected
- max 6 ranges per day passes, 7 fails; max 200 closures passes, 201 fails
- closure: endDate >= startDate (equal passes, before fails, path `['closures', i, 'endDate']`); span <= 366 days passes, 367 fails (compute with date-only math, no TZ drift, include leap-year Feb 29 2028 case); invalid date strings (`2026-02-30`, `2026-13-01`, `26-01-01`, datetime string) fail; reason: undefined/null passes, blank/whitespace fails, 200 chars passes, 201 fails, trimmed
- overlapping or duplicate closures fail (matches UNIQUE(tenantId,startDate,endDate) and avoids ambiguous ranges)
- maxDailyBookings: null passes (unlimited), 1 and 500 pass, 0 and 501 fail, 1.5 fails
- timezone: valid IANA (`Europe/London`) passes; `UTC` passes; `Not/AZone`, empty, `GMT+5` string fails (validate with `Intl.supportedValuesOf` or try `new Intl.DateTimeFormat(undefined,{timeZone})`); NOTE appointment-settings.ts:44 only checks min(1), so this is stricter on purpose
- buffers 0 and 240 pass, -1 and 241 fail (keep parity with appointment-settings validator)
- unknown keys stripped; `tenantId` smuggled in payload is stripped (assert parsed output lacks it)
- Update `packages/validators/src/__tests__/appointment-settings.test.ts`: buffers + timezone are no longer in the update schema; assert they are stripped (or rejected, per final decision) and that `resetToDefaults` output shape lacks them.
- If validators barrel changes: `pnpm --filter @intelliflow/validators build` before dependent tests.

### 1.3 `apps/api/src/modules/calendar/__tests__/availability-enforcement.test.ts` (>90%)
Uses `prismaMock` (test/setup.ts:110), `useTx` pattern, fixed clock.
Legacy fallback
- settings row null -> legacy create rule (07-19, `input.timezone`), Sat 15:00 UTC allowed, 06:59 rejected with exact message `Appointments must start and end between 07:00 and 19:00.`
- settings row `undefined` (deep-mock default; do NOT stub the mock) -> legacy, no throw, no TypeError
- row present but `availabilityConfiguredAt` null -> legacy (buffers set by old UI must not flip tenant to configured)
- reschedule legacy: UTC evaluation, no input.timezone
- findNextSlot legacy: 9-17 weekdays unchanged (Aurora boundary 4)
- legacy cross-midnight gap (18:00 -> 08:00 next day) is still accepted: pin the current behaviour in a test named `legacy path keeps the cross-midnight gap (recorded finding)`, so a later fix is deliberate
Configured path (loads hours + closures + cap + timezone from DB, maps violations to TRPCError)
- OUTSIDE_HOURS -> BAD_REQUEST with code-specific message; CLOSED_DATE -> BAD_REQUEST; DAILY_CAP_REACHED -> BAD_REQUEST (or CONFLICT per spec; assert the chosen code); SPANS_MIDNIGHT -> BAD_REQUEST
- `input.timezone` ignored: firm zone Europe/London, input.timezone 'Asia/Tokyo', result identical to omitting it
- `forceOverrideConflicts: true` does not bypass availability
- cap query: asserts `prismaMock.appointment.count` called with `where` containing `tenantId`, status `in` CAP_COUNTED_STATUSES, start range = firm-local day bounds converted to UTC (check DST day length 23h and 25h), `id: { not: excludeId }` on reschedule
- every Prisma call in the helper carries the caller `tenantId` (iterate `prismaMock` mock calls and assert; one `it` per model)
- zero-row configured tenant (configured, no hours) -> every booking OUTSIDE_HOURS (closed all week), distinct from legacy
- invalid stored timezone (corrupt row) -> defined error (BAD_REQUEST/PRECONDITION or documented fallback), never 500 RangeError
- DB errors propagate (not swallowed into allow)
findNextSlot plumbing
- configured: skips Saturday, skips closure range, skips full-cap day, honours maxDaysAhead bound, returns null when none; returned slot start/end fall in firm-local hours (assert in London across 2026-03-29)
- legacy: unchanged result
- bounded work: asserts at most N DB queries (hours/closures loaded once, cap counts batched or capped), guards against N+1 (feedback on N+1 remediation)

### 1.4 `apps/api/src/modules/calendar/__tests__/availability.router.test.ts` (>90%)
Contexts: `createAdminContext()`, `createManagerContext()`, `createTestContext()` (USER).
- get: any tenant user can read; returns `canEdit` true for ADMIN/MANAGER, false for USER; `isConfigured=false` + no rows for new tenant and NO lazy-create (assert `prismaMock.availabilityHour.createMany` and `appointmentSettings.create` not called)
- get filters every query by ctx tenantId (hours, closures, settings)
- update: ADMIN ok; MANAGER ok; USER -> FORBIDDEN (assert no write calls); unauthenticated -> UNAUTHORIZED
- update runs in ONE `$transaction` callback: hours deleteMany + createMany, closures deleteMany + createMany, settings upsert, `availabilityConfiguredAt` set; assert tx client used, not top-level prisma; if createMany throws mid-way the error propagates and no top-level write happened (rollback by construction)
- update with smuggled `tenantId` in input/rows: ignored, writes use ctx tenantId (case-types.router.test.ts:191 pattern)
- update validation errors: overlap, bad minute, 7 ranges/day -> BAD_REQUEST with Zod issue path; prisma not touched
- P2002 unique violation -> CONFLICT (pattern case-types.router :98-112)
- first save from unconfigured tenant sets `availabilityConfiguredAt` to pinned NOW; second save keeps or updates per spec (assert)
- resetToDefaults: ADMIN/MANAGER only; returns tenant to legacy (deletes rows, nulls cap + configuredAt), does NOT seed 9-17 rows; USER FORBIDDEN
- cross-tenant: tenant A caller never reads/writes tenant B rows (mock returns B rows only when `where.tenantId === B`; A caller gets none)
- update does not touch reminder fields owned by calendar-settings (assert `upsert.update` keys exactly: buffers, timezone, maxDailyBookings, availabilityConfiguredAt)
- `appointmentSettings` router regression (add to existing `appointment-settings.router.test.ts`): update strips buffers + timezone from input (Zod strips unknown keys); resetToDefaults upsert payload no longer contains buffers/timezone; get still returns them (read side unchanged, availability reads same columns)

### 1.5 Additions to `apps/api/src/modules/legal/__tests__/appointments.router.caller.test.ts`
Add a new `describe('availability enforcement (PG-202)')` using real helper with mocked prisma (container stays mocked as at :49-74). Router change is only the swap at :513 and :787 so these tests are the regression net.
create
- configured tenant Mon-Fri 09-12, create Tue 10:00-11:00 -> use case called; Tue 13:00 -> BAD_REQUEST and `scheduleAppointmentUseCase.execute` NOT called
- closure day -> BAD_REQUEST, use case not called
- cap reached -> BAD_REQUEST, use case not called
- Saturday blocked; per-weekday hours differ
- firm timezone governs: 08:30Z booking passes in London BST (09:30 local) but fails if firm zone were UTC; input.timezone ignored
- unconfigured tenant: Sat 15:00 allowed, 06:00 rejected (existing behaviour kept)
- order of checks: availability runs before the use case (call order assertion with `mock.invocationCallOrder`)
reschedule
- configured: move to closed day -> BAD_REQUEST, rescheduleAppointmentUseCase.execute not called
- move within same full-cap day passes (excludes itself); move to different full day fails
- tenant timezone used (reschedule has no input timezone; the old UTC behaviour now gone for configured tenants)
- unconfigured: legacy UTC 07-19 unchanged
- existing reschedule tests at :315-410 still pass untouched
findNextSlot
- configured tenant routes through the policy; result slot is open per hours/closures/cap; unconfigured keeps `checkConflictsUseCase.findNextSlot` call args including 9/17 (assert `toHaveBeenCalledWith` at :712 pattern)
cross-tenant negative (Aurora boundary 3)
- tenant A (Mon-Fri 09-12) and tenant B (unconfigured) in one test file with two contexts; B books Sat 15:00 -> allowed; A books Sat 15:00 -> blocked; assert all availability Prisma reads for A's call have `tenantId === A` and none reference B; and reverse
- tenant B configured with Sat open; A's closed-Saturday rule does not apply to B
RBAC for appointments unchanged: non-admin USER can still create (availability is not a role gate)

### 1.6 `apps/api/src/__tests__/` and suite-wide guards
- `app-router.smoke.test.ts:177-186`: add `calendar.availability` procedures (`get`, `update`, `resetToDefaults`) existence check
- `legal-module-entitlement.test.ts:33-44`: assert availability is NOT module-gated (calendar is core; do not add to LEGAL_ROUTERS)
- container wiring (apps/api/CLAUDE.md): if any new use case/service is registered in `container.ts`, add a runtime test in `apps/api/src/__tests__/container.test.ts` asserting it is instantiated (static checks alone do not prove wiring)

### 1.7 `tests/integration/availability.test.ts` (describeDb gate, per-run prefix, `ensureMigrationSql()` as case-types.test.ts:67-100)
Use DATABASE_TEST_URL only. Cases (raw SQL via the test client, each in its own tenant prefix):
- migration applies cleanly on top of 20261016120100 (`prisma migrate deploy` path covered by ensureMigrationSql)
- CHECK `availability_hours`: weekday -1 and 7 rejected (error code 23514); startMinute -1 rejected; endMinute 1441 rejected; start == end rejected; start > end rejected; boundary 0-1440 accepted
- UNIQUE(tenantId, weekday, startMinute) rejects duplicate (23505); same start in another tenant accepted
- CHECK `availability_closures`: endDate < startDate rejected; equal accepted; blank reason rejected; NULL accepted; reason length 201 rejected (VARCHAR(200))
- UNIQUE(tenantId,startDate,endDate) rejects duplicate
- `appointment_settings.maxDailyBookings` CHECK: 0 and 501 rejected, NULL/1/500 accepted; `availabilityConfiguredAt` nullable, no default (existing rows read NULL = legacy)
- existing appointment_settings rows survive the migration (insert before, apply, assert unchanged) if the harness supports staged migration; otherwise assert column defaults only and say so
- FK ON DELETE CASCADE: deleting tenant removes hours + closures
- RLS: with the `authenticated`-role setup (skip if role missing, mirror case-types.test.ts:405-425) tenant A session cannot SELECT/INSERT/UPDATE/DELETE tenant B rows; WITH CHECK blocks insert with foreign tenantId
- DATE columns: closure `2026-03-29` round-trips without TZ shift when session timezone is 'America/Los_Angeles' (guards DST/timezone drift for date-only values)
- Run on Node 22 (memory: Node 25 hangs pg writes)

### 1.8 Web: `apps/web/src/app/calendar/availability/__tests__/AvailabilityContent.test.tsx` (jsdom pragma, `vi.hoisted`, `vi.mock('@/lib/trpc')`, axe-core; mirrors CaseTypesContent.test.tsx)
- loading skeleton (`AvailabilityLoading`) matches bento, axe clean
- error state with retry
- read-only for non-admin: all inputs disabled/aria-disabled, no Save, read-only note, `canEdit=false`
- unconfigured prefill: shows 07:00-19:00 every day, helper note; first save with only a closure sends full legacy-equivalent hours (guards the "silently closes the firm" risk)
- weekday fieldset: legend per day, Switch name "Monday open", describedby summary; toggle off removes ranges in payload; add range, remove range, 6-range limit disables Add with aria-disabled and message
- positional range names ("Monday range 1 start")
- client validation mirrors validators: overlap error text, `aria-invalid`, `aria-describedby` points to error id, error color classes `text-red-700 dark:text-red-300` and NOT `text-destructive`/`text-red-600`; focus moves to first invalid on failed save
- timezone: TimezoneSelector labelled; note when viewer zone differs from firm zone (use `useTimezoneContext` mock); hours are not converted
- buffers + cap: number inputs with help text; cap empty = "No limit" (payload null); 0 / 501 rejected; buffer 241 rejected; null-for-number bug (BufferRemindersTab.tsx:21) not reproduced: clearing input does not send 0/null accidentally
- closures: Add Closure header button calls forwardRef `openCreate` (adds a draft row, focus into new row); empty state `entity="appointments"`; per-row labels; end < start error; reason 200 limit; remove row; live region announces add/remove; date strings passed as YYYY-MM-DD untouched (no `formatDate`)
- dirty/save: Save disabled until dirty; one `update` call with the whole draft; success refreshes (`utils.invalidate`) and clears dirty; error toast, draft preserved; stable Save label; Save not hidden on mobile
- axe-core zero violations in: default, error, empty closures, read-only, validation-error states
- no horizontal 44px target assertion in jsdom; cover with the Playwright smoke below instead

Calendar-settings updates (`apps/web/src/app/calendar/calendar-settings/__tests__/`):
- `BufferRemindersTab.test.tsx`: remove buffer assertions (:16-17, :41, :62, :69); keep and assert reminder behaviour; assert NO buffer inputs rendered; rename if the tab is now reminders-only (and the test file with it)
- `CalendarIntegrationTab.test.tsx`: replace timezone select assertions (:40, :152-153, :173): assert read-only timezone value text + link with exact text "Manage working hours, buffers and timezone in Availability" and `href="/calendar/availability"`; assert primary calendar + sync still editable
- `CalendarSettingsContent.test.tsx`: fixture (:96-101) keep columns for GET; assert save payload does NOT contain `defaultBufferBeforeMinutes`, `defaultBufferAfterMinutes`, `defaultTimezone` (stale-overwrite guard); dirty detection ignores those fields; axe still clean
- `InboxCalendarSection.test.tsx:47-51`: comment says availability is a stub; update comment and, if feasible, replace negative assertion with a positive link check
- Sidebar/config tests for calendar nav: no change expected; run `apps/web/src/**/configs/**` tests to confirm
- `AppointmentForm.tsx:119-137` duplicates 7-19 on the client: if left untouched, record it as a finding; if the spec touches it, add tests that client hint does not contradict server (server stays authoritative)

### 1.9 E2E (optional, lead decides): `tests/e2e/calendar/availability.spec.ts` (Playwright)
Authenticated E2E never runs in CI (memory), so list as local-only evidence: admin edits Wednesday hours, adds a closure, saves, reloads and sees persisted values; USER sees read-only. Also screenshot at 375px to check the 44px targets and no horizontal scroll. Mark as manual/NEEDS_HUMAN evidence if the auth fixture is unavailable; do NOT claim it ran.

### 1.10 Docs/count reconciliation tests (rerun, update expected numbers)
- `ui-flow-mapping-reconciliation.test.ts:44-93` against `docs/design/ui-flow-mapping.md:5-6` ("69 (403 procedures)"): +3 procedures if three new -> 406; update both together
- `ia-reconciliation.test.ts:45-69` against `information-architecture.md:4`
- page counts (214) unchanged
- any `page-registry` / sitemap / PAGE_MAP tests: add the availability entry if the registry test enumerates pages

## 2. Existing suites to update / rerun (paths)
API (`apps/api`)
- `src/modules/legal/__tests__/appointments.router.caller.test.ts` (update, section 1.5)
- `src/modules/legal/__tests__/appointments.router.test.ts` and `.comprehensive.test.ts` (rerun; fixtures use 2026-02-01 Sunday on the legacy path, so safe only while unconfigured: keep mocks returning null/undefined)
- `src/modules/legal/__tests__/appointment-settings.router.test.ts` (update)
- `src/__tests__/app-router.smoke.test.ts`, `legal-module-entitlement.test.ts`, `container.test.ts` (update/rerun)
- agent tools tests (`src/agent/tools/__tests__/create.test.ts`, `update.test.ts`, `draft-message.test.ts`) assert their OWN 8-19 warnings, not the router rule: rerun only, no change
Packages
- `packages/domain/src/legal/appointments/__tests__/ConflictDetector.test.ts`, `ConflictDetector.b11.test.ts` (rerun; update only if ConflictDetector is edited)
- `packages/application/src/usecases/scheduling/__tests__/CheckConflicts.test.ts` (rerun; update if FindNextSlotInput changes)
- `packages/validators/src/__tests__/appointment-settings.test.ts` (update, section 1.2)
- db barrel: if `packages/db/src/index.ts` export list changes, a db export test (if present) needs the new types
Web
- three calendar-settings test files + `InboxCalendarSection.test.tsx` (section 1.8)
Docs reconciliation tests (section 1.10)

## 3. RED-log procedure
Directory (follow PG-204 layout): `.specify/sprints/sprint-18/execution/PG-202/exec-PG-202-<YYYYMMDD>/tdd/`
- `red-domain-AvailabilityPolicy.log`, `red-validators-availability.log`, `red-api-availability-enforcement.log`, `red-api-availability-router.log`, `red-api-appointments-caller.log`, `red-web-AvailabilityContent.log`, `red-web-calendar-settings.log`, `red-integration-availability.log`
- later `green-<same>.log` per file and one `refactor-*.log` after cleanup
Rules
1. Write the test file first, commit nothing yet. Run the command, capture with `2>&1 | tee <log>` (bash) so exit code is kept: use `set -o pipefail`. First line of each log: `# date -u`, `# git rev-parse HEAD`, `# command`. Last line: `# exit=<code>`.
2. A RED log is valid only if it fails for the RIGHT reason: assertion failure or "module not found" for the not-yet-written file (document which). A log full of syntax/import typos does not count; fix the test and re-capture. For tests of existing code (appointments caller additions, calendar-settings), failure must be an assertion on new behaviour.
3. Do not edit implementation until the RED logs for that layer exist. Order: domain -> validators -> API helper -> router -> appointments caller -> web -> integration (migration SQL needed for the last).
4. GREEN: rerun the identical command, save green log, never overwrite the red log.
5. Counts in the delivery note come from the logs (no hand-typed totals; pipeline-claims rule). Record the vitest summary line verbatim.
6. Commit the logs with the feature (small directional commits, no `git add -A`).
7. Grep every log and staged diff for secret-shaped strings before commit (secret scan rule).

## 4. Exact commands (run from the worktree root; Node 22 required, check `node -v` first)
Slot semaphore: `scripts/with-test-slot.mjs` (package.json:25). The `ops/test-slots/with-slot.mjs` path cited in preship-process.mjs does NOT exist in this worktree (ls returned nothing), so wrap with `node scripts/with-test-slot.mjs --base 2 -- <cmd>` and confirm the flag usage by reading that script first (open question below). Max 3 full runs machine-wide.
- Domain: `node scripts/with-test-slot.mjs --base 2 -- pnpm --filter ./packages/domain exec vitest run src/legal/appointments/__tests__/AvailabilityPolicy.test.ts` (use `./packages/x` form: bare `--filter packages/x` exits 0 matching nothing)
- Domain coverage: `... pnpm --filter ./packages/domain exec vitest run --coverage src/legal/appointments/__tests__/AvailabilityPolicy.test.ts --coverage.include=src/legal/appointments/AvailabilityPolicy.ts`
- Validators: `... pnpm --filter ./packages/validators exec vitest run src/__tests__/availability.test.ts src/__tests__/appointment-settings.test.ts`
- Rebuild after barrel exports: `pnpm --filter ./packages/domain build`, `pnpm --filter ./packages/validators build`, `pnpm --filter ./packages/db build` (db barrel; run `pnpm --filter ./packages/db exec prisma generate` after schema edit, never `--no-engine`), then API tests
- API unit: `... pnpm --filter ./apps/api exec vitest run src/modules/calendar src/modules/legal/__tests__/appointments.router.caller.test.ts src/modules/legal/__tests__/appointment-settings.router.test.ts src/__tests__/app-router.smoke.test.ts src/__tests__/legal-module-entitlement.test.ts`
- Web (default script is watch): `... pnpm --filter ./apps/web exec vitest run src/app/calendar` (one path per RED/GREEN log)
- Integration: with the local test DB only: `DATABASE_URL=$DATABASE_TEST_URL ... pnpm exec vitest run --project integration tests/integration/availability.test.ts` (source `.env.test`, use 127.0.0.1 not localhost on IPv6 flap, Node 22)
- Docs reconciliation: `pnpm exec vitest run <path of the two reconciliation tests>`
- Typecheck/lint/build (mandatory 4 validations): `pnpm --filter ./apps/api exec tsc --noEmit`, same for web/domain/validators, `pnpm lint`, `pnpm --filter ./apps/web build`
- Gate: `git push` triggers pre-ship; no bypass flags. If Docker is down, escalate (do not set PRESHIP_ALLOW_MISSING without confirmation).
- Do NOT use istanbul ignore comments anywhere.

## 5. Diff-coverage strategy (gate: `scripts/check-diff-coverage.mjs`, >=80% changed lines; layer targets Domain >95, Application >90, Overall >90)
- Branch inventory first: for each changed file list branches (legacy null, undefined, unconfigured, each violation code, cap null/not null, excludeId present/absent, invalid tz, DB error). Each branch gets a named test above; this is the table I will use to review the exec diff.
- Edits that carry changed lines but little logic still count: `calendar-settings` component removals (deleted lines are not measured, but new link/read-only value lines are) and the `appointments.router.ts` swap lines; both covered by 1.5 and 1.8.
- Keep the router diff minimal (Aurora boundary 1) so changed lines stay few and all covered by caller tests.
- Collect locally: `pnpm test:coverage` scoped as pre-ship does (related-test scope vs origin/main). Before push run `node scripts/check-diff-coverage.mjs` after the coverage step and inspect uncovered changed lines; add tests, never ignores.
- Page `page.tsx` shell: coverage-gate parity (memory: app page.tsx gate): tests must import the page and render the Suspense shell, otherwise the 3-line file drops diff-coverage; add `availability/__tests__/page.test.tsx`.
- Domain file purity: put as much logic as possible in AvailabilityPolicy (pure, 95%+), keep the API helper thin (load + map), so DB-dependent code is small.
- Sonar new_coverage parity: duplicated-line rule (feedback: Sonar dup gate): do not copy-paste the weekday/DST fixtures across files; share via the factories in 0.
- Merge `origin/main` before SHIP and rerun appointments router tests (Aurora boundary 5); rerun the local DB bootstrap if main brought new migrations (stale test DB lesson).

## 6. Flake and isolation controls
- Fake timers in every date test; restore in afterEach; no `Date.now()` implicit use in the helper (inject `now` where the rule needs it, e.g. findNextSlot start).
- No order dependence: each `it` builds its own mocks (`vi.clearAllMocks` + `mockReset` for `prismaMock`); integration tests use a unique prefix per run and delete their rows in afterAll.
- DST tests assert both the UTC instant and local wall time, so an engine or ICU difference fails loudly. Note Intl "24" normalisation.
- Web: `findBy*` for async, no arbitrary sleeps; `vi.mock('@/lib/trpc')` hoisted.
- Known L5 flake (web coverage worker race): rerun a failing web coverage shard once only to confirm, report both runs.

## 7. Open questions for the lead
1. `AvailabilityPolicy` signature and whether it takes `now`; confirm violation-code priority when several apply (I assumed codes array, ordered CLOSED_DATE, SPANS_MIDNIGHT, OUTSIDE_HOURS, DAILY_CAP_REACHED).
2. TRPC code for DAILY_CAP_REACHED: BAD_REQUEST or CONFLICT (or PRECONDITION_FAILED)? The tests assert exactly one.
3. Touching ranges (09-12, 12-17): valid in validators (my assumption, merged in policy) or rejected? DB UNIQUE only blocks equal starts.
4. Invalid stored timezone at enforcement: fail closed with BAD_REQUEST, or fall back to UTC/legacy? Tests assert one behaviour.
5. `scripts/with-test-slot.mjs` vs `ops/test-slots/with-slot.mjs`: which is the real wrapper in this worktree? I could not find the latter; confirm before logs are captured.
6. Does `update` with `resetToDefaults` need to clear `availabilityConfiguredAt` (my assumption: yes, returns to legacy)?
7. Is ConflictDetector (server-local setHours/getDay) untouched for the legacy path? If findNextSlot configured path no longer calls it, say so; otherwise TZ-dependent tests would flake on non-UTC hosts.
8. E2E: in or out of scope (authenticated E2E never runs in CI)?

</details>

<details><summary>a11y-expert</summary>

# PG-202 Round 2: PROPOSAL (A11Y-EXPERT, WCAG 2.1 AA)

Basis: Round 1 + lead resolutions (single page draft, one Save, ClosuresList forwardRef `openCreate`, read-only for non ADMIN/MANAGER, calendar-settings loses buffer/timezone). Pattern source: `apps/web/src/app/cases/(list)/case-types/components/ResolutionChecklistEditor.tsx` (fieldset/legend :98-99, `<output aria-live>` :104-106, positional labels :110/:124, per-row error ids :111/:130/:175, 44px buttons :137/:151/:165, `aria-disabled` at limit :189, focus effect :47-56). Shared: `shared/section-header.tsx` (`headingLevel={2}`, `titleId`), `shared/page-header.tsx`, `settings/TimezoneSelector.tsx:117` (`id`, `invalid`, `describedBy`).

Colour tokens: error text `text-red-700 dark:text-red-300` (never `text-destructive`, never `text-red-600`). Muted help text stays `text-muted-foreground`.

## 1. Acceptance criteria (each with test method)

Test legend: AXE = `axe-core` run on the rendered component (pattern: `CaseTypesContent.test.tsx`); RTL = Testing Library role/name queries; FOCUS = `document.activeElement` assertion after `userEvent`.

### Structure and headings
1. Exactly one `h1` ("Availability") from `PageHeader`; every card title is an `h2` via `SectionHeader headingLevel={2}`; no `h3` unless inside an `h2` card. RTL: `getAllByRole('heading', {level:1})` length 1; levels list is `[1,2,2,2,2]` in DOM order (Weekly hours, Timezone, Buffers and daily limit, Closures). AXE `heading-order`.
2. Each card is a `<section aria-labelledby={titleId}>` (landmark region named by its h2). RTL: `getByRole('region',{name:'Weekly hours'})` etc. (four regions).
3. DOM order matches visual order: weekly hours, timezone, buffers/cap, closures, then the Save row. RTL: `compareDocumentPosition` across the four region nodes.
4. The page needs no `main` of its own (the calendar layout supplies it); AXE `landmark-one-main` is not asserted at component level, and is checked in the E2E smoke if one exists.

### Weekly hours
5. Seven `<fieldset>`s, each with a `<legend>` containing the FULL day name (Monday ... Sunday, in the order the firm week starts: Monday first, matching the lead's resolution; if Sunday-first is chosen, the order is the DOM order, not CSS). RTL: `getByRole('group',{name:'Monday'})`; seven groups.
6. Each day has a `Switch` named "Monday open" (`aria-label`, or `<Label htmlFor>`; the Switch primitive has no intrinsic name). RTL: `getByRole('switch',{name:'Monday open'})`, `aria-checked` true/false. Switch is a native-focusable `button role=switch`: Space toggles it. FOCUS: after toggling, focus stays on the switch.
7. The switch has `aria-describedby` pointing at a per-day summary `<p id="hours-summary-mon">` with text "09:00 to 17:00" / "09:00 to 12:00 and 13:00 to 17:00" / "Closed". Closed state is TEXT, never colour or opacity alone. RTL: `toHaveAccessibleDescription('Closed')`.
8. Switch off removes the range list and Add range from the DOM (not just visually hidden; no `display:none` leftovers in tab order). Ranges the user had entered are kept in draft state so toggling back on restores them (no data loss). RTL: `queryByRole('list',{name:'Monday hours'})` null when off; back on restores values.
9. Ranges: `<ul aria-label="Monday hours">` of `<li>`, each row with two `type="time"` inputs labelled by the exact accessible names "Monday range 1 start" / "Monday range 1 end" (one name source only: `aria-label`; do not also render a visible `<Label>` pointing at the same input, to avoid the QuietHoursScheduler double-label pattern at `QuietHoursScheduler.tsx:119-128`). A visible "to" separator is `aria-hidden`. RTL: `getByLabelText('Monday range 1 start')`.
10. Remove button: icon-only, `aria-label="Remove Monday range 1"`, `h-11 w-11`. Not rendered when the day has only one range (the Switch is how a day is closed). If product wants removal of the last range, it must go through the Switch. RTL: no Remove button on a one-range day.
11. Add button per day: visible text "Add range", `aria-label="Add Monday range"`. At the 6-range cap it uses `aria-disabled="true"` (NOT `disabled`, so it stays focusable and announces) with `aria-describedby` pointing at help "Maximum 6 ranges per day"; activating it only announces "Maximum of 6 ranges reached for Monday." RTL: `toHaveAttribute('aria-disabled','true')`, live region text after click.
12. Focus management: Add moves focus to the new row's start input; Remove moves focus to the same-index row's start input, else the previous row's start input, and the last remaining row's removal falls back to the day's Add range button. FOCUS assertions for add, remove-middle, remove-last. Uses the `data-range-control="start-<day>-<i>"` selector-in-effect technique from `ResolutionChecklistEditor.tsx:47-56`.
13. Copy-to-weekdays helper (only if the lead keeps it): a button in the Monday fieldset named "Copy Monday hours to Tuesday to Friday" (name states the targets and is generated from the actual target set). It replaces the target days' ranges, so it must (a) announce via the live region "Monday hours copied to Tuesday, Wednesday, Thursday and Friday", and (b) be undoable via an "Undo copy" button shown inside the live announcement area until the next edit, OR be gated behind a confirm dialog. Recommendation: skip the helper in this PR (not in the DoD); if kept, undo is mandatory. RTL: name + live region text; FOCUS: stays on the copy button.
14. Time inputs: `type="time"` with `step={900}`? NO. Do not set `step` (a step > 60 hides seconds but constrains keyboard entry in some browsers); validate on the Zod side instead. Native control chosen for keyboard and screen reader support; display (12h or 24h) follows the browser locale, so the zone note (criterion 19) states which zone the hours are in.

### Validation and errors
15. Per-field errors: `aria-invalid="true"` on the offending input(s) and `aria-describedby` to a `<p id="avail-err-mon-1">` with `text-red-700 dark:text-red-300`. Cases: end not after start ("Monday range 1 must end after it starts"), overlapping or touching ranges ("Monday range 2 overlaps range 1"; touching is allowed per domain merge rule only if the validator allows it, in which case no error), empty time, more than 6 ranges, buffer outside 0-240, cap outside 1-500, closure end before start, closure longer than 366 days, reason over 200 chars. RTL: `toBeInvalid()`, `toHaveAccessibleDescription(...)`.
16. Error summary: on a failed Save attempt (client validation) a summary `<div role="alert" id="avail-error-summary" tabIndex={-1}>` is rendered above the Save row (or at the top of the form) as a heading-less list: "2 problems need fixing" plus a `<ul>` of `<li><a href="#field-id">Monday range 1 must end after it starts</a></li>`. Focus moves to the FIRST invalid field (not the summary) so the screen reader hears field name + error via describedby; the summary is announced via `role="alert"` once. Links jump to the field and `.focus()` it (anchor `onClick` preventDefault + focus, since the time inputs are not scroll anchors in a client SPA). FOCUS: `document.activeElement` is the first invalid input (DOM order, weekly hours before buffers before closures). RTL: `getByRole('alert')` has the count text; links count equals invalid fields.
17. Server errors (FORBIDDEN, CONFLICT, validation, network) render in a `role="alert"` region near Save with plain text and a Retry path; the Save button keeps its name. Focus stays on the Save button.
18. No error is conveyed by colour only: every error has text and the invalid input also carries the red border (non-text contrast 3:1 for the border against the card). AXE `color-contrast` is NOT reliable in jsdom, so contrast is verified by token choice (red-700 on white = 6.5:1, red-300 on slate-900 = 8.7:1 passes 4.5:1) and recorded in the review note, not asserted at runtime.

### Timezone, buffers, cap
19. Timezone card: `<Label htmlFor="availability-timezone">Firm timezone</Label>` + `<TimezoneSelector id="availability-timezone" describedBy="availability-timezone-help" invalid=... />`. Help text: "Weekly hours are wall-clock times in this zone." When the viewer zone differs (`useTimezoneContext().timezone`), an extra `<p>` note (not `role=alert`): "Your browser is in Europe/London; hours here are in America/New_York." "Detect from browser" (in TimezoneSelector) changes the value silently today (`TimezoneSelector.tsx:141-150`): the page wraps `onChange` and writes "Timezone set to X." to the shared live region. RTL: `getByLabelText('Firm timezone')` is the trigger; live text after detect click.
20. Buffers: two `type="number"` inputs, `<Label>` "Buffer before (minutes)" / "Buffer after (minutes)", `min=0 max=240 inputMode="numeric"`, help `<p id>` "0 to 240 minutes" linked by `aria-describedby` (replaced by the error id when invalid, matching `ResolutionChecklistEditor.tsx:130`). Empty is invalid ("Enter 0 to 240"), NOT silently coerced to null (existing bug `BufferRemindersTab.tsx:21` must not be copied; hold the raw string in draft and parse on validate/save). RTL: label, `toBeInvalid` when empty, no null sent.
21. Max daily bookings: a Switch/Checkbox "Limit bookings per day" (default off = unlimited) controlling a number input "Maximum bookings per day" (`min=1 max=500`). When off, the number input is removed from the DOM (or `disabled` with the text "No limit" visible: pick removed). Help text states "Counts scheduled, confirmed, in-progress and completed appointments. Leave the limit off for no limit." RTL: switch name "Limit bookings per day", number input present only when on.
22. Units and context are in the label text (minutes, bookings per day), not the placeholder. No placeholder-only labelling anywhere.

### Closures
23. Closures card: header action is "Add Closure" `<Button size="sm">` in `SectionHeader action`, backed by `ClosuresList` forwardRef `openCreate`. Calling it appends a draft row and moves FOCUS to that row's start-date input. If the Closures list is read-only the button is not rendered.
24. List: `<ul aria-label="Closures">`; each `<li>` has "Closure N start date", "Closure N end date" (`type="date"`, aria-label only), "Closure N reason (optional)" (`type="text" maxLength=200`), Remove `aria-label="Remove closure N (YYYY-MM-DD to YYYY-MM-DD)"` once dates are filled, otherwise "Remove closure N". Since closures sort by date and rows can reorder after entry, the positional index N would shift under the user's hands. Rule: keep DRAFT order (no auto-sort) while editing; sort only after a successful save. RTL queries by those names.
25. Remove closure focus: next row's start date, else previous row's, else the "Add Closure" button. Live region: "Closure 2 removed, 1 closure remains."
26. Empty state: `<EmptyState entity="appointments" phase="passive" size="sm" />`. Check the heading it renders (`packages/ui/.../empty-state.tsx:400-425` interactive variant has an h3 and tabIndex=0): with `phase="passive"` verify it renders no heading above the h2, or that its heading is at h3 inside the Closures region. Add a test that the heading levels sequence stays `[1,2,2,2,2,(3)]`. The passive variant must not be in the tab order (no `tabIndex=0`).
27. Dates are shown as typed (YYYY-MM-DD in the input; locale formatted by the browser), never run through the context `formatDate` (frontend-lead note); the "all-day, inclusive" semantics is in the card description text: "Closed all day, from the start date to the end date inclusive."

### Live region and status
28. ONE page-level `<output aria-live="polite" className="sr-only">` (not several; `<output>` has implicit role status) for add/remove/move/copy/timezone/limit messages, plus `role="alert"` ONLY for the error summary and server errors. Messages are replaced, not appended, and set after state commits (same effect-based approach as :47-56). Save success: "Availability saved." in the same polite region (and a toast is visual only: `aria-hidden` or not relied upon). RTL: `getByRole('status')` text after each action.
29. The live region node exists on first render (empty), so the first announcement is read.

### Save, loading, read-only
30. Save button: stable accessible name "Save changes" (loading shows a spinner `aria-hidden` and sets `aria-busy`/`disabled` while the label text stays). Do NOT use `PageHeader` `hideOnMobile` for Save (`page-header.tsx:153`). Placement: in the PageHeader `actions` array or a sticky bar; either way it is a real `<button>` (`page-header.tsx:165-168`). Disabled when not dirty? A disabled Save with no explanation is a trap: use `aria-disabled` plus help "No changes to save" in the status region, OR keep it enabled. Recommendation: enabled when dirty, `disabled` otherwise, with the dirty state announced by text "Unsaved changes" (visible, not colour-only) near the button. Unsaved-changes navigation: `beforeunload` is browser-native; no custom modal needed.
31. After a successful save the draft is reset to server data and focus stays on Save; after a failed save focus goes to the first invalid field (client) or stays on Save (server).
32. Loading: `AvailabilityLoading` skeleton wrapper has `aria-busy="true"` and an `sr-only` "Loading availability" in a status region; skeleton shapes `aria-hidden`.
33. Read-only (non ADMIN/MANAGER; `canEdit=false` from `get`): a note `<p id="availability-readonly-note" role="note"?` NO: plain `<p>` (no role) placed directly after the PageHeader: "You can view availability but only admins and managers can change it." Every control is rendered as `disabled`/`readOnly` and the note is linked via `aria-describedby` on each fieldset (not on every input). Use `<fieldset disabled>` wrapping all editable regions so a single attribute disables all descendants (as `ResolutionChecklistEditor.tsx:98`), Save and Add/Remove buttons are not rendered. Disabled controls are NOT in the tab order, so read-only users get the values as text: each weekday summary paragraph (criterion 7) stays visible and is the source of truth, and the closures list shows plain text rows ("2026-12-24 to 2026-12-26, Christmas"). Ensures read-only users with a screen reader still get all information. RTL: no Save, no Add buttons, note present, `getByText('09:00 to 17:00')`.
34. Error state (query failed): `role="alert"` message with a Retry button, mirroring `CaseTypesContent.tsx:123-133`.

### Keyboard, targets, motion, responsive
35. Complete keyboard operation without a pointer. Tab order inside a day: Switch, range 1 start, range 1 end, Remove (if any), ... Add range. Days follow in order. No positive `tabindex`, no `tabIndex=-1` on interactive controls, no keyboard trap (TimezoneSelector's Radix select closes with Esc and returns focus to the trigger). Tab stops worst case: 7 days x (1 switch + 6 ranges x 3 + 1 add) = 140, which is why criterion 8 removes closed days' controls and a typical week is about 7 x 5 = 35. This is acceptable for WCAG 2.1 AA (no tab stop limit) but the page offers a skip aid: a visually-hidden-until-focus "Skip to closures" link is NOT proposed (over-engineering); the `section` regions give screen reader users landmark navigation instead.
36. Targets: icon buttons `h-11 w-11` (44px); the Switch row and Add range buttons have at least 44px height on touch (WCAG 2.5.5 is AAA, but PG-204 set 44 as the repo standard). Reflow at 320px (1.4.10): ranges row wraps (`flex-wrap`), no horizontal scroll; the bento collapses to one column below `lg` (`grid-cols-1 lg:grid-cols-12`).
37. Focus visible on all controls (the `ring-2` tokens already used, `page-header.tsx:88`); custom `div` controls are not used; all controls are native or Radix.
38. No timed content, no motion beyond `active:scale-95`; `prefers-reduced-motion` is respected by the spinner (`animate-spin` is minor; existing pattern, not a regression).
39. Language: dates and times are not in a different language; the timezone label text is from `Intl`.

### Automated checks
40. AXE zero violations in four states of `AvailabilityContent`: default (configured), unconfigured (prefilled legacy 07-19), error (summary shown plus invalid fields), empty closures, read-only. Same helper as the case-types test. Rules explicitly on: `label`, `aria-valid-attr-value` (describedby targets exist: the helper must render every referenced id), `duplicate-id`, `heading-order`, `region`, `aria-required-children` for lists (no `role=list` on `ul` overriding), `form-field-multiple-labels`.
41. Every `aria-describedby`/`aria-labelledby` id referenced exists in the DOM at render (RTL helper `expectNoDanglingIdrefs(container)`), since an unlinked help id is the most common silent failure.

## 2. Exact markup patterns

(JSX shapes; class names abbreviated; use `@intelliflow/ui` `Button`, `Input`, `Label`, `Switch`, `Card`.)

### 2.1 Page shell
```tsx
<div className="space-y-4 sm:space-y-5">
  <PageHeader
    breadcrumbs={[{label:'Dashboard',href:'/dashboard'},{label:'Calendar',href:'/calendar'},{label:'Availability'}]}
    title="Availability"
    description="Working hours, timezone, buffers and closures for your firm."
    actions={canEdit ? [{label:'Save changes', icon:'save', variant:'primary', onClick:save, disabled:!isDirty, loading:saving}] : []}
  />
  <output aria-live="polite" className="sr-only">{announcement}</output>   {/* the ONE status region, always mounted */}
  {!canEdit && (
    <p id="availability-readonly-note" className="text-sm text-muted-foreground">
      You can view availability but only admins and managers can change it.
    </p>
  )}
  {errorSummary && (
    <div role="alert" id="availability-error-summary" tabIndex={-1} className="rounded-lg border border-red-700 p-3 text-sm text-red-700 dark:text-red-300">
      <p className="font-medium">{errorSummary.length === 1 ? '1 problem needs fixing' : `${errorSummary.length} problems need fixing`}</p>
      <ul className="list-disc pl-5">
        {errorSummary.map(e => <li key={e.fieldId}><a href={`#${e.fieldId}`} onClick={ev => {ev.preventDefault(); document.getElementById(e.fieldId)?.focus();}}>{e.message}</a></li>)}
      </ul>
    </div>
  )}
  <form onSubmit={...} noValidate aria-describedby={!canEdit ? 'availability-readonly-note' : undefined}>
    <fieldset disabled={!canEdit} className="contents">   {/* contents so the grid is unaffected */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5"> ...cards... </div>
    </fieldset>
  </form>
</div>
```
Notes: `noValidate` because native validation bubbles are not accessible-consistent across browsers; the page owns the error text. `fieldset className="contents"` keeps `disabled` inheritance without a layout box. The "Save changes" action is in `PageHeader`; if Save must also be reachable at the bottom, add the same `<Button type="submit">Save changes</Button>` in a footer row, but only ONE of them in the DOM per breakpoint (no duplicate names).

### 2.2 Weekly hours card
```tsx
<Card as="section" aria-labelledby="weekly-hours-title" className="lg:col-span-8 p-4 sm:p-5">
  <SectionHeader icon="schedule" iconBg=... iconFg=... title="Weekly hours" titleId="weekly-hours-title" headingLevel={2}
    description="Set when appointments can be booked, in the firm timezone." />
  <div className="space-y-4">
    {DAYS.map(day => (
      <fieldset key={day.key} className="border-t pt-3 first:border-0 first:pt-0">
        <legend className="text-sm font-medium text-foreground">{day.name}</legend>
        <div className="flex items-center gap-3">
          <Switch id={`open-${day.key}`} checked={d.open} onCheckedChange={...}
                  aria-label={`${day.name} open`} aria-describedby={`hours-summary-${day.key}`} />
          <p id={`hours-summary-${day.key}`} className="text-sm text-muted-foreground">{summary(d)}</p>
        </div>
        {d.open && (
          <>
            <ul aria-label={`${day.name} hours`} className="mt-2 space-y-2">
              {d.ranges.map((r, i) => (
                <li key={r.key} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input type="time" aria-label={`${day.name} range ${i+1} start`} data-range-control={`start-${day.key}-${i}`}
                           id={`${day.key}-${i}-start`} value={r.start} aria-invalid={err ? true : undefined}
                           aria-describedby={err ? `${day.key}-${i}-err` : undefined} className="w-32" />
                    <span aria-hidden="true" className="text-sm text-muted-foreground">to</span>
                    <Input type="time" aria-label={`${day.name} range ${i+1} end`} ... />
                    {d.ranges.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" className="h-11 w-11 p-0"
                              aria-label={`Remove ${day.name} range ${i+1}`} onClick={() => remove(day, i)}>
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
                      </Button>
                    )}
                  </div>
                  {err && <p id={`${day.key}-${i}-err`} className="text-xs text-red-700 dark:text-red-300">{err}</p>}
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="outline" className="mt-2 min-h-11"
                    ref={addRef(day.key)} aria-label={`Add ${day.name} range`}
                    aria-disabled={atCap || undefined} aria-describedby={atCap ? `${day.key}-cap-help` : undefined}
                    onClick={() => add(day)}>Add range</Button>
            {atCap && <p id={`${day.key}-cap-help`} className="text-xs text-muted-foreground">Maximum 6 ranges per day.</p>}
          </>
        )}
      </fieldset>
    ))}
  </div>
</Card>
```
Why `aria-label` with visible "Add range": the accessible name contains the visible text ("Add range" is included in "Add Monday range"? NO: WCAG 2.5.3 Label in Name needs the visible label text to appear in the accessible name as a contiguous string. "Add Monday range" does NOT contain "Add range". Fix: make the visible text and the name match: visible "Add range" with `aria-label="Add range, Monday"`, or visually-hidden suffix `<span className="sr-only"> for Monday</span>` (name = "Add range for Monday"). Choose the sr-only suffix; same for Remove (icon-only, so label-in-name is not applicable). This corrects Round 1 criterion wording "Add Monday range": use "Add range for Monday". Tests assert the new name.)

### 2.3 Timezone card (col-span-4)
```tsx
<Card as="section" aria-labelledby="tz-title" ...>
  <SectionHeader ... title="Timezone" titleId="tz-title" headingLevel={2} description="Weekly hours are wall-clock times in this zone." />
  <Label htmlFor="availability-timezone">Firm timezone</Label>
  <TimezoneSelector id="availability-timezone" value={tz} onChange={onTz} invalid={!!tzErr} describedBy={tzErr ? 'tz-err' : 'tz-help'} />
  <p id="tz-help" className="text-xs text-muted-foreground">{viewerDiffers ? `Your browser is in ${viewerTz}; hours above are in ${tz}.` : 'Applies to all weekly hours.'}</p>
  {tzErr && <p id="tz-err" className="text-xs text-red-700 dark:text-red-300">{tzErr}</p>}
</Card>
```
`onTz` sets the draft and announces `Timezone set to ${tz}.`

### 2.4 Buffers and limit card (col-span-4)
```tsx
<Label htmlFor="buffer-before">Buffer before (minutes)</Label>
<Input id="buffer-before" type="number" inputMode="numeric" min={0} max={240} value={raw.before}
       aria-invalid=... aria-describedby={err ? 'buffer-before-err' : 'buffer-help'} />
<p id="buffer-help" className="text-xs text-muted-foreground">0 to 240 minutes of free time around each appointment.</p>
... same for after ...
<div className="flex items-center gap-3">
  <Switch id="cap-on" checked={capOn} onCheckedChange={...} aria-label="Limit bookings per day" aria-describedby="cap-help" />
  <label htmlFor="cap-on">Limit bookings per day</label>   {/* visible label; ensure single name source: drop the aria-label if label htmlFor is used */}
</div>
{capOn && (<><Label htmlFor="cap-max">Maximum bookings per day</Label>
  <Input id="cap-max" type="number" inputMode="numeric" min={1} max={500} .../></>)}
<p id="cap-help" className="text-xs text-muted-foreground">Counts scheduled, confirmed, in-progress and completed appointments. Off means no limit.</p>
```
Use `<label htmlFor>` only for the Switch (no duplicate aria-label), consistent with `CalendarIntegrationTab.tsx:76-89`.

### 2.5 Closures card (col-span-8)
```tsx
<Card as="section" aria-labelledby="closures-title" ...>
  <SectionHeader ... title="Closures" titleId="closures-title" headingLevel={2}
    description="Dates the firm is closed all day, from the start date to the end date inclusive."
    action={canEdit ? <Button size="sm" type="button" onClick={() => closuresRef.current?.openCreate()}>Add Closure</Button> : undefined} />
  <ClosuresList ref={closuresRef} ... />
</Card>

// ClosuresList
rows.length === 0
  ? <EmptyState entity="appointments" phase="passive" size="sm" className="py-4 px-3 gap-2" />
  : <ul aria-label="Closures" className="space-y-3">
      {rows.map((c, i) => (
        <li key={c.key} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" aria-label={`Closure ${i+1} start date`} data-closure-control={`start-${i}`} .../>
            <Input type="date" aria-label={`Closure ${i+1} end date`} .../>
            <Input type="text" maxLength={200} aria-label={`Closure ${i+1} reason (optional)`} className="flex-1 min-w-[12rem]" .../>
            <Button type="button" size="sm" variant="ghost" className="h-11 w-11 p-0" aria-label={removeLabel(c, i)} onClick={...}>...</Button>
          </div>
          {err && <p id={`closure-${c.key}-err`} className="text-xs text-red-700 dark:text-red-300">{err}</p>}
        </li>
      ))}
    </ul>
```
`removeLabel`: `Remove closure N` when dates are empty, `Remove closure N, YYYY-MM-DD to YYYY-MM-DD` otherwise. Read-only mode renders `<ul aria-label="Closures"><li>2026-12-24 to 2026-12-26, Christmas</li></ul>` as text (no inputs).

Imperative handle: `useImperativeHandle(ref, () => ({ openCreate: () => { addRow(); setFocusTarget({kind:'start', index: rows.length}); announce(`Closure ${rows.length+1} added.`) } }))`. The header button is outside the list, so it is in the tab order BEFORE the list; focus must move into the new row (criterion 23).

### 2.6 Read-only note: see 2.1 (plain `<p>`, linked by `aria-describedby` on the form). Do not use `role="alert"` (static information, not an event). Do not use `aria-disabled` on inputs (use real `disabled` via fieldset). Read-only values remain readable as text (criterion 33).

### 2.7 Error summary and live region: see 2.1. Rules: summary links use `href="#field-id"` with `preventDefault` + `focus()`; focus moves to the FIRST invalid field (not the summary); `role="alert"` content is set once per failed attempt (clear then set on the next attempt so repeated failures re-announce).

### 2.8 Loading
```tsx
<div aria-busy="true"><output className="sr-only">Loading availability</output><div aria-hidden="true">...skeletons...</div></div>
```

## 3. calendar-settings change

Current: `CalendarSettingsContent.tsx:154-192` (tabs inside deprecated `ModuleSettingsLayout`), `BufferRemindersTab.tsx:33-60` (buffers), `CalendarIntegrationTab.tsx:92-111` (timezone select), save payload `:116-120`.

Proposal:
- Buffer & Reminders tab: delete the two buffer inputs; keep the reminder input; add above it a pointer paragraph.
- Calendar Integration tab: replace the timezone `Select` with a read-only line and link.
- Both pointers use the same markup (no `role`, no `aria-live`):
```tsx
<div className="flex flex-col gap-1.5">
  <span id="availability-pointer-label" className="text-sm font-medium">Working hours, buffers and timezone</span>
  <p className="text-sm text-muted-foreground">
    Currently {tz}, {before} min before and {after} min after each appointment.{' '}
    <Link href="/calendar/availability" className="text-primary underline underline-offset-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      Manage working hours, buffers and timezone in Availability
    </Link>
  </p>
</div>
```
  Link text is descriptive out of context (2.4.4), identical in both tabs, not "click here", has an underline (not colour-only, 1.4.1) and the standard focus ring (`page-header.tsx:88`). The "Currently ..." values are shown as text so the user keeps the information that used to be editable; values come from `settingsQuery.data` (read-only, no local state).
- Tests: remove the buffer assertions (`BufferRemindersTab.test.tsx:16-17,41,62,69`) and timezone assertions (`CalendarIntegrationTab.test.tsx:40,152-153,173`); add RTL `getByRole('link',{name:'Manage working hours, buffers and timezone in Availability'})` with `href="/calendar/availability"` in both tabs; `CalendarSettingsContent.test.tsx:96-101` payload must NOT contain `defaultBufferBeforeMinutes`, `defaultBufferAfterMinutes` or `defaultTimezone`.
- The `Label htmlFor="defaultTimezone"` pointing at a trigger (`CalendarIntegrationTab.tsx:93`) disappears with the select, removing one label/control mismatch.
- Also fix while here (small, in scope since the file is touched): the remaining `defaultReminderMinutes` field keeps its `htmlFor`, but `BufferRemindersTab.tsx:21` sets `null` on empty for the number state; keep the reminder semantics ("no reminder" is valid) but add `aria-describedby` help "0 to 60 minutes, empty for no reminder". If the lead wants to limit scope, record this as a finding instead.

## 4. Governance doc rows (verified latest rows first)

WCAG statement `docs/compliance-and-governance/compliance/wcag-conformance-statement.md` revision table: latest row is **1.8.0 | 2026-10-13 | Engineering (PG-201)** (:270). Next row is **1.9.0**. `/calendar/availability` and `/calendar/calendar-settings` are ALREADY in the scope list (:51), so route count is unchanged (follow the PG-201 wording at :270):

`| 1.9.0   | 2026-10-17 | Engineering (PG-202)          | /calendar/availability stub replaced at the same URL (route count unchanged); /calendar/calendar-settings modified (buffer and timezone editing replaced by a link to Availability); per-weekday labelled fieldsets, switch plus time-range list with positional names, single polite status region, error summary with focus on the first invalid field, text for every closed or error state; axe checks in component tests; a11y-expert WCAG 2.1 AA review passed, no conformance claim degraded |`

(Keep the table's column padding; also check whether the header "Last updated"/version lines elsewhere in the file reference 1.8.0 and bump them: `grep -n "1.8.0" wcag-conformance-statement.md`.)

VPAT `docs/compliance-and-governance/compliance/vpat-2.5.md` revision table: latest row is **1.9.0 | 2026-10-13 | Engineering (PG-201)** (:150). Next row is **1.10.0**:

`| 1.10.0  | 2026-10-17 | Engineering (PG-202)          | /calendar/availability stub replaced at the same URL and /calendar/calendar-settings modified (route count unchanged, 92); a11y-expert WCAG 2.1 AA review passed, no new conformance exceptions |`

(Also check the VPAT front matter for a version/date line that names 1.9.0 and bump it.) The row text must not claim "review passed" until the Round 3/4 a11y sign-off and the post-implementation review have actually happened; the implementer writes the row at SHIP with the real review result (per the "pipeline claims must match the transcript" rule), so this proposal supplies the TEMPLATE, not a pre-attested claim. If the review finds a minor issue, follow PG-204's wording (":269 ... a11y-expert review PASS WITH MINOR").

## 5. Corrections to my Round 1 and open items for the lead

- Round 1 item 5 said "Add Monday range"; WCAG 2.5.3 (Label in Name) requires the accessible name to contain the visible label. Use visible "Add range" + `sr-only` " for Monday" (name "Add range for Monday"). Remove buttons are icon-only so keep "Remove Monday range 1".
- Decide: Copy-to-weekdays helper. Recommendation is to cut it (not in DoD; announcement and undo burden). If kept, criterion 13 is mandatory.
- Decide: week start day (Monday vs Sunday) for DOM order; domain uses 0=Sunday storage, UI order is a presentation choice but must match visual order.
- Decide: can the last range of a day be removed? Recommendation: no, closing is via the Switch.
- Confirm EmptyState passive variant heading level (`packages/ui/src/components/empty-state.tsx:400-425`) with frontend-lead before relying on criterion 26.
- Backend dependency recap: the calendar-settings save/reset must stop touching buffers and timezone (already resolved by the lead), otherwise the pointer text shows values the other page can overwrite.

</details>

## Lead resolutions after Round 2 (input to the draft spec and Round 3)

1. **Roles:** `AVAILABILITY_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES` (ADMIN, MANAGER plus the forward-compatible OWNER,
   SUPER_ADMIN, which rank above admin; none exist in ROLE_HIERARCHY today), with an honestly named helper
   `isAvailabilityAdminRole()`. Matches owner Q5 ("Admins + Managers").
2. **`DEFAULT_APPOINTMENT_SETTINGS`** is exported from appointment-settings.router.ts (no second copy) so the
   availability upsert can create the settings row.
3. **findNextSlot configured path** uses the domain `nextCandidateStart` + a single-slot conflict check + the cap check
   for that day, looping with bounded attempts. It does NOT feed rules into `ConflictDetector.findNextAvailableSlot`
   (server-local `setHours/getDay`), so no `skipWeekends` flag and no ConflictDetector edit. The unconfigured path is the
   unchanged call (9/17, weekends skipped).
4. **resetToDefaults:** deletes hours + closures, sets `maxDailyBookings` and `availabilityConfiguredAt` to NULL. Keeps
   buffers and timezone (AppointmentSettings columns that also drive booking defaults). Tenant returns to legacy rules.
   (Supersedes the lead's earlier note that reset sets buffers to 0.)
5. **Errors:** every policy violation maps to `TRPCError BAD_REQUEST` with a fixed, user-readable message per code
   (the message is the stable contract). `INVALID_TIMEZONE` at enforcement maps to `PRECONDITION_FAILED` ("The firm
   timezone is invalid. An administrator must fix it in Calendar > Availability."). DAILY_CAP_REACHED is BAD_REQUEST.
6. **Validator:** touching ranges allowed (merged by the policy); overlapping ranges rejected (path of the later range);
   duplicate or overlapping closures rejected; IANA zone validated and canonicalised.
7. **UI:** Monday-first display (storage 0 = Sunday); no "Copy to all weekdays"; last range of a day not removable (the
   Switch closes the day); Switch off keeps the day's ranges in the draft but sends none; daily cap via a "Limit
   bookings per day" Switch + number input (UI-only control, not persisted as a Boolean); read-only users get
   `<fieldset disabled>` + text summaries and no Save/Reset actions; Save label "Save Changes" (playbook Title Case);
   Reset is a PageHeader action behind `ConfirmationDialog`; closures keep draft order while editing; an error summary
   (`role="alert"`) on a failed save with focus on the first invalid field; EmptyState renders an h3 (empty-state.tsx:425,
   :512) under the Closures h2, so heading order holds.
8. **calendar-settings:** both tabs show the current firm values as text + the link "Manage working hours, buffers and
   timezone in Availability"; save payload, `mapSettings`, `normalize` and the description stop carrying buffers +
   timezone.
9. **AppointmentForm.tsx:118-138:** delete the client-side 07-19 duplicate; the server message is shown. No change to
   attendee/client/assignee/conflict logic. Disclosed to Aurora in the PR body.
10. **Slot wrapper:** the real wrapper is `C:/Users/talys/ops/test-slots/with-slot.mjs` (outside the repo; used for the
    package build at provisioning).
11. **E2E:** out of scope (authenticated E2E never runs in CI); not claimed.
12. **No new appointments index;** cap best-effort (ADR-081).

## Round 3 — CHALLENGE (same 6 agents, against the draft spec; requested 2026-10-17T16:12:38Z, all written by 2026-10-17T16:15:50Z; verbatim)

Verdicts: backend-architect 0/5/7, data-engineer 0/3/5, frontend-lead 2/6/6, domain-expert 0/4/5, test-engineer 3/7/6, a11y-expert 2/6/7 (blockers/major/minor).

<details><summary>backend-architect</summary>

# PG-202 Round 3 CHALLENGE: backend-architect

Spec read: PG-202-spec.md (draft, 375 lines) + "Lead resolutions after Round 2" (discussion :1421-1455).
Verdict: BLOCKERS: 0 / MAJOR: 5 / MINOR: 7

## Challenges

### M1 (MAJOR) findNextSlot configured loop is N+1 on the database; NF-001 is false as written
- Spec :143-146 loops `nextCandidateStart` -> `container.checkConflictsUseCase.checkConflicts` per candidate, up to 200 attempts.
- `checkConflicts` runs `appointmentRepository.forTenant(tenantId).findForConflictCheck(...)` on EVERY call (packages/application/src/usecases/scheduling/CheckConflicts.ts:100-105). Today's `findNextSlot` loads once for the whole horizon (CheckConflicts.ts:210-215). So the configured path goes from 1 repository query to up to 200, plus one cap `count` per distinct local date.
- NF-001 (spec :310-311) says "No N+1 in findNextSlot ... cap counts cached per local date". That is only true for the cap; the conflict check is N+1 by construction. `maxDaysAhead` is up to 365 (appointments.router.ts:162) and the procedure has no rate limit beyond the global one.
- `checkConflicts` also builds a `TimeSlot` + `Buffer` per call and requires `attendeeIds: string[]` (CheckConflicts.ts:12-20), not the single `attendeeId` of `FindNextSlotInput` (:49-59); the wrapper must pass `[attendeeId]`.
- Fix (keeps ConflictDetector untouched, honours lead resolution 3): add ONE application-layer method on `CheckConflictsUseCase`, e.g. `findFirstFreeCandidate({ tenantId, attendeeId, candidates: {start,end}[], bufferMinutesBefore, bufferMinutesAfter })`: one `findForConflictCheck` over [first candidate - buffer, last candidate + buffer], then `ConflictDetector.checkTimeSlotConflicts` per candidate in memory (the same pure call used at CheckConflicts.ts:108-112). Candidates come from the pure `nextCandidateStart` generator (no I/O) with the cap pre-filtered via ONE `appointment.findMany({ select: { startTime }, where: { tenantId, status in CAP_COUNTED_STATUSES, startTime in [horizonStart, horizonEnd) } })` bucketed with `toZonedParts` (only when a cap is set), instead of a count per date. Total: 1 settings read, 2 child reads, <= 1 conflict read, <= 1 cap read. Application layer stays infra-free (packages/application/CLAUDE.md rule 2).
- If the lead insists on no use-case change: clamp the configured path to `min(maxDaysAhead, 60)` and attempts to 50, and correct NF-001 to state the true query count.

### M2 (MAJOR) `update` write order permits a lost update / merged state between two admins
- Spec :127-129 order: `deleteMany`+`createMany` hours, then closures, then `appointmentSettings.upsert` LAST. Postgres default isolation is read committed. Admin A and admin B save concurrently: each `deleteMany` sees only committed rows; each `createMany` inserts different rows (A: Mon 09-12, B: Mon 13-17, no unique collision). Both commit and the stored week is the UNION neither admin submitted. Last-writer-wins is not guaranteed; P2002 only fires when the two inserts hit the same (tenantId, weekday, startMinute) (data-engineer UNIQUE, discussion :149-150).
- Fix: make the settings upsert the FIRST statement in the transaction. It takes a row lock on `appointment_settings` for the tenant, so the second transaction blocks until the first commits, then its `deleteMany` sees and removes the first's rows. Same ordering in `resetToDefaults` (do the `updateMany` first).
- Optional stronger guard: send the `availabilityConfiguredAt` the form loaded (`expectedConfiguredAt`) and reject with CONFLICT when it differs (inside the same tx, after the upsert lock). Cheap optimistic concurrency, and it gives the CONFLICT message a real trigger. Needs a field on `UpdateAvailabilityInput`.

### M3 (MAJOR) Deploy-order slip takes down booking for every tenant
- `loadTenantAvailability` selects `availabilityConfiguredAt` on EVERY create/reschedule (spec NF-001 :309). If the API ships before the manual prod migration (spec :12 says it "must happen before"), Prisma raises P2022 (missing column) and `appointments.create/reschedule` return 500 for ALL tenants, including never-configured ones. Even `appointmentSettings.get` (no `select`, appointment-settings.router.ts:29-32) would break once the client knows the new columns: calendar settings dies too.
- Fix (spec edit): in the loader, catch ONLY Prisma `P2021`/`P2022` (missing table/column; use the `prismaCode()` shape from case-types.router.ts:98-101), log loudly, and return `{ configured: false }` (identical to today's behaviour, so not "silently open" relative to prod). Every other DB error propagates. Add a test for it. State the deploy order in the PR body as planned.

### M4 (MAJOR) First save can silently change the governing timezone
- Unconfigured create uses `input.timezone` (appointments.router.ts:513; legacy). After the first save, the firm zone governs and `input.timezone` is ignored (spec AC-015 :281).
- `get` with no settings row returns timezone 'UTC' (spec :125-126), and an existing lazily created row also holds the column default 'UTC' (schema defaultTimezone @default("UTC"), discussion :44). An admin at a London firm who adds only a closure on first save (the prefill case the spec protects, :359) saves 'UTC' and every later booking is evaluated in UTC, off by an hour all summer, with no visible error.
- Fix: when `!isConfigured`, `get` returns `timezone = settingsRow?.defaultTimezone` only if the row exists AND its value is not the untouched default... which cannot be detected. So instead: unconfigured `get` returns `timezone = ctx.user.timezone ?? settingsRow?.defaultTimezone ?? 'UTC'` (`ctx.user.timezone` is already used in home.router.ts:1383, appointments.router.ts:612; `User.timezone @default("Europe/London")`, discussion :43), and the TimezoneCard shows a short "Confirm your firm timezone" note while `!isConfigured`. Add to AC-003/AC-017.

### M5 (MAJOR) Dead-on-arrival: configured findNextSlot path has no production consumer
- Census: `findNextSlot` callers are only the procedure itself, router tests and CheckConflicts tests (grep of repo ts/tsx/py/json: appointments.router.ts, 3 router test files, container.test.ts, CheckConflicts.ts + test; nothing under apps/web, apps/ai-worker, or the agent tools). Web uses only `appointments.create` (apps/web/src/app/appointments/new/page.tsx:42) and `.reschedule` (apps/web/src/app/appointments/[id]/page.tsx:51); the agent path calls `create`/`reschedule` via `createCaller` (apps/api/src/agent/approved-action-executor.ts:226, :244-260).
- The spec's wiring row (:225) admits "no web caller today". Under the repo's Dead Endpoint Policy, ~100+ lines (domain `nextCandidateStart`, wrapper, tests) that are reachable only through an endpoint nobody calls is the exact shape reviewers flag.
- The owner ruling (Q3 = B) requires findNextSlot enforcement, so the work stays. Required spec edit: add a "Consumers" sentence naming the endpoint as an API-only capability (external tRPC clients), state the pre-existing zero web callers, and file an issue for a "next available" UI. Do not claim UI wiring. Keep the configured loop small (see M1) so the unconsumed surface is minimal.
- Everything else is wired: `availability.get/update/reset` (page), `assertAppointmentWithinAvailability` (create at :513, reschedule at :787, web + agent callers), `availabilityConfiguredAt` (writer + reader).

## Edge Cases

- E1 Termination of the loop: advancing to `slot.end` on conflict is strictly > candidate start, so progress is guaranteed ONLY if `nextCandidateStart({ from })` returns a start >= `from` and the previous candidate start < `from`. Spec :144-145 does not state the invariant. Add: "each iteration's `from` must be strictly greater than the previous candidate start; the loop breaks otherwise", plus a unit test with a conflict that ends exactly on an aligned boundary and one whose buffer (not the appointment) causes the overlap.
- E2 Alignment mismatch: `stepMinutes = 60` aligned to local hour (spec :89) means a conflict ending 10:30 yields next candidate 11:00, same as the legacy whole-hour loop (ConflictDetector hour stepping), acceptable; but a firm whose hours start 09:30 never gets a 09:30 candidate with aligned-hour stepping. Define alignment as "range start, then every step minutes" rather than clock hour.
- E3 Buffers: `findNextSlotSchema` defaults buffers to 0 (appointments.router.ts:163-164), so `!== undefined` is always true and a Buffer is always built (CheckConflicts.ts:193-203). Not an issue, but the spec should say the slot must fit the hours WITHOUT buffers (domain-expert rule, discussion :177) while conflicts are checked WITH buffers (as the legacy loop adds buffer to duration).
- E4 Recurrence: `create` accepts `recurrence` (appointments.router.ts:116); the use case stores one appointment with a recurrence pattern (ScheduleAppointment.ts:77-97, 134-138), so only the FIRST occurrence is checked against hours/closures/cap. Later occurrences can land on a closure date. Out of scope, but must be listed in Risks (spec :366) and the findings doc; today's 7-19 check has the same gap.
- E5 `get` with no settings row: spec :125-126 is correct (no write). The `update` upsert create branch needs `DEFAULT_APPOINTMENT_SETTINGS` for the required columns (appointment-settings.router.ts:10-20). Use `Promise.all` for the three reads in `get` (no transaction needed).
- E6 P2002 reachability (spec :130): reachable in three real ways: (a) two admins insert the identical (weekday, startMinute) row; (b) first-time settings row creation racing `appointmentSettings.get`'s lazy create (appointment-settings.router.ts:34) or another admin's upsert on the `tenantId` unique; (c) duplicate closure (tenantId, startDate, endDate). With M2's lock-first ordering (a) and (c) collapse to (b) plus the optimistic check. The CONFLICT message is correct for all three. Test (b) explicitly, not only the hours unique.
- E7 `ctx.user.tenantId` vs `ctx.tenant.tenantId`: identical by construction (trpc.ts:410-411). In Vitest `createTenantScopedPrisma` returns the raw mock (tenant-context.ts:152-154) and RLS is not exercised, so ONLY explicit `tenantId` in every `where` protects tests and the AC-020 assertion; keep the "every call carries tenantId" test (spec :328-329), including `appointment.count`.
- E8 Admin-gated writes use `ctx.user.role`; the `CASE_TYPE_ADMIN_ROLES` list includes OWNER/SUPER_ADMIN, which are absent from ROLE_HIERARCHY (tenant-context.ts:51-56); fine, matches lead resolution 1.

## Integration Issues

- I1 Moved legacy helper is verbatim-safe: `getLocalHour` is used only by `assertWithinBusinessHours` (grep: appointments.router.ts:334-335); the helper references only `TRPCError`, `Intl` and the two constants; the router-local `tenantProcedure` shadow (:307-314) is a separate const the helper never touches, and sits between the constants (:196-197) and the helper (:316-358), so deleting :196-197 and :316-358 leaves it intact. Required in the new file: `import { TRPCError } from '@trpc/server'`. The only behaviour change: the legacy path now runs AFTER an awaited settings read, so any test double of `prismaWithTenant` lacking `appointmentSettings` throws a TypeError instead of the BAD_REQUEST. Fix by adding `prismaMock.appointmentSettings.findUnique.mockResolvedValue(null)` in the shared setup/`beforeEach` of appointments.router.caller/comprehensive/router tests rather than relying only on the `undefined` guard (spec :135-136), which is production code shaped by a test artifact (real Prisma returns `null`, never `undefined`). Keep the guard, but do not make it the only mechanism.
- I2 Stale doc comment above the constants (appointments.router.ts:191-195, "Update both sides in sync") and the swap comments (:512, :786, :1139) must be updated or removed with the code.
- I3 `DEFAULT_APPOINTMENT_SETTINGS` export side effects: `availability.router.ts` importing from `appointment-settings.router.ts` pulls in a router module (and `trpc.ts`) for a constant, and breaks wherever a test does `vi.mock('.../appointment-settings.router')` (the pattern used by `routerMock(...)` in apps/api/src/agent/__tests__/approved-action-executor.test.ts:29-30), where the import would be `undefined`. Prefer moving the constant to `apps/api/src/modules/legal/appointment-settings.defaults.ts` (pure, no imports) and re-importing it in both routers. `as const` keeps `defaultTimezone: 'UTC'` as a literal type; spreading into `create` is fine, and a typed `AppointmentSettingsDefaults` avoids literal narrowing leaking into the upsert `update` branch.
- I4 `AvailabilityPrisma` typing: `ctx.prismaWithTenant` is typed `PrismaClient` (tenant-context.ts:45) even though it is `$extends` output (cast at :142-145), and `$transaction` callbacks receive `Omit<PrismaClient, ...>` (the `CaseTypeTx` derivation, case-types.router.ts:37). `Pick<PrismaClient, 'appointmentSettings' | 'availabilityHour' | 'availabilityClosure' | 'appointment'>` accepts both, and a `DeepMockProxy<PrismaClient>`. Narrower is better for tests: type only the delegate methods used (`appointmentSettings.findUnique`, `availabilityHour.findMany`, `availabilityClosure.findMany`, `appointment.count`) via `Pick<PrismaClient['appointment'], 'count'>` etc. Needs `pnpm --filter @intelliflow/db` generate before typecheck passes (new models), and the db barrel allowlist (db/src/index.ts :23-101).
- I5 Agent path: `approved-action-executor.ts` calls `appointmentsRouter.createCaller(ctx).create(...)` with NO `timezone` (:226-238) and `reschedule` (:260-264). For a configured tenant an already-approved AI appointment can now be rejected at execution with BAD_REQUEST. The executor test mocks the router (approved-action-executor.test.ts:29-30), so no test would notice. Add one executor test asserting the BAD_REQUEST message surfaces as a failed execution (not a crash), and mention it in the PR body.
- I6 `appointments.update` cannot change times (updateAppointmentSchema, appointments.router.ts:122-132), so reschedule/create are the only time-setting entry points: no bypass through `update`. Good; state it in the spec as the enforcement census so reviewers see it was checked.
- I7 `appointmentSettingsSchema` / `UpdateAppointmentSettingsInput` consumers: census web and api usages before omitting keys (validators/src/appointment-settings.ts:47-54), otherwise typed callers still passing the fields fail typecheck rather than being stripped at runtime.

## Dead-On-Arrival Risk

Wired and verified: availability.get/update/resetToDefaults (page, via sidebar `calendar.ts:15-17`), `assertAppointmentWithinAvailability` (create :513, reschedule :787; web pages apps/web/src/app/appointments/new/page.tsx:42 and [id]/page.tsx:51; agent executor :226/:260), `availabilityConfiguredAt`, `loadTenantAvailability`, `AVAILABILITY_ADMIN_ROLES` (router). At risk: only the configured findNextSlot path (M5). `capCountWindow` is used by the enforcement helper; `nextCandidateStart` only by the findNextSlot path: if M5 were resolved by dropping the path, it would be dead too.

## Error contract

- Messages are fixed and user readable (spec :197-203), but `OUTSIDE_HOURS` ("fit inside the firm's working hours for that day") does not tell the user what the hours are. Allowed to include data without breaking the contract: "Appointments on Monday must fall within 09:00-12:00 or 13:00-17:00 (Europe/London)." Keeps the code-to-message mapping one place (the helper).
- UI string matching is brittle: add `cause: { code: 'OUTSIDE_HOURS' | ... }` to the TRPCError (the router already uses `cause` objects for CONFLICT, appointments.router.ts:816-817) so AppointmentForm can key off the code. Verify the tRPC error formatter exposes `cause` data before relying on it; if it does not, keep message-only and say so.
- `PRECONDITION_FAILED` for INVALID_TIMEZONE (spec :202) is consistent with case-types.router.ts:258. `CONFLICT` for P2002 matches :106-109.

## Suggestions (concrete spec edits)

1. Technical Approach / API (spec :143-146) and NF-001 (:309-311): replace the per-candidate `checkConflicts` loop with the single-read design in M1 (new `CheckConflictsUseCase.findFirstFreeCandidate`, plus one cap `findMany`), or state the clamps and correct the NF-001 wording.
2. API `update` (:127-129) and `resetToDefaults` (:131-133): "the first statement in the transaction is the `appointmentSettings` upsert/updateMany (row lock), then hours, then closures"; add optional `expectedConfiguredAt` optimistic check; add a concurrent-save test (two admins, different ranges, expect last-writer-wins not union).
3. `loadTenantAvailability` (:135-136): catch P2021/P2022 only, log, return `{ configured: false }`; add test; add "deploy order" line to Risks (:365).
4. API `get` (:124-126) and AC-003/AC-017: unconfigured timezone prefill from `ctx.user.timezone ?? settingsRow?.defaultTimezone ?? 'UTC'` plus UI confirm note.
5. Runtime Wiring table (:225): reword the findNextSlot row to "API-only capability; no web caller (pre-existing); issue filed for a UI".
6. Appointment-settings changes (:153-154): move `DEFAULT_APPOINTMENT_SETTINGS` to `appointment-settings.defaults.ts` instead of exporting from the router (I3).
7. Test Requirements (:326-336): add (a) P2022 fallback, (b) concurrent update lock order, (c) P2002 on the settings upsert, (d) loop-progress invariant and 1-query assertion for findNextSlot, (e) executor BAD_REQUEST surfacing, (f) legacy tests set `appointmentSettings.findUnique -> null` explicitly.
8. Risks (:366): add recurrence occurrences not checked (E4) and the first-save timezone trap (M4).
9. Implementation reminders: rebuild domain/validators/application dists after barrel changes (packages/domain/CLAUDE.md, packages/validators/CLAUDE.md, packages/application/CLAUDE.md); no `container.ts` change is needed if the new use-case method is added to the existing `CheckConflictsUseCase` (container.ts builds it once, per discussion :41), but verify with a runtime check as apps/api/CLAUDE.md requires.

</details>

<details><summary>data-engineer</summary>

# PG-202 Round 3 CHALLENGE — data-engineer

Verdict: 0 BLOCKERS / 3 MAJOR / 5 MINOR.
Read: PG-202-spec.md (draft), discussion "Lead resolutions after Round 2", my R2 migration, plus the code cited below.

## Challenges

### M1 (MAJOR) — `update` order lets two concurrent admins persist a state the validator forbids
Spec "API" (spec:127-130) runs `deleteMany`+`createMany` for hours and closures and only then `appointmentSettings.upsert`.
Under READ COMMITTED, admin A and admin B both delete the old rows, then each inserts its own rows. The unique
`(tenantId, weekday, startMinute)` only trips when both write the same start minute (A: Mon 09-12, B: Mon 13-17 -> both commit,
no P2002, and the tenant now has both ranges). The same applies to closures. The result is a union nobody saved, and a
configured tenant whose data fails `updateAvailabilitySchema`. P2002 -> CONFLICT (spec:130, AC-010) does not cover this.
Fix: make the settings upsert the FIRST statement in the transaction. It takes the row lock on the `tenantId`-unique row, so the
second writer blocks until the first commits and then deletes the first writer's rows. For a first save with no row, two
simultaneous upserts hit P2002 on `appointment_settings_tenantId_key` -> CONFLICT, which is the right outcome.
Apply the same order to `resetToDefaults` (the `updateMany` first, then the deletes). Add a test asserting call order
(upsert before deleteMany) — the Prisma mock records order.

### M2 (MAJOR) — "RLS with WITH CHECK" gives no protection in this app, and the spec/tests present it as if it did
`createTenantScopedPrisma` (`apps/api/src/security/tenant-context.ts:150-195`) issues a session-level `SET app.current_tenant_id`
once per request via the BASE client (`prisma.$executeRawUnsafe`, :186), and short-circuits to the raw client under VITEST (:157-160).
The header (:120-140) says outright that RLS "is NOT the tenant boundary here": the SET can leak across pooled connections, and
tables do not `FORCE ROW LEVEL SECURITY` (`tests/integration/rls-tenant-isolation.test.ts:12`). Consequences:
- The app role is the table owner/BYPASSRLS path; `USING`/`WITH CHECK` on the new tables are defence in depth for other roles (Supabase
  `authenticated`) only. AC-018 / AC-020 "RLS WITH CHECK" security negative path must not be claimed as proof of app-level isolation;
  the app-level proof is the explicit `tenantId` filter on every query.
- Inside `$transaction`, the SET is issued on a different connection than the transaction's, so if the app role ever became
  non-bypass, `WITH CHECK` would reject legitimate writes on a stale session value. Not a bug today; record it as a reason NOT
  to FORCE RLS on these tables.
- Gate 5 (`rls-tenant-isolation.test.ts`) does not enumerate case_types or the new tables (grep: no table list), so "existing suite re-run"
  is not evidence for the new tables. Only the new `availability.test.ts` is. State that in the attestation.
Suggestion: reword AC-018/AC-020/Security negative paths to "explicit tenantId filtering proven by router tests; RLS proven on
the `authenticated` role in integration (skipped, disclosed, when the role is absent)".

### M3 (MAJOR) — Class A "autonomous through production" is not evidenced for gates 4, 7, 10; spec header must not imply it
No staging environment is referenced in `.github/workflows/migration.yml` (grep "staging": no hits). `ci.yml:334` and
`test-regression.yml:599` build the DB with `db:push`, and only `migration.yml:280/387` and `performance-gate.yml:138` use
`migrate deploy`. So gate 4 (staging) cannot be satisfied by anything the lane can run; gate 7 needs a snapshot id; gate 10-prod needs
the prod run. The spec says this in Risks (spec:365) which is right; also say in the spec header (spec:12) and PR body that the
migration is **merged but not applied** until the owner supplies gates 4/7/10-prod, and that the API must not deploy first
(migration-before-API). Otherwise `calendar.availability.get` and `appointmentSettings.get` (which select `maxDailyBookings`,
`availabilityConfiguredAt` as part of the model) fail with P2022 on every tenant, including booking (the loader reads
`appointment_settings` on EVERY create/reschedule, NF-001). That is the dead-on-arrival path: see below.

## Challenges — specific items asked

1. **Prisma `@db.Date` round trip.** The client uses `@prisma/adapter-pg` (`packages/db/src/client.ts:2,124`). Precedent for `@db.Date`
   exists (`schema.prisma:5952`, "UTC day bucket"), so UTC-midnight `Date` in/out is the established convention and the spec's
   `new Date(`${s}T00:00:00.000Z`)` / `toISOString().slice(0,10)` is consistent with it. It is not proven for a non-UTC server or session
   timezone; the spec's integration test line (spec:337-338, "DATE round-trip under a non-UTC session timezone") is right — make it
   concrete: `SET TIME ZONE 'Pacific/Auckland'` (UTC+12/13) on the session, write 2026-03-29 via Prisma, read back both through Prisma and
   raw `SELECT "startDate"::text`, expect `2026-03-29` in both. Also run one unit test with `process.env.TZ` NOT used (repo bans it) by
   asserting the converter functions are pure UTC (`getUTC*`), not local getters.
2. **Validator minutes vs DB CHECK.** Validator `startMinute 0..1439`, `endMinute 1..1440`, start < end (spec:95) vs DB
   `start >= 0`, `end <= 1440`, `start < end` (my migration). They are equivalent: start < end <= 1440 implies start <= 1439, and
   0 <= start < end implies end >= 1. No gap, no contradiction. Integration test must still insert (1440,1440), (-1,5), (0,1441), (5,5).
3. **UNIQUE(tenantId,startDate,endDate) vs overlap rule.** The unique rejects only identical ranges; the validator rejects any overlap
   (spec:101-103). Validator is strictly stronger, so the DB never rejects something the validator accepts. The DB offers no
   protection for partial overlap (see M1). Acceptable; it is why M1's lock ordering matters. Touching hours ranges are allowed and
   the unique does not forbid them (distinct startMinute).
4. **`resetToDefaults` `updateMany` with no row.** `updateMany` with no match returns `{count:0}` and does not throw, so it is safe, and the DTO
   returns "unconfigured" from defaults. But the transaction then deletes hours/closures that cannot exist without a settings row (they
   are only written by `update`, which upserts the row), so no inconsistency arises. Test it explicitly (spec test list does not).
   Do NOT replace with `update`: it throws P2025 when the row is missing.
5. **CI `db push` vs SQL-only objects.** Confirmed: `ci.yml:334` runs `db:push`. It will create both tables, the two `appointment_settings` columns,
   uniques and indexes, but NOT any CHECK, the NOT-VALID/VALIDATE pair, or RLS. So the `appointment_settings_maxDailyBookings_check`
   is also missing in CI exactly like the other CHECKs; `ensureMigrationSql` must therefore add it (my R2 §5 does, guarded by pg_constraint).
   Probe constraint choice: probe `availability_hours_range_check`; if only the appointment_settings CHECK is missing (partially migrated
   local DB), the replay path must still add it — safer to probe BOTH conname values and replay when either is absent.
   Also `performance-gate.yml` and `migration.yml` use `migrate deploy`, so those jobs DO get the CHECKs: the Prisma-declared index names
   must match Prisma defaults or `migrate diff`/drift checks flag them (they do match; verified lengths <= 52).
6. **Is `app.current_tenant_id` ever set?** Yes, but only by `createTenantScopedPrisma` (tenant-context.ts:186) in non-test mode, once per request,
   session level, base-client connection. Under Vitest it is never set. See M2.
7. **Integration test on shared :5433.** `case-types.test.ts:67-85` `DROP TABLE ... CASCADE` + replay on whatever DB `DATABASE_URL` points to. Two
   lanes running integration concurrently against the same persistent :5433 can interleave one lane's DROP with another's inserts, and a
   stale :5433 schema (memory: stale local test DB after merging main) can fail unrelated suites. The repo already has
   `scripts/lib/ephemeral-test-db.mjs` (fresh per-run database + `migrate deploy`), which would also exercise the real migration file and
   the NOT VALID/VALIDATE pair instead of a statement replay. Recommendation: the availability integration run should be executed through the
   ephemeral DB (migrate deploy applies the actual file, so `ensureMigrationSql` becomes a probe-only no-op there) and, when only
   `db push` DB is available, fall back to the replay. Take a test slot via the wrapper (`ops/test-slots/with-slot.mjs`, resolution 10)
   for the integration run; the pre-ship gate runs everything under it already (`scripts/pre-ship.mjs:441-449`).

## Edge Cases
- Timezone change after saving: hours/closures stay as written and are reinterpreted in the new zone; no data migration. Document in ADR-081 and the UI note.
- A tenant deleted: CASCADE removes hours/closures; `appointment_settings` also CASCADE; no orphan risk.
- Closure of 366 days across a year boundary: `DATE` arithmetic fine; validator span uses UTC date math (not local `Date` diff — DST would give 365.96 days).
- `reason` of whitespace: CHECK `btrim(reason) <> ''` rejects; validator trims first and maps blank to `null` so the CHECK is only a backstop; test that the router sends `null`, not `''`.
- Cap 0: rejected by CHECK 1..500; UI "no limit" = `null`. Lowering the cap below today's existing bookings only affects new bookings (document).
- `createMany` with 7x6 = 42 hours rows and 200 closures in one statement each: fine for parameters (well under the 65k limit).
- Empty `days` (all closed) with `availabilityConfiguredAt` set: valid "closed every day"; every booking rejected with OUTSIDE_HOURS. This is intended, but the UI Save should warn/confirm when all seven days are closed (suggest, not required).

## Integration Issues
- `appointmentSettings.get` returns the full model, so after migration its response gains `maxDailyBookings`/`availabilityConfiguredAt`; check its output Zod/DTO for `.strict()` and the web `mapSettings`. Not a DB issue, but it is a hidden coupling to the new columns (`appointment-settings.router.ts` get/lazy-create).
- `appointmentSettings.resetToDefaults` update branch (spec:153-154) must not null the new columns; confirm the "defaults minus buffers/timezone" object cannot include them (it is built from `DEFAULT_APPOINTMENT_SETTINGS`, which has neither).
- `packages/db/src/index.ts` barrel: also grep for a tenant-scoped model registry (e.g. query-budget / tenant-model lists in `packages/db/src/`) in case new models must be registered; none found in the directory listing, but implementer must grep `AppointmentSettings` across `packages/db/src` before declaring done.
- Prisma Tenant relations are `@ignore`; `ctx.prismaWithTenant.availabilityHour` relation includes are not needed. Do not add `include: {tenant}`.
- Seeds/fixtures: `packages/test-fixtures` or `prisma/seed` create `appointment_settings`? Not affected (new columns nullable), but run `grep -rn appointmentSettings.create` to confirm no fixture builds the model with a strict type that now misses fields (they are optional, so no).

## Dead-On-Arrival Risk
1. **Deploy order.** API before migration -> `P2022 column does not exist` on `appointment_settings` select in the loader on EVERY create/reschedule/findNextSlot, i.e. all booking breaks, not just the new page. Mitigations to specify: (a) the loader must not be on the legacy-critical path without a guard — wrap the availability load so a missing-column/table error (Prisma `P2021`/`P2022`) falls back to the legacy rule and logs, so a lagging migration degrades to today's behaviour; (b) PR body migration-first note (already in spec); (c) pre-deploy check `information_schema` for the two columns. Option (a) is cheap and keeps Aurora boundary 4 true during rollout; decide with backend-architect, because swallowing P2022 must not mask real errors (only these two codes, only in the loader).
2. **Local DB stale.** The shared :5433 may lack the new columns; every appointments router integration/e2e that runs real Prisma will fail until reprovisioned. Mention in the exec handoff.
3. **`db push` CI is fine** (columns/tables created from schema.prisma), but CI never has the CHECKs; any CI test that depends on a CHECK firing must call `ensureMigrationSql` (the integration one does).
4. **Migration checksum**: do not edit the migration file after it is committed and applied anywhere (`migrate deploy` checksum). Freeze after Gate 1 review.

## Suggestions
1. Reorder `update`/`reset` to lock the settings row first (M1) and add the ordering test.
2. Wrap the loader's settings/hours/closures read so Prisma P2021/P2022 degrade to `{configured:false}` with a logged warning (DOA #1), only if backend-architect agrees; otherwise keep the deploy-order note and add a startup/smoke check.
3. Reword RLS claims (M2) and say in the attestation that the app-level boundary is the explicit tenantId filter.
4. Replace the 'staging' gate wording with an explicit NEEDS_HUMAN row and a "merged, not applied" statement (M3).
5. Integration test: probe both CHECK names; run through `ephemeral-test-db.mjs` where available; concrete non-UTC DATE assertion; insert-failure matrix (weekday 7/-1, start -1, end 1441, start==end, endDate<startDate, blank reason, cap 0/501, duplicate hours, duplicate closure, cross-tenant FK to a missing tenant -> 23503, tenant delete cascade, `resetToDefaults` with no row).
6. Add a router test: `update` for tenant with no settings row creates it via `DEFAULT_APPOINTMENT_SETTINGS` and sets `availabilityConfiguredAt`; a second concurrent-style test where `appointmentSettings.upsert` rejects P2002 -> CONFLICT.
7. Keep the migration at one file (`20261017130000_availability`); the second timestamp is not needed.

</details>

<details><summary>frontend-lead</summary>

# PG-202 Round 3 - Frontend CHALLENGE (frontend-lead)

Verdict: BLOCKERS 2, MAJOR 6, MINOR 6. Paths relative to apps/web/src unless noted. Spec = PG-202-spec.md (draft).

## Challenges

### BLOCKER B1 - Reschedule rejections are silently swallowed; AC-022 only covers AppointmentForm
Evidence:
- The only web callers of `appointments.reschedule` are `app/appointments/[id]/page.tsx:51,87-93` (`handleReschedule` -> `mutateAsync`, no catch) feeding `components/appointments/AppointmentDetail.tsx:21,700-704`.
- Every dialog action goes through `AppointmentDetail.tsx:89-98`: `try { await action() } finally { setIsActionLoading(false); setActiveDialog(null); setDialogInput('') }`. There is NO catch. So when the new availability check rejects the reschedule: the dialog CLOSES, the typed start/end are discarded, the rejection escapes as an unhandled promise rejection, and nothing is shown. The user sees the dialog vanish and assumes success (the detail page does not refetch because `onSuccess` never ran).
- The spec makes this path newly rejectable (AC-015, Runtime Wiring row `assertAppointmentWithinAvailability` -> "appointment detail reschedule") but the Web table, AC-022 and the Test Requirements mention only `AppointmentForm`. Enforcement without a visible rejection on reschedule is dead-on-arrival UX for half the enforced surface.
Required: add `AppointmentDetail.tsx` (reschedule dialog) and/or `[id]/page.tsx handleReschedule` to the Web table, an AC ("a rejected reschedule keeps the dialog open and shows the server message in a role=alert region, input preserved"), and tests. Minimal correct change: `handleAction` gets a `catch` that stores `actionError`, only closes the dialog on success (move `setActiveDialog(null)` into the try after `await action()`), and renders `actionError` with role="alert" in the dialog. This also fixes the same swallow for confirm/complete/cancel/no-show (pre-existing; mention, do not widen scope beyond the shared handler). If the lead wants the smaller diff: toast in `handleReschedule` (`toast({variant:'destructive', description: error.message})`) and rethrow nothing, but the dialog still closes and loses input - I rate that a fallback, not the fix.

### BLOCKER B2 - Spec contradiction: Save disabled by hasConflict, yet errors/focus appear only "on a failed save"
Evidence: spec AC-008 disables Save when `!isDirty || isSaving || hasConflict`; spec/lead resolution 7 adds an `role="alert"` error summary "on a failed save with focus on the first invalid field"; my R2 proposal showed inline errors after a failed attempt or blur. A failed save attempt is impossible while Save is disabled. Concrete trap: "Add Closure" appends a row with empty dates; `safeParse` fails (date regex) so `hasConflict` is true and Save is disabled with NO visible reason (a fresh row has not been blurred). Keyboard and screen-reader users cannot discover why. Also a Zod `superRefine` (overlaps) does not run until the field-level schema passes, so overlap errors appear only after the empty field is fixed (two-step discovery).
Required decision (pick one, put it in the spec):
 (a) Save enabled whenever `canEdit && isDirty && !isSaving`; on click run `safeParse`, show summary, focus first invalid (matches the lead's focus requirement; deviation from playbook "hasConflict" must be named), or
 (b) keep the playbook rule but validate live and render per-field errors immediately (no "after blur" gating) PLUS a persistent status line next to Save ("2 problems to fix") linked with `aria-describedby` on Save.
I recommend (b) + the status line; (a) is acceptable.

### MAJOR M1 - `ModuleSettingsLayout` reset dialog text becomes false
`components/settings/ModuleSettingsLayout.tsx:159-167` hard-codes "This will restore all settings to their factory defaults. This action cannot be undone." for /calendar/calendar-settings. After this PR `appointmentSettings.resetToDefaults` no longer resets buffers/timezone (spec Api section) and (spec) also nulls `primaryCalendarId`. The toast in `CalendarSettingsContent.tsx:134-137` ("Appointment settings have been restored to defaults.") is also over-broad. Also the sidebar there is the layout's own Save/Reset (:119-137), so removing fields does not break `isDirty` (it is `normalize(local) !== normalize(initial)` at CalendarSettingsContent.tsx:108-111, computed from remaining fields only) - but: `normalize` (:54-66) and `mapSettings` (:24-52) MUST drop the three fields, else a stale `settingsQuery.data` refetch after an Availability save would not be dirty-affecting only because both snapshots move together; dropping them is still right (payload at :116-120 is the real stale-write risk). Required: either add an optional `resetDescription` prop to `ModuleSettingsLayout` (EXTENDS shared; small) or accept and document the inaccurate text. I recommend the optional prop: "Resets durations and reminder to defaults. Buffers and timezone are managed in Availability and are not changed." Add to Web table + a test.

### MAJOR M2 - PageHeader `actions` cannot do what the spec assumes
Evidence `components/shared/page-header.tsx`: `PageAction` has `label,onClick,href,icon,variant('primary'|'secondary'),hideOnMobile,disabled,loading` (:18-34). There is no `destructive` variant, no `aria-busy`, no `aria-describedby`/`id`/`aria-disabled`. Consequences:
- Reset as destructive: use `variant: 'secondary'` and rely on the `ConfirmationDialog variant="destructive"` (works; no red button needed). OK.
- Disabled Save: rendered with the `disabled` attribute (:166). When the user saves, `isDirty` flips false and the focused Save button becomes disabled -> focus drops to `<body>` (the exact failure `CaseTypesContent.tsx:99` comments about). Spec says "stable Save label" so the key `label + index` (:241) stays stable (good), but focus loss remains. `loading: true` also sets `disabled` (:166).
- Cannot point `aria-describedby` at the read-only note or the "N problems" status line.
Options: (1) EXTEND `PageAction` with optional `ariaDisabled`, `describedBy`, `id` (additive, backward compatible; keeps the shared header) - recommended; (2) render Save/Reset as plain `<Button>`s in the `children` slot (:234) - loses right alignment on desktop; (3) accept focus loss and move focus to the `<output>` live region after save. I recommend (1) and listing `page-header.tsx` in the Web table as EXTENDS with its test. Whichever is chosen must be in the spec; today it says "REUSES, no change".
- Also `hideOnMobile` must stay false (:153) as already noted.

### MAJOR M3 - Prefill and note over-claim; the legacy rule is not "07:00-19:00" everywhere
Spec AC-017 and the unconfigured prefill claim a single default. Actual legacy rules differ: create 07-19 any day in `input.timezone`, reschedule 07-19 in UTC, findNextSlot 09-17 weekdays (spec Overview). An unconfigured note saying "bookings use the default 07:00-19:00 rule" is true only for create. Also the first save is a behaviour change for the tenant (firm zone now governs instead of `input.timezone`; midnight-spanning bookings newly blocked; weekends/closures newly enforceable). Required: note copy must say "Until you save, the built-in booking rule applies (07:00-19:00 any day). Saving switches this firm to the availability you set here." and the spec must record that wording as a contract. Also `PREFILL_LEGACY` hard-codes 07:00-19:00 in `availability-draft.ts` while the API has its own legacy constants: two copies drift. Export one constant (e.g. `LEGACY_BUSINESS_HOURS = { startHour: 7, endHour: 19 }` from the domain or validators, which web already imports - precedent: web imports runtime values from `@intelliflow/validators`, e.g. ACCOUNT_TIER_COLOR_TOKENS) and use it in both. This also answers the repo rule "never populate fields with fake values": the prefill must be the real rule from one source.

### MAJOR M4 - AppointmentForm: catch + display is under-specified and the event-timezone field becomes misleading
Evidence:
- `app/appointments/new/page.tsx:42-60`: `handleSubmit` awaits `createMutation.mutateAsync` with no catch; `components/appointments/AppointmentForm.tsx:144-166` awaits `onSubmit` with no catch; so today a server rejection is an unhandled rejection and nothing is shown (the spec's own risk row says so). `isSubmitting` is `createMutation.isPending` (page :70-ish) so the button re-enables - the user sees nothing.
- AppointmentForm is used only by `/appointments/new` (grep: only new/page.tsx imports it). `isEdit` exists in the component but no edit page uses it; so "create" is the only form path.
- The form has an "Event Timezone" `TimezoneSelector` (`AppointmentForm.tsx:292-296`) defaulting to the viewer zone and sends `timezone` (:153). For configured tenants the rule ignores `input.timezone` (AC-015), so the field no longer affects validation but still looks like it does. A London firm member in New York picks 09:00 "America/New_York" and is rejected against firm hours with a message that does not say the firm zone or hours.
Required: (1) catch inside `AppointmentForm.handleSubmit`, set `formError` from `error.message` (TRPC messages are safe, fixed strings), render `role="alert"` above the actions, scroll/focus to it; non-availability errors (e.g. ownership FORBIDDEN from #890) show through the same region, which is correct. (2) Append the firm zone and day hours to availability messages OR add a static helper under the Start field for configured tenants ("Firm hours are set in Europe/London"). The message contract in the spec is fixed strings without zone; amending `OUTSIDE_HOURS` to include the zone is cheap and makes the rejection actionable (ask backend; if rejected, add a hint line in the form fed by `calendar.availability.get`, which is a read the form can do - but then spec "client-side availability pre-validation out of scope" must say a hint is not pre-validation). (3) State in the spec that `eventTimezone` no longer governs enforcement and add a one-line help text, or leave the field alone and file a finding. (4) Keep `aria-describedby`/`aria-invalid` for start/end when the server error is time-related: map code-free messages by text is brittle; with message-only contracts just use the form-level alert.

### MAJOR M5 - Switch-off "keeps ranges in draft, sends none" breaks dirty/validation unless computed from the payload
Resolution 7 keeps hidden ranges. `normalize()`/`isDirty` and `safeParse` must run on `toUpdateInput(draft)` (what will be sent), not on the draft, else (a) hidden overlapping ranges block Save with an invisible error, (b) toggling a day off then on again is "dirty" vs. the snapshot differently than the sent payload suggests. Also validator issue paths are `['days', d, 'ranges', j, ...]` where `d` indexes the Sun..Sat array (spec DTO) while the UI is Monday-first: the path->control mapping needs an explicit helper with a test (off-by-one on Sunday is the likely bug). Add both to Web tests (`availability-draft.test.ts`).

### MAJOR M6 - Bundle (L11) is asserted, not measured
The page imports runtime Zod schemas (`updateAvailabilitySchema`) in a client component. `packages/validators` depends on `@intelliflow/domain` (package.json:96) and the new validator "derives limits from domain constants" and uses `isValidTimezone` from domain; if the tsup bundle inlines or the barrel pulls the domain module graph, the page's first-load JS grows beyond the <300KB budget. Web already imports runtime values from the validators barrel (precedent exists), so this is a risk not a proof. Required: add an AC/step to record `/calendar/availability` first-load JS from `next build` output and compare with a sibling settings page (case-types); if large, import from a leaf entry (validators has subpath exports, e.g. `./required-url`) or keep client-only constants in the validators file with no domain import.

## Edge Cases
1. Unconfigured + untouched page: `isDirty` false so Save is disabled; an admin cannot save "keep 07-19, just switch to the firm-zone rule" without changing a field. Decide: enable Save when `!isConfigured && canEdit` (label unchanged) or document that any change is required. (MINOR)
2. Timezone canonicalisation: validator transforms to `resolvedOptions().timeZone` (e.g. `Asia/Calcutta` -> `Asia/Kolkata`). After save the response differs from the draft; refresh both snapshots from the response (R2 plan does), and keep `TimezoneSelector`'s "append unknown value" behaviour (TimezoneSelector.tsx:121-123) for stored zones the runtime does not list. The selector also has a "detect browser timezone" button (:147-155) that sets the FIRM zone to the viewer's browser zone: wrong affordance on a firm-level field next to a viewer-zone note. Hide it via a prop (EXTENDS, additive) or confirm it is acceptable. (MINOR)
3. Closure row keys: new rows use client keys, saved rows come back with ids; replacing state from the response remounts rows and drops focus. Keep the client `key` stable by reusing keys positionally when snapshotting. (MINOR)
4. Closure dates in a western viewer zone: build display from the `YYYY-MM-DD` string with a UTC formatter (as proposed); a test must run with a mocked viewer zone (e.g. America/Los_Angeles) and assert the displayed day equals the stored day. (covered in R2; ensure it is in AC-006 tests)
5. `<input type="time">` cannot express 24:00; spec allows `endMinute` 1440 (validator 1..1440, domain 24:00 exception). Spec Web section never says how the UI shows or enters a 24:00 end. A tenant configured via API with 1440 would render `00:00`, which parses as 0 (< start) and fails validation on any edit. Decide: UI maps 1440 <-> "23:59"? (then end becomes 1439 on first save, silently shortening); or an "Until midnight" checkbox per range; or the validator rejects 1440 from the UI. (R2 B1 asked this; not resolved in the spec.) (MAJOR for correctness; counted here as one of M-level items via M5/this - treat as MAJOR #7 if you count strictly)
6. Concurrency: another admin saves between load and Save; `update` replaces everything (deleteMany + createMany) - last write wins with no version check, and the P2002 CONFLICT message is the only guard. For a whole-page replace this loses the other admin's closures silently. Suggest sending `updatedAt` precondition or accept and state it. (MINOR)
7. Read-only users: `<fieldset disabled>` makes controls unfocusable; the text summary is the accessible content (good). Radix Switch/Select are buttons so the native fieldset disable works, but the TimezoneSelector browser-detect Button inside also gets disabled (fine).
8. Mobile 360px: seven weekday fieldsets each with 2 time inputs + 44px buttons; use `grid-cols-1 sm:grid-cols-[1fr_1fr_auto]` per range so inputs do not cram (playbook section 1 mobile note). Test at the Loading skeleton too.
9. `beforeunload` guard (R2) plus Next.js client navigation: sidebar links do not trigger `beforeunload`; unsaved draft is lost silently on sidebar navigation. Either accept (consistent with calendar-settings) and say so, or skip the guard to avoid a half-measure. (MINOR)

## Integration Issues
- calendar-settings tabs: `CalendarIntegrationTab.tsx:13,37` imports `getAvailableTimezones`; after removing the Select the import and `defaultTimezone` field must go (else lint unused). `DurationDefaultsTab` is unaffected. The three tests listed by test-engineer are right; also `CalendarSettingsContent.test.tsx` mock of `ModuleSettingsLayout` (:70-82) bypasses the dialog, so the new `resetDescription` prop needs its own layout test.
- `calendar/actions.ts` (`revalidateCalendar`): availability changes do not affect the cached calendar events (events are appointments); no revalidation needed. Verified file only handles `CALENDAR_EVENTS`/user tags (actions.ts:1-24) and has no availability logic - spec need not touch it. But `revalidateCalendarCache(user.id)` in `appointments/new/page.tsx:47` runs only in `onSuccess`, so a rejected create correctly does not revalidate.
- tRPC client: web uses `api` (`lib/api`) for appointments and `trpc` (`lib/trpc`) for settings pages; the new content component should use `trpc.calendar.availability.*` like `CalendarSettingsContent.tsx:71-79` and case types; confirm the generated client exposes the nested `calendar.availability` sub-router (type check will tell; calendar router already used as `trpc.calendar.list`).
- Server shell: the current `availability/page.tsx:1` is `'use client'` with a hard-coded body. The new `page.tsx` must drop `'use client'` (server component) and wrap the client `AvailabilityContent` in `Suspense` as `case-types/page.tsx:9-19`. Note `app/calendar/loading.tsx` (generic 4-card skeleton) already shows during navigation; the page-level `AvailabilityLoading` is a second, different skeleton for the same load (flash of two shapes). Either accept (as PG-204 does if `cases` has a similar route loading) or drop the Suspense fallback duplication; minor.
- Docs: `docs/design/page-registry.md` has no entry (spec lists it) - fine. Confirm the sidebar `id` in `configs/calendar.ts` is `availability` (spec cites :15-17; I verified `event-types` at :12, adjacent).

## Dead-On-Arrival Risk
| Surface | Risk | Evidence / mitigation |
|---|---|---|
| Availability page -> API | Page ships before migration/API in prod: `get` 500s, whole page shows error state | Spec flags manual prod migration; web must show the CaseTypes-style error + Retry (`CaseTypesContent.tsx:123-133`), test it |
| Enforcement visible to users | Reschedule rejection invisible | B1 |
| Create rejection visible | Form swallows | M4 |
| Daily cap UI | Cap enforced best-effort only; UI copy must not promise a hard limit ("up to N bookings per day; simultaneous bookings may exceed it") | NF-004 |
| Buffers | They now live on this page; confirm a runtime consumer exists: `AppointmentSettings.defaultBuffer*` are read by whom? Spec says "read by availability get/enforcement and appointmentSettings.get" but enforcement (AC-015) does not apply buffers to hours; findNextSlot takes buffers from input (spec findNextSlot loop). If no code reads the saved buffers to apply them to bookings/new-form defaults, moving the editor here keeps a setting with no effect (same as today, but now on a page that promises "booking rules"). Verify the consumer (e.g. AppointmentForm default buffers `bufferMinutesBefore/After` at AppointmentForm.tsx:~309-336 could prefill from `appointmentSettings.get`) and state it in the Runtime Wiring table or label buffers as defaults. |
| `maxDailyBookings` | Wired (enforcement) - ok | AC-015 |
| `EmptyState` closures | ok | EmptyState h3 under h2 verified by lead (empty-state.tsx:425) |

## UI Reachability
- `/calendar/availability` is reachable: sidebar `components/sidebar/configs/calendar.ts` lists it (spec :15-17), `CalendarSettingsPanel.tsx:23-29` links it, both calendar-settings tabs will link to it. `app/calendar/` on disk contains only `(list)`, `availability`, `calendar-settings`, `event-types`, so there is no stale `/calendar/new` or `/calendar/[id]` route to collide or to link to from the new pointers. Reachability: PASS.
- Reverse reachability: the new links from the calendar-settings tabs need `next/link`; tests assert `href="/calendar/availability"`.
- From the booking surface: a rejected booking tells the user hours/closures are the cause but offers no path to Availability for admins. Optional (MINOR): the AppointmentForm error region includes "Manage availability" link when `canEdit`... needs a role read; skip unless the lead wants it. The `INVALID_TIMEZONE` message already names "Calendar > Availability".

## Route Conflict
- No conflict. `/calendar/availability` is an existing page file (stub) being replaced; no second route, no dynamic segment in `app/calendar` that could shadow it (`(list)` is a route group, `event-types` and `calendar-settings` are static siblings).
- Confirmed `app/calendar/event-types/page.tsx` is a separate "coming soon" stub (lines 1-16, `category` icon) linked from `configs/calendar.ts:12` and `CalendarSettingsPanel.tsx:17-21`; it is NOT in PG-202 scope. The only fake-data-like surface in /calendar/** after this PR is that stub (placeholder, not fabricated data); not PG-202's to fix, but the spec's "Out of scope" list should name it so reviewers do not ask.
- Fake-data overlap: `PREFILL_LEGACY` (see M3) is the only new "default data"; it must come from the single legacy constant, not a web literal.

## Suggestions (ordered)
1. Add B1 (AppointmentDetail/handleReschedule) to the Web table, a new AC (AC-022b), tests; apply the `handleAction` catch/keep-open fix.
2. Resolve B2 with live validation + "N problems" status line (or enabled Save + summary on click); update AC-008 and resolution 7 wording.
3. Decide PageHeader: EXTEND `PageAction` (`id`, `describedBy`, `ariaDisabled`) and list `page-header.tsx` as EXTENDS; or choose the children-slot alternative; record the focus-after-save behaviour either way.
4. Add optional `resetDescription` (and `resetToast` stays in content) to `ModuleSettingsLayout`; fix wording in `CalendarSettingsContent.tsx:134-137`.
5. Single exported legacy-hours constant used by API legacy branch and web prefill; rewrite the unconfigured note per M3.
6. AppointmentForm: catch + `role="alert"` form error + firm-zone hint/message; document that `Event Timezone` no longer governs; test with a rejected `onSubmit`.
7. Decide the 24:00 UI representation (recommend: UI max end 23:59 AND validator keeps 1440 for API; show an existing 1440 end as "24:00" via a disabled-text fallback or the "Until midnight" checkbox) and test the round trip so a save never silently shortens a range.
8. Compute `isDirty`/validation from `toUpdateInput(draft)`, add the Sun..Sat <-> Monday-first path mapping helper and test it.
9. Record `/calendar/availability` first-load JS vs `/cases/case-types` in the exec evidence; prefer a leaf import if validators/domain graph is heavy.
10. Name the buffers' runtime consumer in the Runtime Wiring table (or label them "default buffers" and wire the form default); name `event-types` stub as out of scope.
11. Hide or relabel TimezoneSelector's "detect browser timezone" button for the firm-zone use.

</details>

<details><summary>domain-expert</summary>

# PG-202 Round 3 CHALLENGE: domain-expert

Verdict: BLOCKERS 0, MAJOR 4, MINOR 5.

## Challenges

**M1 (MAJOR): the buffers have no runtime consumer, but the spec says they do.**
Lead resolution 4 says buffers and timezone are "AppointmentSettings columns that also drive booking defaults", and AC-014
says the settings are "wired now". A grep of `apps` and `packages` (non-test, non-generated) finds `defaultBufferBeforeMinutes`
and `defaultTimezone` only in `appointment-settings.router.ts`, the validator and three calendar-settings web files.
`create` takes `bufferMinutesBefore/After` from its own input, default 0 (`appointments.router.ts:114-115`), and never reads the
settings row. So moving the buffer and timezone inputs to Availability changes WHERE they are edited, and nothing about booking.
After this PR, `defaultTimezone` is read by availability enforcement for configured firms only. Required: reword the spec and the
PR body ("stored firm defaults; the only booking consumer is availability enforcement (timezone); buffers have no consumer today
(pre-existing)"). File a finding. Do not wire buffers into create here (out of scope, and it would touch the Aurora-protected
hunk).

**M2 (MAJOR): multi-day events become impossible for configured firms, which is a visible behaviour change.**
Legacy `assertWithinBusinessHours` (`appointments.router.ts:333-358`) tests the two hours independently, so a HEARING or
DEPOSITION (types at `:52-54`) from 09:00 day 1 to 17:00 day 2 passes today. For a configured firm, SPANS_MIDNIGHT now rejects it.
This is the intended rule (owner Q3 hard block, one range of the start day), but the owner did not rule on multi-day. The spec
treats the legacy pass as a "gap". Recommendation: keep SPANS_MIDNIGHT (the policy is not defined for multi-day), but
(a) make the message actionable: `Appointments cannot run past midnight. Split multi-day events into one appointment per day.`,
(b) state the behaviour change in the spec Overview and PR body, (c) put one yes/no in the final modal if the owner is already
being asked something else; otherwise record it as an assumption. Alternative if the owner objects: a later PR may add an
"allow multi-day when every covered local day is open and not closed" mode; do not do it now.

**M3 (MAJOR): recurring appointments are checked once.**
`create` stores the recurrence PATTERN on ONE row (`appointments.router.ts:536`; `ScheduleAppointment.ts:77-98,137-138,180-186`
builds a `Recurrence` VO). `Recurrence.generateOccurrences` is referenced only inside the domain (`Recurrence.ts`,
`Appointment.ts`); nothing in `apps/` expands a series. Consequences for the spec: only the first occurrence is availability-checked;
later occurrences (other weekdays, closure dates, cap days) are never checked or counted, because they do not exist as rows. State
this in the spec ("series: first occurrence only") and record it as a finding with an issue, rather than implying full
enforcement (AC-015). A cheap, defensible addition is NOT recommended here (it would validate occurrences that no code
materializes).

**M4 (MAJOR): the spec's "wrapper" claim about which writes are covered is incomplete.**
AC-015 / the Runtime Wiring table cover `create` and `reschedule`. Other writers: `inbound.logCallBooking`
(`inbound.router.ts:1043`, `ctx.prisma.appointment.create`) records a call already booked on an external calendar. It must NOT be
blocked (the meeting already exists and failing would lose the record; it is best-effort at `:1040-1066`), but its rows DO count
toward the cap and may sit on closure days. `appointments.update` (`:765`) cannot change times (the schema has no times,
`:129-137`). Add a table of "write paths: enforced / not enforced and why" to the spec so the claim "saved availability is
enforced" is scoped honestly: it governs user-initiated create and reschedule via `appointments.*`.

## Edge Cases
1. **Reschedule of a past appointment.** `Appointment.reschedule` rejects a new slot whose END is in the past
   (`Appointment.ts:375`, `TimeSlot.isPast` = `endTime < now`, `TimeSlot.ts:131-133`) and rejects CANCELLED and COMPLETED
   (`:359-365`). Availability runs BEFORE the use case, so a past slot on a closed day returns the availability error, not
   "in the past". Harmless, but the spec's check-order sentence ("availability before use case") should add that both errors are
   BAD_REQUEST-class and either is acceptable; test one case so the order is pinned.
2. **Reschedule while IN_PROGRESS.** The domain allows it (only CANCELLED/COMPLETED block). Availability judges only the NEW
   slot. The original slot is not re-evaluated. Cap count excludes self via `excludeAppointmentId`, which matters only for a
   same-day move.
3. **Reschedule of an appointment that already violates the (new) rules.** Judged only on the new slot. No retroactive check.
4. **Closures vs already booked appointments: no retroactive effect.** State it in the spec and in the UI hint under Closures
   ("Existing appointments on these dates are not cancelled or moved"). Optional nice-to-have (non-blocking, may be a finding):
   `update` returns a count of existing active appointments inside the saved closures so the page can warn.
5. **Timezone change semantics.** Changing `defaultTimezone` reinterprets the same wall-clock hours and the closure dates in the new
   zone; existing appointments (UTC instants) are untouched and may now sit outside the hours; cap windows shift. Because
   hours, closures and the zone are saved in one transaction the reinterpretation is atomic. Add one sentence to the spec and a
   confirmation hint in `TimezoneCard` when a configured tenant changes the zone ("Working hours and closures keep their clock
   times in the new zone"). Test: same rules, two zones, same instant, different verdict.
6. **Cap by start day vs organizer.** Tenant-wide per firm-local START day. An appointment is counted on its start day only
   (a 24:00 end belongs to the start day). Organizer, case and type are ignored (firm-wide ruling). All appointment types count,
   including internal ones; if the owner wants "client bookings only", that is a follow-up. Include `inbound` call bookings (M4).
7. **Cap and DST.** Windows are 23h/25h on DST days (already in the spec). Confirm the count uses `>= startUtc AND < endUtc` (half-open).
8. **Week boundary.** `weekday` is the weekday of the firm-local START date, never of the UTC date. Test with a 23:30 local
   start in `Pacific/Auckland` (UTC date is the previous day) and `America/New_York`.
9. **Start at exactly closing time.** Start 17:00 in a 09-17 range is OUTSIDE_HOURS (`endMinute <= range.end` and
   `start < end`; the start must lie before the range end because duration is positive). Test it.
10. **Closure test on a DST-day boundary.** Closures are date strings compared on local dates, so DST does not matter; one test anyway.

## Integration Issues
1. **`ACCOUNT_OWNER_ADMIN_ROLES` import (bounded-context coupling).** The constant lives in
   `crm/account/territory/territory-constants.ts:273` and its doc says "choose an account owner, reassign accounts and manage
   territories". Importing it into `legal/appointments` couples calendar to the CRM territory context and to a misleading name.
   There is precedent: `legal/cases/case-type-defaults.ts:11,40` (`CASE_TYPE_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES`) and
   `scheduled-reports.router.ts:21,56`. Recommendation: (a) do NOT put roles inside `AvailabilityPolicy.ts` (it is an
   authorization concern and the policy must stay a pure scheduling rule); (b) follow the precedent in a tiny separate module
   (e.g. `availability-roles.ts` in the same folder, or in the API router file) exporting `AVAILABILITY_ADMIN_ROLES` and
   `isAvailabilityAdminRole`; (c) accept the import as consistent with PG-204 rather than inventing a new shared-kernel
   constant in this PR, and note the coupling in ADR-081 Consequences. Not a blocker.
2. **Forward-compatible roles.** OWNER and SUPER_ADMIN are in the constant but not in `ROLE_HIERARCHY` today (the lead's own
   note). The test must pass a USER role -> FORBIDDEN and ADMIN/MANAGER -> allowed; do not test OWNER/SUPER_ADMIN as real.
3. **`nextCandidateStart` grid vs legacy.** Legacy loops whole hours from a rounded `now` (`ConflictDetector.ts:317-372`,
   `FindNextSlotInput` whole-hour ints). My R2 text anchors the grid at LOCAL MIDNIGHT. For a range 09:30-17:30 with step 60 that
   yields 10:00, 11:00 ... and never 09:30, so the first half hour of the range is unusable. Fix in the spec: anchor the grid at
   the START OF EACH MERGED RANGE (candidates `range.start + k*step`), with `from` rounded up to the next grid point inside the
   range. Legacy parity for round-hour ranges (09:00, 10:00 ...) is unchanged. Update the contract row
   (`nextCandidateStart` in the spec table) and add a test with a 09:30 range.
4. **Buffers in the findNextSlot candidate check.** The conflict check passes buffers (spec: "buffers from input"); candidates
   are placed by the policy WITHOUT buffers. A slot touching the end of a range is fine even if its after-buffer spills past
   closing time; this matches the stated rule (buffers are not hours). Say so in the spec.
5. **Create vs reschedule zone.** Configured firms: both use the firm zone (`input.timezone` ignored). Unconfigured: create uses
   `input.timezone`, reschedule UTC. A tenant that saves availability changes reschedule from UTC to the firm zone. This is
   intended; add it to the PR body as a behaviour change for configured tenants only.
6. **Dist rebuild.** `packages/domain/dist/index.d.ts` is present and stale until rebuilt; the plan needs a rebuild step before
   validators/API tests (domain CLAUDE.md).

## Suggestions
1. Spec: add a "Write paths and series" subsection (M3, M4) and an "Accepted behaviour changes for configured tenants"
   subsection (multi-day, reschedule zone) so the PR body can copy it verbatim.
2. Fix the buffers claim (M1) in Overview, AC-014 and lead resolution 4; add a finding entry.
3. Change the SPANS_MIDNIGHT message (M2) and update the contract table row.
4. Move the roles out of `AvailabilityPolicy.ts` (Integration 1). Update the Components table accordingly.
5. Replace "grid aligned on local minute-of-day" with "grid anchored at each merged range start" (Integration 3).
6. Add tests: week boundary in Pacific/Auckland (Edge 8), start at closing time (Edge 9), timezone change verdict (Edge 5),
   reschedule past slot on a closed day (Edge 1), 09:30 range candidates (Integration 3).
7. Closure-save UX: one static hint "Existing appointments on these dates are not changed" (Edge 4); no server work.

</details>

<details><summary>test-engineer</summary>

# PG-202 Round 3 CHALLENGE (test-engineer)

Read: PG-202-spec.md (DRAFT), discussion "Lead resolutions after Round 2" (:1421-1455), appointments.router.ts:1136-1180, AppointmentForm.tsx:100-166, page-header.tsx:215-260, test/setup.ts (:110, :397), appointments.router.caller.test.ts:1-75, tests/integration/case-types.test.ts:87-100. Nothing run.

Verdict: BLOCKERS 3 / MAJOR 7 / MINOR 6.

## Challenges

### BLOCKERS
**B1. Deep-mock false greens: the "configured" branch can silently pass on `undefined`.** `prismaMock` is `mockDeep` (setup.ts:110) and `prismaWithTenant` is that same mock (setup.ts:397). Unstubbed calls return `undefined`. The spec handles this for the settings row (spec :135-136), but not for the other reads on the configured path:
- `availabilityHour.findMany` / `availabilityClosure.findMany` returning `undefined`: either the loader throws a TypeError (test fails for the wrong reason) or, worse, `?? []` makes the tenant "configured with zero hours" and every booking fails OUTSIDE_HOURS.
- `appointment.count` returning `undefined` with a cap set: `undefined >= max` is `false`, so the cap is never reached and every cap-allowed test is a false green. The spec says `sameDayCount: undefined` with a cap set throws (spec :87); the helper must pass the raw count through so this throw is reached, and a test must prove an unstubbed `count` fails loudly (not allows).
- Required: each configured-path test stubs ALL four reads explicitly through one `stubTenantAvailability(prismaMock, {...})` helper, and one test per read asserts "unstubbed -> defined error, not allow". Also assert `toHaveBeenCalledTimes` for each model, otherwise a branch that skips the cap query still passes.

**B2. Configured `findNextSlot` loop is untestable as specced because the caller test replaces `container.checkConflictsUseCase` with bare `vi.fn()` (caller.test.ts:67-71).** `checkConflicts` is `vi.fn()` returning `undefined`; the loop does `result.isFailure` on it and throws TypeError. Worse, if a default `mockResolvedValue(Result.ok({hasConflicts:false}))` is set, the loop always accepts the first candidate and the "advance on conflict" and "attempt bound 200" branches (spec :143-146) are never exercised, but diff-coverage may still look fine through the happy path. The cases that need real sequences:
- conflict on candidate 1, ok on candidate 2: `mockResolvedValueOnce` sequence, assert second candidate = slot end of the first (spec :145);
- conflict forever: assert exactly 200 `checkConflicts` calls (or horizon exit) and `null`;
- `result.isFailure` -> `mapDomainErrorToTRPC`;
- full day cached per date: `appointment.count` called once per date even when 3 candidates fall on it.
Also the shape returned by `checkConflicts` must match the real `CheckConflictsUseCase` result (verify against `CheckConflicts.ts`); a hand-written shape that does not match is the classic wrong-mock false green. Add one contract test in `packages/application` or the API that calls the REAL use case with an in-memory repository for a single slot, so the mock shape is anchored to reality.

**B3. AC-022 / the removed AppointmentForm 07-19 rule has no RED-able test and an uncovered new branch.** No existing test asserts the client rule (grep of `AppointmentForm.test.tsx` and `appointments/new/__tests__` for 07:00/19:00/business/between: no matches). So deleting :118-138 cannot go RED by itself. And the new "catch `onSubmit` rejection -> role=alert" branch (spec :174) is brand new changed code; `handleSubmit` today has no try/catch (AppointmentForm.tsx:144-166), and `page.tsx:92` passes `handleSubmit` straight through. Required tests (named):
- `submits a 06:00 start (no client-side business-hours rule)`: RED on current code (it blocks), GREEN after deletion;
- `renders the server rejection in role=alert when onSubmit rejects` with a `TRPCError`-shaped error (message from the contract table) and with a non-Error rejection (string/undefined) for the fallback message branch;
- `clears the alert on the next submit` and `re-enables the submit button after rejection` (no stuck `isSubmitting`);
- `does not swallow onSuccess path` (existing `page.onsuccess.test.tsx` rerun);
- the alert must be programmatically associated/focused (a11y), so assert focus or `aria-live`.
Without these, diff-coverage fails on the catch lines and AC-022 has no failing-first evidence.

### MAJOR
**M1. Test that cannot fail for the right reason: `legacy path ... moved verbatim`.** Moving `getLocalHour`/`assertWithinBusinessHours` into `availability-enforcement.ts` is protected only by tests the router never had (no existing test asserts the 7-19 rejection). The "verbatim" claim needs a characterization test written BEFORE the move, run against the CURRENT router (RED/GREEN does not apply; it must be GREEN on current code and stay GREEN after). Save that log as `characterization-legacy-*.log`. Cases: start 06:59 rejected, 07:00 ok, end 19:00:00 ok, end 19:01 rejected, 18:00 -> 08:00 next day accepted (gap pinned), `input.timezone` Asia/Tokyo shifts the window, reschedule has no timezone (UTC), exact message string. Otherwise the legacy "no behaviour change" claim (AC-017) rests on nothing.

**M2. `getLocalHour` midnight "24" and the new `toZonedParts` (`hourCycle:'h23'`).** Spec switches to `h23`, which fixes "24", but the legacy path keeps the old `hour12:false` code. Both must be tested at local 00:00 (legacy: hour 0 normalisation; policy: minuteOfDay 0, not 1440/24h). Different ICU/Node versions differ on `hour12:false`; Node 22 pinned only (memory: host default is Node 25). Add a CI-independent assertion.

**M3. AC without a named test in the spec's Test Requirements list.** Mapping AC -> test (gaps marked):
- AC-001, AC-002, AC-008, AC-009: AvailabilityContent / WeeklyHoursCard / ClosuresList (listed). The PageHeader actions part is a GAP: see M4.
- AC-003: calendar-settings tabs listed generically; GAP: assert the exact link text "Manage working hours, buffers and timezone in Availability" and `href="/calendar/availability"`, read-only current values rendered, and payload without buffers/timezone.
- AC-004: cap statuses covered in policy; GAP: UI cap Switch off => payload `maxDailyBookings: null`; Switch on with empty number => validation error (not 0); 0 and 501 rejected.
- AC-005: validators + integration listed; GAP: the 366-day span at a leap year, and the API conversion `new Date(`${s}T00:00:00.000Z`)` / `toISOString().slice(0,10)` (spec :205-206) round-trip test under a non-UTC `process`-level TZ is impossible (no TZ pin) but the conversion is TZ-independent; assert it explicitly with `2026-03-29` and `2028-02-29`.
- AC-006: viewer-zone note: GAP, needs `useTimezoneContext` mocked to differ/equal; assert closure dates never go through `formatDate` (spy on the context formatters, expect not called with closure strings).
- AC-007: EmptyState props exact (`entity`, `phase`, `size`, `className`) and "no CTA inside": GAP, assert no button within the empty state.
- AC-014: "derived from presence of ranges" Switch semantics: GAP: Switch off keeps ranges in draft but sends none (lead resolution 7), Switch back on restores them; last range not removable.
- AC-017: UI prefill + "first save that only adds a closure sends 07:00-19:00 x 7": listed in risks, make it a named AC-017 test; also assert `isConfigured` flips after save (invalidate/refetch).
- AC-019 read-only UI: fieldset disabled, text summaries, no Save/Reset: listed. GAP: `canEdit` derived from server (`dto.canEdit`), not recomputed client-side from role.
- AC-021: appointment-settings update stripping: listed (validators + router). GAP: old-client payload with buffers/timezone parsed through the real router (not only schema) leaves the stored values untouched: assert the `upsert.update` object has no such keys.
- AC-023 Lighthouse: not a test (NEEDS_HUMAN); say so, do not claim.
- AC-025/026: reconciliation tests; add sitemap-reconciliation (listed in the existing-suites paragraph, not in my R2).

**M4. Web test of PageHeader actions (Save Changes / Reset).** `PageHeader` renders `ActionButton` per `actions[]` with key `label + index` (page-header.tsx:238-241). Risks: (a) tests that find "Save Changes" by role work only if `AvailabilityContent` renders the real `PageHeader`; if the test mocks `@/components/shared/page-header` (common to isolate) the disabled logic is not exercised. Do NOT mock PageHeader. (b) the `disabled` state of an action button (`!isDirty || isSaving || hasConflict`) must be asserted by `toBeDisabled()` on the button found by name, in four states (clean, dirty, saving via a pending mutation promise, conflict after P2002). (c) a11y: spec requires stable Save label and no `hideOnMobile`; assert the action has no `hideOnMobile` and the label stays "Save Changes" while saving (check what ActionButton does with `loading`). (d) Reset opens `ConfirmationDialog` (mock-free, from `@intelliflow/ui`): assert the dialog text lists hours, closures, daily limit as reset and timezone, buffers as kept, Cancel leaves the draft intact, Confirm calls `resetToDefaults` once and refetches. (e) Read-only user: `actions` is empty/undefined so no right-hand block at all.

**M5. Integration test isolation on the shared DB.** The case-types pattern uses a per-run prefix (`pg204_${Date.now()}`, case-types.test.ts:94-100) but:
- two parallel vitest runs within the same millisecond or retries reuse the prefix; use `Date.now()` + random suffix.
- `availability_hours` and `availability_closures` have UNIQUE keys on (tenantId, weekday, startMinute): leftover rows from a crashed run are tenant-scoped so harmless, but `afterAll` must delete by the run prefix in dependency order (hours, closures, appointment_settings, tenants) inside try/finally, and a `beforeAll` sweep of stale `pg202_%` rows older than N hours prevents buildup on the shared local DB.
- RLS tests need session-level `SET`/`set_config('app.current_tenant_id', ...)`: use `SET LOCAL` inside a transaction, never session-level on a pooled connection, or the setting leaks into other tests (pool reuse). Reset in finally.
- The `authenticated`-role skip (case-types.test.ts:405-425) is a silent-skip risk (memory: runtime silent-skip gate #664). The skip must print a visible disclosed reason and the delivery note must say RLS was NOT proven when skipped; do not count it as pass.
- CI "uses db push" (ensureMigrationSql note in discussion): `db push` ignores the hand-written `NOT VALID/VALIDATE` constraints? CHECKs come from the SQL file, not Prisma schema, so under `db push` they would be absent unless `ensureMigrationSql()` applies them. The test must assert the CHECK EXISTS (query `pg_constraint` by name) BEFORE trying violations, otherwise "insert bad row rejected" tests fail for a wrong reason (no constraint) or, if the harness swallows, pass falsely.
- Stale local test DB after merging main (memory): bootstrap fresh DB via ephemeral-test-db before the run; record in the log which DB (DATABASE_TEST_URL only, never `.env.local` DATABASE_URL).

**M6. Time-dependent code without an injected clock.** `availabilityConfiguredAt = now` in `update` (spec :129), `nextCandidateStart` takes `from` (good), but `findNextSlot` `searchStart = Date.now()` exists and `searchDurationMs` is returned. Tests that `toEqual` the whole findNextSlot response fail unless `searchDurationMs` is matched with `expect.any(Number)` or the clock is faked. Use fake timers and assert `availabilityConfiguredAt` equals the pinned NOW. Also `startFrom` in the past: define and test (does the loop start at `max(startFrom, now)`?).

**M7. Reschedule cross-tenant / excludeId test can pass vacuously.** With `excludeAppointmentId: input.id` in `where: { id: { not: ... } }`, a test that only checks the arg is present passes even if the appointment belongs to another tenant (that is the use case's job and out of this lane's boundary 2). Keep the assertion scoped: the count's `where` has `tenantId` of the CALLER, not of the appointment. Do not add a "foreign appointment id" test here (boundary 2 forbids touching ownership), but record the pre-existing gap in the findings doc.

### MINOR
- m1. Spec lists `availability-draft.test.ts` (pure): include minute <-> HH:MM edge cases 00:00, 23:59, 24:00 (1440), `<input type=time>` values like "7:00" or empty string; `step` attribute (seconds) ignored.
- m2. `AvailabilityLoading.test.tsx` and `page.test.tsx` exist for diff-coverage but add no behaviour value; keep them tiny and assert something real (Suspense fallback rendered while content suspends, skeleton count equals 4 cards), not snapshot-only.
- m3. Validators: `days` must be exactly 7 unique weekdays (spec :96). Add: 6 entries, 8 entries, duplicated weekday, out-of-order input (valid?), and a transform check that canonical timezone output equals `resolvedOptions().timeZone` for alias inputs (e.g. `Asia/Calcutta`, `US/Eastern`, `utc`, `Etc/UTC`). ICU version differences can change canonical names; assert on a stable alias set or only assert "valid and idempotent".
- m4. `isValidTimezone('')` false is specced; also test whitespace `' UTC '`, lowercase `utc`, offset strings `+02:00`, `GMT+5`. `Intl.DateTimeFormat` accepts offset-like zones in newer Node; decide and pin.
- m5. Router `update` P2002 -> CONFLICT: the mock must throw an error shaped like Prisma's (`code: 'P2002'`) using the `prismaError(code)` helper from case-types.router.test.ts:79-85.
- m6. Unused-code risk: `AVAILABILITY_VIOLATION_CODES` values and `INVALID_INTERVAL` mapping must each be reachable from a router test; the spec message table has seven rows, so assert all seven messages byte-for-byte (they are a stable contract).

## Edge Cases (each needs a named test)
1. Booking 23:00-24:00 on a day whose range ends 1440: allowed; 23:30 to 00:30 next day: SPANS_MIDNIGHT even if next day is open; end exactly at next-day 00:00 when the last range ends before 1440: OUTSIDE_HOURS (or SPANS_MIDNIGHT: pin which, the policy order says span check precedes hours).
2. Closure applies to the LOCAL END date too: start on open day 16:00, end 18:00 same day passes; start 23:00 on open day, end next closed day 00:00 exactly: the "effective end date" rule (spec :87) means end 00:00 belongs to the previous day. Test it explicitly; this is where off-by-one bugs live.
3. DST gap: a booking whose local start is 02:30 on 2026-03-08 New York (nonexistent): `localToUtc` gap rule (first instant after gap) applies to RULE boundaries, but a booking is an instant, so it cannot be nonexistent. Test that hours ranges spanning the gap (01:00-04:00) evaluate 23-hour behaviour correctly and the cap day window is 23 h.
4. DST overlap 2026-11-01 01:30: two distinct instants map to the same minuteOfDay; verdict identical; range end at 02:00 includes both.
5. Cap day boundary around DST: 25 h day (2026-10-25 London, 2026-11-01 NY): a booking at 23:30 local on the 25 h day counts toward that date, one at 00:30 next local day does not.
6. Cap with `excludeAppointmentId` on a reschedule that stays on the same day and the day is at cap: allowed; reschedule from a non-full to a full day: blocked; reschedule within the same full day for a CANCELLED appointment (status not counted, so cap would not include it; the use case rejects anyway).
7. Zone changes between save and booking (admin changes timezone, existing closures stay as calendar dates): closure dates are interpreted in the NEW zone; document and test that a booking near midnight changes verdict. Weekly minutes are not converted.
8. Weekday numbering: Sunday=0; Intl `weekday` strings vs numeric mapping, locale-independent (use `en-US`/`en-GB` fixed, not the host locale). Test all seven days with a known date set (2026-04-12 Sunday ... 2026-04-18 Saturday).
9. Configured tenant with `days` all empty: every booking OUTSIDE_HOURS; `findNextSlot` returns `null` quickly (not 200 iterations): assert query count bound.
10. 200 closures + 6 ranges x 7 days (42 rows) load: assert `findMany` is called once for each (NF-001), and no per-candidate DB call except cached per-date count.
11. Booking inside a range on a day that is also in a closure: CLOSED_DATE precedes OUTSIDE_HOURS (order in spec :87).
12. `maxDailyBookings = 1`, one COMPLETED appointment already on the day: counts (COMPLETED included); NO_SHOW does not.
13. Appointment crossing from tenant timezone day to another when `input.timezone` differs: only the firm zone is used; assert with Asia/Tokyo input and a UTC instant that is Tuesday in Tokyo but Monday in London.
14. Validators: closure spanning exactly 366 days passes, 367 fails; `startDate` 2026-02-29 invalid; dates with leading/trailing whitespace; reason `"   "` fails but `null` passes; reason is trimmed before the length check.
15. Router `update` with the SAME payload twice: second save is idempotent (deleteMany + createMany), `availabilityConfiguredAt` behaviour (refreshed or kept) pinned.
16. Concurrent update from two admins: P2002 (UNIQUE) only arises if both createMany interleave after both deleteMany; pin the CONFLICT message text; do not claim the race is covered by a unit test.

## Integration Issues
- The helper receives Prisma as an argument (spec :155-156); callers pass `ctx.prismaWithTenant`. In the caller tests that is `prismaMock`, so tenant isolation in the helper is only provable by inspecting call arguments, not by RLS. Assertion helper `expectEveryCallTenantScoped(prismaMock, tenantId)` must iterate ALL four models' `mock.calls` and fail if any call lacks `where.tenantId` (including `appointmentSettings.findUnique/findFirst`); a `findUnique({ where: { tenantId } })` shape counts.
- `appointments.router.test.ts` and `.comprehensive.test.ts` mock `AppointmentDomainService`/container and assert shapes; with the new helper their `create` paths would now hit `prismaMock.appointmentSettings.*` (undefined -> legacy). They must still pass UNCHANGED; run them first after the swap as the regression net.
- `legal-module-entitlement.test.ts` iterates router lists; verify the new `calendar.availability` sub-router is not accidentally covered by a LEGAL wildcard.
- Procedure counts: reconciliation tests require +3 procedures (`get`, `update`, `resetToDefaults`); `ui-flow-mapping.md` and `information-architecture.md` plus `sitemap-reconciliation` must move together or the reconciliation tests go red after the router lands.
- `appointment-settings.ts` update schema `.omit(...).partial().superRefine(durationConsistency)`: `durationConsistency` may reference omitted buffer fields; verify the superRefine does not read `defaultBufferBeforeMinutes` (validators :3-33) or it will silently see `undefined`. Test the duration consistency still rejects what it rejected before.
- `AppointmentForm` still sends `bufferMinutesBefore/After` per appointment (AppointmentForm.tsx:148-160) - unrelated to tenant buffer settings; make sure the form's default buffers, if prefilled from `appointmentSettings.get`, still work after the editing moves (reads unchanged).
- Domain barrel rebuild: after `export *` of AvailabilityPolicy, API tests import `@intelliflow/domain` from `dist`; a stale dist yields "not exported" at runtime, test failures that look like logic bugs. Make `pnpm --filter ./packages/domain build` step #0 of the GREEN procedure; same for validators and db (`prisma generate`, never `--no-engine`).
- Wrapper path: `C:/Users/talys/ops/test-slots/with-slot.mjs` is outside the repo; commands in the logs will reference an absolute external path. Fine locally, but record the exact invocation in each log header. `scripts/with-test-slot.mjs` (package.json:25) remains the repo-side wrapper; use one consistently.

## Dead-On-Arrival Risk
1. **Migration not applied before the API ships.** The helper queries `availabilityConfiguredAt` on `appointment_settings`; without the column every `appointments.create` throws a Prisma "column does not exist" error: the booking path of ALL tenants dies, not only configured ones. NF-001 says "one settings read for every create/reschedule". Required: (a) a fail-safe in the loader is NOT acceptable as silent fallback to legacy (it would hide the missing migration), but the failure must be loud and specific; at minimum a test that the loader's Prisma error propagates (no swallow) and that the PR body lists the ordering; (b) preferably a deploy-order check or a feature-detect health test in the integration suite (`SELECT "availabilityConfiguredAt"` works) mirroring the "Class A gates" manual step. Flag to lead: this is the highest-impact production risk of the whole task.
2. **Prisma client not regenerated / db dist stale** -> types compile in editors but runtime lacks `availabilityHour` model; unit tests with `mockDeep<PrismaClient>` would still pass because the deep mock invents any property (`prismaMock.availabilityHour.findMany` exists on a mock even if the model does not exist in the schema). A typo'd model name in the router passes unit tests. Mitigation: typecheck (`tsc --noEmit`) is mandatory and the integration test must hit the real client; add a tiny test asserting `Prisma.ModelName` (or `Prisma.dmmf`) includes `AvailabilityHour`/`AvailabilityClosure` and that the generated client has `availabilityHour` delegate.
3. **Router mounted but unreachable**: `availability: availabilityRouter` in `calendar.router.ts` (spec :155); add a router-level reachability test via `appRouter.createCaller(ctx).calendar.availability.get()` through the ROOT router (the smoke test), not only the sub-router directly, otherwise a missing registration is invisible (container.ts-wiring lesson in apps/api/CLAUDE.md).
4. **Web page calls a procedure name that does not exist** (`trpc.calendar.availability.get`): the web tests mock `@/lib/trpc` with `vi.hoisted`, so a typo passes. Mitigation: typecheck against the real `AppRouter` type (web typecheck must run after api dts build) and keep one test that imports the real router type for the call path; do not rely only on mocks.
5. **Silent skip of the integration suite** when `DATABASE_URL` is unset (case-types.test.ts:87-92): it would be green with zero assertions. The delivery note must quote the run summary with the number of tests executed; the pre-ship `integration-tests` step must be confirmed non-skipped (memory #658 silent-skip gate).
6. **Settings row absence at update**: `upsert` create branch uses `DEFAULT_APPOINTMENT_SETTINGS` (spec :129); if that constant also contains `primaryCalendarId`/reminder fields tied to relations, creating a row for a tenant with no calendars can violate an FK. Integration test: first-ever `update` for a tenant with NO existing settings row.
7. **Calendar-settings stale-overwrite**: old browser tabs (pre-deploy) still POST buffers/timezone to `appointmentSettings.update`; schema strips them (Zod default strip) - verify the router input uses `.strip()` semantics and not `.strict()` (which would FORBID/400 the old tab's save of reminders too).
8. **Reset semantics vs UI**: reset keeps buffers/timezone and returns `isConfigured: false`; the UI then prefills legacy 07-19 hours, while the actual enforced rule is the legacy create rule in `input.timezone`, not the firm timezone. UI display of "07:00-19:00 in <firm tz>" for an unconfigured tenant is slightly untrue (legacy create uses `input.timezone`, reschedule UTC, findNextSlot 9-17). State this in the UI copy or test that the prefill is labelled as the default starting point, not the active rule.

## Diff-coverage holes (explicit list)
- `AppointmentForm.tsx` new catch branch (both error shapes, success after failure) - see B3.
- `CalendarSettingsContent.tsx`: `mapSettings`, `normalize`, payload and description edits: every removed-field line is deleted (not measured) but the NEW lines (pointer props passed to tabs, read-only values) are; also `isDirty` after removing fields: test dirty detection still works for reminder + primary calendar + sync only.
- `BufferRemindersTab.tsx` / `CalendarIntegrationTab.tsx` pointer + link lines; the link needs `next/link` mocked or rendered; assert `href`.
- `appointments.router.ts` hunks: the configured findNextSlot branch is the largest changed block: needs the sequence tests in B2, including `result.isFailure` and the `slot: null` branches, both `console.log` branches, and `searchDurationMs`.
- `appointment-settings.router.ts`: exported `DEFAULT_APPOINTMENT_SETTINGS` and the changed reset update branch (defaults minus buffers/timezone + `primaryCalendarId: null`): assert the exact `update` object in the reset test, and the `create` branch unchanged.
- `availability-enforcement.ts` branch inventory (each needs a test): settings null; settings undefined; settings non-object (string/number); `availabilityConfiguredAt` null; configured: hours empty; closures empty; cap null (no count query, assert `count` NOT called); cap set (count called with exact where); excludeId present/absent; each of seven violation codes; invalid timezone; `legacyTimezone` undefined vs defined.
- `page.tsx` shell: `page.test.tsx` as listed (app page coverage-gate parity).
- `db/src/index.ts` barrel lines: type-only exports; covered by typecheck, not by coverage; confirm the diff-coverage script ignores type-only/re-export lines or add an import test.
- No `istanbul ignore`; do not add `/* c8 ignore */` either.

## Suggestions
1. Add a "characterization first" step to the plan: legacy create/reschedule/findNextSlot tests that are GREEN on current main, saved as `characterization-*.log`, before touching the router (M1). This is the only honest evidence for AC-017.
2. Add `stubTenantAvailability()` and `expectEveryCallTenantScoped()` helpers in `apps/api/src/modules/calendar/__tests__/availability.test-utils.ts` so all new tests share the same explicit stubbing and no one relies on mock defaults (B1). Not a test file, so it must not match the `*.test.ts` glob.
3. Anchor the `checkConflicts` mock shape to the real use case with one real-use-case contract test (B2).
4. Make the RED procedure per AC: a table in the plan `AC -> test file::test name -> red log -> green log`, so the exec gates can verify no AC lacks a failing-first test (feedback: pipeline claims must match the transcript).
5. Record in the spec that AC-023 (Lighthouse) and RLS-when-role-missing are NEEDS_HUMAN/disclosed-skip items, never counted as passed.
6. Run order for GREEN: domain build -> validators build -> db generate/build -> API tests -> web tests -> integration (fresh DB, Node 22) -> reconciliation tests -> full suites of touched packages; run the characterization and appointments regression suites after EVERY step that touches the router.
7. Add a single boundary test file `availability-boundary.test.ts` in the API that asserts, via `git diff`-independent static checks, that `appointments.router.ts` contains no `BUSINESS_HOURS_`, no `assertWithinBusinessHours`, and calls `assertAppointmentWithinAvailability` exactly twice (create, reschedule); cheap guard against a merge from main re-introducing the old helper (Aurora boundary 5).
8. Rename the web test for the PageHeader actions explicitly (`AvailabilityContent.actions.test.tsx`) so the "do not mock PageHeader" rule is visible and reviewable.

</details>

<details><summary>a11y-expert</summary>

# PG-202 Round 3: CHALLENGE (A11Y-EXPERT)

Reviewed: `PG-202-spec.md` (DRAFT), discussion "Lead resolutions after Round 2" (:1421-1455), `shared/page-header.tsx`, `AppointmentForm.tsx`, `appointments/new/page.tsx:42-63`, calendar-settings tests, `confirmation-dialog.tsx`.

Verdict: 2 BLOCKERS, 6 MAJOR, 7 MINOR.

## Challenges

### BLOCKER-1: a range ending at midnight cannot be shown or entered in `<input type="time">`
Spec stores `endMinute` 1..1440 (AC-002, Validators `availabilityRangeSchema`; `localToUtc` treats 1440 as next-day 00:00; `evaluateAvailability` has a 24:00 exception) and the draft helper does "minute<->HH:MM" (`availability-draft.ts`). `type="time"` only accepts 00:00 to 23:59, so `toDraft` of a saved 09:00-24:00 range yields an invalid value (empty input), and typing "00:00" as the end gives start >= end, which validation rejects. A user with a 24:00 close cannot round-trip. Not covered by any AC.
Fix (spec wording below): define that an END input of `00:00` means 24:00 when start > 00:00; `toDraft` maps 1440 to `00:00`; the weekday summary renders it as "midnight (end of day)"; the validator message for end <= start says so. Test: draft round-trip 1440, axe-neutral RTL test "09:00 to 00:00 saves 540..1440".

### BLOCKER-2: hidden ranges can block Save with an error nobody can reach
Resolution 7: "Switch off keeps the day's ranges in the draft but sends none". The spec does not say which ranges are validated. If an invalid range (end before start) is entered and the day is then switched off, the error summary can list a link to a field that is not in the DOM (R2 criterion 8 removes closed-day controls), a dead link, and Save stays blocked or silently passes. Also AC-014 says the open Switch is "derived from the presence of ranges", which cannot be true for an in-draft "off but ranges kept" state, and it does not say what a reopened day shows after save (the kept ranges are not persisted).
Fix: validate ONLY open days; summary and aria-invalid are computed from the same open-day set; after save/reload a day with no persisted ranges shows Switch off, and turning it on seeds 09:00-17:00 (or the last non-empty draft range during the same session). Test: invalid range + switch off => save allowed, summary has no entry, no `aria-invalid` field in DOM.

### MAJOR-1: PageHeader cannot satisfy R2 criteria 30/31 as written
`page-header.tsx:108-170`: `PageAction` has only `label, onClick, href, icon, variant ('primary'|'secondary'), hideOnMobile, disabled, loading` (:18-34). There is NO destructive variant, NO `aria-describedby`, NO `aria-disabled`, NO `aria-busy`, NO `type="submit"`/`form` attribute. Consequences:
- `loading` renders `<button disabled={disabled||loading}>` (:166): the focused Save button becomes `disabled` on click, so focus is dropped (to `body` in Chrome/Firefox), contradicting R2 criterion 31 ("focus stays on Save"). Fix options: (a) accept and move focus programmatically to the page status region or the h1 (`tabIndex=-1`) after save settles, or (b) extend `PageAction` with `ariaDisabled`/`describedBy` (shared component change, affects all pages, needs approval). Recommend (a): no shared-component change. Spec must say where focus goes.
- Disabled-when-clean Save: `disabled` drops it from the tab order with no stated reason (opacity-50 only, :122). Acceptable under WCAG (disabled controls are exempt from contrast), but needs a visible text cue. Add "No changes to save" / "Unsaved changes" text (see Suggestions).
- Save cannot be a submit button (no `form` prop), so Enter inside a field does not submit. State that this is intended.
- Reset must NOT use a `destructive` variant (none exists); use `variant: 'secondary'` + the ConfirmationDialog.
- Read-only: `actions` rendering is guarded by `actions && actions.length > 0` (:238), so passing `[]` or `undefined` removes the whole actions container with no layout hole. Consistent with AC-019 "no Save/Reset". No contradiction. (Pass `undefined`, not buttons with `disabled`.)
- `hideOnMobile` must stay unset on both actions (:153).

### MAJOR-2: double announcements (toast + status region, error summary + toast)
AC-008/AC-024 do not say how success and failure are announced. `CalendarSettingsContent.tsx:121-128` uses `toast` for both; Radix toasts are live regions themselves. If the availability page also writes "Availability saved." to the polite `<output>` (R2 criterion 28) the same message is read twice; for errors, a destructive toast plus the `role="alert"` summary/server error is read twice.
Rule: success = ONE channel: the toast only (it is already announced) and the `<output>` is used for list operations only (add/remove range/closure, timezone detect, cap switch, reset result). Failure = ONE channel: inline `role="alert"` (summary for client validation, a server-error alert for CONFLICT/FORBIDDEN/network); NO destructive toast for validation or server errors on this page.

### MAJOR-3: CONFLICT state is undefined (`hasConflict` appears in AC-008 only)
AC-008 says Save is disabled when `hasConflict`; nothing defines what is shown. A disabled Save plus no explanation is a dead end. Required: server CONFLICT renders a `role="alert"` with the exact message from AC-010 plus a "Reload" `<Button>`; activating Reload refetches, resets the draft, moves focus to the h1 (`tabIndex=-1`) and announces "Availability reloaded." in the status region.

### MAJOR-4: AppointmentForm server error (AC-022)
`AppointmentForm.tsx:148` `await onSubmit(...)` has no catch; the page (`new/page.tsx:53-63`) has no `onError`, so there is no toast today and no double announcement (good). Requirements the spec lacks:
- The new error block is `role="alert"` with a stable id (`form-submit-error`), text `text-red-700 dark:text-red-300` (the file's field errors use `text-red-600` at :186, :228, :249; do NOT copy that token for the new block; leave the existing ones untouched, out of scope).
- Cleared on the next submit attempt and on any field edit (a stale alert that stays after the user fixes the time is misleading).
- Focus: the submit button is re-enabled (`isSubmitting` false) and keeps focus; do not move focus to the alert (it is announced by `role="alert"`).
- For OUTSIDE_HOURS/CLOSED_DATE/SPANS_MIDNIGHT also set `aria-invalid` and `aria-describedby="form-submit-error"` on the start and end inputs (the existing `aria-describedby` slots at :183/:246/:266 are free when there is no field error), so the message is reachable from the field. Optional but recommended; at minimum the alert.
- The rejection must still not be swallowed for navigation: only catch around `await onSubmit`, set the message from `error.message` (TRPCError message is the contract in the table).

### MAJOR-5: calendar-settings tab naming and tests
- Tab `value: 'buffer'` is labelled "Buffer & Reminders" (`CalendarSettingsContent.tsx:167-178`) and the card h3 + description say "Configure buffer time before/after appointments and default reminder timing" (`BufferRemindersTab.tsx:27-30`). After the change the tab only edits the reminder, so the label and heading no longer describe the content (WCAG 2.4.6). The spec lists the tab as MODIFY but never renames it. Rename the tab and heading to "Reminders" and update the description; the test at `CalendarSettingsContent.test.tsx:149` (`toHaveTextContent('Buffer & Reminders')`) must change with it. (If the owner prefers to keep the name, the h3 description must at least say buffers moved.)
- Existing tests that break (confirmed by grep): `CalendarSettingsContent.test.tsx:255-257` (`getByLabelText('Buffer Before (minutes)')`), `:96-97` (fixture buffers), `:149` (label); `BufferRemindersTab.test.tsx`, `CalendarIntegrationTab.test.tsx` (timezone select assertions). The `getByRole('switch')` at `:278` expects exactly ONE switch on the integration tab: do not add any switch to the pointer block. The tests mock `@intelliflow/ui` (`CalendarSettingsContent.test.tsx:46`, `CalendarIntegrationTab.test.tsx:4`, `BufferRemindersTab.test.tsx:4`) with a closed list of exports: the pointer must use `next/link` and plain elements only, no new `@intelliflow/ui` import, or the mock returns undefined and the render throws.
- The pointer appears in both tabs; with the real `ModuleSettingsLayout` only the active tab panel is mounted, so there is one link per view. Tests assert it per tab, not globally.

### MAJOR-6: read-only coverage is only specified for weekdays
AC-019: "fieldset disabled, text summaries". A disabled `TimezoneSelector` trigger, disabled number inputs and the cap switch show dimmed values (disabled contrast is exempt, but screen-reader users get "dimmed/unavailable" and low-vision users get faded values). R2 criterion 33 asked for text for ALL values. Spec must say: in read-only mode timezone, buffers, daily limit and closures render as a `<dl>`/text rows, not disabled controls, and the `fieldset` is only a safety net. Test: `queryByRole('combobox')`/`spinbutton`/`switch`/`textbox` count is 0 in the read-only axe state.

### MINOR-1: AC-024 numbering is stale
AC-024 cites "R2 a11y-expert §1, 1-12, 15-37, 40-41". Criterion 3 (DOM order "weekly hours, timezone, buffers/cap, closures") contradicts AC-001's card order (Weekly 8, Timezone 4, Closures 8, Buffers 4, i.e. DOM order weekly, timezone, closures, buffers). Criterion 10 ("no Remove on one-range day"), 11 (Add range name "Add Monday range", superseded by "Add range for Monday"), 13 (cut), 30 (Save label "Save changes" vs "Save Changes"), 31 (focus stays on Save) all changed. Referencing a discussion section by number is brittle. Replace by an inline criteria table in the spec (see Suggestions).

### MINOR-2: Time display vs summary format
Inputs show the browser locale (12h in en-US), summaries ("09:00 to 17:00") are 24h text. Same page, two notations. Build the summary with `Intl.DateTimeFormat(undefined, {hour:'2-digit', minute:'2-digit', timeZone:'UTC'})` from the minutes so it matches the input in the viewer's locale; the timezone note already states the firm zone. Test with a fixed locale.

### MINOR-3: Validation timing
Not specified. Rule: validate on Save attempt; after a failed attempt, re-validate a field on change/blur and clear its error text immediately; the summary is recomputed only on a Save attempt (updating a `role="alert"` on every keystroke is noisy).

### MINOR-4: Reset confirm dialog
`ConfirmationDialog` is a Radix `AlertDialog` (`confirmation-dialog.tsx:87-134`): focus trap, Esc, initial focus on Cancel, and return to the trigger are provided by Radix. The spec must state: dialog text lists what resets (hours, closures, daily limit) and what is kept (timezone, buffers) (AC-008, good), the trigger for focus return is the PageHeader Reset button (a plain `<button>` in the page header, OK), and after confirming, the draft re-seeds with the legacy prefill and the status region says "Availability reset. Hours show the default 07:00 to 19:00 until you save." (reset leaves the tenant unconfigured; see AC-017.) Reset while the draft is dirty discards the draft: mention it in the dialog text only if dirty.

### MINOR-5: Date inputs have an unbounded year
`type="date"` in Chrome accepts years up to 275760; "real date" validation passes, a 366-day cap does not catch a far-future single-day closure. Add `min`/`max` attributes (e.g. current year -1 to +5) and a matching validator bound, with a text hint in the help ("Dates from X to Y"); an out-of-range value gets the standard per-field error. If the backend lead rejects bounds, still add the attributes for AT.

### MINOR-6: Empty / partial native input
With `noValidate`, a partially typed time/date yields `value === ''`. Spec needs messages: "Enter a start time for Monday range 1", "Enter a start date for closure 1". Test them.

### MINOR-7: Loading state
`AvailabilityLoading` (AC-001) has no a11y statement. Wrap in `aria-busy="true"` with an sr-only "Loading availability" `<output>`, skeletons `aria-hidden`. Also the query-error state needs `role="alert"` + Retry (as `CaseTypesContent.tsx:123-133`).

## Edge Cases

1. Midnight end (BLOCKER-1).
2. Invalid range in a closed day (BLOCKER-2).
3. Turn a day on, then Switch off again, then Save: persisted day is closed; reload shows Switch off; turning it on seeds a default range (state in spec).
4. Unconfigured tenant prefill (07:00-19:00 x 7): the page must say so in text, not only by values: a `<p>` under the page description "Availability has not been saved yet. The hours below are the current default; saving applies them." (AC-017 mentions the prefill, no AC mentions telling the user). Test in the unconfigured axe state.
5. Closures with the 200 cap and ranges with the 6 cap: Add uses `aria-disabled` and announces on activation (not `disabled`, to stay focusable); "Add Closure" in `SectionHeader action` must follow the same rule.
6. Remove of the last closure moves focus to "Add Closure" (header button), which sits ABOVE the list; announce the new empty state in the status region.
7. Viewer zone differs from the firm zone: the note is static text, not an alert; it updates when the firm zone is changed in the draft (live text only inside the existing `<p id>`, no extra announcement).
8. Invalid stored timezone (backend returns it): `TimezoneSelector` appends unknown values (`TimezoneSelector.tsx:127-128`) so it renders; add an inline `role="alert"` text "The saved timezone is not recognised. Choose a valid timezone." with `invalid` set, since enforcement returns PRECONDITION_FAILED (error table).
9. 320px reflow: three controls per range row + remove button; rows must `flex-wrap`; time inputs must not be `w-32` fixed on a 320px viewport with 200% zoom. Use `min-w-[7.5rem] flex-1 sm:flex-none sm:w-32`.
10. Forced-colours/high contrast: closed state is text, error state is text; the red border must not be the only cue (already so).
11. Tab count: worst case 7 days x (switch + 6 ranges x 3 + add) = 140; the closed-day collapse and landmarks are the mitigation; acceptable for AA.
12. `fieldset className="contents"` (my R2 sample): `display: contents` on a `fieldset` has had accessibility-tree regressions (group role dropped in some browser versions). Do NOT use `contents`; use a normal block wrapper (`<fieldset disabled={!canEdit} className="min-w-0 border-0 p-0 m-0">`). Correction to my R2 markup.

## Integration Issues

- PageHeader (above).
- `SectionHeader` supports `action`, `titleId`, `headingLevel`, `focusableTitle` (`section-header.tsx:11-59`): good; Closures header "Add Closure" is in `action` (`shrink-0`), reachable. No issue.
- `EmptyState` passive renders an h3 (`empty-state.tsx:425`, `:512` per lead): under the Closures h2 the order is fine. Confirm it is NOT in the tab order for `phase="passive"`. A test line `queryByRole('button', ...)` inside the empty state returns null.
- `ConfirmationDialog` focus return (MINOR-4).
- `TimezoneSelector` "Detect from browser" (`TimezoneSelector.tsx:141-150`) is a button inside the selector; the page wraps `onChange`; the announcement string lives in the page (documented, R2 criterion 19).
- `AppointmentForm` (MAJOR-4).
- Reconciliation/registry docs are not an a11y matter.
- Governance rows: WCAG 1.9.0 and VPAT 1.10.0 verified as the next rows in R2 (WCAG latest 1.8.0 at :270, VPAT latest 1.9.0 at :150); `/calendar/availability` is already in the WCAG scope list (:51). Spec's wording "(written at SHIP with the real review result)" is correct.

## Suggestions (exact spec wording)

1. Replace AC-024 with:

> **AC-024** WCAG 2.1 AA, verified by RTL role/name queries, focus assertions and axe-core (zero violations in default, unconfigured, validation-error, empty-closures and read-only states):
> a. One `h1`; each card is a `<section aria-labelledby>` with an `h2` (`SectionHeader headingLevel={2}`); the EmptyState `h3` sits under the Closures `h2`; DOM order is Weekly hours, Timezone, Closures, Buffers & daily limit.
> b. Weekly hours: seven `<fieldset>` with a full-day `<legend>` (Monday first); a `Switch` named "<Day> open" described by a text summary ("09:00 to 17:00", "Closed"); open days list ranges in `<ul aria-label="<Day> hours">`; inputs named "<Day> range N start/end"; "Add range for <Day>" (visible text "Add range"); "Remove <Day> range N" only when the day has more than one range; closed days render no range controls; only open days are validated.
> c. A range end of `00:00` means 24:00 when the start is after `00:00`; saved `endMinute` 1440 round-trips to `00:00` and is summarised as "midnight (end of day)".
> d. Add/remove/limit-reached/timezone-detected/reset results are announced through ONE always-mounted polite `<output>`; save success is announced by the toast only; failures are announced by `role="alert"` only (no destructive toast).
> e. Failed Save: `role="alert"` summary "N problems need fixing" with links, focus on the first invalid field in DOM order; per-field `aria-invalid` + `aria-describedby` with `text-red-700 dark:text-red-300`; empty native time/date inputs have their own message.
> f. Focus: Add range -> new start input; remove -> same-index start input, else previous, else "Add range for <Day>"; "Add Closure" -> new row start date; remove closure -> next row, else previous, else "Add Closure"; after Save settles focus moves to the status-bearing h1 (`tabIndex=-1`) because the PageHeader button is disabled while saving; after CONFLICT "Reload" moves focus to the h1.
> g. Save label "Save Changes" with a visible "Unsaved changes" / "No changes to save" text; no `hideOnMobile` on any action; Reset opens `ConfirmationDialog` and focus returns to Reset on cancel.
> h. Read-only (`canEdit` false): no Save/Reset (`actions` omitted), a plain-text note after the PageHeader, every value rendered as text (no combobox, spinbutton, switch or textbox), closure rows as text.
> i. Unconfigured tenants see the text "Availability has not been saved yet. The hours below are the current default; saving applies them."
> j. Targets 44px for icon buttons; reflow at 320px without horizontal scroll; every `aria-describedby`/`aria-labelledby` id resolves.

2. Add to AC-014: "The weekday open Switch is a draft-only control: an open day sends its ranges, a closed day sends none; the ranges of a closed day are kept in the draft for the session only and are neither validated nor persisted."

3. Add to AC-008: "`hasConflict` renders an alert with the AC-010 message and a Reload button; Save stays disabled until reloaded."

4. Add to AC-022: "The `AppointmentForm` submit-error block is `role="alert"`, `text-red-700 dark:text-red-300`, cleared on the next submit or field edit; the submit button keeps focus."

5. Add to the calendar-settings row of the Web table: "Rename the `buffer` tab label and its card heading to "Reminders" (description updated); pointer = `next/link` + plain elements only (tests mock `@intelliflow/ui`); no new switch on the integration tab (`CalendarSettingsContent.test.tsx:278` expects one)."

6. Add to Test Requirements (web): draft round-trip of 1440; hidden invalid range; CONFLICT alert + Reload; read-only control count; unconfigured notice; `AppointmentForm` alert clearing; calendar-settings link `getByRole('link', {name: 'Manage working hours, buffers and timezone in Availability'})` with `href="/calendar/availability"` in both tabs and absence of `defaultBufferBeforeMinutes`, `defaultBufferAfterMinutes`, `defaultTimezone` in the save payload.

7. Corrections to my own R2 markup (mark superseded): do not use `fieldset className="contents"`; Save label is "Save Changes"; Add range name is "Add range for <Day>"; card order is Weekly, Timezone, Closures, Buffers.

</details>

## Owner rulings Q6–Q7 (after Round 3)

Q6 = A (one day only; SPANS_MIDNIGHT kept with an actionable message). Q7 = A (New Appointment form prefills the
firm default buffers). Recorded in PG-202-owner-ruling.md.

## Lead resolutions after Round 3 (applied to spec v2)

Blockers resolved:
- **R3-1 (test B1, deep-mock false greens):** every configured-path test stubs all four reads via one
  `stubTenantAvailability()` helper (`apps/api/src/modules/calendar/__tests__/availability.test-utils.ts`); an unstubbed
  `count` with a cap set must fail loudly (the helper passes the raw count; the policy throws on `undefined`);
  `toHaveBeenCalledTimes` per model; legacy tests set `appointmentSettings.findUnique → null` explicitly.
- **R3-2 (test B2 + backend M1, findNextSlot loop):** new application method `CheckConflictsUseCase.findFirstFreeCandidate`
  (one `findForConflictCheck` over the candidate window, in-memory `ConflictDetector.checkTimeSlotConflicts` per
  candidate). Candidates come from the pure domain generator (anchored at each merged range start, step 60, bounded at
  2000 candidates and `maxDaysAhead`); cap pre-filter with ONE `appointment.findMany({select:{startTime}})` over the
  horizon bucketed by firm-local date (only when a cap is set). Total ≤ 1 settings + 2 child + 1 cap + 1 conflict read.
  No container change (method on the existing use case). A real-use-case contract test anchors the mock shape.
- **R3-3 (test B3 + frontend M4 + a11y M-4, AppointmentForm):** RED test "submits a 06:00 start (no client-side
  business-hours rule)"; `handleSubmit` catches the `onSubmit` rejection → `role="alert"` block `form-submit-error`
  (`text-red-700 dark:text-red-300`), cleared on next submit or field edit, submit button re-enabled and keeps focus;
  non-Error rejection → generic message; the Event Timezone field gets help text "Firm hours are checked in the firm
  timezone".
- **R3-4 (frontend B1, reschedule swallowed):** `AppointmentDetail.tsx` `handleAction` gets a `catch` storing
  `actionError`; the dialog closes only on success; `actionError` renders `role="alert"` in the dialog; input preserved.
  Same shared handler covers confirm/complete/cancel/no-show (pre-existing swallow fixed by the same lines).
- **R3-5 (frontend B2 + a11y M-3, Save vs hasConflict):** `hasConflict` = a server CONFLICT state (alert with the
  CONFLICT message + "Reload" button; Save disabled until reload). Client validation runs on Save click: Save is enabled
  when `canEdit && (isDirty || !isConfigured) && !isSaving && !hasConflict`; a failed attempt renders the
  `role="alert"` summary and focuses the first invalid field; after a failed attempt fields re-validate on change/blur.
- **R3-6 (a11y B1, 24:00):** an end input of `00:00` means 24:00 when start > 00:00; `endMinute` 1440 round-trips to
  `00:00`; summary text "midnight (end of day)". Domain keeps the 24:00 exception.
- **R3-7 (a11y B2):** only open days are validated and sent; a closed day's ranges stay in the draft for the session
  only; after reload a day with no persisted ranges is closed and turning it on seeds 09:00-17:00.

Majors resolved:
- **Write order (backend M2, data M1):** the settings upsert (or `updateMany` in reset) is the FIRST statement in the
  transaction (row lock serialises writers); call-order test. Last-writer-wins otherwise (stated).
- **Deploy order (backend M3, data DOA, test DOA):** the loader catches ONLY Prisma `P2021`/`P2022` (missing table/column),
  logs `console.error('[availability] migration 20261017130000 not applied …')`, and returns legacy; every other DB error
  propagates; tested. Migration-before-API stays the stated deploy order; the fallback only prevents a booking outage.
- **First-save timezone (backend M4):** unconfigured `get` returns `timezone = ctx.user.timezone ?? row.defaultTimezone ??
  'UTC'` with a "Confirm your firm timezone" note in the TimezoneCard while unconfigured.
- **findNextSlot consumer (backend M5):** documented as an API-only capability (no web or agent caller, pre-existing); gh
  issue for a "next available" UI.
- **`DEFAULT_APPOINTMENT_SETTINGS` (backend I3):** moved to `apps/api/src/modules/legal/appointment-settings.defaults.ts`
  and imported by both routers.
- **Agent executor (backend I5):** test that an availability BAD_REQUEST from `appointmentsRouter.createCaller(ctx).create`
  surfaces as a failed execution, not a crash.
- **RLS wording (data M2):** app-level isolation = explicit `tenantId` filters (router tests); RLS is defence in depth,
  proven on the `authenticated` role in integration or disclosed as skipped.
- **Class A gates (data M3):** migration "merged, not applied" until the owner supplies gates 4/7/10-prod (NEEDS_HUMAN).
- **Buffers consumer (domain M1 + Q7):** `/appointments/new` reads `appointmentSettings.get` and the form initialises its
  buffer inputs from the firm defaults (once, before the user edits); editing an existing appointment keeps its values.
- **Multi-day (domain M2 + Q6):** SPANS_MIDNIGHT message "Appointments cannot run past midnight. Book multi-day events as
  one appointment per day."
- **Series + write paths (domain M3/M4):** a recurring appointment is checked on its first occurrence only (finding);
  `inbound.logCallBooking` is not enforced (already-booked external call) but its rows count toward the cap; `update`
  cannot change times. Write-path table added.
- **Error contract (backend):** OUTSIDE_HOURS names the weekday, the open ranges and the zone; a closed weekday says so;
  CLOSED_DATE names the date (never the reason).
- **Roles module (domain I1):** `availability-roles.ts` (separate from the pure policy) following `case-type-defaults.ts:40`.
- **Grid (domain I3):** candidates anchored at each merged range start.
- **calendar-settings (frontend M1, a11y M-5):** optional `resetDescription` prop on `ModuleSettingsLayout` (EXTENDS,
  additive); the "Buffer & Reminders" tab and card heading become "Reminders"; pointer uses `next/link` + plain elements
  only (tests mock `@intelliflow/ui`); reset toast wording corrected.
- **PageHeader (frontend M2, a11y M-1):** not extended. Save/Reset use existing `PageAction` (`variant:'primary'` /
  `'secondary'`, no `hideOnMobile`); after Save settles focus moves to the Weekly hours SectionHeader title
  (`focusableTitle`, tabIndex -1); visible "Unsaved changes" text near the header when dirty.
- **Announcements (a11y M-2):** success = toast only; failures = `role="alert"` only (no destructive toast); list
  operations use the one polite `<output>`.
- **Read-only (a11y M-6):** values rendered as text (no combobox/spinbutton/switch/textbox), plain-text note.
- **Legacy constant (frontend M3):** one `LEGACY_BOOKING_HOURS = { startHour: 7, endHour: 19 }` exported from the domain
  (re-exported by validators for web) used by the API legacy branch and the web prefill; unconfigured note: "Availability
  has not been saved yet. Until you save, the built-in booking rule applies (07:00-19:00 any day). Saving switches this
  firm to the availability set here."
- **Payload-based dirty/validation (frontend M5):** `isDirty` and validation run on `toUpdateInput(draft)`; tested
  Sun..Sat ↔ Monday-first path-mapping helper.
- **Bundle (frontend M6):** record `/calendar/availability` first-load JS vs `/cases/case-types` from `next build`.
- **Characterization (test M1):** legacy create/reschedule/findNextSlot tests written and GREEN on the current router
  BEFORE the move (`characterization-*.log`).
- **TimezoneSelector:** additive optional `showDetect` prop (default true) hidden on the firm-zone field.
- **Dates:** closure dates bounded 2000-01-01..2100-12-31 (validator + input min/max).
- **Integration:** run on a fresh per-run DB via `scripts/lib/ephemeral-test-db.mjs` where possible (else the shared DB with
  the exclusive slot); probe both CHECK names; `SET LOCAL` in a transaction for RLS; visible skip reason.
- **Boundary guard test:** static check that `appointments.router.ts` has no `BUSINESS_HOURS_`/`assertWithinBusinessHours`
  and calls `assertAppointmentWithinAvailability` exactly twice.
- Minor items accepted as written in the R3 files unless contradicted above (e.g. time summaries stay 24h text; no
  `beforeunload` guard, consistent with calendar-settings).

## Round 4 — CONSENSUS (/spec-consensus; requested 2026-10-17T16:57:31Z, all votes by 2026-10-17T16:59:02Z; verbatim)

Result: **6/6 APPROVED (100%)** in the first consensus round; no critical unresolved issue. Recorded 2026-10-17T16:59:15Z.

<details><summary>backend-architect</summary>

# PG-202 Round 4 CONSENSUS: backend-architect

Vote: APPROVED (non-blocking modifications below).

## Agreement

All five R3 MAJORs are resolved in spec v2 and match the code:

- **M1 findNextSlot cost.** Spec :63, :107-113, :172-175 and AC-016 (:330-331) replace the per-candidate `checkConflicts` loop with one `findFirstFreeCandidate` read plus one cap `findMany`, so at most 5 queries (settings, hours, closures, cap, conflicts). The repository read is attendee- and tenant-scoped (`PrismaAppointmentRepository.ts:267-290`, `tenantId: this.tenantId`, status NOT IN CANCELLED/NO_SHOW), so one read over the candidate window is semantically what the legacy path does over `maxDaysAhead` (`CheckConflicts.ts:210-215`). No container change: the method lands on the already-wired use case (`container.ts:634-635`, 804-805).
- **M2 lost update.** Settings upsert first (row lock), then hours, then closures (spec :153-158); reset does `updateMany` first (:159-161); AC-010 (:317-318). The reasoning holds under read committed: the second transaction's `deleteMany` runs after the lock wait, with a fresh statement snapshot.
- **M3 deploy order.** Loader catches only P2021/P2022 and returns legacy (spec :163-165, AC-017, ADR-081 Deploy order). See modification 1 for one verification gap.
- **M4 first-save timezone.** Unconfigured `get` returns `ctx.user.timezone ?? row.defaultTimezone ?? 'UTC'` plus the confirm note (spec :150-152, AC-003).
- **M5 DOA.** Row at spec :271 states API-only, pre-existing, with a gh issue. Census confirmed: scheduling use cases are called only from `appointments.router.ts:521` and `:789` (grep of `apps/`).

Other items verified:
- Legacy helper move is verbatim-safe. `getLocalHour` is used only by the helper (`appointments.router.ts:334-335`); the router-local `tenantProcedure` shadow (:307-314) sits between the constants and the helper and is untouched; the legacy message text matches AC-017 (:352-355 for 07:00-19:00).
- `DEFAULT_APPOINTMENT_SETTINGS` moves to `appointment-settings.defaults.ts` (spec :184-186), avoiding the mocked-router import problem (`approved-action-executor.test.ts:29-30` uses `routerMock`).
- Write-path census (spec :189-197) is accurate. `appointments.update` cannot change times (`updateAppointmentSchema`, `appointments.router.ts:122-132`); `confirm` and `no-show` write only `status` (:908-910, :1013-1015); `inbound.logCallBooking` is a `publicProcedure` (`inbound.router.ts:973`) writing `ctx.prisma.appointment.create` (:1043). No other non-test `appointment.create/update` exists under `apps/api/src` apart from `calendar.router.ts:121` (calendar id reset, no times).
- Tenant id source: `ctx.tenant.tenantId` and `ctx.user.tenantId` are the same value (`trpc.ts:410-411`). In Vitest `createTenantScopedPrisma` returns the raw mock (`tenant-context.ts:152-154`), so the explicit-tenantId assertions (AC-020, spec test 4/5 `expectEveryCallTenantScoped`) are the real guard. Good.
- Error contract: tRPC codes and messages (spec :240-249) are consistent with the PG-204 precedent (`case-types.router.ts:106-109`, `:258`).

## Modifications (non-blocking; add to the plan, no spec re-vote needed)

1. **P2021/P2022 under the driver adapter.** `prismaCode()`-style detection (`case-types.router.ts:98-101`) relies on `error.code`. The repo uses `@prisma/adapter-pg` with Prisma 7 (`packages/db/CLAUDE.md`), where a missing column may surface as a mapped adapter error rather than a classic known-request error. Spec test 4 mocks `{ code: 'P2022' }`, which would pass either way. Add one integration case (spec test 7, ephemeral DB) that drops `availabilityConfiguredAt` and asserts the loader returns legacy, or record the real error shape from a run and use it in the unit test. If the real shape differs, match on the observed field.
2. **Cap pre-filter size and clock.** The cap `findMany` is tenant-wide over the horizon, up to 365 days (`findNextSlotSchema`, `appointments.router.ts:162`). Bound the `where` to the candidate span (first candidate day start to last candidate day end) and say so; worst case is `select: { startTime }` only. Also, `from = max(startFrom, now)` (spec :173) is a behaviour difference from the legacy path, which uses `startFrom` as given (`appointments.router.ts:1147`). Add it to the accepted behaviour changes and pin the clock in tests.
3. **Wrapper output shape.** `findNextSlotWithinAvailability` must map `findFirstFreeCandidate`'s `{start,end}` to the unchanged router response `{ startTime, endTime, durationMinutes }` plus `searchDurationMs` (`appointments.router.ts:1162-1168`); `durationMinutes` comes from the input. State it in the spec so the caller contract does not drift.
4. **Closure reasons visibility.** `get` is open to every tenant user and AC-019 shows all values as text, so closure reasons are visible to all members even though booking errors never name them. Add helper text on the closure reason field ("Visible to all workspace members") or confirm the intent with security-lead.
5. **Write-path table.** Add the rows verified above (`confirm`/`no-show` status-only writes, `calendar.router.ts:121`) so the census reads as closed rather than sampled.
6. **Order assertion.** The call-order test (spec test 5) should use `invocationCallOrder` across `appointmentSettings.upsert`, `availabilityHour.deleteMany`, `availabilityClosure.deleteMany`, and likewise for reset with `updateMany` first.
7. **Barrels and builds.** After exporting `AvailabilityPolicy`, `availability-roles` and the validators, rebuild domain, application and validators dists before API tests (`packages/domain/CLAUDE.md` stale dist note, `packages/validators/CLAUDE.md`, `packages/application/CLAUDE.md`), and run a runtime check that `container.checkConflictsUseCase.findFirstFreeCandidate` is a function on the built container (apps/api/CLAUDE.md container-wiring rule), not only a typecheck.

## Sign-off

APPROVED for the API layer: router placement, procedure set and RBAC, transaction ordering, enforcement helper and legacy fallback, the two `appointments.router.ts` hunks, the findNextSlot design and the `appointment-settings` changes. Conditions: modifications 1-3 folded into the plan; 4-7 are plan or PR-body items.

## Final Notes

- Cap remains best-effort under concurrency (NF-004, ADR-081); acceptable as documented.
- Recurring series are checked on their first occurrence only (`ScheduleAppointment.ts` stores one pattern row); correctly listed in Risks.
- Agent executor impact (`approved-action-executor.ts:226`, `:260`): approved AI bookings can now fail for configured tenants; covered by the planned executor test.
- Production order: migration before API; the fallback only prevents an outage, it does not replace the order.

## Files Verified

- `.specify/sprints/sprint-18/specifications/PG-202-spec.md` (v2)
- `.specify/sprints/sprint-18/specifications/PG-202-discussion.md` (:2138-2207)
- `docs/architecture/adr/ADR-081-tenant-availability.md`
- `apps/api/src/modules/legal/appointments.router.ts` (:122-165, :191-197, :307-358, :509-540, :783-798, :904-917, :1008-1020, :1141-1177)
- `apps/api/src/modules/legal/appointment-settings.router.ts`
- `apps/api/src/modules/calendar/calendar.router.ts` (:16, :121)
- `apps/api/src/modules/inbound/inbound.router.ts` (:973, :1043)
- `apps/api/src/agent/approved-action-executor.ts` (:212-269)
- `apps/api/src/trpc.ts` (:393-429)
- `apps/api/src/security/tenant-context.ts` (:142-182, :474-481)
- `apps/api/src/container.ts` (:634-635, :804-805)
- `packages/application/src/usecases/scheduling/CheckConflicts.ts`
- `packages/adapters/src/repositories/PrismaAppointmentRepository.ts` (:267-293)
- `apps/api/src/modules/legal/case-types.router.ts` (:90-112)

</details>

<details><summary>data-engineer</summary>

# PG-202 Round 4 CONSENSUS — data-engineer

## Agreement
Spec v2 resolves every R3 data finding:
- M1 (write order): spec:153-160 and AC-010 put the settings `upsert` / `updateMany` first so the row lock serialises writers; a call-order test is required (discussion R3 resolutions "Write order").
- M2 (RLS wording): ADR-081 lines 66-67 state app-level isolation is the explicit `tenantId` filter; AC-018 offers RLS proof on the `authenticated` role or a disclosed skip.
- M3 (Class A gates): spec:12 says "Merged, NOT applied", gates 4 (staging), 7 (snapshot id) and 10-prod are NEEDS_HUMAN.
- DOA deploy order: spec:164-165 loader degrades on Prisma P2021/P2022 only, logs the migration name, any other error propagates (AC-017 covers it). Only those two codes are caught, which is the narrow scope I asked for.
- DATE: `@db.Date` at UTC midnight with the schema.prisma:5952 precedent (spec:251); integration test uses `SET TIME ZONE 'Pacific/Auckland'` (spec:425).
- Integration test: ephemeral DB when available, else shared DB under the exclusive slot; probes both CHECK names (spec:423-424).
- `resetToDefaults` with no settings row: `updateMany` count 0 is explicitly fine (spec:159-161).
Migration shape (columns, named CHECKs, uniques, indexes, tenants-FK CASCADE, RLS with USING + WITH CHECK, NOT VALID + VALIDATE) matches my R2 draft.

## Modifications
None required. Implementation notes (not blockers):
1. Freeze `migration.sql` after the independent SQL review (Gate 1); a later edit breaks the `migrate deploy` checksum on any DB that already applied it.
2. When the loader catches P2021/P2022 it must cover the whole load (settings, hours, closures reads), but not the appointment `count` of the cap query, which touches an existing table.
3. The Prisma-declared index/unique names must stay the defaults I listed (`availability_hours_tenantId_weekday_startMinute_key` etc.) so `migrate diff` shows no drift.
4. Before declaring the db barrel done, grep `AppointmentSettings` across `packages/db/src` for any model registry besides the export-type list at index.ts:99.

## Sign-off
APPROVED (data-engineer). Basis: spec v2 read in full, ADR-081, discussion "Owner rulings Q6–Q7" and "Lead resolutions after Round 3". Nothing run; this is a read of documents and cited code.

## Final Notes
- The migration is Class A by content (new tables, two nullable no-default columns, CHECK added NOT VALID then validated, no data copied).
- Production application, snapshot id and the post-migration smoke are human steps; the PR can merge but must say the migration is not applied and must precede the API.
- The cap stays best-effort under concurrency (ADR-081); no new `appointments` index.

## Files Verified
- `.specify/sprints/sprint-18/specifications/PG-202-spec.md` (lines 12, 153-168, 251, 317-346, 423-426)
- `.specify/sprints/sprint-18/specifications/PG-202-discussion.md` (Owner rulings Q6–Q7, Lead resolutions after Round 3)
- `docs/architecture/adr/ADR-081-tenant-availability.md` (lines 59-80)
- `apps/api/src/security/tenant-context.ts:120-195` (R3 evidence, RLS not the boundary)
- `.github/workflows/ci.yml:334` (db push), `scripts/pre-ship.mjs:441-449`, `scripts/lib/ephemeral-test-db.mjs`
- `packages/db/prisma/migrations/20261013120000_case_types/migration.sql`, `packages/db/prisma/schema.prisma:2383-2402,5952`

</details>

<details><summary>frontend-lead</summary>

# PG-202 Round 4 - Frontend consensus (frontend-lead)

APPROVED

## Agreement
All Round 3 frontend findings are resolved in spec v2 and the Round 3 resolutions:
- B1 reschedule swallow: `AppointmentDetail.handleAction` catch + `actionError` role="alert", dialog closes only on success (spec :219, AC-022, tests :431). Verified the root cause at `components/appointments/AppointmentDetail.tsx:89-98` (try/finally, no catch).
- B2 Save vs hasConflict: `hasConflict` is now only the server CONFLICT state; validation runs on Save click with summary + focus on first invalid (AC-008, AC-024 d.). Removes the unreachable "failed save while disabled" contradiction.
- M1 `ModuleSettingsLayout` reset text: additive optional `resetDescription` (default = current text). Verified the hard-coded text at `components/settings/ModuleSettingsLayout.tsx:159-167`.
- M2 PageHeader: not extended; plain `PageAction` plus focus moved to the Weekly hours title via `focusableTitle` (verified present at `components/shared/section-header.tsx:23-24,36,49`, so `section-header.tsx` truly needs no change) and a visible "Unsaved changes" text.
- M3 one `LEGACY_BOOKING_HOURS` and corrected unconfigured wording; M4 AppointmentForm catch + alert + timezone help text; M5 payload-based dirty/validation and Sun..Sat mapping helper; M6 first-load JS recorded (NF-003).
- 24:00: end `00:00` <-> 1440 round-trips; forwardRef equivalent via ClosuresList retained; `TimezoneSelector` `showDetect` is additive and listed (spec :208,:213).
- Reachability and routes: unchanged from R3 (page exists, sidebar + panel link it, no route conflict, `event-types` stub out of scope).

## Modifications (non-blocking, fold into plan/exec; none requires another round)
1. Q7 buffer prefill race: `AppointmentForm.tsx:73-74` initialises buffers with `useState(appointment?.bufferMinutesBefore ?? 0)`, so defaults arriving after mount would be ignored. `app/appointments/new/page.tsx` must not render the form until `appointmentSettings.get` has settled (show the existing skeleton, `new/page.tsx:73-79`), then pass the defaults as props; on query error fall back to 0 and still render. Test both.
2. 24:00 edge: "end 00:00 means 24:00 when start > 00:00" leaves start 00:00 + end 00:00 unrepresentable (an all-day 00:00-24:00 range). Document that as invalid ("end must be after start") rather than silently mapping; users can use 00:00-23:59 or 00:00-00:00 is rejected with the field error. Add one test row.
3. The sidebar `id`/`href` and pointer links in the calendar-settings tabs must use `next/link` only (spec says so); tests mock `@intelliflow/ui`, keep assertions on `href="/calendar/availability"`.
4. Unconfigured prefilled timezone ("from the user's zone") must go through `TimezoneSelector` with a visible "Confirm your firm timezone" note; ensure Save is enabled while unconfigured (AC-008) even if the user changes nothing, and that the first save sends the prefilled values, not an empty draft.
5. Record in exec evidence the actual `next build` first-load JS numbers for `/calendar/availability` and `/cases/case-types` (NF-003), not an assertion.

## Sign-off
frontend-lead: APPROVED. I sign off on the web surface of PG-202: Availability page, calendar-settings edits, AppointmentForm, AppointmentDetail, `ModuleSettingsLayout` and `TimezoneSelector` additive extensions, as specified in v2 plus the five non-blocking modifications above.

## Final Notes
- Playbook compliance: PageHeader + 12-col bento, Card `p-4 sm:p-5`, shared SectionHeader, canonical EmptyState (`entity="appointments"`, `phase="passive"`, no CTA inside), "Add Closure" `<Button size="sm">` in the header action, stable "Save Changes" label, Loading skeleton mirroring the bento, server-shell page with `'use client'` removed from `page.tsx`.
- DoD "TagsTab via forwardRef" is honestly mapped to `ClosuresList` `forwardRef<ClosuresListHandle>` `{ openCreate }`; the spec states it as the equivalent, not as a tags tab.
- No new web dependency; native time/date/number inputs; Material Symbols only.
- Known accepted gaps stated in the spec: no `beforeunload` guard, last-writer-wins on concurrent saves, cap best-effort, recurring series checked on first occurrence.

## Files Verified
- `.specify/sprints/sprint-18/specifications/PG-202-spec.md` (v2) and `PG-202-discussion.md` (Q6-Q7 + Round 3 resolutions)
- `apps/web/src/components/appointments/AppointmentDetail.tsx:21,89-98,635-712`
- `apps/web/src/components/appointments/AppointmentForm.tsx:67-74,110-166,292-296`
- `apps/web/src/app/appointments/new/page.tsx:1-100`
- `apps/web/src/components/shared/page-header.tsx:18-247`
- `apps/web/src/components/shared/section-header.tsx:20-49`
- `apps/web/src/components/settings/ModuleSettingsLayout.tsx:28-170`
- `apps/web/src/components/settings/TimezoneSelector.tsx:23-175`
- `apps/web/src/app/calendar/calendar-settings/CalendarSettingsContent.tsx`, `components/BufferRemindersTab.tsx`, `components/CalendarIntegrationTab.tsx`
- `apps/web/src/app/calendar/event-types/page.tsx`, `apps/web/src/app/calendar/availability/page.tsx`, `apps/web/src/app/calendar/loading.tsx`
- `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx`, `CaseTypesLoading.tsx`
- `apps/web/src/providers/TimezoneProvider.tsx`

</details>

<details><summary>domain-expert</summary>

# PG-202 Round 4 CONSENSUS: domain-expert

Vote: APPROVED (no critical unresolved issue; four small modifications below, all editorial or test-level).

## Agreement
- All four R3 majors are resolved in spec v2 and the R3 lead resolutions:
  - M1 buffers consumer: Q7 makes `/appointments/new` start from the firm buffers; the "drive booking defaults" claim is replaced by a real consumer.
  - M2 multi-day: Q6 = A keeps SPANS_MIDNIGHT with the message "Book multi-day events as one appointment per day."
  - M3/M4 series and write paths: the "Write paths (enforcement census)" table lists create, reschedule, update, `inbound.logCallBooking` and recurring series with reasons. This matches my code reading (`inbound.router.ts:1043`; `appointments.router.ts:129-137`, `:536`).
  - Roles are in `availability-roles.ts`, separate from the pure policy (precedent `case-type-defaults.ts:11,40`). The coupling is noted in ADR-081.
- Policy contract (spec "Domain" table) matches the rules I proposed: order interval, timezone, midnight span (24:00 exception), closure (start and effective end local dates), hours (one merged range of the local start weekday, buffers excluded), cap (`>=`, throws on `undefined` with a cap). `CAP_COUNTED_STATUSES` is `satisfies readonly AppointmentStatus[]` (`AppointmentEvents.ts:7-14`).
- Candidates are anchored at each merged range start (my R3 Integration 3). The cap count window is half-open over the firm-local start day, 23h/25h on DST days.
- No retroactive effect of closures (AC-005 hint), timezone change reinterpretation (AC-006 helper text, ADR-081 line 81), tenant-wide cap by start day (AC-004), forceOverrideConflicts not bypassing (AC-015): all stated.
- Legacy path unchanged for unconfigured tenants, including the P2021/P2022 fallback, with `LEGACY_BOOKING_HOURS` as the single source. No domain event is required.

## Modifications (non-blocking; fold in at plan time)
1. **`findFirstFreeCandidate` input.** The spec gives `attendeeId` (singular), which matches `findNextSlotSchema` (`appointments.router.ts:159`). The repository port takes `attendeeIds: string[]` (`AppointmentRepository.ts:91-92`), so the use case must wrap it as `[attendeeId]`. State this in the Application paragraph and test it.
2. **Cap pre-filter vs create semantics.** In `findNextSlotWithinAvailability` the cap pre-filter drops days whose count is `>= maxDailyBookings`. Add a test that a day with `count = cap - 1` is still offered and `count = cap` is dropped, so it agrees with `evaluateAvailability` (`sameDayCount >= max`).
3. **Domain test for `formatViolationMessage`.** It lives in the pure policy and builds user-facing strings. Add assertions that CLOSED_DATE never contains the closure reason and that no message contains tenant or appointment ids. Closure reasons are free text, so this is a privacy guard.
4. **`generateCandidates` edge.** Add the tests R3 listed for the grid: 09:30 range, step 60 (09:30, 10:30...), `from` mid-range rounds up within the range, candidate whose end would pass the range end is omitted, and the 2000-candidate limit stops cleanly (return what was found, not an error).

## Sign-off
Domain-expert signs off on PG-202 spec v2 and ADR-081 for the business rules, bounded-context boundaries and domain API surface, with modifications 1-4 as plan/test items. Condition: ADR-081 status moves from Proposed to Accepted at consensus, and the "Accepted behaviour changes for configured tenants" (multi-day rejection, reschedule moves from UTC to the firm zone) appear in the PR body.

## Final Notes
- Pre-migration deploys: `appointmentSettings.get` and the other existing settings reads select the new Prisma columns and would fail with P2022 until the migration is applied. The loader fallback protects bookings only. The "migration before API" deploy order in the spec must stay loud in the PR body (it already does).
- The recurring-series and legacy cross-midnight gaps are recorded as findings, not fixed. That is consistent with the Aurora boundary and the lead resolutions.
- Cap remains best-effort under concurrency (ADR-081). Rebuild `@intelliflow/domain` after the barrel change before running validators and API tests.

## Files Verified
- `.specify/sprints/sprint-18/specifications/PG-202-spec.md` (v2: Components, Write paths, AC-004..017)
- `.specify/sprints/sprint-18/specifications/PG-202-discussion.md` (Owner rulings Q6-Q7; Lead resolutions after Round 3)
- `docs/architecture/adr/ADR-081-tenant-availability.md`
- `packages/application/src/usecases/scheduling/CheckConflicts.ts:95-125`
- `packages/domain/src/legal/appointments/AppointmentRepository.ts:86-96`
- `packages/domain/src/legal/appointments/AppointmentEvents.ts:7-14`
- `apps/api/src/modules/legal/appointments.router.ts:112-160, 1141-1160`
- `apps/api/src/modules/inbound/inbound.router.ts:1043`
- `packages/domain/src/crm/account/territory/territory-constants.ts:273`, `packages/domain/src/legal/cases/case-type-defaults.ts:11,40`

</details>

<details><summary>test-engineer</summary>

# PG-202 Round 4 CONSENSUS (test-engineer)

Vote: APPROVED (no critical unresolved issue). Three modifications requested, none blocking.

## Agreement
- R3-1 (deep-mock false greens): `stubTenantAvailability()` + `expectEveryCallTenantScoped()` in `availability.test-utils.ts`, per-model `toHaveBeenCalledTimes`, unstubbed `count` with a cap fails loudly, legacy tests set `findUnique -> null` explicitly (spec Test Requirements #4; risk table row "Deep-mock false greens"). Resolves my B1.
- R3-2 (findNextSlot loop): the loop is now `CheckConflictsUseCase.findFirstFreeCandidate` tested with an in-memory repository (spec #2), so the bare `vi.fn()` container mock in the caller test (appointments.router.caller.test.ts:67-71) no longer carries the loop logic. The query bound (<= 5) is testable and AC-016 states it. Resolves my B2.
- R3-3 (AppointmentForm): RED "submits a 06:00 start", rejection alert, non-Error rejection, clearing, buffers prefill (spec #8); plus AppointmentDetail swallow fix in AC-022. Resolves my B3.
- Characterization-first (spec #0, `characterization-*.log`) resolves M1. Real PageHeader (not mocked) plus `AvailabilityContent.actions.test.tsx` resolves M4. Random run prefix, probing both CHECK names, `SET LOCAL`, disclosed RLS skip, ephemeral DB resolve M5. Boundary guard test resolves suggestion 7. Fake-timer pinning for `availabilityConfiguredAt = NOW` is in #5.
- AC trace: every AC now maps to at least one named test group in Test Requirements; AC-025 (Lighthouse) is explicitly NEEDS_HUMAN and never claimed. AC-012/013 are N/A, which is acceptable.
- Wrapper path exists: `C:/Users/talys/ops/test-slots/with-slot.mjs` and `scripts/lib/ephemeral-test-db.mjs` both present (checked with ls).
- P2021/P2022 fallback is testable with the mock (throw a Prisma-shaped error with `code`), and "other DB error propagates" is listed (#4). I accept the lead's loud-log-not-outage decision.

## Modifications
1. **P2021/P2022 fallback tests (small additions to spec #4):**
   - assert `console.error` is called once with the migration-name message for BOTH codes (spy, restore in afterEach), and that no `console.error` happens on the normal legacy path (null/undefined row), so the loud log keeps its signal;
   - assert the fallback triggers only for a `PrismaClientKnownRequestError`-shaped error with those exact codes (a plain `Error('P2022')` and code `P2002`/`P1001` propagate);
   - the fallback must apply to ALL loader reads (settings, hours, closures, and the cap `count`), not only the first; a missing `availability_hours` table with a present settings row is possible mid-deploy. Add one case per read.
   - log volume: the loader runs per booking. Consider once-per-process dedupe or rate limit; if the lead keeps log-per-call, test that behaviour explicitly so it is deliberate.
2. **Verify the fallback survives an aborted transaction (verification item, not a spec change):** if `createTenantScopedPrisma` (trpc.ts:424) runs queries inside an interactive transaction/`set_config` session, a failing statement inside that transaction aborts it in Postgres, and the later `scheduleAppointmentUseCase` work would fail with "current transaction is aborted", defeating the no-outage goal. I did not read `createTenantScopedPrisma`. The exec phase should read it and, if queries share a transaction, either run the loader outside it or keep the fallback honest in the docs. The mock-based unit tests cannot prove this; add one integration case against the real DB with the column temporarily absent (ephemeral DB, apply all migrations except this one) asserting a booking still succeeds on legacy. If that is impractical, the PR body must say the fallback is unit-tested only.
3. **Test-utils file glob:** `availability.test-utils.ts` ends in `.test-utils.ts`, which some vitest `include` globs (`**/*.test.ts`) would NOT pick up as a test (good) but a coverage `include`/Sonar test-file pattern might mis-classify as source and count its lines in diff-coverage. Confirm the diff-coverage/Sonar exclusions cover it, otherwise helper branches can lower changed-line coverage.

## Sign-off
APPROVED by test-engineer for PG-202 spec v2, conditional on the exec phase honoring modifications 1-3. TDD is mandatory: saved characterization, RED, then GREEN logs; coverage targets Domain >95%, Application/API/validators >90%, diff-coverage >= 80%, no `istanbul ignore` / `c8 ignore`.

## Final Notes
- Highest residual test risk: the web layer (AvailabilityContent focus management, 24:00 round-trip, path mapping Sun..Sat to Monday-first, axe in five states). It is the largest surface, relies on mocked `@/lib/trpc`, and typecheck against the real `AppRouter` type is the only guard against a mistyped procedure path; keep web typecheck after the API d.ts build in the GREEN order.
- Order for GREEN: domain build -> application build -> validators build -> db generate/build -> API tests -> web tests -> integration (Node 22, fresh DB) -> reconciliation tests -> full suites of touched packages. Rerun characterization + appointments regression suites after every router-touching step.
- Spec mentions `generateCandidates` in the test list and `nextCandidateStart` in earlier text; make sure the test names follow the final exported name.
- `inbound.logCallBooking` rows counting toward the cap (domain M3): add a router or helper test proving the count query does not filter on source, and one proving `logCallBooking` is NOT blocked.
- Nothing was run; this vote rests on reading files.

## Files Verified
- `.specify/sprints/sprint-18/specifications/PG-202-spec.md` (v2, lines 286-470 plus section list)
- `.specify/sprints/sprint-18/specifications/PG-202-discussion.md` (lines 2138-2227)
- `apps/api/src/modules/legal/__tests__/appointments.router.caller.test.ts` (container mock :49-74, from earlier rounds)
- `apps/api/src/test/setup.ts` (:110 mockDeep, :397 prismaWithTenant = prismaMock)
- `apps/api/src/trpc.ts:380,424` (prismaWithTenant creation, body not read)
- `scripts/lib/ephemeral-test-db.mjs`, `C:/Users/talys/ops/test-slots/with-slot.mjs` (existence only)

</details>

<details><summary>a11y-expert</summary>

# PG-202 Round 4: CONSENSUS (A11Y-EXPERT)

Vote: APPROVED (with three non-blocking modifications to carry into the plan).

## Agreement

All Round 3 a11y findings are resolved in spec v2 and the "Lead resolutions after Round 3":
- BLOCKER-1 (midnight end in `type=time`): AC-002 + AC-024b + `availability-draft.ts` row (end `00:00` <=> 1440 when start > 0; summary "midnight (end of day)"; round-trip test listed in Test Requirements).
- BLOCKER-2 (hidden invalid ranges): AC-002 "only open days are validated and sent; a closed day's ranges persist in the draft for the session only"; resolution R3-7 covers reload (closed day, seed 09:00-17:00 on turn-on); `toUpdateInput` is open-days-only and `isDirty`/validation run on the payload.
- MAJOR-1 (PageHeader): confirmed against `page-header.tsx:18-34, 108-170`: `PageAction` has `variant 'primary'|'secondary'`, `disabled`, `loading`, no destructive/describedby/aria-busy. Not extending it is acceptable: `variant:'primary'` Save and `'secondary'` Reset, no `hideOnMobile`. Read-only omits `actions` (guard at :238), so no layout hole. Focus after Save moves to the Weekly hours SectionHeader title: verified `section-header.tsx:23-24, 49` (`focusableTitle` -> `tabIndex=-1` on the h2). That is a valid, deliberate target (a heading inside the first landmark region, announced as "Weekly hours, heading level 2"), and is better than the h1 because it is where the user's work is.
- MAJOR-2 (double announcement): AC-024c (toast only for success, `role="alert"` only for failure, one `<output>` for list operations).
- MAJOR-3 (CONFLICT): AC-008 + R3-5 (alert with message + Reload; Save disabled until reload; after Reload focus to the Weekly hours title, AC-024e).
- MAJOR-4 (AppointmentForm): AC-022 + R3-3 (`role="alert"` `form-submit-error`, `text-red-700 dark:text-red-300`, cleared on next submit/edit, submit keeps focus; AppointmentDetail dialog keeps input and shows `role="alert"`).
- MAJOR-5 (calendar-settings naming/tests): tab and card heading renamed "Reminders", pointer via `next/link` + plain elements, `resetDescription` additive prop.
- MAJOR-6 (read-only): AC-019 + AC-024g (values as text, no form controls, plain note, no Save/Reset).
- `showDetect` hidden on the firm-zone selector removes the silent timezone change I flagged in R1, so the "Timezone set to X" announcement is no longer needed (the timezone `onChange` announcement in AC-024c still applies to a manual selection and is harmless).
- AC-024 is now inline and consistent with the lead resolutions (card order, "Save Changes", "Add range" + sr-only " for <Day>", no `fieldset className="contents"`).

## Modifications (non-blocking; add to the plan/tests, no spec rewrite required)

1. Focus after a FAILED SAVE that is not client validation. AC-024e defines focus for "after Save settles" (success) and for failed client validation (first invalid field, AC-024d), but not for a server error (FORBIDDEN, network, validation echo from the API). `PageHeader` disables the Save button while `loading` (`page-header.tsx:166`), so focus is dropped to `body`. Rule to implement and test: on any save that settles with a server error, focus moves to the server-error `role="alert"` container (`tabIndex={-1}`) or, if none is rendered, to the Weekly hours title. One RTL focus assertion.
2. Loading state. AC-001 covers the query-error alert but not `AvailabilityLoading` semantics. Implement `aria-busy="true"` on the wrapper with an sr-only "Loading availability" status, skeleton shapes `aria-hidden`. Add one RTL assertion.
3. Reset result. After a confirmed Reset the draft re-seeds to the legacy prefill; announce it through the polite `<output>` ("Availability reset. Hours show the default 07:00 to 19:00 until you save.") and move focus to the Weekly hours title (the Reset button is in the header and remains, but the dialog's focus return on cancel is the Radix `AlertDialog` default, `confirmation-dialog.tsx:87-134`). Test with RTL.

Carried minor items, accepted as written by the lead: time summaries stay 24h text while inputs follow the browser locale (documented limitation; the zone note states the firm zone); no `beforeunload` guard (consistent with calendar-settings).

## Sign-off

A11Y-EXPERT: APPROVED for WCAG 2.1 AA on the specification, conditional on the three plan-level modifications above. The a11y review is NOT yet performed on code: the WCAG statement 1.9.0 and VPAT 1.10.0 rows must be written at SHIP only after the implementation review and the real axe/RTL results, using the PG-204 wording style if a minor issue remains.

## Final Notes

- Governance rows to write at SHIP (verified in R2): WCAG statement next row 1.9.0 (latest 1.8.0 at `wcag-conformance-statement.md:270`); VPAT next row 1.10.0 (latest 1.9.0 at `vpat-2.5.md:150`). `/calendar/availability` and `/calendar/calendar-settings` are already in the WCAG scope list (`:51`), so the route count stays unchanged.
- Test mocks in calendar-settings mock `@intelliflow/ui` with a closed export list (`CalendarSettingsContent.test.tsx:46`, `CalendarIntegrationTab.test.tsx:4`, `BufferRemindersTab.test.tsx:4`); `CalendarSettingsContent.test.tsx:278` expects exactly one switch on the integration tab. Neither is violated by the spec as written, but the pointer markup must stay `next/link` + plain elements.
- Reminder for the implementer: the existing `AppointmentForm.tsx` field errors use `text-red-600` (:186, :228, :249); the new alert must use the `text-red-700 dark:text-red-300` pair and the old ones stay untouched.
- Spec risk worth one line in the PR body: "Confirm your firm timezone" for unconfigured tenants must be real text in the Timezone card (not a placeholder or tooltip) and covered by the unconfigured axe state.

## Files Verified

- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/.specify/sprints/sprint-18/specifications/PG-202-spec.md` (AC-001..AC-008, AC-014, AC-017, AC-019, AC-022, AC-024, Web table :206-218)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/.specify/sprints/sprint-18/specifications/PG-202-discussion.md` ("Lead resolutions after Round 3", from :2143)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/apps/web/src/components/shared/page-header.tsx` (:18-34, :104-170, :238)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/apps/web/src/components/shared/section-header.tsx` (:23-24, :49)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/packages/ui/src/components/confirmation-dialog.tsx` (:87-134)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/apps/web/src/components/appointments/AppointmentForm.tsx` (:148, :186, :228, :249)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/apps/web/src/app/appointments/new/page.tsx` (:42-63)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/apps/web/src/app/calendar/calendar-settings/__tests__/CalendarSettingsContent.test.tsx` (mocks :46-81, :149, :255-257, :278)
- `C:/Users/talys/projects/intelliFlow-CRM-worktrees/pg-202/docs/compliance-and-governance/compliance/wcag-conformance-statement.md` (:51, :270) and `vpat-2.5.md` (:150)

</details>
