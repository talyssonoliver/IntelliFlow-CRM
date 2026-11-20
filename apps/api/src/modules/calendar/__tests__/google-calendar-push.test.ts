/**
 * MVP-013, Aurora to Google: the user's appointments written to their Google calendar, run through the
 * engine against an in-memory database and a fake Google calendar that numbers its changes: events made,
 * changed and deleted from appointments, a create whose answer was lost, one refused event, conflicts, and
 * a tenant's appointments only ever going to that tenant's calendar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn(),
  forgetAccessToken: vi.fn(),
}));
vi.mock('../../email/mailbox-transport', () => ({
  getOAuthAccess: mocks.getOAuthAccess,
  hasOAuthClient: mocks.hasOAuthClient,
  forgetAccessToken: mocks.forgetAccessToken,
  oauthClientEnvNames: () => ['EMAIL_OAUTH_GOOGLE_CLIENT_ID'],
}));
import { runCalendarSync } from '../google-calendar-sync';
import { eventIdFor, pushChanges } from '../google-calendar-push';
import { CalendarEventNotFoundError, CalendarRateLimitError } from '@intelliflow/application';
import { newReport } from '../google-calendar-links';
import { Result } from '@intelliflow/domain';
import {
  FakeGoogle,
  NOW,
  OTHER_TENANT,
  TENANT,
  appointmentRow,
  createSyncHarness,
  mailboxRow,
  p2002,
  refusal,
} from './google-calendar-harness';

const h = createSyncHarness();

beforeEach(() => {
  mocks.hasOAuthClient.mockReturnValue(true);
  mocks.getOAuthAccess.mockImplementation(
    async (_p: unknown, mailbox: { tokenVersion: number }) => ({
      accessToken: 'access',
      tokenVersion: mailbox.tokenVersion,
    })
  );
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
describe('Aurora to Google: an appointment becomes an event', () => {
  it('creates it once, under an id made from the appointment, and links it', async () => {
    const sync = h.setup({
      appointment: [appointmentRow({ title: 'Site visit', location: 'Yard' })],
    });

    const report = await runCalendarSync(sync);

    const id = eventIdFor('mbx-1', 'appt-1');
    expect(report.pushedCreated).toBe(1);
    expect(h.google.log).toContain(`createEvent:${id}`);
    expect(h.google.events.get(id)).toMatchObject({ title: 'Site visit', location: 'Yard' });
    expect(h.links()[0]).toMatchObject({
      appointmentId: 'appt-1',
      googleEventId: id,
      origin: 'AURORA',
      etag: h.google.events.get(id)?.etag,
    });
  });

  it('uses an id Google accepts: 5 to 1024 characters of 0-9 and a-v', () => {
    const id = eventIdFor('mbx-1', 'appt-1');
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(eventIdFor('mbx-1', 'appt-1')).toBe(id);
    expect(eventIdFor('mbx-2', 'appt-1')).not.toBe(id);
  });

  it('makes no second event on a re-run, and does not take its own event back as a new one', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    await runCalendarSync(sync);

    const report = await h.nextRound(sync);

    expect(report).toMatchObject({ pushedCreated: 0, pushedUpdated: 0, imported: 0, updated: 0 });
    expect(h.google.events.size).toBe(1);
    expect(h.appointments()).toHaveLength(1);
    expect(h.links()).toHaveLength(1);
  });

  it('finds its own event when the answer to an earlier create was lost', async () => {
    const id = eventIdFor('mbx-1', 'appt-1');
    const sync = h.setup({
      appointment: [appointmentRow()],
      // The link was written first, so the lost answer left it pending.
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: id,
          origin: 'AURORA',
          pending: true,
          pushAttempts: 0,
          nextPushAt: null,
          etag: null,
          localSyncedAt: null,
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });
    // Google made the event, the answer never arrived.
    h.google.put(id, { title: 'Site visit' });

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ pushedCreated: 1, imported: 0 });
    expect(h.google.events.size).toBe(1);
    expect(h.appointments()).toHaveLength(1);
    expect(h.links()[0].pending).toBe(false);
  });
  it('leaves an appointment alone when a link for it was made meanwhile', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.db.failures.set('calendarEventLink.create', p2002());
    const read = h.db.calendarEventLink.findFirst.getMockImplementation() as (
      a: unknown
    ) => unknown;
    h.db.calendarEventLink.findFirst.mockImplementation(async (args: any) =>
      args.where.appointmentId ? { id: 'made-meanwhile' } : read(args)
    );

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ pushedCreated: 0, itemFailures: 0 });
    expect(h.google.events.size).toBe(0);
  });
  it('writes the link first, pending, and settles it once the event is made', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    const create = h.google.createEvent.bind(h.google);
    let during: unknown;
    h.google.createEvent = async (...args: Parameters<typeof create>) => {
      during = { ...h.links()[0] };
      return create(...args);
    };

    await runCalendarSync(sync);

    expect(during).toMatchObject({ pending: true, googleEventId: eventIdFor('mbx-1', 'appt-1') });
    expect(h.links()[0]).toMatchObject({ pending: false, pushAttempts: 0 });
  });

  it('makes a refused create wait, then tries it again, and the link keeps the appointment linked', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.google.failNext.set('createEvent', refusal());

    const first = await runCalendarSync(sync);
    expect(first.itemFailures).toBe(1);
    expect(h.links()[0]).toMatchObject({ pending: true, pushAttempts: 1 });
    expect(h.links()[0].nextPushAt.getTime()).toBe(NOW.getTime() + 5 * 60_000);

    await h.nextRound(sync);
    expect(h.links()[0]).toMatchObject({ pending: false, pushAttempts: 0, nextPushAt: null });
    expect(h.google.events.size).toBe(1);
  });

  it('does not let refused items hold up the ones behind them', async () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, n) =>
        appointmentRow({
          id: `bad-${String(n).padStart(2, '0')}`,
          title: 'bad',
          startTime: new Date(NOW.getTime() + 60_000 * (n + 1)),
          endTime: new Date(NOW.getTime() + 60_000 * (n + 61)),
        })
      ),
      ...Array.from({ length: 5 }, (_, n) => appointmentRow({ id: `good-${n}`, title: 'good' })),
    ];
    const sync = h.setup({ appointment: rows });
    const create = h.google.createEvent.bind(h.google);
    h.google.createEvent = async (...args: Parameters<typeof create>) =>
      args[1].title === 'bad' ? (Result.fail(refusal()) as any) : create(...args);

    await runCalendarSync(sync);

    // The 50 refused ones wait; the engine finished the five behind them in the same tick.
    expect(h.links().filter((l) => !l.pending)).toHaveLength(5);
    expect(h.links().filter((l) => l.pending)).toHaveLength(50);
  });

  it('keeps backing off a refused item, never for longer than a day, and never gives up on it', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    let calls = 0;
    h.google.createEvent = async () => {
      calls += 1;
      return Result.fail(refusal()) as any;
    };
    for (let round = 0; round < 14; round++) {
      await (round === 0 ? runCalendarSync(sync) : h.nextRound(sync));
      expect(h.links()[0].nextPushAt.getTime() - NOW.getTime()).toBeLessThanOrEqual(
        24 * 60 * 60_000 + round * 5 * 60_000
      );
      // Each failure moves its next attempt on: now make it due again.
      h.links()[0].nextPushAt = null;
      h.mailbox().calendarNextSyncAt = null;
    }

    expect(calls).toBe(14);
    expect(h.links()[0].pushAttempts).toBe(14);
  });

  it('does not let refused deletions hold up the creates behind them', async () => {
    const cancelled = Array.from({ length: 50 }, (_, n) =>
      appointmentRow({ id: `gone-${String(n).padStart(2, '0')}`, status: 'CANCELLED' })
    );
    const links = cancelled.map((a, n) => ({
      id: `link-${String(n).padStart(2, '0')}`,
      tenantId: TENANT,
      mailboxId: 'mbx-1',
      appointmentId: a.id,
      googleEventId: `ev-${n}`,
      origin: 'AURORA',
      pending: false,
      pushAttempts: 0,
      nextPushAt: null,
      etag: '"e"',
      localSyncedAt: a.updatedAt,
      remoteUpdatedAt: null,
      remoteCancelledAt: null,
    }));
    const sync = h.setup({
      appointment: [...cancelled, appointmentRow({ id: 'fresh', title: 'fresh' })],
      calendarEventLink: links,
    });
    h.google.deleteEvent = async () => Result.fail(refusal()) as any;

    await runCalendarSync(sync);

    expect(h.links().find((l) => l.appointmentId === 'fresh')).toMatchObject({ pending: false });
    expect(h.links().filter((l) => l.pushAttempts === 1)).toHaveLength(50);
  });

  it('cancels the appointment when the create finds its event already deleted in Google', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    const id = eventIdFor('mbx-1', 'appt-1');
    h.google.put(id);
    h.google.remove(id);

    await runCalendarSync(sync);

    expect(h.appointments()[0]).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Cancelled in Google Calendar',
    });
    expect(h.links()[0]).toMatchObject({ pending: false });
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
  });
  it('writes no guests and sends no invitation', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    const seen: unknown[] = [];
    const create = h.google.createEvent.bind(h.google);
    h.google.createEvent = vi.fn(async (...args: Parameters<FakeGoogle['createEvent']>) => {
      seen.push(args[1].attendeeIds);
      return create(...args);
    });

    await runCalendarSync(sync);

    expect(seen).toEqual([[]]);
    expect(h.links()).toHaveLength(1);
  });

  it('does not bring back an event the user deleted in Google after a create whose answer was lost', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    const id = eventIdFor('mbx-1', 'appt-1');
    h.google.put(id);
    h.google.remove(id);

    await runCalendarSync(sync);
    await h.nextRound(sync);

    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
    expect(h.google.log.some((l) => l.startsWith('patchEvent'))).toBe(false);
  });

  it('leaves an event whose link is still pending to the push, not the pull', async () => {
    const sync = h.setup({
      appointment: [appointmentRow()],
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: 'ev-pending',
          origin: 'AURORA',
          pending: true,
          pushAttempts: 0,
          nextPushAt: null,
          etag: null,
          localSyncedAt: null,
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });
    h.google.put('ev-pending', { title: 'Site visit' });

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ imported: 0, updated: 0 });
    expect(h.appointments()).toHaveLength(1);
    expect(h.links()[0].pending).toBe(false);
  });
  it('only sends the user’s own live, upcoming appointments of the mailbox tenant', async () => {
    const sync = h.setup({
      appointment: [
        appointmentRow({ id: 'mine' }),
        appointmentRow({ id: 'someone-else', organizerId: 'user-2' }),
        appointmentRow({ id: 'other-tenant', tenantId: OTHER_TENANT }),
        appointmentRow({ id: 'cancelled', status: 'CANCELLED' }),
        appointmentRow({ id: 'completed', status: 'COMPLETED' }),
        appointmentRow({
          id: 'long-ago',
          startTime: new Date('2026-10-01T09:00:00.000Z'),
          endTime: new Date('2026-10-01T10:00:00.000Z'),
        }),
      ],
    });

    await runCalendarSync(sync);

    expect(h.links().map((l) => l.appointmentId)).toEqual(['mine']);
  });

  it('leaves an event that came from Google alone when its appointment is cancelled here', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    await runCalendarSync(sync);
    h.appointments()[0].status = 'CANCELLED';

    const report = await h.nextRound(sync);

    expect(report.pushedDeleted).toBe(0);
    expect(h.google.events.get('ev-1')?.status).toBe('confirmed');
  });
});

describe('Aurora to Google: an appointment changes or goes', () => {
  async function pushed() {
    const sync = h.setup({ appointment: [appointmentRow()] });
    await runCalendarSync(sync);
    return sync;
  }

  it('patches the event when the appointment is edited, once', async () => {
    const sync = await pushed();
    h.appointments()[0].title = 'Site visit (moved)';
    h.appointments()[0].updatedAt = new Date('2026-11-20T10:02:00.000Z');

    const report = await h.nextRound(sync);
    const again = await h.nextRound(sync);

    const id = eventIdFor('mbx-1', 'appt-1');
    expect(report.pushedUpdated).toBe(1);
    expect(h.google.events.get(id)?.title).toBe('Site visit (moved)');
    expect(again.pushedUpdated).toBe(0);
    expect(h.google.log.filter((l) => l.startsWith('patchEvent'))).toHaveLength(1);
  });

  it('deletes the event once when the appointment is cancelled, and never makes it again', async () => {
    const sync = await pushed();
    h.appointments()[0].status = 'CANCELLED';

    const report = await h.nextRound(sync);
    h.appointments()[0].status = 'SCHEDULED';
    const again = await h.nextRound(sync);

    const id = eventIdFor('mbx-1', 'appt-1');
    expect(report.pushedDeleted).toBe(1);
    expect(h.google.events.get(id)?.status).toBe('cancelled');
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
    expect(again).toMatchObject({ pushedCreated: 0, pushedDeleted: 0 });
  });

  it('deletes the event and drops the link when the appointment is deleted', async () => {
    const sync = await pushed();
    h.links()[0].appointmentId = null;
    h.appointments().splice(0, 1);

    const report = await h.nextRound(sync);

    expect(report.pushedDeleted).toBe(1);
    expect(h.links()).toHaveLength(0);
    expect(h.google.events.get(eventIdFor('mbx-1', 'appt-1'))?.status).toBe('cancelled');
  });

  it('leaves the appointment alone when Google no longer has the event, and tries again only after a change', async () => {
    const sync = await pushed();
    h.appointments()[0].title = 'Edited';
    h.appointments()[0].updatedAt = new Date('2026-11-20T10:02:00.000Z');
    h.google.failNext.set('patchEvent', new CalendarEventNotFoundError('google', 'gone'));

    const report = await h.nextRound(sync);
    await h.nextRound(sync);

    expect(h.appointments()[0].status).toBe('SCHEDULED');
    expect(report).toMatchObject({ pushedUpdated: 0, itemFailures: 0, skipped: 1 });
    expect(h.google.log.filter((l) => l.startsWith('patchEvent'))).toHaveLength(1);
  });

  it('carries on past one event Google refuses, and counts it', async () => {
    const sync = h.setup({
      appointment: [
        appointmentRow({ id: 'a' }),
        appointmentRow({
          id: 'b',
          startTime: new Date('2026-11-21T11:00:00.000Z'),
          endTime: new Date('2026-11-21T12:00:00.000Z'),
        }),
      ],
    });
    h.google.failNext.set('createEvent', refusal());

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ pushedCreated: 1, itemFailures: 1, failures: 0 });
    expect(h.links().map((l) => [l.appointmentId, l.pending])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });
});

describe('Aurora and Google both changed', () => {
  async function imported() {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Lunch' });
    await runCalendarSync(sync);
    return sync;
  }

  it('sends Aurora’s version on when it was changed here later than Google’s', async () => {
    const sync = await imported();
    // Google edits at 10:03; the user edits the appointment in Aurora at 10:04.
    h.google.now = new Date('2026-11-20T10:03:00.000Z');
    h.google.put('ev-1', { title: 'Google title' });
    h.appointments()[0].title = 'Aurora title';
    h.appointments()[0].updatedAt = new Date('2026-11-20T10:04:00.000Z');

    const report = await h.nextRound(sync);

    expect(h.appointments()[0].title).toBe('Aurora title');
    expect(report.pushedUpdated).toBe(1);
    expect(h.google.events.get('ev-1')?.title).toBe('Aurora title');
  });

  it('does not send a change made in Google back to it', async () => {
    const sync = await imported();
    h.google.now = new Date('2026-11-20T10:03:00.000Z');
    h.db.clock.now = h.google.now;
    h.google.put('ev-1', { title: 'Lunch moved' });

    const report = await h.nextRound(sync);

    expect(report).toMatchObject({ updated: 1, pushedUpdated: 0 });
    expect(h.google.log.some((l) => l.startsWith('patchEvent'))).toBe(false);
  });
});
describe('Aurora to Google: what is never written, and a backlog', () => {
  it('never writes to the event of a link marked gone from Google', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    await runCalendarSync(sync);
    Object.assign(h.links()[0], { remoteCancelledAt: NOW });
    Object.assign(h.appointments()[0], {
      title: 'Edited',
      updatedAt: new Date(NOW.getTime() + 60_000),
    });
    h.google.log.length = 0;

    await h.nextRound(sync);

    expect(h.google.log).toEqual([expect.stringMatching(/^fetchChanges/)]);
  });

  it('does not patch the event of an appointment that is no longer the user’s own', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    await runCalendarSync(sync);
    Object.assign(h.appointments()[0], {
      organizerId: 'user-2',
      updatedAt: new Date(NOW.getTime() + 60_000),
    });

    const report = await h.nextRound(sync);

    expect(report.pushedUpdated).toBe(0);
  });

  it('patches every edited appointment of a backlog bigger than a round writes, over several rounds', async () => {
    const rows = Array.from({ length: 130 }, (_, n) =>
      appointmentRow({ id: `a-${String(n).padStart(3, '0')}`, title: `Visit ${n}` })
    );
    const sync = h.setup({ appointment: rows });
    await runCalendarSync(sync);
    await h.nextRound(sync);
    await h.nextRound(sync);
    expect(h.links()).toHaveLength(130);
    for (const [n, a] of h.appointments().entries()) {
      Object.assign(a, {
        title: `Edited ${n}`,
        updatedAt: new Date(NOW.getTime() + 3_600_000 + n),
      });
    }

    let patched = 0;
    for (let round = 0; round < 5; round++) patched += (await h.nextRound(sync)).pushedUpdated;

    expect(patched).toBe(130);
  });
});
describe('Aurora to Google: the scan of edited appointments', () => {
  it('writes the edits it has found even when the round’s time runs out while it scans on', async () => {
    let t = NOW;
    const rows = Array.from({ length: 150 }, (_, n) =>
      appointmentRow({ id: `a-${String(n).padStart(3, '0')}`, title: `Visit ${n}` })
    );
    const sync = h.setup({ appointment: rows }, () => t);
    await runCalendarSync(sync);
    await (async () => {
      t = new Date(NOW.getTime() + 10 * 60_000);
      await runCalendarSync(sync);
      t = new Date(NOW.getTime() + 20 * 60_000);
      await runCalendarSync(sync);
    })();
    // The first of 150 links is edited; the time runs out when the next page of links is read.
    Object.assign(h.appointments()[0], {
      title: 'Edited',
      updatedAt: new Date(NOW.getTime() + 3_600_000),
    });
    const find = h.db.calendarEventLink.findMany.getMockImplementation() as (
      a: unknown
    ) => Promise<unknown>;
    let pages = 0;
    h.db.calendarEventLink.findMany.mockImplementation(async (args: any) => {
      if (args.where?.pending === false && ++pages === 2)
        t = new Date(NOW.getTime() + 6 * 3_600_000);
      return find(args);
    });
    t = new Date(NOW.getTime() + 2 * 3_600_000);

    const report = await runCalendarSync(sync);

    expect(report.pushedUpdated).toBe(1);
  });
});
describe('Aurora to Google: review cases', () => {
  const settled = async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    await runCalendarSync(sync);
    return sync;
  };

  it('never creates the event of a pending link whose appointment was cancelled and then restored', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.google.failNext.set('createEvent', refusal());
    await runCalendarSync(sync);
    h.appointments()[0].status = 'CANCELLED';
    h.links()[0].nextPushAt = null;
    await h.nextRound(sync);
    expect(h.links()[0]).toMatchObject({ pending: false });
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
    h.appointments()[0].status = 'SCHEDULED';
    h.google.log.length = 0;

    await h.nextRound(sync);

    expect(h.google.log.some((l) => l.startsWith('createEvent'))).toBe(false);
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
  });

  it('takes the event down when its appointment is reassigned to someone else', async () => {
    const sync = await settled();
    Object.assign(h.appointments()[0], {
      organizerId: 'user-2',
      updatedAt: new Date(NOW.getTime() + 60_000),
    });

    const report = await h.nextRound(sync);

    expect(report.pushedDeleted).toBe(1);
    expect(h.google.events.get(eventIdFor('mbx-1', 'appt-1'))?.status).toBe('cancelled');
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
  });

  it('writes an edit made while its item waits after a failure, without waiting out the backoff', async () => {
    const sync = await settled();
    Object.assign(h.appointments()[0], {
      title: 'First edit',
      updatedAt: new Date(NOW.getTime() + 60_000),
    });
    h.google.failNext.set('patchEvent', refusal());
    await h.nextRound(sync);
    expect(h.links()[0].nextPushAt).not.toBeNull();
    // Edited again after the failure: not held back by the wait.
    Object.assign(h.appointments()[0], {
      title: 'Second edit',
      updatedAt: new Date(NOW.getTime() + 3_600_000),
    });

    const report = await h.nextRound(sync);

    expect(report.pushedUpdated).toBe(1);
    expect(h.google.events.get(eventIdFor('mbx-1', 'appt-1'))?.title).toBe('Second edit');
  });

  it('does not patch while the pull has not finished, and does once it has', async () => {
    const sync = await settled();
    Object.assign(h.appointments()[0], {
      title: 'Edited',
      updatedAt: new Date(NOW.getTime() + 60_000),
    });
    const ctx: any = {
      prisma: sync.prisma,
      gateway: h.google,
      tokens: {},
      mailbox: { id: 'mbx-1', tenantId: TENANT, userId: 'user-1' },
      now: new Date(NOW.getTime() + 10 * 60_000),
      hasTime: () => true,
      report: newReport(),
      failed: new Map(),
    };

    const held = await pushChanges(ctx, { patch: false });
    expect(held.complete).toBe(false);
    expect(ctx.report.pushedUpdated).toBe(0);

    await pushChanges(ctx, { patch: true });
    expect(ctx.report.pushedUpdated).toBe(1);
  });

  describe('a create whose answer was lost, found again with other content', () => {
    const pendingLink = (localSyncedAt: Date | null) => ({
      id: 'link-1',
      tenantId: TENANT,
      mailboxId: 'mbx-1',
      appointmentId: 'appt-1',
      googleEventId: eventIdFor('mbx-1', 'appt-1'),
      origin: 'AURORA',
      pending: true,
      pushAttempts: 0,
      nextPushAt: null,
      etag: null,
      localSyncedAt,
      remoteUpdatedAt: null,
      remoteCancelledAt: null,
    });

    it('adopts the edit made in Google when Aurora has not changed since the revision sent', async () => {
      const sent = new Date('2026-11-19T08:00:00.000Z');
      const sync = h.setup({
        appointment: [appointmentRow({ title: 'Aurora title', updatedAt: sent })],
        calendarEventLink: [pendingLink(sent)],
      });
      h.google.put(eventIdFor('mbx-1', 'appt-1'), { title: 'Edited in Google' });

      await runCalendarSync(sync);

      expect(h.appointments()[0].title).toBe('Edited in Google');
      expect(h.google.log.some((l) => l.startsWith('patchEvent'))).toBe(false);
    });

    it('sends Aurora’s content over it when the appointment was edited here since the revision sent', async () => {
      const sync = h.setup({
        appointment: [appointmentRow({ title: 'Edited here meanwhile' })],
        calendarEventLink: [pendingLink(new Date('2026-11-18T08:00:00.000Z'))],
      });
      const id = eventIdFor('mbx-1', 'appt-1');
      // Google's copy is older than the edit made here: Aurora's is the newer.
      h.google.now = new Date('2026-11-19T07:00:00.000Z');
      h.google.put(id, { title: 'What the first create sent' });

      await runCalendarSync(sync);

      expect(h.appointments()[0].title).toBe('Edited here meanwhile');
      expect(h.google.events.get(id)?.title).toBe('Edited here meanwhile');
    });
  });

  it.each([
    [
      'ended long ago',
      {
        endTime: new Date('2026-10-01T10:00:00.000Z'),
        startTime: new Date('2026-10-01T09:00:00.000Z'),
      },
    ],
    ['became recurring', { recurrence: { frequency: 'WEEKLY', interval: 1 } }],
  ])('retires a pending link whose appointment %s, taking its event down', async (_name, over) => {
    const id = eventIdFor('mbx-1', 'appt-1');
    const sync = h.setup({
      appointment: [appointmentRow(over)],
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: id,
          origin: 'AURORA',
          pending: true,
          pushAttempts: 0,
          nextPushAt: null,
          etag: null,
          localSyncedAt: null,
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });
    h.google.put(id);

    await runCalendarSync(sync);

    expect(h.links()[0]).toMatchObject({ pending: false });
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
    expect(h.google.events.get(id)?.status).toBe('cancelled');
  });
  it('marks a recovered event that was made private in Google, and never writes to it again', async () => {
    const id = eventIdFor('mbx-1', 'appt-1');
    const sync = h.setup({
      appointment: [appointmentRow({ title: 'Aurora title' })],
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: id,
          origin: 'AURORA',
          pending: true,
          pushAttempts: 0,
          nextPushAt: null,
          etag: null,
          localSyncedAt: null,
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });
    h.google.put(id, { title: 'Now private', visibility: 'private' });

    await runCalendarSync(sync);
    await h.nextRound(sync);

    expect(h.links()[0]).toMatchObject({ pending: false });
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
    expect(h.google.log.some((l) => l.startsWith('patchEvent'))).toBe(false);
    expect(h.google.events.get(id)?.title).toBe('Now private');
    expect(h.appointments()[0].title).toBe('Aurora title');
  });
  describe('a lost create found again after both sides changed', () => {
    const seed = (appointmentUpdatedAt: Date) => ({
      appointment: [appointmentRow({ title: 'Edited here', updatedAt: appointmentUpdatedAt })],
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: eventIdFor('mbx-1', 'appt-1'),
          origin: 'AURORA',
          pending: true,
          pushAttempts: 0,
          nextPushAt: null,
          etag: null,
          localSyncedAt: new Date('2026-11-18T08:00:00.000Z'),
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });

    it('adopts Google’s edit when it was made well after the one here', async () => {
      const sync = h.setup(seed(new Date('2026-11-19T08:00:00.000Z')));
      h.google.now = new Date('2026-11-19T10:00:00.000Z');
      h.google.put(eventIdFor('mbx-1', 'appt-1'), { title: 'Edited in Google later' });

      await runCalendarSync(sync);

      expect(h.appointments()[0].title).toBe('Edited in Google later');
    });

    it('keeps Aurora’s edit when Google’s change is within a minute of it (a commit still in flight)', async () => {
      const sync = h.setup(seed(new Date('2026-11-19T08:00:00.000Z')));
      h.google.now = new Date('2026-11-19T08:00:20.000Z');
      h.google.put(eventIdFor('mbx-1', 'appt-1'), { title: 'What the create committed' });

      await runCalendarSync(sync);

      expect(h.appointments()[0].title).toBe('Edited here');
      expect(h.google.events.get(eventIdFor('mbx-1', 'appt-1'))?.title).toBe('Edited here');
    });
  });

  it('creates a pending event as soon as its appointment is edited, without waiting out the backoff', async () => {
    const id = eventIdFor('mbx-1', 'appt-1');
    const sync = h.setup({
      appointment: [
        appointmentRow({ title: 'Fixed', updatedAt: new Date('2026-11-19T12:00:00.000Z') }),
      ],
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: id,
          origin: 'AURORA',
          pending: true,
          pushAttempts: 6,
          nextPushAt: new Date(NOW.getTime() + 20 * 3_600_000),
          updatedAt: new Date('2026-11-19T09:00:00.000Z'),
          etag: null,
          localSyncedAt: null,
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });

    await runCalendarSync(sync);

    expect(h.links()[0]).toMatchObject({ pending: false, pushAttempts: 0 });
    expect(h.google.events.get(id)?.title).toBe('Fixed');
  });
  it('does not push a recurring appointment, which would be one wrong event', async () => {
    const sync = h.setup({
      appointment: [appointmentRow({ recurrence: { frequency: 'WEEKLY', interval: 1 } })],
    });

    await runCalendarSync(sync);

    expect(h.links()).toHaveLength(0);
    expect(h.google.events.size).toBe(0);
  });
  it('does not copy a private event’s content into the appointment when a create finds it changed', async () => {
    const id = eventIdFor('mbx-1', 'appt-1');
    const sync = h.setup({
      appointment: [appointmentRow({ title: 'Aurora title' })],
      calendarEventLink: [
        {
          id: 'link-1',
          tenantId: TENANT,
          mailboxId: 'mbx-1',
          appointmentId: 'appt-1',
          googleEventId: id,
          origin: 'AURORA',
          pending: true,
          pushAttempts: 0,
          nextPushAt: null,
          etag: null,
          localSyncedAt: null,
          remoteUpdatedAt: null,
          remoteCancelledAt: null,
        },
      ],
    });
    h.google.now = new Date(NOW.getTime() + 3_600_000);
    h.google.put(id, {
      title: 'Secret meeting',
      description: 'Private notes',
      visibility: 'private',
    });

    await runCalendarSync(sync);

    expect(JSON.stringify(h.appointments())).not.toContain('Secret meeting');
    expect(JSON.stringify(h.appointments())).not.toContain('Private notes');
  });

  describe('a change made in Google between the pull and the push', () => {
    const pushNow = (sync: any) => {
      const ctx: any = {
        prisma: sync.prisma,
        gateway: h.google,
        tokens: {},
        mailbox: { id: 'mbx-1', tenantId: TENANT, userId: 'user-1' },
        now: new Date(NOW.getTime() + 10 * 60_000),
        hasTime: () => true,
        report: newReport(),
        failed: new Map(),
      };
      return pushChanges(ctx).then(() => ctx.report);
    };

    it('is not overwritten: Google’s newer edit is adopted into the appointment', async () => {
      const sync = await settled();
      const id = eventIdFor('mbx-1', 'appt-1');
      Object.assign(h.appointments()[0], {
        title: 'Aurora edit',
        updatedAt: new Date(NOW.getTime() + 60_000),
      });
      h.google.now = new Date(NOW.getTime() + 3_600_000);
      h.google.put(id, { title: 'Google edit' });

      const report = await pushNow(sync);

      expect(report.pushedUpdated).toBe(0);
      expect(h.appointments()[0].title).toBe('Google edit');
      expect(h.google.events.get(id)?.title).toBe('Google edit');
    });

    it('is sent over again with the fresh etag when Aurora’s edit is the newer', async () => {
      const sync = await settled();
      const id = eventIdFor('mbx-1', 'appt-1');
      Object.assign(h.appointments()[0], {
        title: 'Aurora edit',
        updatedAt: new Date(NOW.getTime() + 3_600_000),
      });
      h.google.now = new Date(NOW.getTime() + 60_000);
      h.google.put(id, { title: 'Google edit' });

      const report = await pushNow(sync);

      expect(report.pushedUpdated).toBe(1);
      expect(h.google.events.get(id)?.title).toBe('Aurora edit');
    });
  });
  it('ends the round on Google’s rate limit, keeping the pull’s token and waiting as long as asked', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.google.failNext.set('createEvent', new CalendarRateLimitError('google', 3600));

    const report = await runCalendarSync(sync);

    expect(report.failures).toBe(1);
    expect(h.mailbox().calendarSyncToken).not.toBeNull();
    expect(h.mailbox().calendarNextSyncAt.getTime()).toBeGreaterThanOrEqual(
      NOW.getTime() + 3600_000
    );
    // A rate limit is not the item's failure.
    expect(h.links()[0].pushAttempts).toBe(0);
  });
});
describe('two tenants', () => {
  it('keeps each tenant’s events and appointments to itself, even with the same event id', async () => {
    const sync = h.setup({
      emailMailbox: [
        mailboxRow(),
        mailboxRow({ id: 'mbx-2', tenantId: OTHER_TENANT, userId: 'user-9' }),
      ],
      appointment: [
        appointmentRow({ id: 'a-1' }),
        appointmentRow({ id: 'b-1', tenantId: OTHER_TENANT, organizerId: 'user-9' }),
      ],
    });
    // Each user has their own Google calendar; both hold an event with the same id.
    const calendars: Record<string, FakeGoogle> = { 'mbx-1': h.google, 'mbx-2': new FakeGoogle() };
    h.google.put('shared-event', { title: 'Shared' });
    calendars['mbx-2'].put('shared-event', { title: 'Shared' });
    sync.gatewayFor = (mailbox) => calendars[mailbox.id];

    await runCalendarSync(sync);

    const byTenant = (tenantId: string) => h.appointments().filter((a) => a.tenantId === tenantId);
    expect(
      byTenant(TENANT)
        .map((a) => a.title)
        .sort()
    ).toEqual(['Shared', 'Site visit']);
    expect(
      byTenant(OTHER_TENANT)
        .map((a) => a.title)
        .sort()
    ).toEqual(['Shared', 'Site visit']);
    for (const link of h.links()) {
      const appointment = h.appointments().find((a) => a.id === link.appointmentId);
      expect(appointment?.tenantId).toBe(link.tenantId);
    }
    expect(h.links().filter((l) => l.googleEventId === 'shared-event')).toHaveLength(2);
  });
});
