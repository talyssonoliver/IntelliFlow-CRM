import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAppointmentRepository } from '../InMemoryAppointmentRepository';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function makeApt(o: Record<string, unknown> = {}): any {
  const id = o.id || Math.random().toString(36).slice(2, 10);
  const now = new Date();
  return {
    id: { value: typeof id === 'string' ? id : (id as any).value },
    tenantId: (o.tenantId as string) ?? TENANT_A,
    organizerId: o.organizerId ?? 'org-1',
    attendeeIds: (o.attendeeIds as string[]) ?? [],
    linkedCaseIds: (o.linkedCaseIds as any[]) ?? [],
    startTime: (o.startTime as Date) ?? now,
    endTime: (o.endTime as Date) ?? new Date(now.getTime() + 3600000),
    status: (o.status as string) ?? 'SCHEDULED',
    appointmentType: (o.appointmentType as string) ?? 'MEETING',
    isRecurring: o.isRecurring ?? false,
    externalCalendarId: o.externalCalendarId ?? null,
    reminderMinutes: o.reminderMinutes ?? null,
    // Optional: parentAppointmentId for findRecurringInstances tests
    ...(o.parentAppointmentId !== undefined ? { parentAppointmentId: o.parentAppointmentId } : {}),
    // Fake props so batchUpdateStatus direct mutation works on plain objects
    props: { status: (o.status as string) ?? 'SCHEDULED' },
  };
}

describe('InMemoryAppointmentRepository', () => {
  let repo: InMemoryAppointmentRepository;

  beforeEach(() => {
    repo = new InMemoryAppointmentRepository();
  });

  // -------------------------------------------------------------------------
  // Root repo: save / saveAll
  // -------------------------------------------------------------------------

  it('save/findById', async () => {
    const a = makeApt({ id: 'a1' });
    await repo.save(a);
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findById({ value: 'a1' } as any)).toBe(a);
  });

  it('findById null for unknown', async () => {
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findById({ value: 'x' } as any)).toBeNull();
  });

  it('saveAll/findByIds', async () => {
    await repo.saveAll([makeApt({ id: 'x1' }), makeApt({ id: 'x2' })]);
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByIds([{ value: 'x1' }, { value: 'x2' }] as any[])).toHaveLength(2);
  });

  it('findByIds skips unknown', async () => {
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByIds([{ value: 'nope' }] as any[])).toHaveLength(0);
  });

  it('delete', async () => {
    await repo.save(makeApt({ id: 'd1' }));
    const scoped = repo.forTenant(TENANT_A);
    await scoped.delete({ value: 'd1' } as any);
    expect(await scoped.findById({ value: 'd1' } as any)).toBeNull();
  });

  it('findByOrganizer filters and sorts', async () => {
    const t1 = new Date(2025, 0, 1),
      t2 = new Date(2025, 0, 2);
    await repo.save(makeApt({ id: 'o1', organizerId: 'A', startTime: t2 }));
    await repo.save(makeApt({ id: 'o2', organizerId: 'A', startTime: t1 }));
    await repo.save(makeApt({ id: 'o3', organizerId: 'B', startTime: t1 }));
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findByOrganizer('A');
    expect(r).toHaveLength(2);
    expect(r[0].id.value).toBe('o2');
  });

  it('findByOrganizer paginates', async () => {
    for (let i = 0; i < 5; i++)
      await repo.save(
        makeApt({ id: 'p' + i, organizerId: 'P', startTime: new Date(2025, 0, i + 1) })
      );
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByOrganizer('P', { limit: 2, offset: 1 })).toHaveLength(2);
  });

  it('findByAttendee as organizer', async () => {
    await repo.save(makeApt({ id: 'ba1', organizerId: 'u1' }));
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByAttendee('u1')).toHaveLength(1);
  });

  it('findByAttendee as attendee', async () => {
    await repo.save(makeApt({ id: 'ba2', organizerId: 'x', attendeeIds: ['u2'] }));
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByAttendee('u2')).toHaveLength(1);
  });

  it('findByCase', async () => {
    await repo.save(makeApt({ id: 'fc1', linkedCaseIds: [{ value: 'c1' }] }));
    await repo.save(makeApt({ id: 'fc2', linkedCaseIds: [] }));
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByCase({ value: 'c1' } as any)).toHaveLength(1);
  });

  it('findInTimeRange', async () => {
    await repo.save(
      makeApt({
        id: 'tr1',
        startTime: new Date(2025, 0, 10, 9, 30),
        endTime: new Date(2025, 0, 10, 10, 30),
      })
    );
    await repo.save(
      makeApt({
        id: 'tr2',
        startTime: new Date(2025, 0, 10, 12, 0),
        endTime: new Date(2025, 0, 10, 13, 0),
      })
    );
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findInTimeRange(
      new Date(2025, 0, 10, 10, 0),
      new Date(2025, 0, 10, 11, 0)
    );
    expect(r).toHaveLength(1);
    expect(r[0].id.value).toBe('tr1');
  });

  it('findOverlapping excludes cancelled/no-show', async () => {
    const s = new Date(2025, 1, 1, 10, 0),
      e = new Date(2025, 1, 1, 11, 0);
    await repo.save(makeApt({ id: 'ov1', status: 'CANCELLED', startTime: s, endTime: e }));
    await repo.save(makeApt({ id: 'ov2', status: 'NO_SHOW', startTime: s, endTime: e }));
    await repo.save(makeApt({ id: 'ov3', status: 'SCHEDULED', startTime: s, endTime: e }));
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findOverlapping({ startTime: s, endTime: e } as any);
    expect(r).toHaveLength(1);
    expect(r[0].id.value).toBe('ov3');
  });

  it('findOverlapping excludes by id', async () => {
    const s = new Date(2025, 1, 2, 10, 0),
      e = new Date(2025, 1, 2, 11, 0);
    await repo.save(makeApt({ id: 'ov4', status: 'SCHEDULED', startTime: s, endTime: e }));
    const scoped = repo.forTenant(TENANT_A);
    expect(
      await scoped.findOverlapping({ startTime: s, endTime: e } as any, { value: 'ov4' } as any)
    ).toHaveLength(0);
  });

  it('findWithFilters by organizerId', async () => {
    await repo.save(makeApt({ id: 'fw1', organizerId: 'o1' }));
    await repo.save(makeApt({ id: 'fw2', organizerId: 'o2' }));
    const scoped = repo.forTenant(TENANT_A);
    expect((await scoped.findWithFilters({ organizerId: 'o1' })).items).toHaveLength(1);
  });

  it('findWithFilters by status array', async () => {
    await repo.save(makeApt({ id: 'fs1', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'fs2', status: 'COMPLETED' }));
    const scoped = repo.forTenant(TENANT_A);
    expect((await scoped.findWithFilters({ status: ['SCHEDULED'] as any })).items).toHaveLength(1);
  });

  it('findWithFilters by appointmentType', async () => {
    await repo.save(makeApt({ id: 'ft1', appointmentType: 'MEETING' }));
    await repo.save(makeApt({ id: 'ft2', appointmentType: 'CALL' }));
    const scoped = repo.forTenant(TENANT_A);
    expect(
      (await scoped.findWithFilters({ appointmentType: ['MEETING'] as any })).items
    ).toHaveLength(1);
  });

  it('findWithFilters by time range', async () => {
    await repo.save(makeApt({ id: 'ftm1', startTime: new Date(2025, 0, 10) }));
    await repo.save(makeApt({ id: 'ftm2', startTime: new Date(2025, 0, 20) }));
    const scoped = repo.forTenant(TENANT_A);
    expect(
      (
        await scoped.findWithFilters({
          startTimeFrom: new Date(2025, 0, 5),
          startTimeTo: new Date(2025, 0, 15),
        })
      ).items
    ).toHaveLength(1);
  });

  it('findWithFilters by isRecurring', async () => {
    await repo.save(makeApt({ id: 'fr1', isRecurring: true }));
    await repo.save(makeApt({ id: 'fr2', isRecurring: false }));
    const scoped = repo.forTenant(TENANT_A);
    expect((await scoped.findWithFilters({ isRecurring: true })).items).toHaveLength(1);
  });

  it('findWithFilters hasMore', async () => {
    for (let i = 0; i < 3; i++) await repo.save(makeApt({ id: 'hm' + i, organizerId: 'all' }));
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findWithFilters({ organizerId: 'all' }, { limit: 2, offset: 0 });
    expect(r.hasMore).toBe(true);
    expect(r.total).toBe(3);
  });

  it('findWithFilters by attendeeId', async () => {
    await repo.save(makeApt({ id: 'fa3', organizerId: 'att1' }));
    await repo.save(makeApt({ id: 'fa4', organizerId: 'x', attendeeIds: ['att1'] }));
    await repo.save(makeApt({ id: 'fa5', organizerId: 'none' }));
    const scoped = repo.forTenant(TENANT_A);
    expect((await scoped.findWithFilters({ attendeeId: 'att1' })).items).toHaveLength(2);
  });

  it('findWithFilters by caseId', async () => {
    await repo.save(makeApt({ id: 'fc3', linkedCaseIds: [{ value: 'c1' }] }));
    await repo.save(makeApt({ id: 'fc4', linkedCaseIds: [] }));
    const scoped = repo.forTenant(TENANT_A);
    expect((await scoped.findWithFilters({ caseId: { value: 'c1' } } as any)).items).toHaveLength(
      1
    );
  });

  it('countByStatus all', async () => {
    await repo.save(makeApt({ id: 'cs1', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'cs2', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'cs3', status: 'COMPLETED' }));
    const scoped = repo.forTenant(TENANT_A);
    const c2 = await scoped.countByStatus();
    expect(c2.SCHEDULED).toBe(2);
    expect(c2.COMPLETED).toBe(1);
    expect(c2.CANCELLED).toBe(0);
  });

  it('countByStatus by organizer', async () => {
    await repo.save(makeApt({ id: 'co1', organizerId: 'A', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'co2', organizerId: 'B', status: 'SCHEDULED' }));
    const scoped = repo.forTenant(TENANT_A);
    expect((await scoped.countByStatus('A')).SCHEDULED).toBe(1);
  });

  it('findUpcoming future non-cancelled', async () => {
    const future = new Date(Date.now() + 86400000),
      past = new Date(Date.now() - 86400000);
    await repo.save(
      makeApt({ id: 'up1', organizerId: 'u1', startTime: future, status: 'SCHEDULED' })
    );
    await repo.save(
      makeApt({ id: 'up2', organizerId: 'u1', startTime: past, status: 'SCHEDULED' })
    );
    await repo.save(
      makeApt({ id: 'up3', organizerId: 'u1', startTime: future, status: 'CANCELLED' })
    );
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findUpcoming('u1');
    expect(r).toHaveLength(1);
    expect(r[0].id.value).toBe('up1');
  });

  it('findUpcoming respects limit', async () => {
    const f = new Date(Date.now() + 86400000);
    for (let i = 0; i < 5; i++)
      await repo.save(
        makeApt({
          id: 'ul' + i,
          organizerId: 'u2',
          startTime: new Date(f.getTime() + i * 60000),
          status: 'CONFIRMED',
        })
      );
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findUpcoming('u2', 2)).toHaveLength(2);
  });

  it('findPast sorted desc', async () => {
    const p1 = new Date(Date.now() - 172800000),
      p2 = new Date(Date.now() - 86400000);
    await repo.save(
      makeApt({
        id: 'pa1',
        organizerId: 'u3',
        startTime: p1,
        endTime: new Date(p1.getTime() + 3600000),
      })
    );
    await repo.save(
      makeApt({
        id: 'pa2',
        organizerId: 'u3',
        startTime: p2,
        endTime: new Date(p2.getTime() + 3600000),
      })
    );
    await repo.save(
      makeApt({
        id: 'pa3',
        organizerId: 'u3',
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 90000000),
      })
    );
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findPast('u3');
    expect(r).toHaveLength(2);
    expect(r[0].id.value).toBe('pa2');
  });

  it('findByExternalCalendarId finds', async () => {
    await repo.save(makeApt({ id: 'ec1', externalCalendarId: 'gcal-123' }));
    const scoped = repo.forTenant(TENANT_A);
    const f = await scoped.findByExternalCalendarId('gcal-123');
    expect(f).toBeTruthy();
    expect(f!.id.value).toBe('ec1');
  });

  it('findByExternalCalendarId null', async () => {
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findByExternalCalendarId('x')).toBeNull();
  });

  it('hasConflicts with organizer', async () => {
    const s = new Date(2025, 2, 1, 10, 0),
      e = new Date(2025, 2, 1, 11, 0);
    await repo.save(
      makeApt({ id: 'hc1', organizerId: 'u4', startTime: s, endTime: e, status: 'SCHEDULED' })
    );
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.hasConflicts({ startTime: s, endTime: e } as any, ['u4'])).toBe(true);
  });

  it('hasConflicts with attendee', async () => {
    const s = new Date(2025, 2, 2, 10, 0),
      e = new Date(2025, 2, 2, 11, 0);
    await repo.save(
      makeApt({
        id: 'hc2',
        organizerId: 'x',
        attendeeIds: ['u5'],
        startTime: s,
        endTime: e,
        status: 'CONFIRMED',
      })
    );
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.hasConflicts({ startTime: s, endTime: e } as any, ['u5'])).toBe(true);
  });

  it('hasConflicts false cancelled', async () => {
    const s = new Date(2025, 2, 3, 10, 0),
      e = new Date(2025, 2, 3, 11, 0);
    await repo.save(
      makeApt({ id: 'hc3', organizerId: 'u6', startTime: s, endTime: e, status: 'CANCELLED' })
    );
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.hasConflicts({ startTime: s, endTime: e } as any, ['u6'])).toBe(false);
  });

  it('hasConflicts excludes by id', async () => {
    const s = new Date(2025, 2, 4, 10, 0),
      e = new Date(2025, 2, 4, 11, 0);
    await repo.save(
      makeApt({ id: 'hc4', organizerId: 'u7', startTime: s, endTime: e, status: 'SCHEDULED' })
    );
    const scoped = repo.forTenant(TENANT_A);
    expect(
      await scoped.hasConflicts({ startTime: s, endTime: e } as any, ['u7'], {
        value: 'hc4',
      } as any)
    ).toBe(false);
  });

  it('hasConflicts no conflict non-attendee', async () => {
    const s = new Date(2025, 2, 5, 10, 0),
      e = new Date(2025, 2, 5, 11, 0);
    await repo.save(
      makeApt({
        id: 'hc5',
        organizerId: 'someone',
        startTime: s,
        endTime: e,
        status: 'SCHEDULED',
      })
    );
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.hasConflicts({ startTime: s, endTime: e } as any, ['other'])).toBe(false);
  });

  it('findForConflictCheck', async () => {
    await repo.save(
      makeApt({
        id: 'fcc1',
        organizerId: 'u8',
        startTime: new Date(2025, 3, 1, 10, 0),
        endTime: new Date(2025, 3, 1, 11, 0),
        status: 'SCHEDULED',
      })
    );
    const scoped = repo.forTenant(TENANT_A);
    expect(
      await scoped.findForConflictCheck(['u8'], {
        startTime: new Date(2025, 3, 1, 9, 0),
        endTime: new Date(2025, 3, 1, 12, 0),
      })
    ).toHaveLength(1);
  });

  it('findRecurringInstances returns empty when no parentAppointmentId', async () => {
    await repo.save(makeApt({ id: 'ri1' }));
    const scoped = repo.forTenant(TENANT_A);
    expect(await scoped.findRecurringInstances({ value: 'any' } as any)).toEqual([]);
  });

  it('batchUpdateStatus updates matching tenant appointments', async () => {
    const apt = makeApt({ id: 'bu1', status: 'SCHEDULED' });
    await repo.save(apt);
    await repo.batchUpdateStatus([{ value: 'bu1' } as any], TENANT_A, 'COMPLETED' as any);
    // The plain test double has props.status mutated by batchUpdateStatus
    expect(apt.props.status).toBe('COMPLETED');
  });

  it('findNeedingReminder', async () => {
    const soon = new Date(Date.now() + 10 * 60000);
    await repo.save(
      makeApt({ id: 'rn1', startTime: soon, status: 'SCHEDULED', reminderMinutes: 30 })
    );
    await repo.save(
      makeApt({ id: 'rn2', startTime: soon, status: 'COMPLETED', reminderMinutes: 30 })
    );
    await repo.save(
      makeApt({ id: 'rn3', startTime: soon, status: 'CONFIRMED', reminderMinutes: null })
    );
    const scoped = repo.forTenant(TENANT_A);
    const r = await scoped.findNeedingReminder(30);
    expect(r).toHaveLength(1);
    expect(r[0].id.value).toBe('rn1');
  });

  it('clear/count/getAll', async () => {
    await repo.save(makeApt({ id: 'th1' }));
    await repo.save(makeApt({ id: 'th2' }));
    expect(repo.count()).toBe(2);
    expect(repo.getAll()).toHaveLength(2);
    repo.clear();
    expect(repo.count()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // NEW: Tenant isolation tests
  // -------------------------------------------------------------------------

  it('forTenant(A).findById returns null for appointment belonging to tenant B', async () => {
    const aptB = makeApt({ id: 'iso1', tenantId: TENANT_B });
    await repo.save(aptB);
    const scopedA = repo.forTenant(TENANT_A);
    expect(await scopedA.findById({ value: 'iso1' } as any)).toBeNull();
  });

  it('forTenant(A).delete is a no-op for appointment belonging to tenant B', async () => {
    const aptB = makeApt({ id: 'iso2', tenantId: TENANT_B });
    await repo.save(aptB);
    const scopedA = repo.forTenant(TENANT_A);
    // Should not throw and should not remove the appointment
    await expect(scopedA.delete({ value: 'iso2' } as any)).resolves.toBeUndefined();
    // The appointment is still visible when accessed with the correct tenant
    const scopedB = repo.forTenant(TENANT_B);
    expect(await scopedB.findById({ value: 'iso2' } as any)).toBe(aptB);
  });

  it('batchUpdateStatus does NOT update appointment belonging to a different tenant', async () => {
    const aptB = makeApt({ id: 'iso3', tenantId: TENANT_B, status: 'SCHEDULED' });
    await repo.save(aptB);
    await repo.batchUpdateStatus(
      [{ value: 'iso3' } as any],
      TENANT_A, // wrong tenant
      'CANCELLED' as any
    );
    // Status must remain unchanged
    expect(aptB.props.status).toBe('SCHEDULED');
  });

  it('findRecurringInstances returns child instances only for correct tenant', async () => {
    const parentId = 'parent-1';
    const childA = makeApt({
      id: 'child-a',
      tenantId: TENANT_A,
      parentAppointmentId: { value: parentId },
    });
    const childB = makeApt({
      id: 'child-b',
      tenantId: TENANT_B,
      parentAppointmentId: { value: parentId },
    });
    await repo.save(childA);
    await repo.save(childB);

    const scopedA = repo.forTenant(TENANT_A);
    const results = await scopedA.findRecurringInstances({ value: parentId } as any);
    expect(results).toHaveLength(1);
    expect(results[0].id.value).toBe('child-a');
  });
});
