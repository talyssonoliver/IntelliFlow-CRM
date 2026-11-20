/**
 * MVP-013, Aurora to Google: the user's appointments are written to their primary Google calendar.
 *
 * - Appointments that have no link yet become events, created with an id made from the appointment
 *   (eventIdFor), so a create whose answer was lost and is tried again finds its own event.
 * - Linked appointments changed since they were last synced are patched (only what the CRM owns of
 *   the event: guests, a Meet link and reminders on Google's side stay).
 * - A cancelled appointment, or a deleted one, takes the event it made with it. An event that came
 *   from Google is never deleted from here: cancelling its appointment in Aurora leaves the user's
 *   own event alone. An event Google no longer has is not a reason to cancel the appointment here:
 *   the pull cancels it when Google reports the deletion.
 * - No guests are written, so Google never emails anyone on the user's behalf.
 * - Every query carries the mailbox's tenant and the user: only the user's own appointments go out.
 *
 * One item failing on its own (Google refused one event) is counted and the round goes on; a
 * withdrawn permission or a rate limit stops the round and is thrown for the caller to handle.
 */
import { createHash } from 'node:crypto';
import type { CalendarAppointmentLike } from '@intelliflow/adapters';
import {
  CalendarAuthenticationError,
  CalendarEventNotFoundError,
  CalendarRateLimitError,
} from '@intelliflow/application';
import { errorCause } from '../email/mail-sync-report';
import {
  ACTIVE_STATUSES,
  appointmentFields,
  prismaCode,
  type SyncContext,
} from './google-calendar-links';

/** An appointment that ended longer ago than this is left alone: the sync is for what is coming up. */
export const PAST_GRACE_MS = 24 * 60 * 60_000;

/** Writes to Google per round; the rest is picked up next round. */
const MAX_WRITES = 50;
/** Links read per query while looking for appointments changed in Aurora (paged by link id). */
const LINKS_PAGE = 100;
/**
 * A refused item waits 5 minutes after its first failure, then twice as long each time, up to a day:
 * it is never given up on, so an edit that fixes it (or Google changing its mind) gets through within a day.
 */
const RETRY_BASE_MS = 5 * 60_000;
const RETRY_MAX_MS = 24 * 60 * 60_000;

/**
 * The id an Aurora appointment's event is created with in a mailbox's calendar. Google keeps ids
 * unique per calendar and accepts the characters 0-9 and a-v (base32hex), 5 to 1024 of them: a sha-256
 * in hex fits. The same appointment always gets the same id, so a create whose answer was lost and is
 * tried again finds its own event (409) instead of making a second one.
 */
export function eventIdFor(mailboxId: string, appointmentId: string): string {
  return createHash('sha256').update(`${mailboxId}:${appointmentId}`).digest('hex');
}

/**
 * An appointment row as the adapter writes it to Google. No guests: an invitation would email people
 * on the user's behalf, which a sync must never do.
 */
export function toCalendarAppointment(row: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  status: string;
}): CalendarAppointmentLike {
  return {
    id: { value: row.id },
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.startTime,
    endTime: row.endTime,
    attendeeIds: [],
    isCancelled: row.status === 'CANCELLED',
  };
}

export interface PushResult {
  /** False when more was left than one round writes. */
  complete: boolean;
}

/** An error that ends the round rather than one item. */
function endsRound(error: unknown): boolean {
  return error instanceof CalendarAuthenticationError || error instanceof CalendarRateLimitError;
}

/**
 * Runs one item: an error of its own is counted, logged (its id and error code, never its content)
 * and swallowed, anything else ends the round. The item is still a candidate next round: the queries
 * select by what is not yet written.
 */
async function item(ctx: SyncContext, id: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (endsRound(error)) throw error;
    ctx.report.itemFailures += 1;
    console.warn('[calendar-sync] push item failed', { id, ...errorCause(error) });
  }
}

function must<T>(result: { isFailure: boolean; error?: unknown; value?: T }): T {
  if (result.isFailure) throw result.error;
  return result.value as T;
}

/**
 * Writes Aurora's changes to Google. The patch step runs only when the pull finished: a patch could
 * otherwise reach an event the user deleted in Google that the pull has not heard of yet.
 */
export async function pushChanges(
  ctx: SyncContext,
  options: { patch: boolean } = { patch: true }
): Promise<PushResult> {
  const cutoff = new Date(ctx.now.getTime() - PAST_GRACE_MS);
  let budget = MAX_WRITES;
  let complete = options.patch;
  const steps = options.patch
    ? [removeEvents, createEvents, patchEvents]
    : [removeEvents, createEvents];
  for (const step of steps) {
    if (budget <= 0 || !ctx.hasTime()) {
      complete = false;
      break;
    }
    const used = await step(ctx, cutoff, budget);
    budget -= used.writes;
    complete = complete && used.complete;
  }
  return { complete };
}
interface StepResult {
  writes: number;
  complete: boolean;
}

/** May this link be written to now? Not while it waits after a failure, unless its appointment was edited since. */
function eligible(ctx: SyncContext, link: any): boolean {
  if (!link.nextPushAt || link.nextPushAt.getTime() <= ctx.now.getTime()) return true;
  const edited = link.appointment?.updatedAt?.getTime() ?? 0;
  return edited > (link.updatedAt?.getTime() ?? 0);
}

/**
 * Pages the mailbox's links that match `where` by id and runs `work` on each one `wants` and that is
 * eligible, as it is found: a scan cannot use up the round's time before anything is written, and a
 * backlog is not hidden behind rows already in step. A failing item is remembered on its link (it waits,
 * later each time) and the round goes on.
 */
async function scanLinks(
  ctx: SyncContext,
  where: object,
  budget: number,
  wants: (link: any) => boolean,
  work: (link: any) => Promise<void>
): Promise<StepResult> {
  const { tenantId, id: mailboxId } = ctx.mailbox;
  let writes = 0;
  let after = '';
  for (;;) {
    const page: any[] = await ctx.prisma.calendarEventLink.findMany({
      where: { tenantId, mailboxId, id: { gt: after }, ...where },
      include: { appointment: true },
      orderBy: { id: 'asc' },
      take: LINKS_PAGE,
    });
    if (page.length === 0) return { writes, complete: true };
    after = page[page.length - 1].id;
    for (const link of page.filter((l) => wants(l) && eligible(ctx, l))) {
      if (writes >= budget || !ctx.hasTime()) return { writes, complete: false };
      writes += 1;
      await item(ctx, link.id, async () => {
        try {
          await work(link);
        } catch (error) {
          await failedAttempt(ctx, link, error);
          throw error;
        }
      });
    }
    if (!ctx.hasTime()) return { writes, complete: false };
  }
}

/**
 * Events to take down: the event of an appointment that was cancelled or deleted, or is no longer the
 * mailbox user's (reassigned), when Aurora made that event.
 */
async function removeEvents(ctx: SyncContext, _cutoff: Date, budget: number): Promise<StepResult> {
  const { tenantId, userId } = ctx.mailbox;
  const where = {
    origin: 'AURORA',
    remoteCancelledAt: null,
    OR: [
      { appointmentId: null },
      { appointment: { status: 'CANCELLED' } },
      { appointment: { organizerId: { not: userId } } },
    ],
  };
  return scanLinks(
    ctx,
    where,
    budget,
    () => true,
    async (link) => {
      must(await ctx.gateway.deleteEvent(ctx.tokens, link.googleEventId));
      // Its appointment is gone: nothing left to track. Otherwise keep the link, marked, so the
      // event is never made again (and a create that never finished is not finished later).
      if (link.appointmentId === null) {
        await ctx.prisma.calendarEventLink.delete({ where: { id: link.id, tenantId } });
      } else {
        await ctx.prisma.calendarEventLink.update({
          where: { id: link.id, tenantId },
          data: { remoteCancelledAt: ctx.now, pending: false },
        });
      }
      ctx.report.pushedDeleted += 1;
    }
  );
}
/** Items not waiting after a failure. */
function due(ctx: SyncContext) {
  return { OR: [{ nextPushAt: null }, { nextPushAt: { lte: ctx.now } }] };
}

/** A link's write failed: it waits, later and less often each time, and the rest goes on. */
async function failedAttempt(ctx: SyncContext, link: any, error: unknown): Promise<void> {
  if (endsRound(error)) return; // a rate limit or a lost permission is not this item's fault
  const attempts = link.pushAttempts ?? 0;
  const wait = Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS);
  await ctx.prisma.calendarEventLink.update({
    where: { id: link.id, tenantId: ctx.mailbox.tenantId },
    data: { pushAttempts: attempts + 1, nextPushAt: new Date(ctx.now.getTime() + wait) },
  });
}

/** Does the event Google has hold what the appointment says? */
function sameContent(event: any, row: any): boolean {
  return (
    event.title === row.title &&
    (event.location ?? null) === (row.location ?? null) &&
    (event.description ?? null) === (row.description ?? null) &&
    event.startTime.getTime() === row.startTime.getTime() &&
    event.endTime.getTime() === row.endTime.getTime()
  );
}

/**
 * Events to make: the user's live appointments that have no link in this calendar yet, and creates
 * that did not finish. The link is written first, pending, with the id the event will have: it says
 * the event is Aurora's (the pull leaves it alone) and a lost answer cannot leave the appointment
 * unlinked.
 */
async function createEvents(ctx: SyncContext, cutoff: Date, budget: number): Promise<StepResult> {
  const { tenantId, id: mailboxId, userId } = ctx.mailbox;
  const live = {
    tenantId,
    organizerId: userId,
    status: { in: [...ACTIVE_STATUSES] },
    endTime: { gte: cutoff },
  };
  const pending: any[] = await ctx.prisma.calendarEventLink.findMany({
    where: {
      tenantId,
      mailboxId,
      pending: true,
      remoteCancelledAt: null,
      ...due(ctx),
      appointment: live,
    },
    include: { appointment: true },
    orderBy: { id: 'asc' },
    take: budget,
  });
  const fresh: any[] = await ctx.prisma.appointment.findMany({
    where: { ...live, calendarLinks: { none: { mailboxId } } },
    orderBy: { startTime: 'asc' },
    take: budget - pending.length,
  });
  let writes = 0;
  for (const link of pending) {
    if (!ctx.hasTime()) return { writes, complete: false };
    writes += 1;
    await item(ctx, link.id, () => makeEvent(ctx, link, link.appointment));
  }
  for (const row of fresh) {
    if (!ctx.hasTime()) return { writes, complete: false };
    writes += 1;
    await item(ctx, row.id, async () => {
      const link = await startLink(ctx, row);
      if (link) await makeEvent(ctx, link, row);
    });
  }
  return { writes, complete: pending.length + fresh.length < budget };
}

/** The pending link of an appointment; null when it has a link already (made meanwhile). */
async function startLink(ctx: SyncContext, row: any): Promise<any | null> {
  const { tenantId, id: mailboxId } = ctx.mailbox;
  try {
    return await ctx.prisma.calendarEventLink.create({
      data: {
        tenantId,
        mailboxId,
        appointmentId: row.id,
        googleEventId: eventIdFor(mailboxId, row.id),
        origin: 'AURORA',
        pending: true,
      },
    });
  } catch (error) {
    if (prismaCode(error) === 'P2002') return null;
    throw error;
  }
}

/** Creates the event of a pending link, then settles the link. */
async function makeEvent(ctx: SyncContext, link: any, row: any): Promise<void> {
  try {
    const event = must(
      await ctx.gateway.createEvent(ctx.tokens, toCalendarAppointment(row), `${row.id}:create`, {
        eventId: link.googleEventId,
      })
    );
    // An event Google answers 409 for that is cancelled there (deleted by the user after an earlier
    // create whose answer was lost) is not brought back: the link is marked, like a deletion. One that
    // is there with older content (the appointment was edited between the tries) is patched next.
    const gone = event.status === 'cancelled';
    const { tenantId } = ctx.mailbox;
    const settled = {
      pending: false,
      etag: event.etag ?? null,
      remoteUpdatedAt: event.lastModified,
      ...(gone ? { remoteCancelledAt: ctx.now } : {}),
      localSyncedAt: sameContent(event, row) ? row.updatedAt : null,
      pushAttempts: 0,
      nextPushAt: null,
    };
    // The event was deleted in Google: the appointment is cancelled, as when the pull hears of a
    // deletion, and the link settled with it.
    await ctx.prisma.$transaction(async (tx: any) => {
      if (gone) {
        await tx.appointment.updateMany({
          where: { id: row.id, tenantId, status: { in: [...ACTIVE_STATUSES] } },
          data: {
            status: 'CANCELLED',
            cancelledAt: ctx.now,
            cancellationReason: 'Cancelled in Google Calendar',
          },
        });
      }
      // The event is there with other content (the appointment was edited, or the user edited the event,
      // between the tries): the newer wins, as in the pull. Google's newer edit is adopted; otherwise the
      // next patch sends Aurora's.
      if (
        !gone &&
        !sameContent(event, row) &&
        event.lastModified.getTime() > row.updatedAt.getTime()
      ) {
        const adopted = await tx.appointment.updateMany({
          where: { id: row.id, tenantId, updatedAt: row.updatedAt },
          data: appointmentFields(event),
        });
        if (adopted.count > 0) {
          const fresh = await tx.appointment.findFirst({ where: { id: row.id, tenantId } });
          settled.localSyncedAt = fresh.updatedAt;
        }
      }
      await tx.calendarEventLink.update({ where: { id: link.id, tenantId }, data: settled });
    });
    if (gone) ctx.report.cancelled += 1;
    else ctx.report.pushedCreated += 1;
  } catch (error) {
    await failedAttempt(ctx, link, error);
    throw error;
  }
}
/** A link whose appointment was edited in Aurora since the last sync. */
function isEdited(link: any): boolean {
  return (
    link.localSyncedAt === null ||
    link.appointment.updatedAt.getTime() > link.localSyncedAt.getTime()
  );
}

/** Events to change: linked live appointments of the user edited in Aurora since they were last synced. */
async function patchEvents(ctx: SyncContext, cutoff: Date, budget: number): Promise<StepResult> {
  const { tenantId, userId } = ctx.mailbox;
  const where = {
    remoteCancelledAt: null,
    pending: false,
    appointment: {
      tenantId,
      organizerId: userId,
      status: { in: [...ACTIVE_STATUSES] },
      endTime: { gte: cutoff },
    },
  };
  return scanLinks(ctx, where, budget, isEdited, (link) => patchOne(ctx, link));
}
async function patchOne(ctx: SyncContext, link: any): Promise<void> {
  const appointment = link.appointment;
  const result = await ctx.gateway.patchEvent(
    ctx.tokens,
    link.googleEventId,
    toCalendarAppointment(appointment)
  );
  if (result.isFailure) {
    // Google no longer has the event. A deletion there reaches us as a cancelled event in the next
    // read, which cancels the appointment: doing it here too could cancel appointments of a calendar
    // that is not the one these links were made for (another Google account). Marked as seen, so it
    // is tried again only when the appointment changes.
    if (result.error instanceof CalendarEventNotFoundError) {
      await ctx.prisma.calendarEventLink.update({
        where: { id: link.id, tenantId: ctx.mailbox.tenantId },
        data: { localSyncedAt: appointment.updatedAt },
      });
      ctx.report.skipped += 1;
      return;
    }
    throw result.error;
  }
  const event = result.value;
  await ctx.prisma.calendarEventLink.update({
    where: { id: link.id, tenantId: ctx.mailbox.tenantId },
    data: {
      etag: event.etag ?? null,
      remoteUpdatedAt: event.lastModified,
      localSyncedAt: appointment.updatedAt,
      pushAttempts: 0,
      nextPushAt: null,
    },
  });
  ctx.report.pushedUpdated += 1;
}
