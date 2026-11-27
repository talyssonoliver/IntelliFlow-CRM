/**
 * MVP-013 Google Calendar sync on a real database. The unit suites run the sync against an in-memory
 * stand-in for the database; only a real Postgres proves what the sync leans on:
 * - the lease claim (`FOR UPDATE SKIP LOCKED`) hands one mailbox to one worker;
 * - the link table's unique keys keep an event or an appointment to one link, and the composite
 *   tenant keys hold;
 * - the "edited in Aurora" query (a raw join of appointments and links) returns only the edited ones;
 * - tenant scoping: one tenant's appointments never go to another tenant's calendar, and events read
 *   from Google land in the mailbox's own tenant;
 * - a withdrawn permission stops the sync (NEEDS_RECONNECT) and the claim leaves the mailbox alone.
 * Google itself is a fake that numbers its changes (the same one the unit suites use).
 *
 * Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

// The mailbox's own token helper needs the encryption keys and Google: the fake gateway needs neither.
const mocks = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn(),
  forgetAccessToken: vi.fn(),
}));
vi.mock('../../apps/api/src/modules/email/mailbox-transport', () => ({
  getOAuthAccess: mocks.getOAuthAccess,
  hasOAuthClient: mocks.hasOAuthClient,
  forgetAccessToken: mocks.forgetAccessToken,
  oauthClientEnvNames: () => ['EMAIL_OAUTH_GOOGLE_CLIENT_ID'],
}));

import {
  runCalendarSync,
  type CalendarSyncDeps,
} from '../../apps/api/src/modules/calendar/google-calendar-sync';
import { eventIdFor } from '../../apps/api/src/modules/calendar/google-calendar-push';
import {
  FakeGoogle,
  authFailure,
  refusal,
} from '../../apps/api/src/modules/calendar/__tests__/google-calendar-harness';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
// Never used to sign in anywhere: the mailboxes only need to exist.
const PLACEHOLDER = 'x'.repeat(12);
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const HOUR = 3_600_000;

describeDb('google calendar sync on a real database', () => {
  const run = randomUUID().slice(0, 8);
  const tenantA = `gcal-a-${run}`;
  const tenantB = `gcal-b-${run}`;
  const tenantC = `gcal-c-${run}`; // other due mailboxes that must stay untouched
  const userA = `${tenantA}-user`;
  const userB = `${tenantB}-user`;
  let prisma: PrismaClient;
  let mailboxA: string;
  let mailboxB: string;
  let googleA: FakeGoogle;
  let googleB: FakeGoogle;
  let sync: CalendarSyncDeps;

  /** What the sync did to the mailbox rows, kept for a failing test's diagnostics. */
  const trace: unknown[] = [];

  const soon = (hours: number) => new Date(Date.now() + hours * HOUR);

  const addMailbox = async (tenantId: string, userId: string, sub: string) =>
    (
      await prisma.emailMailbox.create({
        data: {
          tenantId,
          scope: 'USER',
          userId,
          kind: 'GMAIL',
          status: 'ACTIVE',
          fromAddress: `${userId}@example.invalid`,
          accountAddress: `${userId}@example.invalid`,
          oauthAccountId: sub,
          refreshToken: PLACEHOLDER,
          grantedScopes: ['openid', CALENDAR_SCOPE],
        },
      })
    ).id;

  const addAppointment = (tenantId: string, organizerId: string, title: string, hours = 24) =>
    prisma.appointment.create({
      data: {
        tenantId,
        organizerId,
        title,
        startTime: soon(hours),
        endTime: soon(hours + 1),
      },
    });

  /** Every mailbox due now, then one tick. */
  async function round() {
    await prisma.emailMailbox.updateMany({
      where: { id: { in: [mailboxA, mailboxB] } },
      data: { calendarNextSyncAt: null, calendarLockedUntil: null },
    });
    googleA.now = new Date();
    googleB.now = new Date();
    return runCalendarSync(sync);
  }

  /**
   * The sync claims any due mailbox in the database, and other integration files run beside this one
   * against the same database: their Google mailboxes must neither use up this tick's claims nor be
   * written to by it. The claim is narrowed to this file's two mailboxes; nothing else is changed.
   */
  function onlyMyMailboxes(): PrismaClient {
    const claim = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
        ''
      );
      if (!text.includes('email_mailboxes')) return prisma.$queryRaw(strings, ...values);
      const narrowed = text.replace(
        'ORDER BY "calendarNextSyncAt"',
        `AND id = ANY($${values.length + 1}::text[]) ORDER BY "calendarNextSyncAt"`
      );
      if (narrowed === text) throw new Error('the claim query changed: narrow it again here');
      const claimed = await prisma.$queryRawUnsafe(narrowed, ...values, [mailboxA, mailboxB]);
      trace.push({ claimed });
      return claimed;
    };
    return new Proxy(prisma, {
      get(target, prop) {
        if (prop === '$queryRaw') return claim;
        if (prop === 'emailMailbox') {
          const model = Reflect.get(target, prop, target);
          return new Proxy(model, {
            get(m, method) {
              const fn = Reflect.get(m, method, m);
              if (method !== 'update' && method !== 'findFirst') return fn;
              return async (...args: unknown[]) => {
                try {
                  const result = await fn.apply(m, args);
                  trace.push({ [String(method)]: result ? 'ok' : 'null', where: args[0] });
                  return result;
                } catch (error) {
                  trace.push({
                    [String(method)]: 'threw',
                    code: (error as { code?: string }).code,
                  });
                  throw error;
                }
              };
            },
          });
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  const linksOf = (mailboxId: string) =>
    prisma.calendarEventLink.findMany({ where: { mailboxId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
    for (const id of [tenantA, tenantB, tenantC]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    // More due Google mailboxes than one tick claims: they must neither starve nor be written by this run.
    for (let n = 0; n < 12; n++) {
      const userId = `${tenantC}-user-${n}`;
      await prisma.user.create({
        data: { id: userId, tenantId: tenantC, email: `c${n}-${run}@example.invalid` },
      });
      await addMailbox(tenantC, userId, `3${String(n).padStart(2, '0')}${run.replace(/\D/g, '0')}`);
    }
    await prisma.user.create({
      data: { id: userA, tenantId: tenantA, email: `a-${run}@example.invalid` },
    });
    await prisma.user.create({
      data: { id: userB, tenantId: tenantB, email: `b-${run}@example.invalid` },
    });
    mailboxA = await addMailbox(tenantA, userA, `1${run.replace(/\D/g, '0')}01`);
    mailboxB = await addMailbox(tenantB, userB, `2${run.replace(/\D/g, '0')}02`);
  });

  afterAll(async () => {
    const tenants = [tenantA, tenantB, tenantC];
    await prisma.calendarEventLink.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.appointment.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.emailMailbox.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  beforeEach(async ({ onTestFailed }) => {
    mocks.hasOAuthClient.mockReturnValue(true);
    mocks.getOAuthAccess.mockImplementation(
      async (_p: unknown, mailbox: { tokenVersion: number }) => ({
        accessToken: 'access',
        tokenVersion: mailbox.tokenVersion,
      })
    );
    // Quiet, but kept: a failing test prints what the sync warned about and the state it left.
    trace.length = 0;
    const warnings: unknown[][] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => void warnings.push(args));
    onTestFailed(async () => {
      const mailboxes = await prisma.emailMailbox.findMany({
        where: { id: { in: [mailboxA, mailboxB] } },
        select: {
          id: true,
          calendarStatus: true,
          calendarNextSyncAt: true,
          calendarLockedUntil: true,
          calendarFailureCount: true,
          calendarSyncToken: true,
        },
      });
      console.error(
        'DIAG calendar sync',
        JSON.stringify({
          warnings,
          mailboxes,
          trace: trace.slice(-12),
          tz: process.env.TZ,
          node: process.version,
          now: new Date(),
        })
      );
    });
    // A clean slate for each test: both calendars empty, both mailboxes healthy and unsynced.
    await prisma.calendarEventLink.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.appointment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.emailMailbox.updateMany({
      where: { id: { in: [mailboxA, mailboxB] } },
      data: {
        calendarStatus: 'ACTIVE',
        calendarSyncToken: null,
        calendarFailureCount: 0,
        calendarNextSyncAt: null,
        calendarLockedUntil: null,
        grantedScopes: ['openid', CALENDAR_SCOPE],
      },
    });
    googleA = new FakeGoogle();
    googleB = new FakeGoogle();
    const calendars: Record<string, FakeGoogle> = {};
    calendars[mailboxA] = googleA;
    calendars[mailboxB] = googleB;
    sync = {
      prisma: onlyMyMailboxes(),
      transports: {} as never,
      now: () => new Date(),
      gatewayFor: (mailbox) => calendars[mailbox.id],
    };
  });

  describe('Aurora to Google', () => {
    it('writes an appointment to the user’s calendar once, under a stable id, and links it', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Site visit');

      const first = await round();
      const second = await round();

      const id = eventIdFor(mailboxA, appointment.id);
      expect(first.pushedCreated).toBe(1);
      expect(second.pushedCreated).toBe(0);
      expect(googleA.events.get(id)).toMatchObject({
        title: 'Site visit',
        auroraAppointmentId: appointment.id,
      });
      expect(googleA.log.filter((l) => l.startsWith('createEvent'))).toHaveLength(1);
      const links = await linksOf(mailboxA);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        tenantId: tenantA,
        appointmentId: appointment.id,
        googleEventId: id,
        origin: 'AURORA',
        pending: false,
      });
    });

    it('never sends one tenant’s appointments to another tenant’s calendar', async () => {
      await addAppointment(tenantA, userA, 'A only');
      await addAppointment(tenantB, userB, 'B only');
      // A tenant-A appointment organised by a user of tenant B is nobody's to export either.
      await addAppointment(tenantA, userB, 'Wrong organiser');

      await round();

      expect([...googleA.events.values()].map((e) => e.title)).toEqual(['A only']);
      expect([...googleB.events.values()].map((e) => e.title)).toEqual(['B only']);
      expect((await linksOf(mailboxA)).every((l) => l.tenantId === tenantA)).toBe(true);
      expect((await linksOf(mailboxB)).every((l) => l.tenantId === tenantB)).toBe(true);
    });

    it('patches only the edited appointment among many, and the event follows', async () => {
      const rows = [];
      for (let n = 0; n < 6; n++)
        rows.push(await addAppointment(tenantA, userA, `Visit ${n}`, n + 2));
      await round();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await prisma.appointment.update({ where: { id: rows[3].id }, data: { title: 'Moved' } });

      const report = await round();
      const again = await round();

      expect(report.pushedUpdated).toBe(1);
      expect(again.pushedUpdated).toBe(0);
      expect(googleA.events.get(eventIdFor(mailboxA, rows[3].id))?.title).toBe('Moved');
      expect(googleA.log.filter((l) => l.startsWith('patchEvent'))).toHaveLength(1);
    });

    it('takes the event down when the appointment is cancelled, and never makes it again', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Cancelled soon');
      await round();
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      const report = await round();
      await round();

      expect(report.pushedDeleted).toBe(1);
      expect(googleA.log.filter((l) => l.startsWith('deleteEvent'))).toHaveLength(1);
      expect(googleA.log.filter((l) => l.startsWith('createEvent'))).toHaveLength(1);
    });

    it('does not push a recurring appointment', async () => {
      await prisma.appointment.create({
        data: {
          tenantId: tenantA,
          organizerId: userA,
          title: 'Weekly',
          startTime: soon(24),
          endTime: soon(25),
          recurrence: { frequency: 'WEEKLY', interval: 1 },
        },
      });

      await round();

      expect(googleA.events.size).toBe(0);
    });

    it('keeps a refused create waiting with its attempts counted, then writes it once it is accepted', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Refused once');
      googleA.failNext.set('createEvent', refusal());

      const failed = await round();
      const [link] = await linksOf(mailboxA);

      expect(failed.itemFailures).toBe(1);
      expect(link).toMatchObject({ pending: true, pushAttempts: 1 });
      expect(link.nextPushAt).not.toBeNull();

      // It waits out its backoff, unless the appointment is edited (which can be what fixes it).
      await new Promise((resolve) => setTimeout(resolve, 20));
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { location: 'Yard' },
      });
      const retried = await round();

      expect(retried.pushedCreated).toBe(1);
      const [settled] = await linksOf(mailboxA);
      expect(settled).toMatchObject({ pending: false, pushAttempts: 0, nextPushAt: null });
      expect(googleA.events.get(eventIdFor(mailboxA, appointment.id))?.title).toBe('Refused once');
    });
  });

  describe('Google to Aurora', () => {
    it('makes an appointment for the mailbox’s user in the mailbox’s tenant, once', async () => {
      googleA.put('ev-1', { title: 'Lunch with Ada', start: soon(30), end: soon(31) });

      const first = await round();
      const second = await round();

      expect(first.imported).toBe(1);
      expect(second.imported).toBe(0);
      const appointments = await prisma.appointment.findMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      expect(appointments).toHaveLength(1);
      expect(appointments[0]).toMatchObject({
        tenantId: tenantA,
        organizerId: userA,
        title: 'Lunch with Ada',
        externalCalendarId: 'ev-1',
      });
      expect((await linksOf(mailboxA))[0]).toMatchObject({
        origin: 'GOOGLE',
        googleEventId: 'ev-1',
      });
    });

    it('keeps two tenants’ events apart even when they share an event id', async () => {
      googleA.put('shared', { title: 'A shared', start: soon(30), end: soon(31) });
      googleB.put('shared', { title: 'B shared', start: soon(30), end: soon(31) });

      await round();

      const forA = await prisma.appointment.findMany({ where: { tenantId: tenantA } });
      const forB = await prisma.appointment.findMany({ where: { tenantId: tenantB } });
      expect(forA.map((a) => a.title)).toEqual(['A shared']);
      expect(forB.map((a) => a.title)).toEqual(['B shared']);
    });

    it('cancels the appointment when the event is deleted in Google', async () => {
      googleA.put('ev-2', { title: 'Gone soon', start: soon(30), end: soon(31) });
      await round();
      googleA.remove('ev-2');

      const report = await round();

      expect(report.cancelled).toBe(1);
      const [appointment] = await prisma.appointment.findMany({ where: { tenantId: tenantA } });
      expect(appointment.status).toBe('CANCELLED');
    });

    it('does not copy a private event', async () => {
      googleA.put('ev-3', {
        title: 'Dentist',
        visibility: 'private',
        start: soon(30),
        end: soon(31),
      });

      await round();

      expect(await prisma.appointment.count({ where: { tenantId: tenantA } })).toBe(0);
    });
  });

  describe('both sides changed: the later update wins', () => {
    it('adopts Google’s edit when it is the later one', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Original');
      await round();
      googleA.now = new Date(Date.now() + 10 * 60_000);
      googleA.put(eventIdFor(mailboxA, appointment.id), { title: 'Edited in Google' });
      await prisma.emailMailbox.update({
        where: { id: mailboxA },
        data: { calendarNextSyncAt: null },
      });

      await runCalendarSync(sync);

      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(after.title).toBe('Edited in Google');
    });

    it('sends Aurora’s edit over the event when it is the later one', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Original');
      await round();
      const id = eventIdFor(mailboxA, appointment.id);
      googleA.now = new Date(Date.now() - 30 * 60_000);
      googleA.put(id, { title: 'Older Google edit' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { title: 'Newer here' },
      });

      await round();
      await round();

      expect(googleA.events.get(id)?.title).toBe('Newer here');
      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(after.title).toBe('Newer here');
    });
  });

  describe('a link that was lost', () => {
    it('is made again from the event’s own marker, and no second appointment appears', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Pushed once');
      await round();
      await prisma.calendarEventLink.deleteMany({ where: { mailboxId: mailboxA } });
      await prisma.emailMailbox.update({
        where: { id: mailboxA },
        data: { calendarSyncToken: null },
      });

      const report = await round();

      expect(report.imported).toBe(0);
      expect(await prisma.appointment.count({ where: { tenantId: tenantA } })).toBe(1);
      expect(await linksOf(mailboxA)).toHaveLength(1);
      expect((await linksOf(mailboxA))[0]).toMatchObject({
        appointmentId: appointment.id,
        origin: 'AURORA',
      });
    });

    it('refuses a second link for one appointment or one event at the database', async () => {
      const appointment = await addAppointment(tenantA, userA, 'Linked');
      await round();
      const [link] = await linksOf(mailboxA);

      await expect(
        prisma.calendarEventLink.create({
          data: {
            tenantId: tenantA,
            mailboxId: mailboxA,
            googleAccount: link.googleAccount,
            appointmentId: appointment.id,
            googleEventId: 'another-event',
            origin: 'AURORA',
          },
        })
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.calendarEventLink.create({
          data: {
            tenantId: tenantA,
            mailboxId: mailboxA,
            googleAccount: link.googleAccount,
            googleEventId: link.googleEventId,
            origin: 'GOOGLE',
          },
        })
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('the lease and the reconnect card', () => {
    it('claims one mailbox at a time: after a tick that found several due, none is left locked', async () => {
      await addAppointment(tenantA, userA, 'A visit');
      await addAppointment(tenantB, userB, 'B visit');

      const report = await round();

      // A claim that locked every due mailbox but synced only the first would leave the others locked for
      // the lease (five minutes) with nothing synced: both must have been synced and released.
      expect(report.mailboxesSynced).toBe(2);
      const rows = await prisma.emailMailbox.findMany({
        where: { id: { in: [mailboxA, mailboxB] } },
      });
      expect(rows.map((r) => r.calendarLockedUntil)).toEqual([null, null]);
      expect(rows.every((r) => r.calendarSyncedAt !== null)).toBe(true);
      expect([...googleA.events.values()].map((e) => e.title)).toEqual(['A visit']);
      expect([...googleB.events.values()].map((e) => e.title)).toEqual(['B visit']);
    });

    it('does not touch the mailboxes that are not part of the run', async () => {
      await addAppointment(tenantA, userA, 'Only mine');

      await round();

      const others = await prisma.emailMailbox.findMany({ where: { tenantId: tenantC } });
      expect(others).toHaveLength(12);
      for (const other of others) {
        expect(other).toMatchObject({
          calendarStatus: 'ACTIVE',
          calendarNextSyncAt: null,
          calendarLockedUntil: null,
          calendarSyncedAt: null,
        });
      }
      expect([...googleA.events.values()].map((e) => e.title)).toEqual(['Only mine']);
    });

    it('hands a due mailbox to one worker when two ticks run at once', async () => {
      googleA.put('ev-9', { title: 'Once', start: soon(30), end: soon(31) });
      await prisma.emailMailbox.update({
        where: { id: mailboxB },
        data: { calendarStatus: 'NEEDS_RECONNECT' },
      });

      const [one, two] = await Promise.all([runCalendarSync(sync), runCalendarSync(sync)]);

      expect(one.mailboxesSynced + two.mailboxesSynced).toBe(1);
      expect(await prisma.appointment.count({ where: { tenantId: tenantA } })).toBe(1);
    });

    it('stops at NEEDS_RECONNECT when Google withdraws the permission, and the claim skips it after', async () => {
      // Refused every time: one refusal is tried again with a fresh access token, a second means it is gone.
      vi.spyOn(googleA, 'fetchChanges').mockImplementation(
        async () => ({ isFailure: true, isSuccess: false, error: authFailure() }) as never
      );

      const first = await round();
      const mailbox = await prisma.emailMailbox.findUniqueOrThrow({ where: { id: mailboxA } });
      vi.mocked(googleA.fetchChanges).mockClear();
      const second = await round();

      expect(first.reconnects).toBe(1);
      expect(mailbox.calendarStatus).toBe('NEEDS_RECONNECT');
      expect(mailbox.calendarLockedUntil).toBeNull();
      expect(second.mailboxesSynced).toBe(1); // tenant B's calendar still syncs
      expect(googleA.fetchChanges).not.toHaveBeenCalled(); // tenant A's is left alone until the user reconnects
    });

    it('backs a failing round off, and goes back to normal after a good one', async () => {
      googleA.failNext.set('fetchChanges', refusal());

      const failed = await round();
      const backedOff = await prisma.emailMailbox.findUniqueOrThrow({ where: { id: mailboxA } });

      expect(failed.failures).toBe(1);
      expect(backedOff.calendarFailureCount).toBe(1);
      expect(backedOff.calendarNextSyncAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

      const good = await round();
      const healed = await prisma.emailMailbox.findUniqueOrThrow({ where: { id: mailboxA } });
      expect(good.failures).toBe(0);
      expect(healed.calendarFailureCount).toBe(0);
      expect(healed.calendarSyncedAt).not.toBeNull();
    });
  });
});
