/**
 * MVP-013, Google to Aurora: the events of the user's Google calendar becoming, changing and cancelling
 * appointments, run through the engine against an in-memory database and a fake Google calendar that
 * numbers its changes. A re-run must not make anything twice, an echo of our own write is skipped, a private
 * event stays in Google, and a tenant's events only ever reach that tenant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarAuthenticationError, CalendarRateLimitError } from '@intelliflow/application';
import { Result } from '@intelliflow/domain';

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
import {
  FakeGoogle,
  NOW,
  OTHER_TENANT,
  TENANT,
  createSyncHarness,
  mailboxRow,
  p2002,
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
describe('Google to Aurora: an event becomes an appointment', () => {
  it('makes the appointment for the mailbox user in the mailbox tenant, and links it', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Lunch with Ada', location: 'Cafe', description: 'Menu' });

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ mailboxesSynced: 1, imported: 1, failures: 0 });
    expect(h.appointments()).toHaveLength(1);
    expect(h.appointments()[0]).toMatchObject({
      tenantId: TENANT,
      organizerId: 'user-1',
      title: 'Lunch with Ada',
      location: 'Cafe',
      description: 'Menu',
      status: 'SCHEDULED',
      appointmentType: 'MEETING',
      externalCalendarId: 'ev-1',
    });
    expect(h.links()[0]).toMatchObject({
      tenantId: TENANT,
      mailboxId: 'mbx-1',
      appointmentId: h.appointments()[0].id,
      googleEventId: 'ev-1',
      origin: 'GOOGLE',
    });
  });

  it('stores the sync token and is due again in five minutes', async () => {
    const sync = h.setup();
    h.google.put('ev-1');

    await runCalendarSync(sync);

    const mailbox = h.db.tables.emailMailbox[0];
    expect(mailbox.calendarSyncToken).toContain('"t":"tok-1"');
    expect(mailbox.calendarSyncedAt).toEqual(NOW);
    expect(mailbox.calendarNextSyncAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
  });

  it('makes nothing twice: a second round, and a restart after the token expired, add no copy', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    await runCalendarSync(sync);

    await h.nextRound(sync);
    expect(h.appointments()).toHaveLength(1);

    h.google.expiredToken = h.token();
    const report = await h.nextRound(sync);

    expect(report.restarts).toBe(1);
    expect(h.appointments()).toHaveLength(1);
    expect(h.links()).toHaveLength(1);
  });

  it('reads every page of a long calendar before it keeps the token', async () => {
    const sync = h.setup();
    h.google.pageSize = 2;
    for (const n of [1, 2, 3, 4, 5]) h.google.put(`ev-${n}`, { title: `Event ${n}` });

    const report = await runCalendarSync(sync);

    expect(report.imported).toBe(5);
    expect(h.google.log.filter((l) => l.startsWith('fetchChanges'))).toHaveLength(3);
    expect(h.db.tables.emailMailbox[0].calendarSyncToken).toContain('"t":"tok-5"');
  });

  it('does not copy a private or confidential event', async () => {
    const sync = h.setup();
    h.google.put('ev-private', { visibility: 'private' });
    h.google.put('ev-conf', { visibility: 'confidential' });
    h.google.put('ev-open', { title: 'Open' });

    const report = await runCalendarSync(sync);

    expect(h.appointments().map((a) => a.title)).toEqual(['Open']);
    expect(report.skipped).toBe(2);
  });

  it('survives losing the race to make the same event: nothing is left half done', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    h.db.failures.set('calendarEventLink.create', p2002());
    // The other replica's link is there when we look again after the clash.
    const read = h.db.calendarEventLink.findFirst.getMockImplementation() as (
      a: unknown
    ) => unknown;
    h.db.calendarEventLink.findFirst
      .mockImplementationOnce(async (args: unknown) => read(args))
      .mockImplementationOnce(async () => ({ id: 'link-made-by-the-other-replica' }));

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ imported: 0, skipped: 1, failures: 0 });
    expect(h.appointments()).toHaveLength(0);
  });
});

describe('Google to Aurora: an event changes or goes', () => {
  async function imported() {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Lunch' });
    await runCalendarSync(sync);
    return sync;
  }

  it('brings a change made in Google into the appointment', async () => {
    const sync = await imported();
    h.google.now = new Date('2026-11-20T10:03:00.000Z');
    h.db.clock.now = h.google.now;
    h.google.put('ev-1', { title: 'Lunch moved', location: 'Pub' });

    const report = await h.nextRound(sync);

    expect(report).toMatchObject({ updated: 1 });
    expect(h.appointments()[0]).toMatchObject({ title: 'Lunch moved', location: 'Pub' });
  });

  it('cancels the appointment, with the reason, when the event is deleted in Google', async () => {
    const sync = await imported();
    h.google.remove('ev-1');

    const report = await h.nextRound(sync);

    expect(report.cancelled).toBe(1);
    expect(h.appointments()[0]).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Cancelled in Google Calendar',
    });
    expect(h.links()[0]).toMatchObject({ etag: null });
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
    // Kept, not deleted, and Aurora does not delete the event again.
    expect(h.google.log.some((l) => l.startsWith('deleteEvent'))).toBe(false);
  });

  it('does not bring back an appointment cancelled in Aurora, nor touch one that is gone', async () => {
    const sync = await imported();
    h.appointments()[0].status = 'CANCELLED';
    h.google.put('ev-1', { title: 'Edited in Google' });

    const report = await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ status: 'CANCELLED', title: 'Lunch' });
    expect(report.skipped).toBe(1);

    h.links()[0].appointmentId = null;
    h.google.put('ev-1', { title: 'Edited again' });
    const gone = await h.nextRound(sync);
    expect(gone.skipped).toBe(1);
  });

  it('keeps Aurora’s version when it was changed here later than Google’s', async () => {
    const sync = await imported();
    // Google edits at 10:03; the user edits the appointment in Aurora at 10:04.
    h.google.now = new Date('2026-11-20T10:03:00.000Z');
    h.google.put('ev-1', { title: 'Google title' });
    h.appointments()[0].title = 'Aurora title';
    h.appointments()[0].updatedAt = new Date('2026-11-20T10:04:00.000Z');

    await h.nextRound(sync);

    expect(h.appointments()[0].title).toBe('Aurora title');
  });

  it('takes Google’s version when it is the later change', async () => {
    const sync = await imported();
    h.appointments()[0].title = 'Aurora title';
    h.appointments()[0].updatedAt = new Date('2026-11-20T10:01:00.000Z');
    h.google.now = new Date('2026-11-20T10:03:00.000Z');
    h.google.put('ev-1', { title: 'Google title' });

    await h.nextRound(sync);

    expect(h.appointments()[0].title).toBe('Google title');
  });
});

describe('Google to Aurora: privacy, a cut-short round and a restart', () => {
  it('removes the details of an event that was copied and then made private in Google', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Dentist', location: 'Clinic', description: 'Notes' });
    await runCalendarSync(sync);

    h.google.put('ev-1', { visibility: 'private' });
    await h.nextRound(sync);

    expect(h.appointments()).toHaveLength(1);
    expect(h.appointments()[0]).toMatchObject({
      title: 'Private event',
      description: null,
      location: null,
      status: 'CANCELLED',
      cancellationReason: 'Made private in Google Calendar',
    });
    // The link stays, marked gone from Google, so it is not copied again nor written to.
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
  });

  it('brings an appointment back when the event it was cancelled for is restored in Google', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    await runCalendarSync(sync);
    h.google.remove('ev-1');
    await h.nextRound(sync);
    h.google.put('ev-1', { status: 'confirmed' });

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ status: 'SCHEDULED', cancellationReason: null });
    expect(h.links()[0].remoteCancelledAt).toBeNull();
  });

  it('leaves the appointment as it was when its link cannot be updated with it', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Lunch' });
    await runCalendarSync(sync);
    h.google.put('ev-1', { title: 'Changed in Google' });
    h.db.failures.set('calendarEventLink.update', new Error('down'));

    const report = await h.nextRound(sync);

    expect(report.itemFailures).toBe(1);
    expect(h.appointments()[0].title).toBe('Lunch');
  });

  it('also checks an appointment already in the past after the token expired', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Dentist' });
    await runCalendarSync(sync);
    const past = new Date('2026-11-10T09:00:00.000Z');
    Object.assign(h.appointments()[0], { startTime: past, endTime: past });
    // Out of the replacement sync's window, and made private while the token was lost.
    h.google.put('ev-1', { start: past, end: past, visibility: 'private' });
    h.google.expiredToken = h.token();

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ title: 'Private event', status: 'CANCELLED' });
  });

  it('does not cancel an event that was only moved out of the full sync’s window', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Moved later' });
    await runCalendarSync(sync);
    const later = new Date('2028-11-22T12:00:00.000Z');
    h.google.put('ev-1', { start: later, end: new Date(later.getTime() + 60 * 60_000) });
    h.google.expiredToken = h.token();

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ status: 'SCHEDULED', startTime: later });
  });

  it('after a replacement full sync over several rounds, asks for each linked appointment and carries on where the time ran out', async () => {
    let t = NOW;
    const at = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60_000);
    const sync = h.setup({}, () => t);
    for (const n of [1, 2, 3]) h.google.put(`ev-${n}`);
    await runCalendarSync(sync);
    h.google.remove('ev-2');
    h.google.expiredToken = h.token();
    h.google.pageSize = 1;
    const read = h.google.fetchChanges.bind(h.google);
    h.google.fetchChanges = async (...args: Parameters<typeof read>) => {
      if (args[2] === 'page-1') t = at(1);
      return read(...args);
    };
    const get = h.google.getEvent.bind(h.google);
    let answered = 0;
    h.google.getEvent = async (...args: Parameters<typeof get>) => {
      if (++answered === 1) t = at(6);
      return get(...args);
    };

    t = at(0.2);
    await runCalendarSync(sync);
    expect(h.mailbox().calendarSyncToken).toMatch(/^resume:/);
    t = at(3);
    await runCalendarSync(sync);
    expect(h.mailbox().calendarSyncToken).toMatch(/^resume:.*"v":/);
    t = at(9);
    await runCalendarSync(sync);

    expect(h.appointments().find((a) => a.externalCalendarId === 'ev-2')?.status).toBe('CANCELLED');
    expect(new Set(h.google.log.filter((l) => l.startsWith('getEvent:'))).size).toBe(3);
    expect(h.mailbox().calendarSyncToken).toMatch(/^resume:\{"t":"tok-/);
  });

  it('finds a change made just before the monthly re-read that the new window leaves out', async () => {
    let t = NOW;
    const sync = h.setup({}, () => t);
    h.google.put('ev-1', { title: 'Dentist' });
    await runCalendarSync(sync);
    // Moved into the past and made private; the re-read's window no longer lists it.
    const past = new Date('2026-11-10T09:00:00.000Z');
    h.google.put('ev-1', { start: past, end: past, visibility: 'private' });

    t = new Date(NOW.getTime() + 31 * 24 * 60 * 60_000);
    await runCalendarSync(sync);

    expect(h.appointments()[0]).toMatchObject({ title: 'Private event', status: 'CANCELLED' });
  });
  it('does not start an event once the round’s time is spent, and reads it again next round', async () => {
    let t = NOW;
    const sync = h.setup({}, () => t);
    for (const n of [1, 2, 3]) h.google.put(`ev-${n}`);
    const create = h.db.appointment.create;
    const original = create.getMockImplementation() as (args: unknown) => Promise<unknown>;
    create.mockImplementationOnce(async (args: unknown) => {
      t = new Date(NOW.getTime() + 60 * 60_000);
      return original(args);
    });

    await runCalendarSync(sync);

    expect(h.appointments()).toHaveLength(1);
    // What there was no time for waits in the saved state, by id.
    expect(h.mailbox().calendarSyncToken).toContain('"f":{"ev-2":0,"ev-3":0}');

    t = new Date(NOW.getTime() + 2 * 60 * 60_000);
    await runCalendarSync(sync);
    expect(h.appointments()).toHaveLength(3);
    expect(h.mailbox().calendarSyncToken).toContain('"t":"tok-3"');
  });

  it('carries a long full sync on from the page it reached, not from the first', async () => {
    let t = NOW;
    const sync = h.setup({}, () => t);
    h.google.pageSize = 2;
    for (const n of [1, 2, 3, 4, 5]) h.google.put(`ev-${n}`);
    const create = h.db.appointment.create;
    const original = create.getMockImplementation() as (args: unknown) => Promise<unknown>;
    // The time runs out while the second page is being applied (at its first event).
    create.mockImplementation(async (args: unknown) => {
      if (h.appointments().length === 2) t = new Date(NOW.getTime() + 60 * 60_000);
      return original(args);
    });

    await runCalendarSync(sync);

    expect(h.mailbox().calendarSyncToken).toMatch(/^resume:/);
    expect(h.appointments()).toHaveLength(3);

    t = new Date(NOW.getTime() + 2 * 60 * 60_000);
    h.google.log.length = 0;
    await runCalendarSync(sync);

    // What the second page had no time for is read by id first; then the third page, not the first.
    expect(h.google.log[0]).toBe('getEvent:ev-4');
    expect(h.google.log).toContain('fetchChanges:full:page-4');
    expect(h.google.log).not.toContain('fetchChanges:full');
    expect(h.appointments()).toHaveLength(5);
    expect(h.mailbox().calendarSyncToken).toContain('"t":"tok-5"');
  });
});

describe('Google to Aurora: edits racing the sync, failing items and restores', () => {
  async function imported(over: Record<string, unknown> = {}) {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Lunch', ...over });
    await runCalendarSync(sync);
    return sync;
  }

  it('keeps a local edit made between reading the appointment and writing to it', async () => {
    const sync = await imported();
    h.google.now = new Date('2026-11-20T10:03:00.000Z');
    h.google.put('ev-1', { title: 'Google title' });
    const read = h.db.appointment.findFirst.getMockImplementation() as (a: unknown) => Promise<any>;
    h.db.appointment.findFirst.mockImplementationOnce(async (args: unknown) => {
      const seen = await read(args);
      // The user edits the appointment after the sync has read it.
      Object.assign(h.appointments()[0], {
        title: 'Local edit',
        updatedAt: new Date('2026-11-20T10:04:00.000Z'),
      });
      return seen;
    });

    const report = await h.nextRound(sync);

    expect(h.appointments()[0].title).toBe('Local edit');
    expect(report.skipped).toBe(1);
  });

  it('delivers an event again, next round, when the appointment is edited during both tries', async () => {
    const sync = await imported();
    h.google.put('ev-1', { title: 'Google title' });
    h.db.appointment.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    const report = await h.nextRound(sync);
    expect(report).toMatchObject({ itemFailures: 1, failures: 0 });
    expect(h.appointments()[0].title).toBe('Lunch');

    await h.nextRound(sync);
    expect(h.appointments()[0].title).toBe('Google title');
  });
  it('ignores a version of an event older than the one already applied', async () => {
    const sync = await imported();
    h.links()[0].remoteUpdatedAt = new Date('2026-11-21T10:00:00.000Z');
    h.google.put('ev-1', { title: 'An older version' });

    await h.nextRound(sync);

    expect(h.appointments()[0].title).toBe('Lunch');
  });

  it('gives up on an event that fails three times, logging its id and code but not its content', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Secret title' });
    h.google.put('ev-2');
    const create = h.db.appointment.create;
    const original = create.getMockImplementation() as (args: any) => Promise<unknown>;
    create.mockImplementation(async (args: any) => {
      if (args.data.title === 'Secret title')
        throw Object.assign(new Error('bad'), { code: 'P2000' });
      return original(args);
    });

    await runCalendarSync(sync);
    await h.nextRound(sync);
    await h.nextRound(sync);
    expect(h.mailbox().calendarSyncToken).not.toContain('"f"');
    const attempts = h.google.log.filter((l) => l === 'getEvent:ev-1');
    await h.nextRound(sync);

    expect(h.google.log.filter((l) => l === 'getEvent:ev-1')).toHaveLength(attempts.length);
    expect(h.appointments().map((a) => a.title)).not.toContain('Secret title');
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain('ev-1');
    expect(logged).toContain('P2000');
    expect(logged).not.toContain('Secret title');
  });
  it('goes again with a fresh access token when one run out during the round, without asking for a reconnect', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    h.google.failNext.set('fetchChanges', new CalendarAuthenticationError('google', 'expired'));

    const report = await runCalendarSync(sync);

    expect(mocks.forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ imported: 1, reconnects: 0, failures: 0 });
    expect(h.mailbox().calendarStatus).toBe('ACTIVE');
  });

  it('asks for a reconnect only when a fresh access token is refused too', async () => {
    const sync = h.setup();
    h.google.fetchChanges = async () =>
      Result.fail(new CalendarAuthenticationError('google', 'permission gone')) as any;

    const report = await runCalendarSync(sync);

    expect(mocks.forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(report.reconnects).toBe(1);
    expect(h.mailbox().calendarStatus).toBe('NEEDS_RECONNECT');
  });
  it('waits as long as Google asked when its rate limit stops a round', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    h.google.failNext.set('fetchChanges', new CalendarRateLimitError('google', 3600));

    const report = await runCalendarSync(sync);

    expect(report.failures).toBe(1);
    expect(h.mailbox().calendarNextSyncAt.getTime()).toBeGreaterThanOrEqual(
      NOW.getTime() + 3600 * 1000
    );
  });
  it('queues what a round has no time for, by id, and applies it first next round', async () => {
    let t = NOW;
    const sync = h.setup({}, () => t);
    await runCalendarSync(sync);
    for (const n of [1, 2, 3]) h.google.put(`ev-${n}`);
    const create = h.db.appointment.create;
    const original = create.getMockImplementation() as (args: unknown) => Promise<unknown>;
    create.mockImplementationOnce(async (args: unknown) => {
      t = new Date(NOW.getTime() + 60 * 60_000);
      return original(args);
    });

    t = new Date(NOW.getTime() + 10 * 60_000);
    await runCalendarSync(sync);
    expect(h.appointments()).toHaveLength(1);
    // The page is done with: the token moved on, and the rest waits in the saved state.
    expect(h.mailbox().calendarSyncToken).toContain('"f":{"ev-2":0,"ev-3":0}');

    t = new Date(NOW.getTime() + 3 * 60 * 60_000);
    await runCalendarSync(sync);
    expect(h.appointments()).toHaveLength(3);
    expect(h.mailbox().calendarSyncToken).not.toContain('"f"');
  });
  it('reads an event that began before the window and is still going on', async () => {
    const sync = h.setup();
    h.google.put('ev-now', {
      start: new Date(NOW.getTime() - 60 * 60_000),
      end: new Date(NOW.getTime() + 60 * 60_000),
    });

    await runCalendarSync(sync);

    expect(h.appointments()).toHaveLength(1);
  });
  it('keeps the retry counts when the time runs out before the first page', async () => {
    let t = NOW;
    const sync = h.setup({}, () => t);
    h.google.put('ev-1');
    h.db.appointment.create.mockImplementation(async () => {
      throw new Error('bad');
    });
    await runCalendarSync(sync);
    expect(h.mailbox().calendarSyncToken).toContain('"f":{"ev-1":1}');
    // The next round's retry runs, and the round's time is spent right after it.
    const get = h.google.getEvent.bind(h.google);
    h.google.getEvent = async (...args: Parameters<typeof get>) => {
      t = new Date(NOW.getTime() + 60 * 60_000);
      return get(...args);
    };
    t = new Date(NOW.getTime() + 10 * 60_000);

    await runCalendarSync(sync);

    expect(h.mailbox().calendarSyncToken).toContain('"f":{"ev-1":2}');
  });
  it('remembers an event that will not save and applies it in the next round', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    h.google.put('ev-2');
    h.db.failures.set('appointment.create', new Error('transaction conflict'));

    const first = await runCalendarSync(sync);
    expect(first).toMatchObject({ itemFailures: 1, imported: 1, failures: 0 });
    expect(h.mailbox().calendarSyncToken).toContain('"f":{"ev-1":1}');

    await h.nextRound(sync);
    expect(h.appointments()).toHaveLength(2);
    expect(h.mailbox().calendarSyncToken).not.toContain('"f"');
  });
  it('skips an event whose time cannot be read, so it cannot hold the sync back', async () => {
    const sync = h.setup();
    await runCalendarSync(sync);
    h.google.put('ev-1', { start: new Date('not a date') });
    h.google.put('ev-2');

    const report = await h.nextRound(sync);

    expect(report).toMatchObject({ skipped: 1, imported: 1, failures: 0 });
  });

  it('reads the calendar again once a month, so events that came into the year are imported', async () => {
    let t = NOW;
    const sync = h.setup({}, () => t);
    h.google.put('ev-1');
    // 2027-12-01: past the first year's window, inside the one a month later.
    const far = new Date('2027-12-01T09:00:00.000Z');
    h.google.put('ev-far', { start: far, end: new Date(far.getTime() + 60 * 60_000) });
    await runCalendarSync(sync);
    expect(h.appointments()).toHaveLength(1);

    t = new Date(NOW.getTime() + 31 * 24 * 60 * 60_000);
    await runCalendarSync(sync);

    expect(h.appointments()).toHaveLength(2);
  });
  it('only redacts what was imported and is still live', async () => {
    const sync = await imported();
    h.links()[0].origin = 'AURORA';
    h.google.put('ev-1', { visibility: 'private' });

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ title: 'Lunch', status: 'SCHEDULED' });
    expect(h.links()[0].remoteCancelledAt).not.toBeNull();
  });

  it('brings an appointment back when a private event is made public again', async () => {
    const sync = await imported({ location: 'Cafe' });
    h.google.put('ev-1', { visibility: 'private' });
    await h.nextRound(sync);
    h.google.put('ev-1', { visibility: 'default' });

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ title: 'Lunch', status: 'SCHEDULED' });
  });

  it('finds an event deleted, restored and moved out of the window while the token was lost', async () => {
    const sync = await imported();
    h.google.remove('ev-1');
    await h.nextRound(sync);
    const later = new Date('2028-11-22T12:00:00.000Z');
    h.google.put('ev-1', { status: 'confirmed', start: later, end: later });
    h.google.expiredToken = h.token();

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ status: 'SCHEDULED', startTime: later });
  });

  it('keeps its place when Google’s rate limit stops the check, waits, and carries on', async () => {
    const sync = await imported();
    h.google.put('ev-1', { start: new Date('2028-11-22T12:00:00.000Z') });
    h.google.expiredToken = h.token();
    h.google.failNext.set('getEvent', new CalendarRateLimitError('google', 5));

    await h.nextRound(sync);
    expect(h.mailbox().calendarSyncToken).toMatch(/^resume:.*"v":/);
    // Not claimed again in the same tick: it waits at least a minute.
    expect(h.google.log.filter((l) => l === 'getEvent:ev-1')).toHaveLength(1);
    expect(h.mailbox().calendarNextSyncAt.getTime()).toBeGreaterThanOrEqual(
      h.mailbox().calendarSyncedAt.getTime() + 60_000
    );
    await h.nextRound(sync);

    expect(h.mailbox().calendarSyncToken).toMatch(/^resume:\{"t":"tok-/);
  });
  it('treats a saved place it cannot read as lost, and checks every link', async () => {
    const sync = await imported();
    h.google.remove('ev-1');
    h.mailbox().calendarSyncToken = 'resume:{broken';

    await h.nextRound(sync);

    expect(h.appointments()[0].status).toBe('CANCELLED');
  });
});

describe('a reconnect (MVP-013)', () => {
  it('resumes from the saved token for the same account', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    await runCalendarSync(sync);
    h.google.put('ev-2');
    h.google.log.length = 0;

    await h.nextRound(sync);

    expect(h.google.log[0]).toMatch(/^fetchChanges:tok-/);
    expect(h.appointments()).toHaveLength(2);
  });

  it('starts over for another Google account: the old account’s links go, its appointments stay', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'From the old account' });
    await runCalendarSync(sync);
    const oldLinkId = h.links()[0].id;
    h.mailbox().accountAddress = 'someone.else@studio.example.invalid';
    h.google.events.clear();
    h.google.put('ev-new', { title: 'From the new account' });
    h.google.log.length = 0;

    await h.nextRound(sync);

    expect(h.google.log[0]).toBe('fetchChanges:full');
    // The new calendar's event is imported, and the old appointment (the user's own) is made there too.
    expect(h.links().map((l) => l.googleEventId)).toContain('ev-new');
    expect(h.links()).toHaveLength(2);
    expect(h.links().some((l) => l.id === oldLinkId)).toBe(false);
    expect(h.appointments().map((a) => a.title)).toEqual([
      'From the old account',
      'From the new account',
    ]);
  });
});
describe('two tenants', () => {
  it('keeps each tenant’s events to itself, even with the same event id', async () => {
    const sync = h.setup({
      emailMailbox: [
        mailboxRow(),
        mailboxRow({ id: 'mbx-2', tenantId: OTHER_TENANT, userId: 'user-9' }),
      ],
    });
    // Each user has their own Google calendar; both hold an event with the same id.
    const calendars: Record<string, FakeGoogle> = { 'mbx-1': h.google, 'mbx-2': new FakeGoogle() };
    h.google.put('shared-event', { title: 'Shared' });
    calendars['mbx-2'].put('shared-event', { title: 'Shared' });
    sync.gatewayFor = (mailbox) => calendars[mailbox.id];

    await runCalendarSync(sync);

    const byTenant = (tenantId: string) => h.appointments().filter((a) => a.tenantId === tenantId);
    expect(byTenant(TENANT).map((a) => a.title)).toEqual(['Shared']);
    expect(byTenant(OTHER_TENANT).map((a) => a.title)).toEqual(['Shared']);
    for (const link of h.links()) {
      const appointment = h.appointments().find((a) => a.id === link.appointmentId);
      expect(appointment?.tenantId).toBe(link.tenantId);
    }

    expect(h.links().filter((l) => l.googleEventId === 'shared-event')).toHaveLength(2);
  });
});
