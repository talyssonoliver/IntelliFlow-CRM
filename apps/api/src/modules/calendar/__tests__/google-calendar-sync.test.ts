/**
 * MVP-013: the Google Calendar sync engine around its directions: which mailboxes it takes, the lease,
 * what a failure does, the reconnect state when Google withdraws the calendar permission, and the time
 * budget.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSyncError } from '@intelliflow/application';
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

import { CALENDAR_SYNC_INTERVAL_MS, runCalendarSync } from '../google-calendar-sync';
import {
  NOW,
  appointmentRow,
  authFailure,
  createSyncHarness,
  mailboxRow,
} from './google-calendar-harness';

const h = createSyncHarness();
let warn: ReturnType<typeof vi.spyOn>;
const after = (ms: number) => new Date(NOW.getTime() + ms);

beforeEach(() => {
  mocks.hasOAuthClient.mockReturnValue(true);
  mocks.getOAuthAccess.mockImplementation(async (_p: unknown, row: { tokenVersion: number }) => ({
    accessToken: 'access',
    tokenVersion: row.tokenVersion,
  }));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('which mailboxes it syncs', () => {
  it.each([
    ['an SMTP mailbox', { kind: 'SMTP' }],
    ['a Microsoft mailbox', { kind: 'MICROSOFT' }],
    ['the company mailbox', { scope: 'TENANT', userId: null }],
    ['a Google mailbox without the calendar permission', { grantedScopes: ['openid'] }],
    ['a mailbox that needs a reconnect', { calendarStatus: 'NEEDS_RECONNECT' }],
    ['a broken mailbox', { status: 'ERROR' }],
    ['a disconnected mailbox', { status: 'DISCONNECTED' }],
    ['a mailbox not due yet', { calendarNextSyncAt: after(60_000) }],
    ['a mailbox another worker holds', { calendarLockedUntil: after(60_000) }],
  ])('leaves %s alone', async (_name, over) => {
    const sync = h.setup({ emailMailbox: [mailboxRow(over)] });

    const report = await runCalendarSync(sync);

    expect(report.mailboxesSynced).toBe(0);
    expect(h.google.log).toEqual([]);
  });

  it('takes the wider calendar permission as well as events', async () => {
    const sync = h.setup({
      emailMailbox: [mailboxRow({ grantedScopes: ['https://www.googleapis.com/auth/calendar'] })],
    });

    const report = await runCalendarSync(sync);

    expect(report.mailboxesSynced).toBe(1);
  });

  it('syncs every due mailbox in one tick, oldest due first', async () => {
    const sync = h.setup({
      emailMailbox: [
        mailboxRow({ id: 'late', calendarNextSyncAt: after(-1_000) }),
        mailboxRow({ id: 'early', calendarNextSyncAt: after(-60_000) }),
      ],
    });
    const order: string[] = [];
    sync.gatewayFor = (row) => {
      order.push(row.id);
      return h.google;
    };

    const report = await runCalendarSync(sync);

    expect(report.mailboxesSynced).toBe(2);
    expect(order).toEqual(['early', 'late']);
  });

  it('is released after the round, not left under its lease', async () => {
    const sync = h.setup();

    await runCalendarSync(sync);

    expect(h.mailbox().calendarLockedUntil).toBeNull();
  });
});

describe('the row changes, or there is no Google client', () => {
  it('does not sync a mailbox that stopped qualifying between the claim and the read', async () => {
    const sync = h.setup();
    h.db.emailMailbox.findFirst.mockResolvedValueOnce(
      mailboxRow({ calendarStatus: 'NEEDS_RECONNECT' })
    );

    const report = await runCalendarSync(sync);

    expect(report.mailboxesSynced).toBe(0);
    expect(h.google.log).toEqual([]);
    expect(h.mailbox().calendarNextSyncAt).toEqual(after(CALENDAR_SYNC_INTERVAL_MS));
  });

  it('waits the interval, without counting a failure, when this process has no Google client', async () => {
    mocks.hasOAuthClient.mockReturnValue(false);
    const sync = h.setup();

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ mailboxesSynced: 0, failures: 0 });
    expect(h.google.log).toEqual([]);
    expect(h.mailbox()).toMatchObject({
      calendarFailureCount: 0,
      calendarNextSyncAt: after(CALENDAR_SYNC_INTERVAL_MS),
    });
    expect(warn).toHaveBeenCalled();
  });

  it('writes nothing back when the credentials moved on during the round (a reconnect)', async () => {
    mocks.getOAuthAccess.mockResolvedValue({ accessToken: 'access', tokenVersion: 7 });
    const sync = h.setup();
    h.google.put('ev-1');

    await runCalendarSync(sync);

    // The release is keyed on the credentials it read: no match, so no token and no schedule.
    expect(h.mailbox().calendarSyncToken).toBeNull();
    expect(h.mailbox().calendarSyncedAt).toBeNull();
  });

  it('leaves the lease to run out when another worker has the mailbox now', async () => {
    const sync = h.setup();
    h.db.failures.set('emailMailbox.update', Object.assign(new Error('gone'), { code: 'P2025' }));

    await expect(runCalendarSync(sync)).resolves.toMatchObject({ mailboxesSynced: 1 });
  });

  it('treats a database error while saving the outcome as a failed round, and backs off', async () => {
    const sync = h.setup();
    h.db.failures.set('emailMailbox.update', Object.assign(new Error('down'), { code: 'P1001' }));

    const report = await runCalendarSync(sync);

    expect(report.failures).toBe(1);
    expect(h.mailbox()).toMatchObject({
      calendarFailureCount: 1,
      calendarNextSyncAt: after(2 * CALENDAR_SYNC_INTERVAL_MS),
    });
  });
});

describe('Google withdraws the calendar permission', () => {
  it('marks the mailbox for a reconnect and stops syncing it, without backing off', async () => {
    const sync = h.setup();
    // Refused with the fresh access token too: the permission is gone.
    h.google.fetchChanges = async () => Result.fail(authFailure()) as any;

    const report = await runCalendarSync(sync);

    expect(report).toMatchObject({ reconnects: 1, failures: 0 });
    expect(h.mailbox()).toMatchObject({
      calendarStatus: 'NEEDS_RECONNECT',
      calendarFailureCount: 0,
      calendarLockedUntil: null,
    });
    // Not claimed again until the user connects.
    h.google.log.length = 0;
    const later = await runCalendarSync({ ...sync, now: () => after(60 * 60_000) });
    expect(later.mailboxesSynced).toBe(0);
    expect(h.google.log).toEqual([]);
  });
});

describe('a round that fails', () => {
  it('backs off, doubling each time, and never changes the mailbox status', async () => {
    const sync = h.setup();
    h.google.failNext.set('fetchChanges', new CalendarSyncError('google', 'Bad gateway'));

    const first = await runCalendarSync(sync);

    expect(first.failures).toBe(1);
    expect(h.mailbox()).toMatchObject({
      status: 'ACTIVE',
      calendarStatus: 'ACTIVE',
      calendarFailureCount: 1,
      calendarNextSyncAt: after(2 * CALENDAR_SYNC_INTERVAL_MS),
      calendarLockedUntil: null,
    });

    h.mailbox().calendarNextSyncAt = null;
    h.google.failNext.set('fetchChanges', new CalendarSyncError('google', 'Bad gateway'));
    await runCalendarSync(sync);
    expect(h.mailbox().calendarFailureCount).toBe(2);
    expect(h.mailbox().calendarNextSyncAt).toEqual(after(4 * CALENDAR_SYNC_INTERVAL_MS));
  });

  it('never backs off for more than six hours', async () => {
    const sync = h.setup({ emailMailbox: [mailboxRow({ calendarFailureCount: 20 })] });
    h.google.failNext.set('fetchChanges', new CalendarSyncError('google', 'down'));

    await runCalendarSync(sync);

    expect(h.mailbox().calendarNextSyncAt).toEqual(after(6 * 60 * 60_000));
  });

  it('starts again from zero after a good round', async () => {
    const sync = h.setup({ emailMailbox: [mailboxRow({ calendarFailureCount: 3 })] });

    await runCalendarSync(sync);

    expect(h.mailbox().calendarFailureCount).toBe(0);
  });

  it('logs the kind of failure, never what was in the calendar', async () => {
    const sync = h.setup();
    h.google.put('ev-1', { title: 'Private meeting about a divorce' });
    h.google.failNext.set('fetchChanges', new CalendarSyncError('google', 'Bad request'));

    await runCalendarSync(sync);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('calendar-sync');
    expect(logged).not.toContain('divorce');
    expect(logged).not.toContain('access');
  });
});

describe('the time budget', () => {
  it('stops without starting an item once the round’s time is spent, and is due again at once', async () => {
    // The claim and the budget read the clock; every read after that is past the budget.
    let reads = 0;
    const sync = h.setup({ appointment: [appointmentRow()] }, () => {
      reads += 1;
      return reads <= 3 ? new Date(NOW) : after(60 * 60_000);
    });
    h.google.put('ev-1');

    const report = await runCalendarSync(sync);

    expect(h.google.log).toEqual([]);
    expect(report.mailboxesSynced).toBe(1);
    // Due again at once: no later than the moment the round ended.
    expect(h.mailbox().calendarNextSyncAt.getTime()).toBeLessThanOrEqual(
      after(60 * 60_000).getTime()
    );
  });

  it('does not take another mailbox once the tick’s time is spent', async () => {
    let reads = 0;
    const sync = h.setup(
      { emailMailbox: [mailboxRow({ id: 'one' }), mailboxRow({ id: 'two' })] },
      () => {
        reads += 1;
        // The first mailbox is claimed on time; the second claim comes after the tick budget.
        return reads <= 4 ? new Date(NOW) : after(10 * 60_000);
      }
    );

    const report = await runCalendarSync(sync);

    expect(report.mailboxesSynced).toBe(1);
  });
});
