/**
 * Appointment filter state hook — PG-139
 *
 * Manages filter state for the appointment list/calendar page.
 * Follows useCaseFilters pattern.
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { AppointmentFilters, AppointmentStatus, AppointmentType } from '@/components/appointments/types';

export const defaultAppointmentFilters: AppointmentFilters = {
  search: '',
  status: '',
  appointmentType: '',
  sortBy: 'startTime',
  sortOrder: 'asc',
  page: 1,
  limit: 20,
  viewMode: 'calendar',
  calendarView: 'month',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useAppointmentFilters() {
  const [filters, setFilters] = useState<AppointmentFilters>(() => ({
    ...defaultAppointmentFilters,
    viewMode: loadFromStorage('appointment-viewMode', 'calendar' as const),
    calendarView: loadFromStorage('appointment-calendarView', 'month' as const),
  }));

  // Persist view preferences to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('appointment-viewMode', JSON.stringify(filters.viewMode));
    localStorage.setItem('appointment-calendarView', JSON.stringify(filters.calendarView));
  }, [filters.viewMode, filters.calendarView]);

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

  const setSort = useCallback((sortBy: AppointmentFilters['sortBy'], sortOrder?: AppointmentFilters['sortOrder']) => {
    setFilters((prev) => ({ ...prev, sortBy, sortOrder: sortOrder ?? prev.sortOrder }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const setViewMode = useCallback((viewMode: 'calendar' | 'list') => {
    setFilters((prev) => ({ ...prev, viewMode }));
  }, []);

  const setCalendarView = useCallback((calendarView: 'month' | 'week' | 'day') => {
    setFilters((prev) => ({ ...prev, calendarView }));
  }, []);

  const queryParams = useMemo(() => ({
    search: filters.search || undefined,
    status: filters.status || undefined,
    appointmentType: filters.appointmentType || undefined,
    startTimeFrom: filters.startTimeFrom?.toISOString(),
    startTimeTo: filters.startTimeTo?.toISOString(),
    caseId: filters.caseId || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page: filters.page,
    limit: filters.limit,
  }), [filters]);

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
    setViewMode,
    setCalendarView,
  };
}
