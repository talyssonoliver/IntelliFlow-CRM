/**
 * MVP-013, Google to Aurora: the events of the user's Google calendar becoming, changing and cancelling
 * appointments, run through the engine against an in-memory database and a fake Google calendar that
 * numbers its changes. A re-run must not make anything twice, an echo of our own write is skipped, a private
 * event stays in Google, and a tenant's events only ever reach that tenant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn(),
}));
vi.mock('../../email/mailbox-transport', () => ({
  getOAuthAccess: mocks.getOAuthAccess,
  hasOAuthClient: mocks.hasOAuthClient,
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
    expect(mailbox.calendarSyncToken).toBe('tok-1');
    expect(mailbox.calendarSyncedAt).toEqual(NOW);
    expect(mailbox.calendarNextSyncAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
  });

  it('makes nothing twice: a second round, and a restart after the token expired, add no copy', async () => {
    const sync = h.setup();
    h.google.put('ev-1');
    await runCalendarSync(sync);

    await h.nextRound(sync);
    expect(h.appointments()).toHaveLength(1);

    h.google.expiredToken = h.db.tables.emailMailbox[0].calendarSyncToken;
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
    expect(h.db.tables.emailMailbox[0].calendarSyncToken).toBe('tok-5');
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

    expect(report.failures).toBe(1);
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
    h.google.expiredToken = h.mailbox().calendarSyncToken;

    await h.nextRound(sync);

    expect(h.appointments()[0]).toMatchObject({ title: 'Private event', status: 'CANCELLED' });
  });

  it('does not cancel an event that was only moved out of the full sync’s window', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Moved later' });
    await runCalendarSync(sync);
    const later = new Date('2028-11-22T12:00:00.000Z');
    h.google.put('ev-1', { start: later, end: new Date(later.getTime() + 60 * 60_000) });
    h.google.expiredToken = h.mailbox().calendarSyncToken;

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
    h.google.expiredToken = h.mailbox().calendarSyncToken;
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
    expect(h.mailbox().calendarSyncToken).toMatch(/^tok-/);
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
    expect(h.mailbox().calendarSyncToken).toBeNull();

    t = new Date(NOW.getTime() + 2 * 60 * 60_000);
    await runCalendarSync(sync);
    expect(h.appointments()).toHaveLength(3);
    expect(h.mailbox().calendarSyncToken).toBe('tok-3');
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

    expect(h.google.log[0]).toBe('fetchChanges:full:page-2');
    expect(h.appointments()).toHaveLength(5);
    expect(h.mailbox().calendarSyncToken).toBe('tok-5');
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
