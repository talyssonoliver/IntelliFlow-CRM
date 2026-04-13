'use client';

/**
 * Appointments List Page — dedicated table view separate from /calendar.
 *
 * Scope: appointments only (no task merging — that lives on /calendar).
 * Route: /appointments
 */

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentList } from '@/components/appointments';
import type {
  AppointmentStats,
  AppointmentListItem,
  AppointmentType,
  AppointmentStatus,
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

export default function AppointmentsListPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const {
    filters,
    queryParams,
    setSearch,
    setStatusFilter,
    setTypeFilter,
    setDateRange,
    setCaseFilter,
    setSort,
    setPage,
  } = useAppointmentFilters();

  const { data, isLoading } = api.appointments.list.useQuery(queryParams, {
    staleTime: 30_000,
  }) as unknown as {
    data: { appointments?: Record<string, unknown>[]; total?: number } | undefined;
    isLoading: boolean;
  };

  const { data: rawStats } = api.appointments.stats.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const appointments: AppointmentListItem[] = useMemo(() => {
    const rawAppointments: Record<string, unknown>[] | undefined = data?.appointments;
    if (!rawAppointments) return [];
    return rawAppointments.map((a) => {
      const organizer = a.organizer as { id?: string; name?: string | null } | null;
      const attendees = a.attendees as Array<{ user?: { name?: string | null } }> | undefined;
      const linkedCases = a.linkedCases as unknown[] | undefined;
      return {
        id: a.id as string,
        title: a.title as string,
        startTime: new Date(a.startTime as string),
        endTime: new Date(a.endTime as string),
        appointmentType: a.appointmentType as AppointmentType,
        status: a.status as AppointmentStatus,
        location: (a.location as string) ?? undefined,
        attendeeCount: attendees?.length ?? 0,
        hasConflict: false,
        linkedCaseCount: linkedCases?.length ?? 0,
        isRecurring: Boolean(a.recurrencePattern),
        calendarId: a.calendarId as string | null | undefined,
        organizer: { id: organizer?.id ?? '', name: organizer?.name ?? 'Unknown' },
        attendeeNames: attendees?.map((att) => att.user?.name ?? 'Unknown') ?? [],
      };
    });
  }, [data]);

  const total = data?.total ?? 0;

  const stats: AppointmentStats = useMemo(() => {
    return (rawStats as AppointmentStats | undefined) ?? defaultStats;
  }, [rawStats]);

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/appointments/${id}`);
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
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Appointments' }]}
        title="Appointments"
        description="Manage scheduled meetings, calls, hearings, and consultations"
        actions={[
          {
            label: 'Calendar View',
            icon: 'calendar_month',
            variant: 'secondary',
            href: '/calendar',
          },
          {
            label: 'New Appointment',
            icon: 'add',
            variant: 'primary',
            href: '/appointments/new',
          },
        ]}
      />

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
          const fromTouched = 'startTimeFrom' in partial;
          const toTouched = 'startTimeTo' in partial;
          if (fromTouched || toTouched) {
            setDateRange(
              fromTouched ? partial.startTimeFrom : filters.startTimeFrom,
              toTouched ? partial.startTimeTo : filters.startTimeTo
            );
          }
          if (partial.caseId !== undefined) setCaseFilter(partial.caseId);
          if (partial.sortBy !== undefined) setSort(partial.sortBy, partial.sortOrder);
        }}
      />
    </>
  );
}
