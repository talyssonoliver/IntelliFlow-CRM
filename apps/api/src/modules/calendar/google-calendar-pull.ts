/**
 * MVP-013, Google to Aurora: the events that changed in the user's primary calendar since the last
 * round (Google's incremental sync token) become, change or cancel appointments.
 * Idempotent by event id (the link table's unique keys; an appointment and its link are made in one
 * transaction). An event coming back with the etag we stored is our own write and is skipped; if both
 * sides changed, the newer wins. Every query carries the mailbox's tenant. Private and confidential
 * events are not copied: Aurora is shared with the user's team.
 */
import {
  CalendarSyncTokenExpiredError,
  type ExternalCalendarEvent,
} from '@intelliflow/application';
import {
  ACTIVE_STATUSES,
  appointmentFields,
  isPersonal,
  prismaCode,
  type SyncContext,
} from './google-calendar-links';

/** Pages read per round (250 events each); a longer full sync carries on next round. */
const MAX_PAGES = 20;
/** A full sync looks this far ahead: Google expands a repeating event for every date in the window. */
const FULL_SYNC_AHEAD_MS = 365 * 24 * 60 * 60_000;

export interface PullResult {
  /** The token to sync from next; a round stopped mid-way carries where to carry on. */
  syncToken: string | null;
  /** False when the round stopped early (the next round carries on). */
  complete: boolean;
}

type Window = { timeMin: Date; timeMax: Date };

/**
 * Where an unfinished round carries on, kept in the token column: `p` the page to read again, `a`/`b`
 * the full-sync window (Google refuses a changed query), `r` the full sync replaces an expired token,
 * `v` the check that follows it is under way, at this link id ("" = the start).
 */
interface State {
  t: string | null;
  p?: string;
  a?: string;
  b?: string;
  r?: 1;
  v?: string;
}

const STATE_PREFIX = 'resume:';
const VERIFY_BATCH = 100;

function fullWindow(now: Date): Window {
  return { timeMin: now, timeMax: new Date(now.getTime() + FULL_SYNC_AHEAD_MS) };
}

function encodeState(state: State, window?: Window): string {
  const full = window
    ? { ...state, a: window.timeMin.toISOString(), b: window.timeMax.toISOString() }
    : state;
  return STATE_PREFIX + JSON.stringify(full);
}

function decodeState(stored: string | null): State | null {
  if (!stored?.startsWith(STATE_PREFIX)) return null;
  try {
    const state = JSON.parse(stored.slice(STATE_PREFIX.length)) as State;
    return typeof state.p === 'string' || typeof state.v === 'string' ? state : null;
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
  /** Event ids a full sync read this round; null once the sync spans rounds. */
  seen: Set<string> | null;
  /** The token column as it was, for a round that reads nothing. */
  stored: string | null;
}

function freshFullSync(ctx: SyncContext, replace: boolean): Omit<Cursor, 'stored'> {
  return { token: null, page: undefined, window: fullWindow(ctx.now), replace, seen: new Set() };
}

function startCursor(ctx: SyncContext, raw: string | null): Cursor {
  const saved = decodeState(raw);
  const stored = raw?.startsWith(STATE_PREFIX) ? null : raw;
  if (saved) {
    const window = stateWindow(saved);
    return { token: saved.t, page: saved.p, window, replace: !!saved.r, seen: null, stored };
  }
  if (stored) {
    return {
      token: stored,
      page: undefined,
      window: undefined,
      replace: false,
      seen: null,
      stored,
    };
  }
  return { ...freshFullSync(ctx, false), stored };
}

/** Reads Google's changes page by page and applies each; throws what Google answered on failure. */
export async function pullChanges(ctx: SyncContext, raw: string | null): Promise<PullResult> {
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
    if (!(await applyPage(ctx, changes, cur.seen))) return paused(cur);
    if (changes.nextPageToken) {
      cur.page = changes.nextPageToken;
      continue;
    }
    const next = changes.nextSyncToken ?? cur.token;
    if (cur.replace) return verifyLinks(ctx, next, '', cur.seen);
    return { syncToken: next, complete: true };
  }
  return paused(cur);
}

/** A round that stopped during the check after a replacement sync carries on with that check. */
function resumeVerification(ctx: SyncContext, raw: string | null): Promise<PullResult> | null {
  const saved = decodeState(raw);
  return typeof saved?.v === 'string' ? verifyLinks(ctx, saved.t, saved.v, null) : null;
}

/** The state to carry on from: the page cut short, or the token as it was when nothing was read. */
function paused(cur: Cursor): PullResult {
  const state: State = { t: cur.token, p: cur.page, ...(cur.replace ? { r: 1 as const } : {}) };
  return { syncToken: cur.page ? encodeState(state, cur.window) : cur.stored, complete: false };
}

/** Applies one page; false when the round's time ran out part way through it. */
async function applyPage(
  ctx: SyncContext,
  changes: { events: ExternalCalendarEvent[]; deletedEventIds: string[] },
  seen: Set<string> | null
): Promise<boolean> {
  for (const event of changes.events) {
    if (!ctx.hasTime()) return false;
    if (event.externalId) seen?.add(event.externalId);
    await applyEvent(ctx, event);
  }
  for (const id of changes.deletedEventIds) {
    if (!ctx.hasTime()) return false;
    seen?.add(id);
    await applyCancelled(ctx, id);
  }
  return true;
}

/**
 * After a full sync that replaced an expired token: deletions and privacy changes made while the
 * token was lost are not reported again, and a full sync only lists its window, so a missing link may
 * be deleted, made private or just moved. Each live link not seen this round is asked for by id: gone
 * means cancelled, still there means updated. In batches by link id, resumed where the time ran out;
 * the new sync token is kept only once every link has been checked.
 */
async function verifyLinks(
  ctx: SyncContext,
  syncToken: string | null,
  after: string,
  seen: Set<string> | null
): Promise<PullResult> {
  let last = after;
  for (;;) {
    const links = await ctx.prisma.calendarEventLink.findMany({
      where: {
        tenantId: ctx.mailbox.tenantId,
        mailboxId: ctx.mailbox.id,
        remoteCancelledAt: null,
        appointmentId: { not: null },
        id: { gt: last },
      },
      orderBy: { id: 'asc' },
      take: VERIFY_BATCH,
    });
    if (links.length === 0) return { syncToken, complete: true };
    for (const link of links) {
      if (!ctx.hasTime()) {
        return { syncToken: encodeState({ t: syncToken, v: last }), complete: false };
      }
      last = link.id;
      if (!seen?.has(link.googleEventId)) await verifyLink(ctx, link.googleEventId);
    }
  }
}

async function verifyLink(ctx: SyncContext, googleEventId: string): Promise<void> {
  const result = await ctx.gateway.getEvent(ctx.tokens, googleEventId);
  if (result.isFailure) throw result.error;
  const event = result.value;
  if (!event || event.status === 'cancelled') return applyCancelled(ctx, googleEventId);
  return applyEvent(ctx, event);
}

const GOOGLE_CANCELLED_REASON = 'Cancelled in Google Calendar';

/** Changes an appointment and its link together (a failed second write must not leave the first). */
async function updateBoth(
  ctx: SyncContext,
  appointmentId: string,
  appointmentData: Record<string, unknown>,
  linkId: string,
  linkData: Record<string, unknown>
): Promise<void> {
  const { tenantId } = ctx.mailbox;
  await ctx.prisma.$transaction(async (tx: any) => {
    const updated = await tx.appointment.update({
      where: { id: appointmentId, tenantId },
      data: appointmentData,
    });
    await tx.calendarEventLink.update({
      where: { id: linkId },
      data: { ...linkData, localSyncedAt: updated.updatedAt },
    });
  });
}

async function findLink(ctx: SyncContext, googleEventId: string) {
  return ctx.prisma.calendarEventLink.findFirst({
    where: { tenantId: ctx.mailbox.tenantId, mailboxId: ctx.mailbox.id, googleEventId },
  });
}

/** A new or changed event. */
async function applyEvent(ctx: SyncContext, event: ExternalCalendarEvent): Promise<void> {
  if (!event.externalId) return;
  const link = await findLink(ctx, event.externalId);
  if (!link) return importEvent(ctx, event);
  return updateFromEvent(ctx, link, event);
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
    if (prismaCode(error) !== 'P2002') throw error;
    ctx.report.skipped += 1;
  }
}

async function updateFromEvent(
  ctx: SyncContext,
  link: any,
  event: ExternalCalendarEvent
): Promise<void> {
  if (link.etag && event.etag && link.etag === event.etag) return;
  if (!link.appointmentId) {
    ctx.report.skipped += 1;
    return;
  }
  if (isPersonal(event)) return redactAppointment(ctx, link, event);
  const { tenantId } = ctx.mailbox;
  const appointment = await ctx.prisma.appointment.findFirst({
    where: { id: link.appointmentId, tenantId },
  });
  // Restored in Google after Google cancelled it: back; cancelled or done here, or missing: stays.
  const restoring =
    link.remoteCancelledAt && appointment?.cancellationReason === GOOGLE_CANCELLED_REASON;
  const live = appointment && (ACTIVE_STATUSES as readonly string[]).includes(appointment.status);
  if (!live && !restoring) {
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
  await updateBoth(
    ctx,
    appointment.id,
    { ...appointmentFields(event), ...(restoring ? restored : {}) },
    link.id,
    { etag: event.etag ?? null, remoteUpdatedAt: event.lastModified, remoteCancelledAt: null }
  );
  ctx.report.updated += 1;
}

/**
 * An event copied and now private in Google: its details leave the shared appointment, which is
 * cancelled. The link stays, marked gone, so it is never copied again or written to.
 */
async function redactAppointment(
  ctx: SyncContext,
  link: any,
  event: ExternalCalendarEvent
): Promise<void> {
  const { tenantId } = ctx.mailbox;
  const appointment = await ctx.prisma.appointment.findFirst({
    where: { id: link.appointmentId, tenantId },
  });
  if (!appointment) return;
  await updateBoth(
    ctx,
    appointment.id,
    {
      title: 'Private event',
      description: null,
      location: null,
      status: 'CANCELLED',
      cancelledAt: ctx.now,
      cancellationReason: 'Made private in Google Calendar',
    },
    link.id,
    { etag: event.etag ?? null, remoteUpdatedAt: event.lastModified, remoteCancelledAt: ctx.now }
  );
  ctx.report.skipped += 1;
}

/** An event deleted or cancelled in Google cancels its appointment (kept, with the reason). */
export async function applyCancelled(ctx: SyncContext, googleEventId: string): Promise<void> {
  const link = await findLink(ctx, googleEventId);
  if (!link || link.remoteCancelledAt) return;
  const { tenantId } = ctx.mailbox;
  const appointment = link.appointmentId
    ? await ctx.prisma.appointment.findFirst({ where: { id: link.appointmentId, tenantId } })
    : null;
  if (appointment && (ACTIVE_STATUSES as readonly string[]).includes(appointment.status)) {
    await updateBoth(
      ctx,
      appointment.id,
      { status: 'CANCELLED', cancelledAt: ctx.now, cancellationReason: GOOGLE_CANCELLED_REASON },
      link.id,
      { remoteCancelledAt: ctx.now }
    );
    ctx.report.cancelled += 1;
    return;
  }
  await ctx.prisma.calendarEventLink.update({
    where: { id: link.id },
    data: { remoteCancelledAt: ctx.now },
  });
}
