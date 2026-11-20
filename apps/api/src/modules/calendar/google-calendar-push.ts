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
import { ACTIVE_STATUSES, prismaCode, type SyncContext } from './google-calendar-links';

/** An appointment that ended longer ago than this is left alone: the sync is for what is coming up. */
export const PAST_GRACE_MS = 24 * 60 * 60_000;

/** Writes to Google per round; the rest is picked up next round. */
const MAX_WRITES = 50;
/** Links read per query while looking for appointments changed in Aurora (paged by link id). */
const LINKS_PAGE = 100;

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

export async function pushChanges(ctx: SyncContext): Promise<PushResult> {
  const cutoff = new Date(ctx.now.getTime() - PAST_GRACE_MS);
  let budget = MAX_WRITES;
  let complete = true;
  for (const step of [removeEvents, createEvents, patchEvents]) {
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

/** Events to take down: a cancelled or deleted appointment's event, when Aurora made that event. */
async function removeEvents(ctx: SyncContext, _cutoff: Date, budget: number): Promise<StepResult> {
  const { tenantId, id: mailboxId } = ctx.mailbox;
  const links: any[] = await ctx.prisma.calendarEventLink.findMany({
    where: {
      tenantId,
      mailboxId,
      origin: 'AURORA',
      remoteCancelledAt: null,
      OR: [{ appointmentId: null }, { appointment: { status: 'CANCELLED' } }],
    },
    take: budget,
  });
  for (const link of links) {
    if (!ctx.hasTime()) return { writes: 0, complete: false };
    await item(ctx, link.id, async () => {
      must(await ctx.gateway.deleteEvent(ctx.tokens, link.googleEventId));
      // Its appointment is gone: nothing left to track. Otherwise keep the link, marked, so the
      // event is never made again.
      if (link.appointmentId === null) {
        await ctx.prisma.calendarEventLink.delete({ where: { id: link.id, tenantId } });
      } else {
        await ctx.prisma.calendarEventLink.update({
          where: { id: link.id, tenantId },
          data: { remoteCancelledAt: ctx.now },
        });
      }
      ctx.report.pushedDeleted += 1;
    });
  }
  return { writes: links.length, complete: links.length < budget };
}

/** Events to make: the user's live appointments that have no link in this calendar yet. */
async function createEvents(ctx: SyncContext, cutoff: Date, budget: number): Promise<StepResult> {
  const { tenantId, id: mailboxId, userId } = ctx.mailbox;
  const rows: any[] = await ctx.prisma.appointment.findMany({
    where: {
      tenantId,
      organizerId: userId,
      status: { in: [...ACTIVE_STATUSES] },
      endTime: { gte: cutoff },
      calendarLinks: { none: { mailboxId } },
    },
    orderBy: { startTime: 'asc' },
    take: budget,
  });
  for (const row of rows) {
    if (!ctx.hasTime()) return { writes: 0, complete: false };
    await item(ctx, row.id, async () => {
      const event = must(
        await ctx.gateway.createEvent(ctx.tokens, toCalendarAppointment(row), `${row.id}:create`, {
          eventId: eventIdFor(mailboxId, row.id),
        })
      );
      // An event Google answers 409 for that is cancelled there (deleted by the user after an earlier
      // create whose answer was lost) is not brought back: the link is marked, like a deletion.
      const gone = event.status === 'cancelled';
      try {
        await ctx.prisma.calendarEventLink.create({
          data: {
            tenantId,
            mailboxId,
            appointmentId: row.id,
            googleEventId: event.externalId,
            origin: 'AURORA',
            etag: event.etag ?? null,
            remoteUpdatedAt: event.lastModified,
            remoteCancelledAt: gone ? ctx.now : null,
            // The row as it was written: a later change is a change to push.
            localSyncedAt: row.updatedAt,
          },
        });
      } catch (error) {
        // Only a link for this appointment already being there is fine (made meanwhile). Any other
        // clash (the event id belongs to another link) would leave the appointment unlinked: a failure.
        const linked = await ctx.prisma.calendarEventLink.findFirst({
          where: { tenantId, mailboxId, appointmentId: row.id },
        });
        if (prismaCode(error) !== 'P2002' || !linked) throw error;
      }
      if (gone) ctx.report.skipped += 1;
      else ctx.report.pushedCreated += 1;
    });
  }
  return { writes: rows.length, complete: rows.length < budget };
}

/**
 * Links of live, upcoming appointments of the user that were edited in Aurora since they were last
 * synced. Paged by link id until the write budget is covered or the links run out, so a backlog is
 * not hidden behind rows that are already in step.
 */
async function changedLinks(
  ctx: SyncContext,
  cutoff: Date,
  budget: number
): Promise<{ changed: any[]; exhausted: boolean }> {
  const { tenantId, id: mailboxId, userId } = ctx.mailbox;
  const changed: any[] = [];
  let after = '';
  for (;;) {
    const page: any[] = await ctx.prisma.calendarEventLink.findMany({
      where: {
        tenantId,
        mailboxId,
        remoteCancelledAt: null,
        id: { gt: after },
        appointment: {
          tenantId,
          organizerId: userId,
          status: { in: [...ACTIVE_STATUSES] },
          endTime: { gte: cutoff },
        },
      },
      include: { appointment: true },
      orderBy: { id: 'asc' },
      take: LINKS_PAGE,
    });
    if (page.length === 0) return { changed, exhausted: true };
    after = page[page.length - 1].id;
    for (const link of page) {
      const edited =
        link.localSyncedAt === null ||
        link.appointment.updatedAt.getTime() > link.localSyncedAt.getTime();
      if (edited) changed.push(link);
    }
    if (changed.length > budget || !ctx.hasTime()) return { changed, exhausted: false };
  }
}

/** Events to change: linked live appointments edited in Aurora since they were last synced. */
async function patchEvents(ctx: SyncContext, cutoff: Date, budget: number): Promise<StepResult> {
  const { changed, exhausted } = await changedLinks(ctx, cutoff, budget);
  let writes = 0;
  for (const link of changed.slice(0, budget)) {
    if (!ctx.hasTime()) return { writes, complete: false };
    writes += 1;
    await item(ctx, link.id, () => patchOne(ctx, link));
  }
  return { writes, complete: exhausted && changed.length <= budget };
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
    },
  });
  ctx.report.pushedUpdated += 1;
}
