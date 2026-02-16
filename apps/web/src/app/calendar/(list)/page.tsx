'use client';

/**
 * Calendar/Appointments List Page — tRPC integration wrapper (PG-139)
 *
 * Thin wrapper that fetches data via tRPC and delegates rendering
 * to AppointmentList and AppointmentCalendar components.
 * Supports toggling between calendar and list view modes.
 *
 * Route: /calendar
 *
 * @implements AC-01 (Monthly calendar view with CSS Grid)
 * @implements AC-09 (List view with sortable columns)
 * @implements AC-29 (Calendar/list view toggle)
 */

import { useRouter } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentList, AppointmentCalendar } from '@/components/appointments';
import type {
  AppointmentStats,
  CalendarAppointment,
  AppointmentListItem,
} from '@/components/appointments/types';
import { useAppointmentFilters } from '@/hooks/useAppointmentFilters';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

const defaultStats: AppointmentStats = {
  total: 0,
  byStatus: {},
  byType: {},
  upcoming: 0,
  overdue: 0,
};

export default function CalendarPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const {
    filters,
    queryParams,
    setSearch,
    setStatusFilter,
    setTypeFilter,
    setPage,
    setViewMode,
    setCalendarView,
  } = useAppointmentFilters();
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // tRPC queries
  const { data, isLoading } = (api as Record<string, any>).appointments?.list?.useQuery?.(
    queryParams,
    {
      staleTime: 30_000,
    }
  ) ?? { data: undefined, isLoading: false };

  const { data: rawStats } = (api as Record<string, any>).appointments?.stats?.useQuery?.(
    undefined,
    {
      staleTime: 5 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    }
  ) ?? { data: undefined };

  const appointments = useMemo(() => {
    if (!data) return [];
    return ((data as Record<string, unknown>).appointments as AppointmentListItem[]) ?? [];
  }, [data]);

  const total = ((data as Record<string, unknown>)?.total as number) ?? 0;

  const stats: AppointmentStats = useMemo(() => {
    if (!rawStats) return defaultStats;
    return rawStats as AppointmentStats;
  }, [rawStats]);

  const calendarAppointments = useMemo((): CalendarAppointment[] => {
    return appointments.map((a) => ({
      id: a.id,
      title: a.title,
      startTime: new Date(a.startTime),
      endTime: new Date(a.endTime),
      appointmentType: a.appointmentType,
      status: a.status,
      location: a.location,
      attendeeCount: a.attendeeCount,
      hasConflict: a.hasConflict,
      linkedCaseCount: a.linkedCaseCount,
      isRecurring: a.isRecurring,
    }));
  }, [appointments]);

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/calendar/${id}`);
    },
    [router]
  );

  const handleCreateWithSlot = useCallback(
    (_startTime: Date, _endTime: Date) => {
      router.push('/calendar/new');
    },
    [router]
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Calendar' }]}
        title="Appointment Scheduling"
        description="Manage appointments, hearings, and consultations"
        actions={[
          {
            label: filters.viewMode === 'calendar' ? 'List View' : 'Calendar View',
            icon: filters.viewMode === 'calendar' ? 'view_list' : 'calendar_month',
            variant: 'secondary',
            onClick: () => setViewMode(filters.viewMode === 'calendar' ? 'list' : 'calendar'),
          },
          {
            label: 'New Appointment',
            icon: 'add',
            variant: 'primary',
            href: '/calendar/new',
          },
        ]}
      />

      {filters.viewMode === 'calendar' ? (
        <AppointmentCalendar
          appointments={calendarAppointments}
          isLoading={isLoading}
          view={filters.calendarView}
          currentDate={currentDate}
          onViewChange={setCalendarView}
          onDateChange={setCurrentDate}
          onAppointmentClick={handleRowClick}
          onCreateWithSlot={handleCreateWithSlot}
        />
      ) : (
        <AppointmentList
          appointments={appointments}
          total={total}
          isLoading={isLoading}
          stats={stats}
          onRowClick={handleRowClick}
          pagination={{
            page: filters.page,
            limit: filters.limit,
            onPageChange: setPage,
          }}
          filters={filters}
          onFilterChange={(partial) => {
            if (partial.search !== undefined) setSearch(partial.search);
            if (partial.status !== undefined) setStatusFilter(partial.status);
            if (partial.appointmentType !== undefined) setTypeFilter(partial.appointmentType);
          }}
        />
      )}
    </>
  );
}
