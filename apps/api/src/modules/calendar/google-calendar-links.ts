/**
 * MVP-013: what the Google Calendar sync's directions share: the gateway to Google, the context of
 * one mailbox's round, the report, and the mappings between an event and an appointment. The link
 * table (calendar_event_links) makes both directions idempotent; the etag and times kept on a link
 * tell an echo of our own write from a real change.
 */
import type { CalendarAppointmentLike, FullSyncWindow } from '@intelliflow/adapters';
import type { ExternalCalendarEvent, OAuthTokens } from '@intelliflow/application';
import type { DomainError, Result } from '@intelliflow/domain';

/** Appointments in these states are live: they sync, and can still change. */
export const ACTIVE_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const;

/** A Google event that has no end after its start is given this length. */
const MIN_DURATION_MS = 30 * 60_000;

export interface ChangesPage {
  events: ExternalCalendarEvent[];
  deletedEventIds: string[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

/** The part of the Google Calendar adapter the sync uses (the adapter satisfies it; tests fake it). */
export interface CalendarGateway {
  fetchChanges(
    tokens: OAuthTokens,
    syncToken?: string,
    pageToken?: string,
    window?: FullSyncWindow
  ): Promise<Result<ChangesPage, DomainError>>;
  createEvent(
    tokens: OAuthTokens,
    appointment: CalendarAppointmentLike,
    idempotencyKey: string,
    options?: { eventId?: string }
  ): Promise<Result<ExternalCalendarEvent, DomainError>>;
  patchEvent(
    tokens: OAuthTokens,
    eventId: string,
    appointment: CalendarAppointmentLike
  ): Promise<Result<ExternalCalendarEvent, DomainError>>;
  deleteEvent(tokens: OAuthTokens, eventId: string): Promise<Result<void, DomainError>>;
  /** One event by id; null when Google has no such event (deleted). */
  getEvent(
    tokens: OAuthTokens,
    externalEventId: string
  ): Promise<Result<ExternalCalendarEvent | null, DomainError>>;
}

export interface CalendarSyncReport {
  mailboxesSynced: number;
  /** Google to Aurora: appointments made, changed and cancelled from events. */
  imported: number;
  updated: number;
  cancelled: number;
  /** Aurora to Google: events made, changed and deleted from appointments. */
  pushedCreated: number;
  pushedUpdated: number;
  pushedDeleted: number;
  skipped: number;
  /** Items that failed on their own (the round carried on without them). */
  itemFailures: number;
  /** Rounds that failed as a whole, and mailboxes found to need a reconnect. */
  failures: number;
  reconnects: number;
  restarts: number;
}

export function newReport(): CalendarSyncReport {
  return {
    mailboxesSynced: 0,
    imported: 0,
    updated: 0,
    cancelled: 0,
    pushedCreated: 0,
    pushedUpdated: 0,
    pushedDeleted: 0,
    skipped: 0,
    itemFailures: 0,
    failures: 0,
    reconnects: 0,
    restarts: 0,
  };
}

/** The mailbox a round runs for: always a tenant's own user, so every query below carries all three. */
export interface SyncMailbox {
  id: string;
  tenantId: string;
  userId: string;
}

export interface SyncContext {
  prisma: any;
  gateway: CalendarGateway;
  tokens: OAuthTokens;
  mailbox: SyncMailbox;
  /** When the round started. */
  now: Date;
  /** False once the round's time budget is spent: no new item is started. */
  hasTime: () => boolean;
  report: CalendarSyncReport;
  /** Events that failed to apply and are tried again next round, with their attempts so far. */
  failed: Map<string, number>;
}

/**
 * The id Aurora gives an event it creates (a sha-256 in hex). Google's own events have shorter ids, so an
 * event with this shape that has no link yet is one Aurora is still linking: the pull leaves it to the push.
 */
export const AURORA_EVENT_ID = /^[0-9a-v]{64}$/;

export function prismaCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * A private or confidential event is not copied into the CRM: Aurora is shared with the user's team,
 * and the user marked it as theirs alone.
 */
export function isPersonal(event: ExternalCalendarEvent): boolean {
  return event.visibility === 'private' || event.visibility === 'confidential';
}

/** The appointment columns an event decides. */
export function appointmentFields(event: ExternalCalendarEvent) {
  const endsAfterStart = event.endTime.getTime() > event.startTime.getTime();
  return {
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    startTime: event.startTime,
    endTime: endsAfterStart ? event.endTime : new Date(event.startTime.getTime() + MIN_DURATION_MS),
  };
}
