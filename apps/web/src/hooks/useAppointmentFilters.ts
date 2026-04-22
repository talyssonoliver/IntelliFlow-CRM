/**
 * Appointment filter state hook — PG-139
 *
 * Manages filter state for the appointment list/calendar page.
 * Follows useCaseFilters pattern.
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  AppointmentFilters,
  AppointmentStatus,
  AppointmentType,
} from '@/components/appointments/types';

/**
 * Default date range for the list view — first day of the current month
 * through the last day. Gives users a sensible starting dataset instead of
 * "oldest 20 appointments in the tenant".
 */
export function getCurrentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export const defaultAppointmentFilters: AppointmentFilters = {
  search: '',
  status: '',
  appointmentType: '',
  sortBy: 'startTime',
  sortOrder: 'asc',
  page: 1,
  limit: 20,
  calendarView: 'month',
};

type CalendarView = 'month' | 'week' | 'day';
const CALENDAR_VIEWS: ReadonlySet<CalendarView> = new Set<CalendarView>(['month', 'week', 'day']);

function isCalendarView(value: unknown): value is CalendarView {
  return typeof value === 'string' && CALENDAR_VIEWS.has(value as CalendarView);
}

/**
 * Narrow-typed loader that only returns known-safe calendar-view scalars.
 * Any other persisted value is discarded. Keeping this tightly scoped prevents
 * arbitrary persisted data from flowing back into component state.
 */
function loadCalendarView(fallback: CalendarView): CalendarView {
  if (typeof globalThis.window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem('appointment-calendarView');
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    return isCalendarView(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function useAppointmentFilters() {
  const [filters, setFilters] = useState<AppointmentFilters>(() => {
    // Compute the default month range on mount so it always reflects the
    // user's "today", not when the module was first imported.
    const range = getCurrentMonthRange();
    return {
      ...defaultAppointmentFilters,
      startTimeFrom: range.from,
      startTimeTo: range.to,
      calendarView: loadCalendarView('month'),
    };
  });

  // Persist the calendar view as a plain scalar — only after validating it's
  // one of the three known views, so unrelated filter state never hits storage.
  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;
    const view: CalendarView = isCalendarView(filters.calendarView) ? filters.calendarView : 'month';
    localStorage.setItem('appointment-calendarView', JSON.stringify(view));
  }, [filters.calendarView]);

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setStatusFilter = useCallback((status: AppointmentStatus | '') => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  }, []);

  const setTypeFilter = useCallback((appointmentType: AppointmentType | '') => {
    setFilters((prev) => ({ ...prev, appointmentType, page: 1 }));
  }, []);

  const setDateRange = useCallback((startTimeFrom?: Date, startTimeTo?: Date) => {
    setFilters((prev) => ({ ...prev, startTimeFrom, startTimeTo, page: 1 }));
  }, []);

  const setCaseFilter = useCallback((caseId?: string) => {
    setFilters((prev) => ({ ...prev, caseId, page: 1 }));
  }, []);

  const setSort = useCallback(
    (sortBy: AppointmentFilters['sortBy'], sortOrder?: AppointmentFilters['sortOrder']) => {
      setFilters((prev) => ({ ...prev, sortBy, sortOrder: sortOrder ?? prev.sortOrder }));
    },
    []
  );

  const setPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const setCalendarView = useCallback((calendarView: 'month' | 'week' | 'day') => {
    setFilters((prev) => ({ ...prev, calendarView }));
  }, []);

  const queryParams = useMemo(
    () => ({
      search: filters.search || undefined,
      status: filters.status ? [filters.status] : undefined,
      appointmentType: filters.appointmentType ? [filters.appointmentType] : undefined,
      startTimeFrom: filters.startTimeFrom?.toISOString(),
      startTimeTo: filters.startTimeTo?.toISOString(),
      caseId: filters.caseId || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      page: filters.page,
      limit: filters.limit,
    }),
    [filters]
  );

  return {
    filters,
    queryParams,
    setSearch,
    setStatusFilter,
    setTypeFilter,
    setDateRange,
    setCaseFilter,
    setSort,
    setPage,
    setCalendarView,
  };
}
