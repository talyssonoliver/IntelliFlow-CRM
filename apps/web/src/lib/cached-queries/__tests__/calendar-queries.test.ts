/**
 * Tests for calendar-queries.ts
 *
 * fetchAppointmentsList:
 * - Calls cacheLife with LIST_PAGE ("minutes") profile
 * - Calls cacheTag with CALENDAR_EVENTS ("calendar:events")
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.appointments.list() with correct default args
 * - Delegates to caller.appointments.list() with explicit limit/page args
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 *
 * fetchAppointmentStats:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with CALENDAR_EVENTS ("calendar:events")
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.appointments.stats()
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts ───────────────────────────────────
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@intelliflow/api/context', () => ({ createContext: vi.fn() }));
vi.mock('@intelliflow/api/router', () => ({ appRouter: { createCaller: vi.fn() } }));

// ── Mock next/cache ──────────────────────────────────────────────────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── Mock trpc-server ─────────────────────────────────────────────────────────
const mockAppointmentsList = vi.fn();
const mockAppointmentsStats = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchAppointmentsList, fetchAppointmentStats } from '../calendar-queries';

const SAMPLE_APPOINTMENTS_PAGE = {
  appointments: [
    {
      id: 'appt-1',
      title: 'Discovery Call',
      startTime: new Date('2026-04-12T10:00:00Z').toISOString(),
      endTime: new Date('2026-04-12T11:00:00Z').toISOString(),
      appointmentType: 'CALL',
      status: 'SCHEDULED',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const SAMPLE_STATS = {
  total: 15,
  upcoming: 8,
  overdue: 2,
  byStatus: { SCHEDULED: 5, CONFIRMED: 3, COMPLETED: 7 },
  byType: { MEETING: 6, CALL: 5, OTHER: 4 },
};

describe('calendar-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      appointments: {
        list: mockAppointmentsList,
        stats: mockAppointmentsStats,
      },
    });
  });

  // ── fetchAppointmentsList ───────────────────────────────────────────────────

  describe('fetchAppointmentsList', () => {
    it('calls cacheLife with LIST_PAGE ("minutes") profile', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with CALENDAR_EVENTS ("calendar:events")', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('calendar:events');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('tok', null);

      // cacheTag called exactly once (for CALENDAR_EVENTS only)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('delegates to appointments.list with default limit=20, page=1', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('tok', 'uid-1');

      expect(mockAppointmentsList).toHaveBeenCalledWith({
        limit: 20,
        page: 1,
        sortBy: 'startTime',
        sortOrder: 'asc',
      });
    });

    it('delegates to appointments.list with explicit limit and page args', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('tok', 'uid-1', 50, 2);

      expect(mockAppointmentsList).toHaveBeenCalledWith({
        limit: 50,
        page: 2,
        sortBy: 'startTime',
        sortOrder: 'asc',
      });
    });

    it('returns the result from caller.appointments.list unchanged', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      const result = await fetchAppointmentsList('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_APPOINTMENTS_PAGE);
    });

    it('creates caller from the provided token', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList('my-jwt', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt');
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockAppointmentsList.mockResolvedValue(SAMPLE_APPOINTMENTS_PAGE);

      await fetchAppointmentsList(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });

  // ── fetchAppointmentStats ───────────────────────────────────────────────────

  describe('fetchAppointmentStats', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      await fetchAppointmentStats('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with CALENDAR_EVENTS ("calendar:events")', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      await fetchAppointmentStats('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('calendar:events');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      await fetchAppointmentStats('tok', 'user-xyz');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      await fetchAppointmentStats('tok', null);

      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('delegates to appointments.stats() with no arguments', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      await fetchAppointmentStats('tok', 'uid-1');

      expect(mockAppointmentsStats).toHaveBeenCalledWith();
    });

    it('returns the result from caller.appointments.stats unchanged', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      const result = await fetchAppointmentStats('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_STATS);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockAppointmentsStats.mockResolvedValue(SAMPLE_STATS);

      await fetchAppointmentStats(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
