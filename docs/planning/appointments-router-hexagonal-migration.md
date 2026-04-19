# Appointments Router Hexagonal Migration Plan

**Status:** Proposed — pending approval **Owner:** TBD **Target:** Replace
direct-Prisma persistence in `apps/api/src/modules/legal/appointments.router.ts`
(1486 LOC) with the 5 scheduling use cases from `@intelliflow/application`,
preserving tenant isolation, response contracts, and all 371 existing tests.
**Motivation:** Today the router composes around `AppointmentDomainService` for
domain rules but bypasses `PrismaAppointmentRepository` for persistence, leaving
the 5 use cases wired but unused and leaving persistence semantics scattered
between router and repo.

---

## Why this can't be done as a single-session swap

Three hard blockers exist in the current shape:

### B1 — Tenant isolation gap in the repository

`PrismaAppointmentRepository` uses the raw `PrismaClient` singleton from the
container, not the per-request tenant-scoped client. The port
`AppointmentRepository` has **no `tenantId` parameter on any read method**. So:

| Method                                     | Current filter            | Risk                                             |
| ------------------------------------------ | ------------------------- | ------------------------------------------------ |
| `findById(id)`                             | id only                   | Cross-tenant read if ID guessed                  |
| `findForConflictCheck(attendeeIds, range)` | attendee + range + status | Cross-tenant leak if attendee is multi-tenant    |
| `findOverlapping(slot, excludeId)`         | slot + status             | Global scan across tenants                       |
| `findByOrganizer(userId)`                  | organizerId only          | Same                                             |
| `hasConflicts(slot, attendeeIds)`          | attendees + slot + status | Same                                             |
| `save(appointment)`                        | —                         | Write honors entity.tenantId, so writes are safe |

Router is safe today because it goes
`ctx.prismaWithTenant.appointment.findMany(...)` → auto-injects `tenantId` via
`IFC-127` middleware → passes filtered rows to `AppointmentDomainService`. A
naive router→use-case swap would lose that guard.

### B2 — Domain entity missing fields the Prisma row persists

The router sets these on the Prisma row that the domain `Appointment` entity
does not track as first-class properties:

- `timezone` — IANA TZ stored separately from UTC `startTime`/`endTime`
- `calendarId` — FK to internal `Calendar` model (for user's workspace
  calendars)
- `bufferMinutesBefore` / `bufferMinutesAfter` — tracked as `Buffer` VO on
  entity ✓
- `recurrence` — tracked as `Recurrence` VO ✓
- `reminderMinutes` — tracked as scalar ✓
- `externalCalendarId` — tracked ✓ (distinct from `calendarId`; this is the
  provider-side ID for 2-way sync)
- `notes` — tracked ✓
- `cancellationReason`, `cancelledAt`, `completedAt` — tracked ✓

If we use `PrismaAppointmentRepository.save()`, `timezone` and `calendarId` get
nulled on update. Breaking.

### B3 — Response shape & side-effect composition

The router returns the Prisma row with
`include: { attendees: true, linkedCases: true }` — frontend tRPC client
consumes this shape directly. The 5 use cases return domain entities. Without a
DTO serializer, swapping breaks every consumer. Also, all 5 procedures fire side
effects (ICS emit, notifications,
`onAppointmentCancelled`/`onAppointmentRescheduled` handlers, audit trail) that
today compose around the Prisma result.

---

## Target architecture

```
Request ──→ tenantProcedure (tenant guard, ctx.prismaWithTenant)
         ──→ Router (validates zod input, enforces business-hours, assembles use-case input)
         ──→ UseCase (domain rules + repository call)
              ──→ AppointmentRepository port (tenant-aware)
                   ──→ PrismaAppointmentRepository (honors tenantId on read and write)
         ──→ Router (on Ok: re-fetch via prismaWithTenant for response DTO, fire side effects)
                    (on Fail: map DomainError → TRPCError)
         ──→ Response (Prisma row with includes — unchanged contract)
```

Side effects (`onAppointmentCreated`/`Rescheduled`/`Cancelled`,
`createNotification`, reminder scheduling) stay in the router, wrap the use-case
call. Domain work (TimeSlot, Buffer, Recurrence, ConflictDetector, Appointment
state transitions) moves fully into the use case.

---

## Phased execution plan

### Phase 0 — Ground truth (no code changes)

**Deliverables:** audit report (markdown, ~200 lines)

- Enumerate every test that mocks `ctx.prismaWithTenant.appointment.*` vs every
  test that mocks `ctx.services.*UseCase.execute` — note which need rewriting.
- Snapshot every router procedure's response shape — this becomes the contract
  the refactor must not break.
- Snapshot every domain event emitted per procedure (`AppointmentCreatedEvent`,
  `AppointmentRescheduledEvent`, `AppointmentCancelledEvent`,
  `AppointmentConflictDetectedEvent`) — these must still fire with identical
  payloads.
- Confirm `Appointment` entity can be extended with `timezone` + `calendarId`
  without breaking the 100+ domain tests.

**Exit:** document listing every behavior-assertive test, response shape, and
event payload. **Estimate:** 0.5 session.

---

### Phase 1 — Port & adapter upgrade: tenant-aware repository

Add tenant scoping to the port and implementation without changing any caller.

#### 1a. Port changes (`packages/domain/src/legal/appointments/AppointmentRepository.ts`)

Add a `tenantId: string` parameter to every **read** method that can return
cross-tenant data:

```typescript
findById(id: AppointmentId, tenantId: string): Promise<Appointment | null>;
findByIds(ids: AppointmentId[], tenantId: string): Promise<Appointment[]>;
findByOrganizer(organizerId: string, tenantId: string, options?: PaginationOptions): Promise<Appointment[]>;
findByAttendee(attendeeId: string, tenantId: string, options?: PaginationOptions): Promise<Appointment[]>;
findByCase(caseId: CaseId, tenantId: string, options?: PaginationOptions): Promise<Appointment[]>;
findInTimeRange(startTime: Date, endTime: Date, tenantId: string, options?: PaginationOptions): Promise<Appointment[]>;
findOverlapping(timeSlot: TimeSlot, tenantId: string, excludeId?: AppointmentId): Promise<Appointment[]>;
findForConflictCheck(attendeeIds: string[], timeRange: {...}, tenantId: string, excludeId?: AppointmentId): Promise<Appointment[]>;
findWithFilters(filter: AppointmentFilter, tenantId: string, options?: PaginationOptions): Promise<PaginatedResult<Appointment>>;
countByStatus(tenantId: string, organizerId?: string): Promise<Record<AppointmentStatus, number>>;
findUpcoming(attendeeId: string, tenantId: string, limit?: number): Promise<Appointment[]>;
findPast(attendeeId: string, tenantId: string, options?: PaginationOptions): Promise<Appointment[]>;
findByExternalCalendarId(calendarId: string, tenantId: string): Promise<Appointment | null>;
hasConflicts(timeSlot: TimeSlot, attendeeIds: string[], tenantId: string, excludeId?: AppointmentId): Promise<boolean>;
findRecurringInstances(parentId: AppointmentId, tenantId: string): Promise<Appointment[]>;
findNeedingReminder(tenantId: string, reminderThresholdMinutes: number): Promise<Appointment[]>;
delete(id: AppointmentId, tenantId: string): Promise<void>;
```

`save()` / `saveAll()` / `batchUpdateStatus()` don't need tenant params — the
entity already carries it.

#### 1b. `PrismaAppointmentRepository` updates

Every read method injects `tenantId` into its Prisma `where`. `delete` becomes
`deleteMany({ where: { id, tenantId } })` so a stale tenantId doesn't silently
delete cross-tenant.

#### 1c. `InMemoryAppointmentRepository` updates

Mirror port changes; existing tests in
`packages/adapters/src/repositories/__tests__/` pass tenantId.

#### 1d. Domain entity enrichment

Add `timezone?: string` and `calendarId?: string | null` to
`Appointment.reconstitute()` props, `CreateAppointmentProps`, and `Appointment`
getters. Extend `PrismaAppointmentRepository.mapToEntity()` + `save()` to
round-trip them. Write domain unit tests (entity roundtrip + mapper roundtrip).

#### 1e. Use-case updates

Each use case already accepts a `tenantId` in its input. Pipe it to the
repository calls:

- `ScheduleAppointmentUseCase.fetchConflictCandidates` → pass `input.tenantId`
- `RescheduleAppointmentUseCase.fetchConflicts` → pass `appointment.tenantId`
- `CancelAppointmentUseCase` / `CompleteAppointmentUseCase` → need
  `findById(id, tenantId)` — extend input to include `tenantId`
- `CheckConflictsUseCase.checkConflicts` → extend input with `tenantId`, pass to
  `findForConflictCheck`

Existing use-case tests (12 scheduling tests under
`packages/application/src/usecases/scheduling/__tests__/`) get `tenantId`
threaded through.

**Gate:**
`pnpm --filter @intelliflow/domain build && pnpm --filter @intelliflow/adapters test && pnpm --filter @intelliflow/application test`
— all green, zero new failures.

**Estimate:** 1.5 sessions.

---

### Phase 2 — Router refactor, one procedure at a time

Procedures in ascending order of risk. **Each procedure is its own commit + its
own regression run.**

#### 2a. `cancel` (simplest — no conflict detection)

```typescript
cancel: tenantProcedure
  .input(z.object({ id: z.string(), reason: z.string().max(500).optional() }))
  .mutation(async ({ ctx, input }) => {
    const result = await container.services.cancelAppointmentUseCase.execute({
      appointmentId: input.id,
      tenantId: ctx.user.tenantId,
      cancelledBy: ctx.user.userId,
      reason: input.reason,
    });
    if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

    const appointment = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id: input.id },
      include: { attendees: true, linkedCases: true },
    });
    if (!appointment) throw new TRPCError({ code: 'NOT_FOUND', message: `Appointment ${input.id} disappeared after cancel` });

    onAppointmentCancelled(appointment, ctx.user.userId, input.reason).catch(...);
    return appointment;
  })
```

Create a `mapDomainErrorToTRPC` helper in
`apps/api/src/modules/legal/helpers.ts`:

- `ValidationError` → `BAD_REQUEST`
- `NotFoundError` → `NOT_FOUND`
- `ConflictDetectionError` → `INTERNAL_SERVER_ERROR`
- `PersistenceError` → `INTERNAL_SERVER_ERROR`
- everything else → `INTERNAL_SERVER_ERROR`

**Test delta:** rewrite ~8 existing `cancel` tests that assert on
`prismaWithTenant.appointment.update` call shapes to assert on
`cancelAppointmentUseCase.execute` and on the post-fetch shape.

#### 2b. `complete` (same pattern as cancel)

Same structure. ~6 tests to migrate.

#### 2c. `checkConflicts` (read-only, no side effects)

```typescript
checkConflicts: tenantProcedure
  .input(checkConflictsSchema)
  .query(async ({ ctx, input }) => {
    const result =
      await container.services.checkConflictsUseCase.checkConflicts({
        startTime: input.startTime,
        endTime: input.endTime,
        attendeeIds: input.attendeeIds,
        tenantId: ctx.user.tenantId,
        bufferMinutesBefore: input.bufferMinutesBefore,
        bufferMinutesAfter: input.bufferMinutesAfter,
        excludeAppointmentId: input.excludeAppointmentId,
      });
    if (result.isFailure) throw mapDomainErrorToTRPC(result.error);
    return result.value;
  });
```

The use case already returns the enriched shape
`{ hasConflicts, conflicts: [...] }`. Confirm the shape matches what the router
currently returns; if there's a field mismatch (e.g. router includes
`conflictStart`/`conflictEnd` but use case only returns `overlapMinutes`),
extend the use case output OR add a thin shape adapter in the router.

Also covers `checkAvailability` + `findNextSlot` which the router exposes
separately — same pattern.

#### 2d. `reschedule` (conflict detection + state transition)

```typescript
reschedule: tenantProcedure.input(rescheduleSchema).mutation(async ({ ctx, input }) => {
  assertWithinBusinessHours(input.newStartTime, input.newEndTime);  // pre-check stays in router

  const result = await container.services.rescheduleAppointmentUseCase.execute({
    appointmentId: input.id,
    tenantId: ctx.user.tenantId,
    newStartTime: input.newStartTime,
    newEndTime: input.newEndTime,
    rescheduledBy: ctx.user.userId,
    reason: input.reason,
    forceOverrideConflicts: input.forceOverrideConflicts,
  });

  if (result.isFailure) throw mapDomainErrorToTRPC(result.error);
  const { previousTimeSlot, conflictWarnings } = result.value;

  // Use case returns Ok with conflictWarnings when conflicts were found and NOT overridden.
  // Convert that to the router's existing CONFLICT TRPCError shape.
  if (conflictWarnings && !input.forceOverrideConflicts) {
    const details = await ctx.prismaWithTenant.appointment.findMany({
      where: { id: { in: conflictWarnings.map(c => c.appointmentId) } },
      select: { id: true, title: true, startTime: true, endTime: true },
    });
    throw new TRPCError({ code: 'CONFLICT', message: `...`, cause: { conflicts: ... } });
  }

  const appointment = await ctx.prismaWithTenant.appointment.findUnique({
    where: { id: input.id },
    include: { attendees: true, linkedCases: true },
  });
  onAppointmentRescheduled(appointment!, previousTimeSlot.startTime, previousTimeSlot.endTime, ctx.user.userId, input.reason).catch(...);
  createNotification(...).catch(...);
  return { appointment, previousTime: previousTimeSlot };
})
```

**Subtle:** `RescheduleAppointmentUseCase` returns `Ok` even on conflict (just
with `conflictWarnings`), so the router MUST check `conflictWarnings` +
`forceOverrideConflicts` to decide TRPC CONFLICT vs success.

**Tests:** ~20 tests to migrate. Specific risk: tests assert on
`prismaWithTenant.appointment.update` call shape — these need rewriting to mock
the use case.

#### 2e. `create` (most complex — construction + attendees + linkedCases + recurrence + conflicts)

```typescript
create: tenantProcedure.input(createAppointmentSchema).mutation(async ({ ctx, input }) => {
  assertWithinBusinessHours(input.startTime, input.endTime, input.timezone);

  const result = await container.services.scheduleAppointmentUseCase.execute({
    title: input.title,
    description: input.description,
    startTime: input.startTime,
    endTime: input.endTime,
    timezone: input.timezone,                 // NEW — requires Phase 1d entity support
    calendarId: input.calendarId || null,     // NEW — same
    appointmentType: input.appointmentType,
    location: input.location,
    organizerId: ctx.user.userId,
    tenantId: ctx.user.tenantId,
    attendeeIds: input.attendeeIds,
    linkedCaseIds: input.linkedCaseIds,
    bufferMinutesBefore: input.bufferMinutesBefore,
    bufferMinutesAfter: input.bufferMinutesAfter,
    recurrence: input.recurrence,
    reminderMinutes: input.reminderMinutes,
    forceOverrideConflicts: input.forceOverrideConflicts,
  });

  if (result.isFailure) throw mapDomainErrorToTRPC(result.error);
  const { appointment: domainAppt, conflictWarnings } = result.value;

  if (conflictWarnings && !input.forceOverrideConflicts) {
    // Same CONFLICT-mapping pattern as reschedule
    throw new TRPCError({ code: 'CONFLICT', ... });
  }

  const appointment = await ctx.prismaWithTenant.appointment.findUnique({
    where: { id: domainAppt.id.value },
    include: { attendees: true, linkedCases: true },
  });
  onAppointmentCreated(appointment!, ctx.user.userId).catch(...);
  createNotification(...).catch(...);
  return appointment;
})
```

The use case's `appointmentRepository.save()` now handles attendees +
linkedCases + timezone + calendarId via Phase 1 changes.

**Tests:** ~30 tests to migrate. Biggest risk area.

---

### Phase 3 — Remove now-dead code paths

- If every remaining `AppointmentDomainService` caller goes through use cases,
  inline or delete `AppointmentDomainService.validateInput` / `.checkConflicts`
  / `.toDomainAppointments` (they become duplicate logic).
- Drop local conflict-detail re-fetching from the router where the use case
  already returns enough info.
- Update `apps/api/src/services/__tests__/appointment-domain.service.test.ts`
  accordingly.

**Estimate:** 0.5 session.

---

### Phase 4 — Cross-tenant isolation regression test

New integration test:
`apps/api/src/modules/legal/__tests__/appointments.tenant-isolation.test.ts`

- Create 2 tenants, 2 organizers, 2 appointments (one per tenant).
- Assert `findById`, `findForConflictCheck`, `findOverlapping`, `hasConflicts`
  all return/see only the calling tenant's data.
- Assert a scheduling request from tenant A cannot see tenant B's conflicts.
- Assert a cancel/complete/reschedule against tenant B's ID from tenant A's
  session returns NOT_FOUND (not FORBIDDEN, to avoid leaking existence).

This is explicit regression protection for B1.

**Estimate:** 0.25 session.

---

### Phase 5 — Final gates

- `pnpm --filter @intelliflow/domain build` (rebuild for dist)
- `pnpm --filter @intelliflow/adapters test` (port/adapter tests)
- `pnpm --filter @intelliflow/application test` (use-case tests)
- `pnpm --filter @intelliflow/api typecheck && test` (router tests, 371 of them
  must pass + new tenant isolation test)
- `pnpm --filter @intelliflow/api lint`
- `pnpm --filter @intelliflow/api build`
- Coverage check: must be ≥90% statements on touched files
- Runtime smoke via the container wiring test added in the previous session

---

## File inventory

| File                                                                                 | Change                                       | LOC delta (est.)         |
| ------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------ |
| `packages/domain/src/legal/appointments/AppointmentRepository.ts`                    | add `tenantId` param to read methods         | +15                      |
| `packages/domain/src/legal/appointments/Appointment.ts`                              | add `timezone`, `calendarId` props + getters | +40                      |
| `packages/adapters/src/repositories/PrismaAppointmentRepository.ts`                  | tenant filter in every query; map new fields | +80                      |
| `packages/adapters/src/repositories/InMemoryAppointmentRepository.ts`                | same signature changes                       | +50                      |
| `packages/adapters/src/repositories/__tests__/InMemoryAppointmentRepository.test.ts` | pass tenantId through                        | +0 diff / ~60 migrations |
| `packages/application/src/usecases/scheduling/*.ts` (5 files)                        | add tenantId to inputs, pipe through         | +50                      |
| `packages/application/src/usecases/scheduling/__tests__/*.test.ts` (5 files)         | tenantId in test inputs                      | ~50 migrations           |
| `apps/api/src/modules/legal/appointments.router.ts`                                  | refactor 5 procedures                        | **-400 LOC**             |
| `apps/api/src/modules/legal/helpers.ts`                                              | new — `mapDomainErrorToTRPC`                 | +40                      |
| `apps/api/src/modules/legal/__tests__/*.test.ts` (5 files)                           | migrate ~65 tests                            | ~65 migrations           |
| `apps/api/src/modules/legal/__tests__/appointments.tenant-isolation.test.ts`         | new                                          | +150                     |
| `apps/api/src/services/appointment-domain.service.ts`                                | slim down (remove duplicated paths)          | -100                     |

**Net:** router shrinks by ~400 LOC; adapter + port + use cases grow by ~200
LOC; test files mostly migrated not added. Win is single persistence path +
tenant-safe reads.

---

## Session budget

| Phase                                    | Estimate        | Can be parallelized                      |
| ---------------------------------------- | --------------- | ---------------------------------------- |
| 0 — audit                                | 0.5 session     | —                                        |
| 1 — port/adapter/domain/use-case upgrade | 1.5 sessions    | 1a-1c can be one session; 1d-1e the next |
| 2a-2b — cancel + complete                | 1 session       | —                                        |
| 2c — checkConflicts                      | 0.5 session     | —                                        |
| 2d — reschedule                          | 1 session       | —                                        |
| 2e — create                              | 1.5 sessions    | —                                        |
| 3 — dead-code removal                    | 0.5 session     | —                                        |
| 4 — tenant isolation test                | 0.25 session    | —                                        |
| 5 — final gates                          | 0.25 session    | —                                        |
| **Total**                                | **~7 sessions** |                                          |

Splitting across sessions is safe because each phase ends with a fully-green
test suite — nothing leaves the codebase half-refactored.

---

## Risks & mitigations

| Risk                                                                                                       | Likelihood | Impact   | Mitigation                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------- |
| Tenant isolation regression during Phase 2                                                                 | Med        | Critical | Phase 4 regression test is gating; add it at Phase 1 exit if possible to catch issues earlier |
| Response shape drift breaks frontend                                                                       | Med        | High     | Phase 0 snapshots + integration test asserts on exact Prisma row shape post-refetch           |
| `Appointment.reconstitute` breaks when adding `timezone`/`calendarId` (existing serialized rows lack them) | Low        | Med      | Make both fields optional; `mapToEntity` passes `undefined` when missing                      |
| 65 test migrations introduce silent behavior drift                                                         | Med        | Med      | Keep each test's assertion intent identical — only the mock target changes                    |
| Use case `Ok` + `conflictWarnings` branch semantics confuse reviewers                                      | Low        | Low      | Router comment + helper `throwIfConflict(result, ctx)` centralizes the pattern                |
| `AppointmentDomainService` still imported by other callers                                                 | Med        | Low      | Phase 3 grep confirms zero external imports before deletion                                   |

---

## Open questions for approval

1. **Tenant parameter style:** per-method `tenantId: string` parameter
   (proposed) vs. `TenantScope` value object vs. `repo.forTenant(tenantId)`
   factory. Proposed is simplest for call sites but most intrusive to the port.
   Factory style is the cleanest API but requires container-level changes.
2. **Recurrence-expanded children:** current router doesn't expand recurrences
   on create. Out of scope here — recurrence stored as JSON, expansion happens
   elsewhere. Confirm.
3. **Response DTO:** proposal keeps re-fetching via `prismaWithTenant` to
   preserve the current Prisma row shape. Alternative is to define a proper
   `AppointmentDTO` serializer. Deferred.
4. **Single commit per phase or per procedure?** Proposed per-procedure (7
   commits in Phase 2). Tighter bisect, cleaner PRs.

---

## Decision needed

Approve phased plan and kick off **Phase 0** audit in the next session, OR
adjust sequencing / scope first.
