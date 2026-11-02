# PG-203 — Phase 0.75 exploration record

Six `Explore` subagents ran in parallel on 2026-10-20, about 23:40-23:50Z. Each read files with tools and cited
file:line. Tool calls per agent: backend-architect 23, data-engineer 18, frontend-lead 28, security-lead 25,
domain-expert 27, test-engineer 20. Their findings are condensed below. The full text is in the lead's session
transcript. The owner rulings that shaped the prompts are in `PG-203-owner-ruling.md`.

## backend-architect
- Copy the router from `apps/api/src/modules/contact/contact-types.router.ts`, not from case-types: plain
  `tenantProcedure` (:36), `assertContactTypeAdmin` (:40), audit logger (:38), P2002→CONFLICT (:127/:511). Case types use
  `moduleTenantProcedure('LEGAL')` (case-types.router.ts:30/:34), and calendar is core.
- Case-types shapes to reuse: `findOwnedCaseType` findFirst({id, tenantId}) (:114-121); `$transaction` callback form
  (:233/:262/:312); deleteMany+createMany with no skipDuplicates (:135-151); P2003→CONFLICT on delete (:327).
- PG-202 enforcement in `calendar/availability-enforcement.ts`: `loadTenantAvailability` (:53-108),
  `assertAppointmentWithinAvailability` (:161-203), legacy 07-19 fallback (:128), `findNextSlotWithinAvailability`
  (:272-303), `firstFreeInBatch` + cap filter (:222-263). **Nothing lists ALL open slots**, so a new lister is
  needed. Availability is nested as `calendar.availability` (calendar.router.ts:19).
- `appointments.router.ts` create (:496): refs check (:498) → availability (:506) →
  `scheduleAppointmentUseCase.execute` with `organizerId: ctx.user.userId` (:519-537). Conflicts → warnings unless
  `forceOverrideConflicts` (:544-575). The create input is inline at :110-126 and has no eventTypeId.
- Public: `publicProcedure` (trpc.ts:98) = tracing + PUBLIC tier 100/min/IP (rate-limit.ts:44).
  `PublicRateLimiter` allows 1 hit per window per key, in memory (public-rate-limiter.ts:36-80). Public-feedback persists via
  `apiPrisma` without a tenant (container.ts:332) — **not reusable for tenant tables**. Use
  `createTenantScopedPrisma(ctx.prisma, {tenantId})` (security/tenant-context.ts:142-190).
- Lead: `LeadService.createLead` FAILS when the email exists (LeadService.ts:119). `LeadRepository.findByEmail` is not
  tenant-scoped (:58). Contact has `findByEmailInTenant` (ContactRepository.ts:33).
- Email: `createNotificationServiceAdapter` (container.ts:270-296) is real Resend only when
  `EMAIL_PROVIDER==='resend'` && key, otherwise the Mock adapter. Exposed as `adapters.notificationService`.
- Sidebar `configs/calendar.ts:12` already lists event-types; appointments.ts has no entry.

## data-engineer
- `Appointment` (schema.prisma:2089-2145): `organizerId` is a plain column (:2129), `location` is free text (:2098), and there is no
  `@@unique([tenantId,id])` and no booker or lead fields. `Case.caseTypeId` is a plain nullable column with a SQL-only composite FK
  (:2216-2218). The SQL-only object comment block is at :2336-2346.
- colorToken CHECKs: case_types uses 8 tokens (20261013120000_case_types :48-50); contact_types uses the 18-token palette
  (20261017120000_contact_types :48-50) = `TAG_COLOR_TOKENS`, asserted by
  validators `__tests__/enum-consistency.spec.ts:165`.
- Migration header and recovery-plan shape, NOT VALID→VALIDATE FKs, and the RLS `DO $$ … duplicate_object` block are in
  case_types :1-21, :92-119. Newest migration: `20261017130000_availability`.
- `packages/db/src/index.ts` export list is :23-106; add `EventType` after :103.
- Lead `@@unique([email, tenantId])` (:661); `LeadSource` enum (:754-762) has no BOOKING. Contact
  `@@unique([tenantId,email])` (:835), `@@unique([tenantId,id])` (:837). User has no `@@unique([tenantId,id])`.
- CI builds the test DB with `db:push` (ci.yml:334). Integration suites apply migration SQL via `ensureMigrationSql` /
  `applySchemaSql` (tests/integration/case-types.test.ts:59-92; availability.test.ts:12-27).
- Class A gates: docs/operations/agent-autonomy-policy.md:48-63.

## frontend-lead
- The stub `event-types/page.tsx:1-16` is already in settings mode via `CALENDAR_SETTINGS_ITEMS` (calendar.ts:5-28,
  `_layout-shell.tsx:26`). `CalendarSettingsPanel.tsx:17-21` links it with stale copy "Categories & color coding" (:19).
- Reference UI is PG-205 `contacts/(list)/contact-types/`: `ContactTypesContent.tsx` (mutations :44-51, inline CONFLICT
  :68-91, read-only note :172-176, 8+4 bento :178-216, CTA in SectionHeader :187-198, delete dialog with focus restore
  :270-286); `ContactTypeList.tsx` forwardRef (:135,150), EmptyState (:165-168); `ContactTypeDialog.tsx` colour
  RadioGroup (:280-310) and required-fields checklist (:55, :206). Swatch helpers: `apps/web/src/lib/color-tokens.ts:8-36`.
- PG-202 shell: `availability/page.tsx:13-18` (Suspense + Content), NOT_FOUND fallback (AvailabilityContent :161-175).
- EmptyState entity `appointments` exists (empty-state-illustrations.tsx:2019).
- AppointmentForm.tsx (458 lines): state :65-91, Type select :216-224, Location :284-293. It calls `onSubmit` only; the
  mutation is in `appointments/new/page.tsx:52-73`. Edit mode is at `isEdit` (:59).
- `/book` is not in `PROTECTED_ROUTE_PREFIXES` (lib/auth/route-protection.ts:8-29), so it is public by default.
  Public tRPC example: `components/public/feedback-widget-public.tsx:111`. `app/robots.ts:11` has the disallow list.
- New page.tsx → page count 214→215 across 17 registry surfaces (listed in the agent output; carried into the spec).

## security-lead
- `publicProcedure` gets the raw `ctx.prisma`, so RLS is not set. The distributed limiter is `fallback: 'pass-through'` (trpc.ts:91-93) and keys on the
  leftmost XFF (rate-limit.ts:411-424), which can be spoofed (pre-existing). `tenant-context.ts:131-135`: RLS is not the boundary, so every query
  needs an explicit tenantId.
- `adminProcedure` (trpc.ts:312) has no CSRF, rate limit or tenant client. Use tenantProcedure + a role check.
- **`Tenant.slug` = `${orgName}-${supabaseUser.id}` (context.ts:489) leaks the admin's auth UUID**, so it must not be used in a public URL
  (→ owner ruling Q7: a new booking handle).
- There is no CAPTCHA, no per-recipient email throttle, no suppression list and no consent fields on Lead. The honeypot pattern is
  `__honeypot: z.literal('').optional()` (validators/public-onboarding.ts:39). Reuse the
  `inbound.router.ts:448-519 upsertLeadByEmail` pattern (lowercase, tenant-scoped, race-safe). The DSAR router leaks
  `error.message` (dsar.router.ts:114-117), so do not copy it.
- Public responses must be allowlisted: `{start,end}` slots, event name/duration/description/fields, and the host's display name only.

## domain-expert
- The PRD has no PG-203 addendum (prd-module-settings.md stops at PG-202, :990-1050). Playbook §8 toggle categories
  (module-settings-playbook.md:143-165). IFC-310/311/312 cover contacts/accounts only, so a calendar category-2 item needs its own row.
- `Appointment.create` rejects starts more than 5 minutes in the past (Appointment.ts:292) and raises `AppointmentCreatedEvent` (:330).
  `TimeSlot` is 5 min to 24 h (TimeSlot.ts:59-86); Buffer is 0-240 (Buffer.ts:24). `AppointmentAttendee` takes a userId only (:2147).
- `Lead.create` requires email + ownerId (Lead.ts:232). `LEAD_SOURCES` (:26-34) has no BOOKING.
- **AI scoring is queued unconditionally after lead create** (lead.router.ts:532-559). The owner ruled AI stays ON (Q8).
- The ICS handler uses placeholder recipients (AppointmentIcsEventHandler.ts:245-258), so booking email needs a real
  lookup of the host email and the booker email.
- ADR-081 legacy rules apply when `availabilityConfiguredAt` is NULL (ADR-081:75-79). The daily cap is best-effort (:88-89).
- AppointmentSettings durations are 5-480 with min≤default≤max (validators/appointment-settings.ts:36-41).

## test-engineer
- Unit router tests use the prisma deep mock + `createCaller` (availability.router.test.ts:8-16). Cross-tenant shape A is
  case-types.router.test.ts:245-252, shape B is `expectEveryCallTenantScoped` (availability.test-utils.ts:93-108).
- `apps/api` excludes `*.integration.test.ts` (apps/api/vitest.config.ts:11-25). Real-DB suites live in
  `tests/integration/` (root vitest project `integration`), gated by `describeDb` (availability.test.ts:104-108), with prefixed
  tenant ids and a sweep (:163-174). RLS check: SET LOCAL ROLE authenticated (:377-405).
- Web tests: hoisted tRPC mock tree (AvailabilityContent.test.tsx:13-59) and raw axe-core (:66-69).
- Count tests: sitemap-reconciliation.test.ts:52-66 (214), ia-reconciliation.test.ts, ui-flow-mapping-reconciliation.test.ts,
  tools/scripts/route-total-consistency.test.ts, and content-audit tests.
- Lighthouse: only PG-198 measured an authenticated page (Path C local recipe, attestation :159-184). PG-202 and PG-204 were
  NEEDS_HUMAN.
- Pin the clock with `vi.useFakeTimers({ toFake: ['Date'] })` (availability.router.test.ts:19,107-108).

## Lead's own checks (outside the agents)
- `PublicRateLimiter` takes `capacity`/`windowMs`/`now` options and allows 1 hit per window
  (public-rate-limiter.ts:36-80).
- Test DB is PostgreSQL 16.11. A transaction advisory lock precedent exists:
  `scheduled-reports.router.ts:106-110` (`pg_advisory_xact_lock(hashtextextended(key,0))`).

## Discrepancies with the hydrated summary / row
- Row says owner "Frontend Dev (STOA-Foundation)"; the ruling adds domain and security surfaces, so the STOAs needed are Domain + Security.
- Row DoD "AI defaults FALSE" is rejected by the owner (Q8).
- Row DoD "category-2 under IFC-310/311/312" does not fit calendar. Every PG-203 toggle is wired (category 1).
- Row pre-req names sidebar `configs/appointments.ts`, but the real entry is in `configs/calendar.ts:12`.
