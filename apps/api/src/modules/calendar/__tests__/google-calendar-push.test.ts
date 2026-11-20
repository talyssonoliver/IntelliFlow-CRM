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
import { eventIdFor } from '../google-calendar-push';
import { CalendarEventNotFoundError } from '@intelliflow/application';
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
    const sync = h.setup({ appointment: [appointmentRow()] });
    // Google made the event, the answer never arrived, so no link was written.
    h.google.put(eventIdFor('mbx-1', 'appt-1'), { title: 'Site visit' });

    const report = await runCalendarSync(sync);

    expect(report.pushedCreated).toBe(1);
    expect(h.google.events.size).toBe(1);
    expect(h.links()).toHaveLength(1);
  });

  it('tolerates a link for the appointment being there already when it writes its own', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.db.failures.set('calendarEventLink.create', p2002());
    const read = h.db.calendarEventLink.findFirst.getMockImplementation() as (
      a: unknown
    ) => unknown;
    h.db.calendarEventLink.findFirst.mockImplementation(async (args: any) =>
      args.where.appointmentId ? { id: 'made-meanwhile' } : read(args)
    );

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ pushedCreated: 1, itemFailures: 0 });
  });

  it('counts a failure, and tries again next round, when the link clashes but is not there', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.db.failures.set('calendarEventLink.create', p2002());

    const first = await runCalendarSync(sync);
    expect(first).toMatchObject({ pushedCreated: 0, itemFailures: 1 });
    expect(h.links()).toHaveLength(0);

    await h.nextRound(sync);
    expect(h.links()).toHaveLength(1);
    expect(h.google.events.size).toBe(1);
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

  it('leaves an event Aurora is still linking to the push, not the pull', async () => {
    const sync = h.setup({ appointment: [appointmentRow()] });
    h.google.put(eventIdFor('mbx-1', 'appt-1'), { title: 'Site visit' });

    const report = await runCalendarSync(sync);

    expect(report.imported).toBe(0);
    expect(h.appointments()).toHaveLength(1);
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
        appointmentRow({ id: 'b', startTime: new Date('2026-11-21T11:00:00.000Z') }),
      ],
    });
    h.google.failNext.set('createEvent', refusal());

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ pushedCreated: 1, itemFailures: 1, failures: 0 });
    expect(h.links().map((l) => l.appointmentId)).toEqual(['b']);
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
