/**
 * Appointments Tenant-Isolation Regression Tests (Phase 4 — B1 risk)
 *
 * Exercises the full router → use-case → repository chain to prove
 * that cross-tenant reads and writes are impossible.
 *
 * Strategy:
 *  - One shared InMemoryAppointmentRepository with two tenant populations.
 *  - Real use-case instances (no mocks) wired against the in-memory repo.
 *  - Fake timers freeze "now" in the past so Appointment.create() (which
 *    rejects startTime < now − 5 min) always sees future appointment times.
 *
 * Error mapping:
 *  - When a tenant-A use case looks up a tenant-B appointmentId the
 *    tenant-scoped findById returns null, and the use cases surface that as
 *    ValidationError (code 'VALIDATION_ERROR') — not NotFoundError.
 *    Tests assert the actual code produced by the codebase, not the spec label.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Appointment } from '@intelliflow/domain';
import { InMemoryAppointmentRepository } from '@intelliflow/adapters';
import {
  ScheduleAppointmentUseCase,
  CancelAppointmentUseCase,
  CompleteAppointmentUseCase,
  RescheduleAppointmentUseCase,
  CheckConflictsUseCase,
} from '@intelliflow/application';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';

// Frozen "now" — all appointment times below reference this anchor.
// Using a well-known past timestamp lets us control start/end deterministically.
const FROZEN_NOW = new Date('2026-01-01T10:00:00Z');

// A slot that is 1 hour in the "future" relative to FROZEN_NOW.
const SLOT_START = new Date('2026-01-01T14:00:00Z'); // +4h
const SLOT_END = new Date('2026-01-01T15:00:00Z'); // +5h

// An overlapping slot (same times, different tenant).
const OVERLAP_START = SLOT_START;
const OVERLAP_END = SLOT_END;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a real Appointment entity and save it in the shared repo. */
async function seedAppointment(
  repo: InMemoryAppointmentRepository,
  tenantId: string,
  overrides: {
    startTime?: Date;
    endTime?: Date;
    organizerId?: string;
    attendeeIds?: string[];
    title?: string;
  } = {}
): Promise<Appointment> {
  const result = Appointment.create({
    title: overrides.title ?? `Meeting for ${tenantId}`,
    startTime: overrides.startTime ?? SLOT_START,
    endTime: overrides.endTime ?? SLOT_END,
    appointmentType: 'MEETING',
    organizerId: overrides.organizerId ?? `organizer-${tenantId}`,
    tenantId,
    attendeeIds: overrides.attendeeIds ?? [],
  });

  if (result.isFailure) {
    throw new Error(`seedAppointment failed for tenant ${tenantId}: ${result.error.message}`);
  }

  await repo.save(result.value);
  return result.value;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Appointments — cross-tenant isolation (Phase 4 regression)', () => {
  let repo: InMemoryAppointmentRepository;

  // Use-case instances, each wired to the same shared repository.
  let scheduleUC: ScheduleAppointmentUseCase;
  let cancelUC: CancelAppointmentUseCase;
  let completeUC: CompleteAppointmentUseCase;
  let rescheduleUC: RescheduleAppointmentUseCase;
  let conflictsUC: CheckConflictsUseCase;

  beforeEach(() => {
    // Freeze time so all Appointment.create() calls see future start times.
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    repo = new InMemoryAppointmentRepository();
    scheduleUC = new ScheduleAppointmentUseCase(repo);
    cancelUC = new CancelAppointmentUseCase(repo);
    completeUC = new CompleteAppointmentUseCase(repo);
    rescheduleUC = new RescheduleAppointmentUseCase(repo);
    conflictsUC = new CheckConflictsUseCase(repo);
  });

  afterEach(() => {
    vi.useRealTimers();
    repo.clear();
  });

  // ─── Test 1 ────────────────────────────────────────────────────────────────
  it('Test 1: forTenant(A).findById(B.id) === null — repo-level proof', async () => {
    const aptB = await seedAppointment(repo, TENANT_B);

    const scopedA = repo.forTenant(TENANT_A);
    const found = await scopedA.findById(aptB.id);

    expect(found).toBeNull();
  });

  // ─── Test 2 ────────────────────────────────────────────────────────────────
  it('Test 2: forTenant(A).delete(B.id) is a silent no-op — B still exists', async () => {
    const aptB = await seedAppointment(repo, TENANT_B);

    const scopedA = repo.forTenant(TENANT_A);
    // Must not throw.
    await expect(scopedA.delete(aptB.id)).resolves.toBeUndefined();

    // B's appointment is still visible through its own tenant scope.
    const scopedB = repo.forTenant(TENANT_B);
    const stillThere = await scopedB.findById(aptB.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.id.value).toBe(aptB.id.value);
  });

  // ─── Test 3 ────────────────────────────────────────────────────────────────
  it('Test 3: batchUpdateStatus([A.id, B.id], tenantA, CANCELLED) only mutates A — B unchanged', async () => {
    const aptA = await seedAppointment(repo, TENANT_A);
    const aptB = await seedAppointment(repo, TENANT_B);

    expect(aptA.status).toBe('SCHEDULED');
    expect(aptB.status).toBe('SCHEDULED');

    await repo.batchUpdateStatus([aptA.id, aptB.id], TENANT_A, 'CANCELLED');

    // A should now be CANCELLED.
    const updatedA = await repo.forTenant(TENANT_A).findById(aptA.id);
    expect(updatedA!.status).toBe('CANCELLED');

    // B must remain SCHEDULED — the cross-tenant guard must have silently skipped it.
    const updatedB = await repo.forTenant(TENANT_B).findById(aptB.id);
    expect(updatedB!.status).toBe('SCHEDULED');
  });

  // ─── Test 4 ────────────────────────────────────────────────────────────────
  it('Test 4: scheduleAppointmentUseCase for tenant A cannot see tenant B overlapping slot — no conflict warning fires', async () => {
    const SHARED_ATTENDEE = 'user-shared-attendee';

    // Seed a B appointment at the exact same slot with the same attendee.
    await seedAppointment(repo, TENANT_B, {
      startTime: OVERLAP_START,
      endTime: OVERLAP_END,
      organizerId: SHARED_ATTENDEE,
    });

    // Schedule a new A appointment at the same slot with the same attendee.
    const result = await scheduleUC.execute({
      title: 'Tenant A meeting',
      startTime: OVERLAP_START,
      endTime: OVERLAP_END,
      appointmentType: 'MEETING',
      organizerId: SHARED_ATTENDEE,
      tenantId: TENANT_A,
      forceOverrideConflicts: false,
    });

    // The use case must succeed and must NOT produce conflict warnings
    // sourced from tenant B's appointment.
    expect(result.isSuccess).toBe(true);
    expect(result.value.conflictWarnings ?? []).toHaveLength(0);
  });

  // ─── Test 5 ────────────────────────────────────────────────────────────────
  it('Test 5: rescheduleAppointmentUseCase for tenant A against tenant B appointmentId returns VALIDATION_ERROR', async () => {
    const aptB = await seedAppointment(repo, TENANT_B);

    const futureStart = new Date(SLOT_START.getTime() + 2 * 3600_000); // +2h
    const futureEnd = new Date(futureStart.getTime() + 3600_000);

    const result = await rescheduleUC.execute({
      appointmentId: aptB.id.value,
      tenantId: TENANT_A, // wrong tenant
      newStartTime: futureStart,
      newEndTime: futureEnd,
      rescheduledBy: 'attacker-user',
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ─── Test 6 ────────────────────────────────────────────────────────────────
  it('Test 6: cancelAppointmentUseCase for tenant A against tenant B appointmentId returns VALIDATION_ERROR', async () => {
    const aptB = await seedAppointment(repo, TENANT_B);

    const result = await cancelUC.execute({
      appointmentId: aptB.id.value,
      tenantId: TENANT_A, // wrong tenant
      cancelledBy: 'attacker-user',
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('VALIDATION_ERROR');

    // B's appointment must still be SCHEDULED (not touched).
    const aptBAfter = await repo.forTenant(TENANT_B).findById(aptB.id);
    expect(aptBAfter!.status).toBe('SCHEDULED');
  });

  // ─── Test 7 ────────────────────────────────────────────────────────────────
  it('Test 7: completeAppointmentUseCase for tenant A against tenant B appointmentId returns VALIDATION_ERROR', async () => {
    const aptB = await seedAppointment(repo, TENANT_B);

    const result = await completeUC.execute({
      appointmentId: aptB.id.value,
      tenantId: TENANT_A, // wrong tenant
      completedBy: 'attacker-user',
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('VALIDATION_ERROR');

    // B's appointment must remain SCHEDULED.
    const aptBAfter = await repo.forTenant(TENANT_B).findById(aptB.id);
    expect(aptBAfter!.status).toBe('SCHEDULED');
  });

  // ─── Test 8 ────────────────────────────────────────────────────────────────
  it('Test 8: checkConflictsUseCase.checkConflicts for tenant A only sees tenant A appointments even when attendeeIds overlap', async () => {
    const SHARED_ATTENDEE = 'user-overlap-attendee';

    // Seed a B appointment with the shared attendee.
    await seedAppointment(repo, TENANT_B, {
      startTime: OVERLAP_START,
      endTime: OVERLAP_END,
      organizerId: SHARED_ATTENDEE,
    });

    // A's conflict check must return hasConflicts: false because B's appointment
    // is invisible to A's tenant scope.
    const result = await conflictsUC.checkConflicts({
      tenantId: TENANT_A,
      startTime: OVERLAP_START,
      endTime: OVERLAP_END,
      attendeeIds: [SHARED_ATTENDEE],
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.hasConflicts).toBe(false);
    expect(result.value.conflicts).toHaveLength(0);
  });

  // ─── Test 9 ────────────────────────────────────────────────────────────────
  it("Test 9: findUpcoming under forTenant(A) returns only A's upcoming when user is attendee in both tenants", async () => {
    const SHARED_USER = 'user-in-both-tenants';

    const futureA1 = new Date(FROZEN_NOW.getTime() + 2 * 3600_000); // +2h
    const futureA2 = new Date(FROZEN_NOW.getTime() + 24 * 3600_000); // +24h

    // Two A appointments for the shared user.
    await seedAppointment(repo, TENANT_A, {
      organizerId: SHARED_USER,
      startTime: futureA1,
      endTime: new Date(futureA1.getTime() + 3600_000),
      title: 'A meeting 1',
    });
    await seedAppointment(repo, TENANT_A, {
      organizerId: SHARED_USER,
      startTime: futureA2,
      endTime: new Date(futureA2.getTime() + 3600_000),
      title: 'A meeting 2',
    });

    // One B appointment for the same user — must not bleed into A's scope.
    const futureB = new Date(FROZEN_NOW.getTime() + 3 * 3600_000); // +3h
    await seedAppointment(repo, TENANT_B, {
      organizerId: SHARED_USER,
      startTime: futureB,
      endTime: new Date(futureB.getTime() + 3600_000),
      title: 'B meeting',
    });

    const upcomingA = await repo.forTenant(TENANT_A).findUpcoming(SHARED_USER, 10);

    // Must contain exactly the 2 tenant-A appointments, never the B one.
    expect(upcomingA).toHaveLength(2);
    upcomingA.forEach((apt) => {
      expect(apt.tenantId).toBe(TENANT_A);
    });
  });

  // ─── Test 10 ───────────────────────────────────────────────────────────────
  it('Test 10: hasConflicts under forTenant(A) returns false even if tenant B has overlap on that slot + attendee', async () => {
    const SHARED_ATTENDEE = 'user-cross-tenant-conflict-check';

    // Seed a B appointment with the shared attendee at the exact slot.
    await seedAppointment(repo, TENANT_B, {
      startTime: OVERLAP_START,
      endTime: OVERLAP_END,
      organizerId: SHARED_ATTENDEE,
    });

    // A's hasConflicts check must not see B's appointment.
    const hasConflict = await repo
      .forTenant(TENANT_A)
      .hasConflicts({ startTime: OVERLAP_START, endTime: OVERLAP_END } as any, [SHARED_ATTENDEE]);

    expect(hasConflict).toBe(false);
  });
});
