/**
 * Fixtures for the Google Calendar sync's tests (MVP-013): an in-memory database that keeps state,
 * enforces the link table's unique keys and rolls a failed transaction back, and a fake Google
 * calendar that numbers its changes so a sync token means something.
 */
import { vi } from 'vitest';
import type { CalendarAppointmentLike } from '@intelliflow/adapters';
import {
  CalendarAuthenticationError,
  CalendarConflictError,
  CalendarEventNotFoundError,
  CalendarSyncError,
  CalendarSyncTokenExpiredError,
  type ExternalCalendarEvent,
} from '@intelliflow/application';
import { Result, type DomainError } from '@intelliflow/domain';
import type { CalendarGateway, ChangesPage } from '../google-calendar-links';
import { runCalendarSync, type CalendarSyncDeps } from '../google-calendar-sync';

export const NOW = new Date('2026-11-20T10:00:00.000Z');
export const TENANT = '00000000-0000-4000-a000-000000000001';
export const OTHER_TENANT = '00000000-0000-4000-a000-000000000002';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const SEND = 'https://www.googleapis.com/auth/gmail.send';

type Row = Record<string, any>;
type Table = 'emailMailbox' | 'appointment' | 'calendarEventLink';

export function mailboxRow(over: Row = {}): Row {
  return {
    id: 'mbx-1',
    tenantId: TENANT,
    userId: 'user-1',
    kind: 'GMAIL',
    scope: 'USER',
    status: 'ACTIVE',
    refreshToken: 'stored-refresh',
    tokenVersion: 0,
    grantedScopes: ['openid', SEND, CALENDAR_SCOPE],
    calendarSyncToken: null,
    calendarSyncedAt: null,
    calendarNextSyncAt: null,
    calendarLockedUntil: null,
    calendarFailureCount: 0,
    calendarStatus: 'ACTIVE',
    ...over,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
}

export function appointmentRow(over: Row = {}): Row {
  return {
    id: 'appt-1',
    tenantId: TENANT,
    organizerId: 'user-1',
    title: 'Site visit',
    description: null,
    location: null,
    startTime: new Date('2026-11-21T09:00:00.000Z'),
    endTime: new Date('2026-11-21T10:00:00.000Z'),
    status: 'SCHEDULED',
    updatedAt: new Date('2026-11-19T08:00:00.000Z'),
    ...over,
  };
}

export function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

/** The in-memory database, as the sync sees it (the Prisma methods are mocks that keep state). */
export interface FakeDb {
  tables: Record<Table, Row[]>;
  clock: { now: Date };
  failures: Map<string, Error>;
  emailMailbox: any;
  appointment: any;
  calendarEventLink: any;
  $queryRaw: any;
  $transaction: any;
}

/** One Prisma operator on a column value: in, gte, gt, lt or not. */
function matchesOperator(value: any, c: Row): boolean {
  const n = (d: unknown) => (d instanceof Date ? d.getTime() : (d as string | number));
  if ('in' in c) return (c.in as unknown[]).includes(value);
  if ('gte' in c) return n(value) >= n(c.gte);
  if ('gt' in c) return n(value) > n(c.gt);
  if ('lt' in c) return n(value) < n(c.lt);
  if ('lte' in c) return n(value) <= n(c.lte);
  if ('not' in c) return c.not === null ? value != null : value !== c.not;
  throw new Error(`fake db: unsupported condition ${JSON.stringify(c)}`);
}

/** The in-memory database. `clock.now` is what an update stamps as updatedAt. */
export function fakeDb(seed: Partial<Record<Table, Row[]>> = {}): FakeDb {
  const tables: Record<Table, Row[]> = {
    emailMailbox: [...(seed.emailMailbox ?? [mailboxRow()])],
    appointment: [...(seed.appointment ?? [])],
    calendarEventLink: [...(seed.calendarEventLink ?? [])],
  };
  const clock = { now: new Date(NOW) };
  let ids = 0;
  const nextId = (prefix: string) => `${prefix}-${++ids}`;
  /** Errors to throw on the next call of a method, keyed "table.method". */
  const failures = new Map<string, Error>();

  function relation(row: Row, table: Table, key: string): Row | Row[] | undefined {
    if (table === 'calendarEventLink' && key === 'appointment') {
      return tables.appointment.find((a) => a.id === row.appointmentId);
    }
    if (table === 'appointment' && key === 'calendarLinks') {
      return tables.calendarEventLink.filter((l) => l.appointmentId === row.id);
    }
    return undefined;
  }

  function matches(row: Row, where: Row, table: Table): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w, table));
      if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w, table));
      if (table === 'calendarEventLink' && key === 'appointment') {
        const target = relation(row, table, key) as Row | undefined;
        return Boolean(target) && matches(target as Row, cond as Row, 'appointment');
      }
      if (table === 'appointment' && key === 'calendarLinks') {
        const links = relation(row, table, key) as Row[];
        return !links.some((l) => matches(l, (cond as Row).none, 'calendarEventLink'));
      }

      const value = row[key];
      if (cond === null) return value === null || value === undefined;
      if (cond instanceof Date) return sameValue(value, cond);
      if (typeof cond === 'object') return matchesOperator(value, cond as Row);
      return sameValue(value, cond);
    });
  }

  function crud(table: Table, extra: Row = {}) {
    const run = <T>(method: string, work: () => T): T => {
      const failure = failures.get(`${table}.${method}`);
      if (failure) {
        failures.delete(`${table}.${method}`);
        throw failure;
      }
      return work();
    };
    const find = (args: Row = {}) => {
      let rows = tables[table].filter((r) => matches(r, args.where ?? {}, table));

      if (args.orderBy?.startTime) {
        rows = [...rows].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      }
      if (args.orderBy?.appointment?.updatedAt === 'desc') {
        rows = [...rows].sort(
          (a, b) =>
            (relation(b, table, 'appointment') as Row).updatedAt.getTime() -
            (relation(a, table, 'appointment') as Row).updatedAt.getTime()
        );
      }
      if (args.orderBy?.id === 'asc') rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
      // Copies, as a database returns: a row read earlier does not change when another writer does.
      const page = args.take === undefined ? rows : rows.slice(0, args.take);
      return page.map((r) => ({
        ...r,
        ...(args.include?.appointment
          ? { appointment: { ...relation(r, table, 'appointment') } }
          : {}),
      }));
    };
    return {
      findFirst: vi.fn(async (args: Row) => run('findFirst', () => find(args)[0] ?? null)),
      findMany: vi.fn(async (args: Row) => run('findMany', () => find(args))),
      create: vi.fn(async ({ data }: Row) =>
        run('create', () => {
          const row = { id: nextId(table), updatedAt: new Date(clock.now), ...extra, ...data };
          if (table === 'calendarEventLink') {
            const clash = tables.calendarEventLink.some(
              (l) =>
                l.mailboxId === row.mailboxId &&
                (l.googleEventId === row.googleEventId ||
                  (row.appointmentId && l.appointmentId === row.appointmentId))
            );
            if (clash) throw p2002();
          }
          tables[table].push(row);
          return row;
        })
      ),
      updateMany: vi.fn(async ({ where, data }: Row) =>
        run('updateMany', () => {
          const rows = tables[table].filter((r) => matches(r, where, table));
          for (const row of rows) Object.assign(row, data, { updatedAt: new Date(clock.now) });
          return { count: rows.length };
        })
      ),
      delete: vi.fn(async ({ where }: Row) =>
        run('delete', () => {
          const index = tables[table].findIndex((r) => matches(r, where, table));
          if (index < 0) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
          return tables[table].splice(index, 1)[0];
        })
      ),
      update: vi.fn(async ({ where, data }: Row) =>
        run('update', () => {
          const row = tables[table].find((r) => matches(r, where, table));
          if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
          Object.assign(row, data, { updatedAt: new Date(clock.now) });
          return row;
        })
      ),
    };
  }

  const db: FakeDb = {
    tables,
    clock,
    failures,
    emailMailbox: crud('emailMailbox'),
    appointment: crud('appointment', { status: 'SCHEDULED' }),
    calendarEventLink: crud('calendarEventLink', {
      pending: false,
      pushAttempts: 0,
      nextPushAt: null,
    }),
    // The claim: the mailbox that is due, ACTIVE, a user's Google mailbox with the calendar scope.
    $queryRaw: vi.fn(async (_sql: unknown, leaseUntil: Date, scopes: string[], now: Date) => {
      const row = tables.emailMailbox
        .filter(
          (m) =>
            m.status === 'ACTIVE' &&
            m.kind === 'GMAIL' &&
            m.scope === 'USER' &&
            m.calendarStatus === 'ACTIVE' &&
            m.grantedScopes.some((s: string) => scopes.includes(s)) &&
            (!m.calendarNextSyncAt || m.calendarNextSyncAt.getTime() <= now.getTime()) &&
            (!m.calendarLockedUntil || m.calendarLockedUntil.getTime() < now.getTime())
        )
        .sort(
          (a, b) => (a.calendarNextSyncAt?.getTime() ?? 0) - (b.calendarNextSyncAt?.getTime() ?? 0)
        )[0];
      if (!row) return [];
      row.calendarLockedUntil = leaseUntil;
      return [{ id: row.id, calendarLockedUntil: leaseUntil }];
    }),
    // A transaction that throws leaves nothing behind.
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      const saved = {
        appointment: tables.appointment.map((r) => ({ ...r })),
        calendarEventLink: tables.calendarEventLink.map((r) => ({ ...r })),
      };
      try {
        return await work(db);
      } catch (error) {
        tables.appointment.splice(0, tables.appointment.length, ...saved.appointment);
        tables.calendarEventLink.splice(
          0,
          tables.calendarEventLink.length,
          ...saved.calendarEventLink
        );
        throw error;
      }
    }),
  };
  return db;
}

export interface FakeEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  status: 'confirmed' | 'cancelled';
  visibility?: 'default' | 'private' | 'confidential';
  etag: string;
  updated: Date;
  rev: number;
}

/** A Google calendar: events numbered by change, a sync token that is the number it reached. */
export class FakeGoogle implements CalendarGateway {
  events = new Map<string, FakeEvent>();
  private rev = 0;
  private etags = 0;
  /** Calls made, "method" or "method:id". */
  log: string[] = [];
  /** An error to return from the next call of a method. */
  failNext = new Map<string, DomainError>();
  /** The sync token Google no longer accepts. */
  expiredToken: string | null = null;
  pageSize = 250;
  now = new Date(NOW);

  private touch(event: FakeEvent): FakeEvent {
    event.rev = ++this.rev;
    event.etag = `etag-${++this.etags}`;
    event.updated = new Date(this.now);
    return event;
  }

  /** An event changed or added in Google itself (by the user). */
  put(id: string, over: Partial<FakeEvent> = {}): FakeEvent {
    const existing = this.events.get(id);
    const event: FakeEvent = existing ?? {
      id,
      title: 'Lunch with Ada',
      start: new Date('2026-11-22T12:00:00.000Z'),
      end: new Date('2026-11-22T13:00:00.000Z'),
      status: 'confirmed',
      etag: '',
      updated: new Date(this.now),
      rev: 0,
    };
    Object.assign(event, over);
    this.events.set(id, event);
    return this.touch(event);
  }

  remove(id: string): void {
    this.put(id, { status: 'cancelled' });
  }

  private external(e: FakeEvent): ExternalCalendarEvent {
    return {
      externalId: e.id,
      provider: 'google',
      title: e.title,
      description: e.description,
      startTime: e.start,
      endTime: e.end,
      location: e.location,
      attendees: [],
      organizerEmail: 'owner@studio.example.invalid',
      status: e.status === 'cancelled' ? 'cancelled' : 'confirmed',
      iCalUID: `${e.id}@google.com`,
      etag: e.etag,
      lastModified: e.updated,
      visibility: e.visibility ?? 'default',
    };
  }

  private failure(method: string): DomainError | undefined {
    const error = this.failNext.get(method);
    if (error) this.failNext.delete(method);
    return error;
  }

  async getEvent(_tokens: unknown, id: string) {
    this.log.push(`getEvent:${id}`);
    const failure = this.failure('getEvent');
    if (failure) return Result.fail<ExternalCalendarEvent | null, DomainError>(failure);
    const event = this.events.get(id);
    const found = event ? this.external(event) : null;
    return Result.ok<ExternalCalendarEvent | null, DomainError>(found);
  }

  async createEvent(
    _tokens: unknown,
    appointment: CalendarAppointmentLike,
    _key: string,
    options?: { eventId?: string }
  ) {
    this.log.push(`createEvent:${options?.eventId ?? ''}`);
    const failure = this.failure('createEvent');
    if (failure) return Result.fail<ExternalCalendarEvent, DomainError>(failure);
    const id = options?.eventId ?? `generated-${this.events.size + 1}`;
    // The id exists already: an earlier create's answer was lost. Google answers 409, the adapter
    // hands back the event that is there.
    const existing = this.events.get(id);
    if (existing) return Result.ok<ExternalCalendarEvent, DomainError>(this.external(existing));
    const event = this.put(id, this.fieldsOf(appointment));
    return Result.ok<ExternalCalendarEvent, DomainError>(this.external(event));
  }

  async patchEvent(
    _tokens: unknown,
    id: string,
    appointment: CalendarAppointmentLike,
    etag?: string
  ) {
    this.log.push(`patchEvent:${id}`);
    const failure = this.failure('patchEvent');
    if (failure) return Result.fail<ExternalCalendarEvent, DomainError>(failure);
    // If-Match: Google refuses when the event changed since that etag.
    const there = this.events.get(id);
    // A PATCH updates an event that exists: a missing one is a 404.
    if (!there) {
      return Result.fail<ExternalCalendarEvent, DomainError>(
        new CalendarEventNotFoundError('google', 'Event not found')
      );
    }
    if (etag && there.etag !== etag) {
      return Result.fail<ExternalCalendarEvent, DomainError>(
        new CalendarConflictError('Event was modified by another source')
      );
    }
    // As Google does for a PATCH of a deleted event: the event comes back.
    const event = this.put(id, { ...this.fieldsOf(appointment), status: 'confirmed' });
    return Result.ok<ExternalCalendarEvent, DomainError>(this.external(event));
  }

  async deleteEvent(_tokens: unknown, id: string) {
    this.log.push(`deleteEvent:${id}`);
    const failure = this.failure('deleteEvent');
    if (failure) return Result.fail<void, DomainError>(failure);
    this.remove(id);
    return Result.ok<void, DomainError>(undefined);
  }

  private fieldsOf(appointment: CalendarAppointmentLike): Partial<FakeEvent> {
    return {
      title: appointment.title,
      description: appointment.description ?? undefined,
      location: appointment.location ?? undefined,
      start: appointment.startTime,
      end: appointment.endTime,
    };
  }
  async fetchChanges(
    _tokens: unknown,
    syncToken?: string,
    pageToken?: string,
    window?: { timeMin: Date; timeMax?: Date }
  ) {
    const page = pageToken ? ':' + pageToken : '';
    this.log.push(`fetchChanges:${syncToken ?? 'full'}${page}`);
    const failure = this.failure('fetchChanges');
    if (failure) return Result.fail<ChangesPage, DomainError>(failure);
    if (syncToken && syncToken === this.expiredToken) {
      return Result.fail<ChangesPage, DomainError>(new CalendarSyncTokenExpiredError('google'));
    }
    const since = syncToken ? Number(syncToken.replace('tok-', '')) : 0;
    let changed = [...this.events.values()].filter((e) => e.rev > since);
    if (!syncToken) {
      changed = changed.filter(
        (e) =>
          e.status !== 'cancelled' &&
          (!window ||
            (e.end.getTime() > window.timeMin.getTime() &&
              (!window.timeMax || e.start.getTime() < window.timeMax.getTime())))
      );
    }
    changed.sort((a, b) => a.rev - b.rev);
    const from = pageToken ? Number(pageToken.replace('page-', '')) : 0;
    const slice = changed.slice(from, from + this.pageSize);
    const more = from + this.pageSize < changed.length;
    return Result.ok<ChangesPage, DomainError>({
      events: slice.filter((e) => e.status !== 'cancelled').map((e) => this.external(e)),
      deletedEventIds: slice.filter((e) => e.status === 'cancelled').map((e) => e.id),
      nextPageToken: more ? `page-${from + this.pageSize}` : undefined,
      nextSyncToken: more ? undefined : `tok-${this.rev}`,
    });
  }
}

export const authFailure = () => new CalendarAuthenticationError('google', 'permission withdrawn');
export const refusal = () => new CalendarSyncError('google', 'Bad request');

/** One scenario: a database, a Google calendar and a clock that moves five minutes a round. */
export function createSyncHarness() {
  const state = { db: fakeDb(), google: new FakeGoogle(), time: new Date(NOW) };

  function setup(seed: Parameters<typeof fakeDb>[0] = {}, now?: () => Date): CalendarSyncDeps {
    state.db = fakeDb(seed);
    state.google = new FakeGoogle();
    state.time = new Date(NOW);
    state.google.now = state.time;
    return {
      prisma: state.db,
      transports: {} as never,
      now: now ?? (() => new Date(state.time)),
      gatewayFor: () => state.google,
    };
  }

  /** Moves the clock on by five minutes (the sync interval) and runs a round. */
  async function nextRound(sync: CalendarSyncDeps) {
    state.time = new Date(state.time.getTime() + 5 * 60_000);
    state.google.now = new Date(state.time);
    state.db.clock.now = new Date(state.time);
    return runCalendarSync(sync);
  }

  return {
    setup,
    nextRound,
    get db() {
      return state.db;
    },
    get google() {
      return state.google;
    },
    appointments: () => state.db.tables.appointment,
    links: () => state.db.tables.calendarEventLink,
    mailbox: () => state.db.tables.emailMailbox[0],
    /** The Google sync token inside the saved state. */
    token: (): string => {
      const saved: string = state.db.tables.emailMailbox[0].calendarSyncToken;
      return saved.startsWith('resume:') ? JSON.parse(saved.slice(7)).t : saved;
    },
  };
}
