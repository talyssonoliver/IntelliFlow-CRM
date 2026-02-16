import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAppointmentRepository } from '../InMemoryAppointmentRepository';

function makeApt(o: Record<string, unknown> = {}): any {
  const id = o.id || Math.random().toString(36).slice(2, 10);
  const now = new Date();
  return {
    id: { value: typeof id === 'string' ? id : (id as any).value },
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
  };
}

describe('InMemoryAppointmentRepository', () => {
  let repo: InMemoryAppointmentRepository;
  beforeEach(() => {
    repo = new InMemoryAppointmentRepository();
  });

  it('save/findById', async () => {
    const a = makeApt({ id: 'a1' });
    await repo.save(a);
    expect(await repo.findById({ value: 'a1' } as any)).toBe(a);
  });
  it('findById null for unknown', async () => {
    expect(await repo.findById({ value: 'x' } as any)).toBeNull();
  });
  it('saveAll/findByIds', async () => {
    await repo.saveAll([makeApt({ id: 'x1' }), makeApt({ id: 'x2' })]);
    expect(await repo.findByIds([{ value: 'x1' }, { value: 'x2' }] as any[])).toHaveLength(2);
  });
  it('findByIds skips unknown', async () => {
    expect(await repo.findByIds([{ value: 'nope' }] as any[])).toHaveLength(0);
  });
  it('delete', async () => {
    await repo.save(makeApt({ id: 'd1' }));
    await repo.delete({ value: 'd1' } as any);
    expect(await repo.findById({ value: 'd1' } as any)).toBeNull();
  });
  it('findByOrganizer filters and sorts', async () => {
    const t1 = new Date(2025, 0, 1),
      t2 = new Date(2025, 0, 2);
    await repo.save(makeApt({ id: 'o1', organizerId: 'A', startTime: t2 }));
    await repo.save(makeApt({ id: 'o2', organizerId: 'A', startTime: t1 }));
    await repo.save(makeApt({ id: 'o3', organizerId: 'B', startTime: t1 }));
    const r = await repo.findByOrganizer('A');
    expect(r).toHaveLength(2);
    expect(r[0].id.value).toBe('o2');
  });
  it('findByOrganizer paginates', async () => {
    for (let i = 0; i < 5; i++)
      await repo.save(
        makeApt({ id: 'p' + i, organizerId: 'P', startTime: new Date(2025, 0, i + 1) })
      );
    expect(await repo.findByOrganizer('P', { limit: 2, offset: 1 })).toHaveLength(2);
  });
  it('findByAttendee as organizer', async () => {
    await repo.save(makeApt({ id: 'ba1', organizerId: 'u1' }));
    expect(await repo.findByAttendee('u1')).toHaveLength(1);
  });
  it('findByAttendee as attendee', async () => {
    await repo.save(makeApt({ id: 'ba2', organizerId: 'x', attendeeIds: ['u2'] }));
    expect(await repo.findByAttendee('u2')).toHaveLength(1);
  });
  it('findByCase', async () => {
    await repo.save(makeApt({ id: 'fc1', linkedCaseIds: [{ value: 'c1' }] }));
    await repo.save(makeApt({ id: 'fc2', linkedCaseIds: [] }));
    expect(await repo.findByCase({ value: 'c1' } as any)).toHaveLength(1);
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
    const r = await repo.findInTimeRange(
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
    const r = await repo.findOverlapping({ startTime: s, endTime: e } as any);
    expect(r).toHaveLength(1);
    expect(r[0].id.value).toBe('ov3');
  });
  it('findOverlapping excludes by id', async () => {
    const s = new Date(2025, 1, 2, 10, 0),
      e = new Date(2025, 1, 2, 11, 0);
    await repo.save(makeApt({ id: 'ov4', status: 'SCHEDULED', startTime: s, endTime: e }));
    expect(
      await repo.findOverlapping({ startTime: s, endTime: e } as any, { value: 'ov4' } as any)
    ).toHaveLength(0);
  });
  it('findWithFilters by organizerId', async () => {
    await repo.save(makeApt({ id: 'fw1', organizerId: 'o1' }));
    await repo.save(makeApt({ id: 'fw2', organizerId: 'o2' }));
    expect((await repo.findWithFilters({ organizerId: 'o1' })).items).toHaveLength(1);
  });
  it('findWithFilters by status array', async () => {
    await repo.save(makeApt({ id: 'fs1', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'fs2', status: 'COMPLETED' }));
    expect((await repo.findWithFilters({ status: ['SCHEDULED'] as any })).items).toHaveLength(1);
  });
  it('findWithFilters by appointmentType', async () => {
    await repo.save(makeApt({ id: 'ft1', appointmentType: 'MEETING' }));
    await repo.save(makeApt({ id: 'ft2', appointmentType: 'CALL' }));
    expect(
      (await repo.findWithFilters({ appointmentType: ['MEETING'] as any })).items
    ).toHaveLength(1);
  });
  it('findWithFilters by time range', async () => {
    await repo.save(makeApt({ id: 'ftm1', startTime: new Date(2025, 0, 10) }));
    await repo.save(makeApt({ id: 'ftm2', startTime: new Date(2025, 0, 20) }));
    expect(
      (
        await repo.findWithFilters({
          startTimeFrom: new Date(2025, 0, 5),
          startTimeTo: new Date(2025, 0, 15),
        })
      ).items
    ).toHaveLength(1);
  });
  it('findWithFilters by isRecurring', async () => {
    await repo.save(makeApt({ id: 'fr1', isRecurring: true }));
    await repo.save(makeApt({ id: 'fr2', isRecurring: false }));
    expect((await repo.findWithFilters({ isRecurring: true })).items).toHaveLength(1);
  });
  it('findWithFilters hasMore', async () => {
    for (let i = 0; i < 3; i++) await repo.save(makeApt({ id: 'hm' + i, organizerId: 'all' }));
    const r = await repo.findWithFilters({ organizerId: 'all' }, { limit: 2 });
    expect(r.hasMore).toBe(true);
    expect(r.total).toBe(3);
  });
  it('findWithFilters by attendeeId', async () => {
    await repo.save(makeApt({ id: 'fa3', organizerId: 'att1' }));
    await repo.save(makeApt({ id: 'fa4', organizerId: 'x', attendeeIds: ['att1'] }));
    await repo.save(makeApt({ id: 'fa5', organizerId: 'none' }));
    expect((await repo.findWithFilters({ attendeeId: 'att1' })).items).toHaveLength(2);
  });
  it('findWithFilters by caseId', async () => {
    await repo.save(makeApt({ id: 'fc3', linkedCaseIds: [{ value: 'c1' }] }));
    await repo.save(makeApt({ id: 'fc4', linkedCaseIds: [] }));
    expect((await repo.findWithFilters({ caseId: { value: 'c1' } } as any)).items).toHaveLength(1);
  });
  it('countByStatus all', async () => {
    await repo.save(makeApt({ id: 'cs1', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'cs2', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'cs3', status: 'COMPLETED' }));
    const c2 = await repo.countByStatus();
    expect(c2.SCHEDULED).toBe(2);
    expect(c2.COMPLETED).toBe(1);
    expect(c2.CANCELLED).toBe(0);
  });
  it('countByStatus by organizer', async () => {
    await repo.save(makeApt({ id: 'co1', organizerId: 'A', status: 'SCHEDULED' }));
    await repo.save(makeApt({ id: 'co2', organizerId: 'B', status: 'SCHEDULED' }));
    expect((await repo.countByStatus('A')).SCHEDULED).toBe(1);
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
    const r = await repo.findUpcoming('u1');
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
    expect(await repo.findUpcoming('u2', 2)).toHaveLength(2);
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
    const r = await repo.findPast('u3');
    expect(r).toHaveLength(2);
    expect(r[0].id.value).toBe('pa2');
  });
  it('findByExternalCalendarId finds', async () => {
    await repo.save(makeApt({ id: 'ec1', externalCalendarId: 'gcal-123' }));
    const f = await repo.findByExternalCalendarId('gcal-123');
    expect(f).toBeTruthy();
    expect(f!.id.value).toBe('ec1');
  });
  it('findByExternalCalendarId null', async () => {
    expect(await repo.findByExternalCalendarId('x')).toBeNull();
  });
  it('hasConflicts with organizer', async () => {
    const s = new Date(2025, 2, 1, 10, 0),
      e = new Date(2025, 2, 1, 11, 0);
    await repo.save(
      makeApt({ id: 'hc1', organizerId: 'u4', startTime: s, endTime: e, status: 'SCHEDULED' })
    );
    expect(await repo.hasConflicts({ startTime: s, endTime: e } as any, ['u4'])).toBe(true);
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
    expect(await repo.hasConflicts({ startTime: s, endTime: e } as any, ['u5'])).toBe(true);
  });
  it('hasConflicts false cancelled', async () => {
    const s = new Date(2025, 2, 3, 10, 0),
      e = new Date(2025, 2, 3, 11, 0);
    await repo.save(
      makeApt({ id: 'hc3', organizerId: 'u6', startTime: s, endTime: e, status: 'CANCELLED' })
    );
    expect(await repo.hasConflicts({ startTime: s, endTime: e } as any, ['u6'])).toBe(false);
  });
  it('hasConflicts excludes by id', async () => {
    const s = new Date(2025, 2, 4, 10, 0),
      e = new Date(2025, 2, 4, 11, 0);
    await repo.save(
      makeApt({ id: 'hc4', organizerId: 'u7', startTime: s, endTime: e, status: 'SCHEDULED' })
    );
    expect(
      await repo.hasConflicts({ startTime: s, endTime: e } as any, ['u7'], { value: 'hc4' } as any)
    ).toBe(false);
  });
  it('hasConflicts no conflict non-attendee', async () => {
    const s = new Date(2025, 2, 5, 10, 0),
      e = new Date(2025, 2, 5, 11, 0);
    await repo.save(
      makeApt({ id: 'hc5', organizerId: 'someone', startTime: s, endTime: e, status: 'SCHEDULED' })
    );
    expect(await repo.hasConflicts({ startTime: s, endTime: e } as any, ['other'])).toBe(false);
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
    expect(
      await repo.findForConflictCheck(['u8'], {
        startTime: new Date(2025, 3, 1, 9, 0),
        endTime: new Date(2025, 3, 1, 12, 0),
      })
    ).toHaveLength(1);
  });
  it('findRecurringInstances empty', async () => {
    expect(await repo.findRecurringInstances({ value: 'any' } as any)).toEqual([]);
  });
  it('batchUpdateStatus no error', async () => {
    await repo.save(makeApt({ id: 'bu1' }));
    await expect(
      repo.batchUpdateStatus([{ value: 'bu1' } as any], 'COMPLETED' as any)
    ).resolves.toBeUndefined();
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
    const r = await repo.findNeedingReminder(30);
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
});
