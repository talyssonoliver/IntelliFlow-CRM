/**
 * MVP-013, Google to Aurora: the events that changed in the user's primary calendar since the last
 * round (Google's incremental sync token) become, change or cancel appointments.
 * Idempotent by event id (the link table's unique keys; an appointment and its link are made in one
 * transaction). An event coming back with the etag we stored is our own write and is skipped; if both
 * sides changed, the newer wins. Every query carries the mailbox's tenant. Private and confidential
 * events are not copied: Aurora is shared with the user's team.
 */
import {
  CalendarAuthenticationError,
  CalendarRateLimitError,
  CalendarSyncTokenExpiredError,
  type ExternalCalendarEvent,
} from '@intelliflow/application';
import {
  ACTIVE_STATUSES,
  activeAccountLinks,
  appointmentFields,
  isPersonal,
  prismaCode,
  type SyncContext,
} from './google-calendar-links';
import { errorCause } from '../email/mail-sync-report';

/** Pages read per round (250 events each); a longer full sync carries on next round. */
const MAX_PAGES = 20;
/** A full sync looks this far ahead: Google expands a repeating event for every date in the window. */
const FULL_SYNC_AHEAD_MS = 365 * 24 * 60 * 60_000;
/** The window only moves forward by a new full sync: one is made this often, so events that come into view are read. */
const HORIZON_REFRESH_MS = 30 * 24 * 60 * 60_000;
/** An event that fails to apply is tried again in later rounds, this many times in all, then given up. */
const ITEM_ATTEMPTS = 3;
/** More failed events than this at once is not bad data but a systemic failure: the round fails instead. */
const MAX_FAILED_ITEMS = 25;
/** The least a rate-limited mailbox waits before its next round. */
const MIN_RATE_WAIT_MS = 60_000;

export interface PullResult {
  /** The token to sync from next; a round stopped mid-way carries where to carry on. */
  syncToken: string | null;
  /** False when the round stopped early (the next round carries on). */
  complete: boolean;
  /** How long to wait before the next round, when Google's rate limit stopped this one. */
  retryAfterMs?: number;
}

type Window = { timeMin: Date; timeMax: Date };

/**
 * Where an unfinished round carries on, kept in the token column: `p` the page to read again, `a`/`b`
 * the full-sync window (Google refuses a changed query), `r` the full sync replaces an expired token,
 * `v` the check that follows it is under way, at this link id ("" = the start), `h` when the window
 * the sync token covers began (a steady state is just `t` and `h`), `f` events that failed to apply
 * and are tried again, with their attempts so far (0: not yet reached, for want of time), k the Google
 * account the state belongs to.
 */
interface State {
  t: string | null;
  p?: string;
  a?: string;
  b?: string;
  r?: 1;
  v?: string;
  h?: string;
  f?: Record<string, number>;
  /** The Google account the state belongs to: another account starts the sync over. */
  k?: string;
}

const STATE_PREFIX = 'resume:';
const VERIFY_BATCH = 100;

function fullWindow(now: Date): Window {
  return { timeMin: now, timeMax: new Date(now.getTime() + FULL_SYNC_AHEAD_MS) };
}

function encodeState(ctx: SyncContext, state: State, window?: Window): string {
  const base: State = { ...state, k: ctx.mailbox.account };
  const full: State = window
    ? { ...base, a: window.timeMin.toISOString(), b: window.timeMax.toISOString() }
    : base;
  // What still has attempts left rides along with the token.
  const pending = [...ctx.failed].filter(([, attempts]) => attempts < ITEM_ATTEMPTS);
  if (pending.length > 0) full.f = Object.fromEntries(pending);
  return STATE_PREFIX + JSON.stringify(full);
}

function decodeState(stored: string | null): State | null {
  if (!stored?.startsWith(STATE_PREFIX)) return null;
  try {
    const state = JSON.parse(stored.slice(STATE_PREFIX.length)) as State;
    const dates = [state.a, state.b, state.h].every(
      (d) => d === undefined || !isNaN(Date.parse(d))
    );
    const named = [state.p, state.v, state.h].some((x) => typeof x === 'string');
    const counts = Object.values(state.f ?? {}).every((n) => typeof n === 'number');
    const tokenOk = state.t === null || typeof state.t === 'string';
    return named && dates && counts && tokenOk ? state : null;
  } catch {
    return null;
  }
}

function stateWindow(state: State): Window | undefined {
  return state.a && state.b
    ? { timeMin: new Date(state.a), timeMax: new Date(state.b) }
    : undefined;
}

/** Where a round reads from: a saved page, the sync token, or the start of a full sync. */
interface Cursor {
  token: string | null;
  page: string | undefined;
  window: Window | undefined;
  replace: boolean;
  /** When the window the token covers began (ISO); unknown for a token from before this was kept. */
  horizon: string | undefined;
  /** Event ids a full sync read this round; null once the sync spans rounds. */
  seen: Set<string> | null;
  /** The token column as it was, for a round that reads nothing. */
  stored: string | null;
}

function freshFullSync(ctx: SyncContext, replace: boolean): Omit<Cursor, 'stored'> {
  const window = fullWindow(ctx.now);
  const horizon = window.timeMin.toISOString();
  return { token: null, page: undefined, window, replace, horizon, seen: new Set() };
}

function startCursor(ctx: SyncContext, raw: string | null): Cursor {
  const saved = decodeState(raw);
  // A saved state that cannot be read means the place is lost: a replacement sync, which also checks
  // every link, rather than a plain one.
  if (!saved && raw?.startsWith(STATE_PREFIX)) return { ...freshFullSync(ctx, true), stored: null };
  const stored = raw;
  if (saved) {
    // Steady state, but the window has fallen behind: read the whole calendar again. The token is
    // replaced, so changes made since the last round that the new window omits (an event moved into
    // the past, made private) are found by checking every link, as after an expired token.
    const horizonAge = saved.h ? ctx.now.getTime() - Date.parse(saved.h) : 0;
    if (!saved.p && (saved.t === null || horizonAge > HORIZON_REFRESH_MS)) {
      return { ...freshFullSync(ctx, true), stored };
    }
    const window = stateWindow(saved);
    const { t: token, p: page, h: horizon } = saved;
    return { token, page, window, replace: !!saved.r, horizon, seen: null, stored };
  }
  if (stored) {
    const bare = {
      page: undefined,
      window: undefined,
      replace: false,
      horizon: undefined,
      done: 0,
    };
    return { token: stored, ...bare, seen: null, stored };
  }
  return { ...freshFullSync(ctx, false), stored };
}

/** Reads Google's changes page by page and applies each; throws what Google answered on failure. */
export async function pullChanges(ctx: SyncContext, saved: string | null): Promise<PullResult> {
  const raw = await forgetOtherAccount(ctx, saved);
  ctx.failed = new Map(Object.entries(decodeState(raw)?.f ?? {}));
  await retryFailed(ctx);
  const resumed = resumeVerification(ctx, raw);
  if (resumed) return resumed;
  const cur = startCursor(ctx, raw);
  let restarted = false;

  for (let pages = 0; pages < MAX_PAGES && ctx.hasTime(); pages++) {
    const result = await ctx.gateway.fetchChanges(
      ctx.tokens,
      cur.token ?? undefined,
      cur.page,
      cur.window
    );
    if (result.isFailure) {
      if (restarted || !(result.error instanceof CalendarSyncTokenExpiredError)) throw result.error;
      restarted = true;
      ctx.report.restarts += 1;
      Object.assign(cur, freshFullSync(ctx, true));
      continue;
    }
    const changes = result.value;
    await applyPage(ctx, changes, cur.seen);
    if (changes.nextPageToken) {
      cur.page = changes.nextPageToken;
      continue;
    }
    const next = changes.nextSyncToken ?? cur.token;
    const horizon = cur.horizon ?? ctx.now.toISOString();
    if (cur.replace) return verifyLinks(ctx, next, '', cur.seen, horizon);
    return finished(ctx, next, horizon);
  }
  return paused(ctx, cur);
}

/**
 * The saved state belongs to the Google account it was made for. After a reconnect to another account its
 * token means nothing and the sync starts over (a replacement sync, which also checks every link).
 *
 * Links are scoped to the Google account they were made under (calendarEventLink.googleAccount) and are
 * never deleted on a switch: only the active account's links are used to find an event's appointment
 * (import dedupe), to check links, and to decide what is written to Google. So A to B to A finds A's
 * links again and imports nothing twice. The rule that never duplicates: an appointment that has a
 * link under another account is not exported to the active account. It could be a copy of an event
 * the active calendar cannot see, and a link is unique per appointment, so it is left alone until its
 * own account returns; only appointments with no link at all are created as new events.
 * Nothing wrote links before the account column existed (the sync tick ships with it), so every link
 * names its account.
 */
async function forgetOtherAccount(ctx: SyncContext, saved: string | null): Promise<string | null> {
  const known = decodeState(saved)?.k;
  if (known === undefined || known === ctx.mailbox.account) return saved;
  // Saved before anything is imported, naming the new account: a retry after a failure starts from it.
  // The first sync is a replacement.
  const reset = encodeState(ctx, { t: null, r: 1, h: ctx.now.toISOString() });
  await ctx.prisma.emailMailbox.updateMany({
    where: { id: ctx.mailbox.id, tenantId: ctx.mailbox.tenantId },
    data: { calendarSyncToken: reset },
  });
  ctx.rememberState?.(reset);
  return reset;
}
/** A round that stopped during the check after a replacement sync carries on with that check. */
function resumeVerification(ctx: SyncContext, raw: string | null): Promise<PullResult> | null {
  const saved = decodeState(raw);
  if (typeof saved?.v !== 'string') return null;
  return verifyLinks(ctx, saved.t, saved.v, null, saved.h ?? ctx.now.toISOString());
}

/** A completed round: Google's token, with when the window it covers began. */
function finished(ctx: SyncContext, token: string | null, horizon: string): PullResult {
  // No token from Google: nothing to keep a window for; the next round reads the calendar again.
  return { syncToken: token && encodeState(ctx, { t: token, h: horizon }), complete: true };
}

/** The state to carry on from: the page cut short, or the token as it was when nothing was read. */
function paused(ctx: SyncContext, cur: Cursor): PullResult {
  // Always saved, even before a first page: the retry counts moved, and a first full sync that stops has
  // already written appointments, so it restarts as a replacement that checks their links.
  const initial = cur.token === null;
  const horizon = cur.horizon ?? ctx.now.toISOString();
  const state: State = { t: cur.token, p: cur.page, h: horizon };
  if (cur.replace || initial) state.r = 1;
  return { syncToken: encodeState(ctx, state, cur.window), complete: false };
}
/**
 * Applies one page (events first, then deletions). What the round's time cannot get to is queued by id,
 * with 0 attempts, and read from Google again first thing next round: the page is not replayed and the
 * cursor moves on, so a long page cannot starve the rounds that follow it.
 */
async function applyPage(
  ctx: SyncContext,
  changes: { events: ExternalCalendarEvent[]; deletedEventIds: string[] },
  seen: Set<string> | null
): Promise<void> {
  const { events, deletedEventIds } = changes;
  for (let n = 0; n < events.length + deletedEventIds.length; n++) {
    const event = events[n];
    const id = event ? event.externalId : deletedEventIds[n - events.length];
    if (!ctx.hasTime()) {
      if (id && !ctx.failed.has(id)) ctx.failed.set(id, 0);
      continue;
    }
    if (id) seen?.add(id);
    await item(ctx, id, () => (event ? applyEvent(ctx, event) : applyCancelled(ctx, id)));
  }
}
/**
 * An event that fails to apply is counted and remembered in the saved state, and tried again in the
 * next rounds (ITEM_ATTEMPTS in all), so one bad event cannot hold the sync back and a transient failure
 * does not lose a change. Many failing at once is systemic, and fails the round instead. Only its id
 * and error code are logged, never its content.
 */
async function item(ctx: SyncContext, id: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
    ctx.failed.delete(id);
  } catch (error) {
    const stops =
      error instanceof CalendarAuthenticationError || error instanceof CalendarRateLimitError;
    const failing = [...ctx.failed.values()].filter((n) => n > 0).length;
    if (stops || (failing >= MAX_FAILED_ITEMS && !ctx.failed.get(id))) throw error;
    const attempts = (ctx.failed.get(id) ?? 0) + 1;
    ctx.failed.set(id, attempts);
    ctx.report.itemFailures += 1;
    console.warn('[calendar-sync] event not applied', {
      googleEventId: id,
      attempts,
      ...errorCause(error),
    });
  }
}

/** Reads the events that failed earlier again, from Google, and applies them. */
async function retryFailed(ctx: SyncContext): Promise<void> {
  for (const id of [...ctx.failed.keys()]) {
    if (!ctx.hasTime()) return;
    await item(ctx, id, () => refetch(ctx, id));
  }
}

/** One event by id: gone or cancelled cancels its appointment, otherwise it is applied. */
async function refetch(ctx: SyncContext, googleEventId: string): Promise<void> {
  const result = await ctx.gateway.getEvent(ctx.tokens, googleEventId);
  if (result.isFailure) throw result.error;
  const event = result.value;
  if (!event || event.status === 'cancelled') await applyCancelled(ctx, googleEventId);
  else await applyEvent(ctx, event);
}
/**
 * After a full sync that replaced an expired token: deletions and privacy changes made while the
 * token was lost are not reported again, and a full sync only lists its window, so a missing link may
 * be deleted, restored, made private or just moved. Each link not seen this round (marked ones too: a
 * restored event comes back through them) is asked for by id: gone means cancelled, still there means
 * updated. In batches by link id, resumed where the time ran out or Google's rate limit was hit; the
 * new sync token is kept only once every link has been checked.
 */
async function verifyLinks(
  ctx: SyncContext,
  syncToken: string | null,
  after: string,
  seen: Set<string> | null,
  horizon: string
): Promise<PullResult> {
  let last = after;
  for (;;) {
    const links = await ctx.prisma.calendarEventLink.findMany({
      where: {
        tenantId: ctx.mailbox.tenantId,
        mailboxId: ctx.mailbox.id,
        ...activeAccountLinks(ctx),
        appointmentId: { not: null },
        id: { gt: last },
      },
      orderBy: { id: 'asc' },
      take: VERIFY_BATCH,
    });
    if (links.length === 0) return finished(ctx, syncToken, horizon);
    for (const link of links) {
      if (!ctx.hasTime()) return pausedVerifying(ctx, syncToken, last, horizon);
      const wait = seen?.has(link.googleEventId)
        ? undefined
        : await verifyLink(ctx, link.googleEventId);
      if (wait !== undefined) return pausedVerifying(ctx, syncToken, last, horizon, wait);
      last = link.id;
    }
  }
}

function pausedVerifying(
  ctx: SyncContext,
  syncToken: string | null,
  last: string,
  horizon: string,
  retryAfterMs?: number
): PullResult {
  const syncState = encodeState(ctx, { t: syncToken, v: last, h: horizon });
  return { syncToken: syncState, complete: false, retryAfterMs };
}

/** Checks one link; when Google's rate limit stopped it, how long to wait (ms) before asking again. */
async function verifyLink(ctx: SyncContext, googleEventId: string): Promise<number | undefined> {
  try {
    await item(ctx, googleEventId, () => refetch(ctx, googleEventId));
    return undefined;
  } catch (error) {
    if (!(error instanceof CalendarRateLimitError)) throw error;
    return Math.max(error.retryAfterSeconds * 1000, MIN_RATE_WAIT_MS);
  }
}
const GOOGLE_CANCELLED_REASON = 'Cancelled in Google Calendar';
const PRIVATE_REASON = 'Made private in Google Calendar';
const isActive = (a: { status: string }) =>
  (ACTIVE_STATUSES as readonly string[]).includes(a.status);

/**
 * Changes an appointment and its link together (a failed second write must not leave the first), and
 * only if the appointment was not edited since it was read: false means a local edit got in first.
 */
async function updateBoth(
  ctx: SyncContext,
  appointment: { id: string; updatedAt: Date },
  appointmentData: Record<string, unknown>,
  linkId: string,
  linkData: Record<string, unknown>
): Promise<boolean> {
  const { tenantId } = ctx.mailbox;
  return ctx.prisma.$transaction(async (tx: any) => {
    const where = { id: appointment.id, tenantId, updatedAt: appointment.updatedAt };
    const { count } = await tx.appointment.updateMany({ where, data: appointmentData });
    if (count === 0) return false;
    const fresh = await tx.appointment.findFirst({ where: { id: appointment.id, tenantId } });
    await tx.calendarEventLink.update({
      where: { id: linkId, tenantId },
      data: { ...linkData, localSyncedAt: fresh.updatedAt },
    });
    return true;
  });
}

/** A local edit got in between the read and the write: decide again once, with it in view. */
async function decideAgain(
  ctx: SyncContext,
  event: ExternalCalendarEvent,
  retry: boolean,
  run: (link: any) => Promise<void>
): Promise<void> {
  const link = retry ? await findLink(ctx, event.externalId) : null;
  if (link) return run(link);
  // Edited again during the second try: fail the round so the event is delivered again, not dropped.
  if (!retry) throw new Error('appointment edited while the sync was writing to it');
  ctx.report.skipped += 1;
}

async function findLink(ctx: SyncContext, googleEventId: string) {
  return ctx.prisma.calendarEventLink.findFirst({
    where: {
      tenantId: ctx.mailbox.tenantId,
      mailboxId: ctx.mailbox.id,
      ...activeAccountLinks(ctx),
      googleEventId,
    },
  });
}

/** A new or changed event. */
async function applyEvent(ctx: SyncContext, event: ExternalCalendarEvent): Promise<void> {
  if (!event.externalId) return;
  // A time that cannot be read would fail every retry: skip the event, not the sync.
  if ([event.startTime, event.endTime, event.lastModified].some((d) => isNaN(d.getTime()))) {
    ctx.report.skipped += 1;
    return;
  }
  const link = await findLink(ctx, event.externalId);
  if (link) return updateFromEvent(ctx, link, event);
  const own = await adoptOwnEvent(ctx, event);
  if (own) return updateFromEvent(ctx, own, event);
  return importEvent(ctx, event);
}

/**
 * An event Aurora made from one of this user's appointments (it says so in a private property) that has
 * no link here: the link was lost (the mailbox row was rebuilt, say). It is linked again to its
 * appointment, so the event is not imported as a second appointment, and then compared like any linked
 * event (the newer side wins). An appointment that already has a link in this mailbox is not taken: the
 * event is then a copy the user made in Google, and is imported on its own.
 */
async function adoptOwnEvent(ctx: SyncContext, event: ExternalCalendarEvent) {
  if (!event.auroraAppointmentId) return null;
  const { tenantId, id: mailboxId, userId } = ctx.mailbox;
  const appointment = await ctx.prisma.appointment.findFirst({
    where: { id: event.auroraAppointmentId, tenantId, organizerId: userId },
  });
  if (!appointment) return null;
  const linked = await ctx.prisma.calendarEventLink.findFirst({
    where: { tenantId, mailboxId, appointmentId: appointment.id },
  });
  if (linked) return null;
  try {
    return await ctx.prisma.calendarEventLink.create({
      data: {
        tenantId,
        mailboxId,
        googleAccount: ctx.mailbox.account,
        appointmentId: appointment.id,
        googleEventId: event.externalId,
        origin: 'AURORA',
      },
    });
  } catch (error) {
    if (prismaCode(error) !== 'P2002') throw error;
    return null;
  }
}

async function importEvent(ctx: SyncContext, event: ExternalCalendarEvent): Promise<void> {
  if (isPersonal(event)) {
    ctx.report.skipped += 1;
    return;
  }
  const { tenantId, id: mailboxId, userId } = ctx.mailbox;
  try {
    await ctx.prisma.$transaction(async (tx: any) => {
      const appointment = await tx.appointment.create({
        data: {
          ...appointmentFields(event),
          tenantId,
          organizerId: userId,
          appointmentType: 'MEETING',
          status: 'SCHEDULED',
          externalCalendarId: event.externalId,
        },
      });
      await tx.calendarEventLink.create({
        data: {
          tenantId,
          mailboxId,
          googleAccount: ctx.mailbox.account,
          appointmentId: appointment.id,
          googleEventId: event.externalId,
          origin: 'GOOGLE',
          etag: event.etag ?? null,
          remoteUpdatedAt: event.lastModified,
          localSyncedAt: appointment.updatedAt,
        },
      });
    });
    ctx.report.imported += 1;
  } catch (error) {
    // Our link exists already (another replica made it first): the transaction made no appointment.
    // Any other unique clash is a real failure.
    if (prismaCode(error) !== 'P2002' || !(await findLink(ctx, event.externalId))) throw error;
    ctx.report.skipped += 1;
  }
}

async function updateFromEvent(
  ctx: SyncContext,
  link: any,
  event: ExternalCalendarEvent,
  retry = true
): Promise<void> {
  // A create the push has not finished: the event is Aurora's own, and the push settles the link.
  if (link.pending) return;
  if (link.etag && event.etag && link.etag === event.etag) return;
  // An older version of the event than the one already applied (a late or retried round): ignore it.
  if (link.remoteUpdatedAt && event.lastModified.getTime() < link.remoteUpdatedAt.getTime()) {
    ctx.report.skipped += 1;
    return;
  }
  if (!link.appointmentId) {
    ctx.report.skipped += 1;
    return;
  }
  const { tenantId } = ctx.mailbox;
  const appointment = await ctx.prisma.appointment.findFirst({
    where: { id: link.appointmentId, tenantId },
  });
  if (!appointment) {
    ctx.report.skipped += 1;
    return;
  }
  // Made private in Google after it was copied: Aurora is shared, so the copy goes.
  if (isPersonal(event)) return redactAppointment(ctx, link, appointment, event, retry);
  // Restored in Google after Google cancelled it or made it private: back. Cancelled or done here: stays.
  const restoring =
    link.remoteCancelledAt &&
    [GOOGLE_CANCELLED_REASON, PRIVATE_REASON].includes(appointment.cancellationReason);
  if (!isActive(appointment) && !restoring) {
    ctx.report.skipped += 1;
    return;
  }
  const changedHere =
    link.localSyncedAt === null || appointment.updatedAt.getTime() > link.localSyncedAt.getTime();
  // Both changed: the newer wins. Aurora's stays, and the push sends it to Google.
  if (changedHere && appointment.updatedAt.getTime() > event.lastModified.getTime()) {
    ctx.report.skipped += 1;
    return;
  }
  const restored = { status: 'SCHEDULED', cancelledAt: null, cancellationReason: null };
  const written = await updateBoth(
    ctx,
    appointment,
    { ...appointmentFields(event), ...(restoring ? restored : {}) },
    link.id,
    { etag: event.etag ?? null, remoteUpdatedAt: event.lastModified, remoteCancelledAt: null }
  );
  if (!written)
    return decideAgain(ctx, event, retry, (again) => updateFromEvent(ctx, again, event, false));
  ctx.report.updated += 1;
}

/**
 * An event copied and now private in Google: its details leave the shared appointment, which is
 * cancelled. Only what was imported and is still live is redacted (an appointment made in Aurora or
 * already done keeps its content). The link stays, marked gone, so it is never copied again or
 * written to.
 */
async function redactAppointment(
  ctx: SyncContext,
  link: any,
  appointment: any,
  event: ExternalCalendarEvent,
  retry: boolean
): Promise<void> {
  const linkData = {
    etag: event.etag ?? null,
    remoteUpdatedAt: event.lastModified,
    remoteCancelledAt: ctx.now,
  };
  if (link.origin !== 'GOOGLE' || !isActive(appointment)) {
    await ctx.prisma.calendarEventLink.update({
      where: { id: link.id, tenantId: ctx.mailbox.tenantId },
      data: linkData,
    });
    ctx.report.skipped += 1;
    return;
  }
  const redacted = {
    title: 'Private event',
    description: null,
    location: null,
    status: 'CANCELLED',
    cancelledAt: ctx.now,
    cancellationReason: PRIVATE_REASON,
  };
  if (await updateBoth(ctx, appointment, redacted, link.id, linkData)) ctx.report.skipped += 1;
  else await decideAgain(ctx, event, retry, (again) => updateFromEvent(ctx, again, event, false));
}

/** An event deleted or cancelled in Google cancels its appointment (kept, with the reason). */
export async function applyCancelled(
  ctx: SyncContext,
  googleEventId: string,
  retry = true
): Promise<void> {
  const link = await findLink(ctx, googleEventId);
  if (!link || link.remoteCancelledAt || link.pending) return;
  const { tenantId } = ctx.mailbox;
  const appointment = link.appointmentId
    ? await ctx.prisma.appointment.findFirst({ where: { id: link.appointmentId, tenantId } })
    : null;
  if (appointment && isActive(appointment)) {
    const cancelled = {
      status: 'CANCELLED',
      cancelledAt: ctx.now,
      cancellationReason: GOOGLE_CANCELLED_REASON,
    };
    // The etag goes too: the event coming back (restored) has another one and must be looked at.
    const linkData = { remoteCancelledAt: ctx.now, etag: null };
    if (await updateBoth(ctx, appointment, cancelled, link.id, linkData)) {
      ctx.report.cancelled += 1;
    } else if (retry) {
      await applyCancelled(ctx, googleEventId, false);
    } else {
      throw new Error('appointment edited while the sync was writing to it');
    }
    return;
  }
  await ctx.prisma.calendarEventLink.update({
    where: { id: link.id, tenantId },
    data: { remoteCancelledAt: ctx.now, etag: null },
  });
}
