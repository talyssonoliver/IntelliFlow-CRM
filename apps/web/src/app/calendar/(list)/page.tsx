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

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentList, AppointmentCalendar } from '@/components/appointments';
import type {
  AppointmentStats,
  AppointmentListItem,
  AppointmentType,
  AppointmentStatus,
  CalendarAppointment,
  CalendarTask,
} from '@/components/appointments/types';
import { TaskForm, type TaskFormData } from '@/components/tasks/TaskForm';
import { useAppointmentFilters } from '@/hooks/useAppointmentFilters';
import { useCalendarVisibility } from '@/hooks/useCalendarVisibility';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

const defaultStats: AppointmentStats = {
  total: 0,
  byStatus: {},
  byType: {},
  upcoming: 0,
  overdue: 0,
};

/**
 * Compute the visible date range for a calendar view.
 * Adds padding so appointments in the grid's overflow days (e.g. days of the
 * previous/next month shown in a month grid) are still fetched.
 */
function getCalendarRange(
  date: Date,
  view: 'month' | 'week' | 'day'
): { from: Date; to: Date } {
  const from = new Date(date);
  const to = new Date(date);
  if (view === 'month') {
    // First of month minus 7 days → last of month plus 7 days (covers grid overflow)
    from.setDate(1);
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);
    to.setMonth(to.getMonth() + 1, 0); // last day of current month
    to.setDate(to.getDate() + 7);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    // Start of ISO week (Sun) → end of week (Sat)
    const day = from.getDay();
    from.setDate(from.getDate() - day);
    from.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() + (6 - day));
    to.setHours(23, 59, 59, 999);
  } else {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

export default function CalendarPage() {
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
    setViewMode,
    setCalendarView,
  } = useAppointmentFilters();
  const { isVisible: isCalendarVisible, setOnlyVisible } = useCalendarVisibility();
  const searchParams = useSearchParams();

  // Apply ?show=tasks (or other calendar IDs) filter on mount
  const appliedShowFilter = useRef(false);
  useEffect(() => {
    const showParam = searchParams.get('show');
    if (showParam && !appliedShowFilter.current) {
      appliedShowFilter.current = true;
      const ids = showParam.split(',').map((s) => s.trim());
      setOnlyVisible(ids);
    }
  }, [searchParams, setOnlyVisible]);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [taskCreateDefaultDate, setTaskCreateDefaultDate] = useState<string>('');

  /**
   * When in calendar mode, expand the query range to cover the visible grid
   * and raise the pagination limit so appointments in the current view actually
   * reach the calendar. Without this, the default list query returns only the
   * 20 oldest appointments (sort=startTime ASC, limit=20) — which almost never
   * overlap with today's month.
   */
  const calendarQueryParams = useMemo(() => {
    if (filters.viewMode !== 'calendar') return queryParams;
    const range = getCalendarRange(currentDate, filters.calendarView);
    return {
      ...queryParams,
      startTimeFrom: range.from.toISOString(),
      startTimeTo: range.to.toISOString(),
      // Calendar mode: max allowed by listAppointmentsSchema. The narrow date
      // window (visible grid) means 100 is enough for typical usage.
      limit: 100,
      page: 1,
    };
  }, [queryParams, filters.viewMode, filters.calendarView, currentDate]);

  // tRPC queries — cast to simplified type to avoid TS2589 (excessively deep instantiation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = api.appointments.list.useQuery(calendarQueryParams, {
    staleTime: 30_000,
  }) as any as {
    data: { appointments?: Record<string, unknown>[]; total?: number } | undefined;
    isLoading: boolean;
  };

  const { data: rawStats } = api.appointments.stats.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Task stats — merged into KPI cards so the Calendar page shows combined
  // counts (appointments + tasks), matching what users see in the calendar grid.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawTaskStats } = (api as any).task.stats.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  }) as {
    data:
      | {
          total?: number;
          byStatus?: Record<string, number>;
          byPriority?: Record<string, number>;
          overdue?: number;
          dueToday?: number;
        }
      | undefined;
  };

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
    const apptStats = (rawStats as AppointmentStats | undefined) ?? defaultStats;
    const taskStats = rawTaskStats ?? {};
    const taskByStatus = taskStats.byStatus ?? {};
    const totalTasks = taskStats.total ?? 0;
    const completedTasks = taskByStatus.COMPLETED ?? 0;
    const cancelledTasks = taskByStatus.CANCELLED ?? 0;
    const inProgressTasks = taskByStatus.IN_PROGRESS ?? 0;
    const overdueTasks = taskStats.overdue ?? 0;
    // "Upcoming tasks" = active tasks that aren't overdue.
    const upcomingTasks = Math.max(
      0,
      totalTasks - completedTasks - cancelledTasks - overdueTasks
    );

    return {
      ...apptStats,
      upcoming: apptStats.upcoming + upcomingTasks,
      overdue: apptStats.overdue + overdueTasks,
      byStatus: {
        ...apptStats.byStatus,
        CONFIRMED: (apptStats.byStatus?.CONFIRMED ?? 0) + inProgressTasks,
        COMPLETED: (apptStats.byStatus?.COMPLETED ?? 0) + completedTasks,
      },
    };
  }, [rawStats, rawTaskStats]);

  const calendarAppointments = useMemo((): CalendarAppointment[] => {
    return appointments
      .filter((a) => {
        if (a.calendarId) {
          return isCalendarVisible(a.calendarId);
        }
        return isCalendarVisible('personal');
      })
      .map((a) => ({
        id: a.id,
        title: a.title,
        startTime: a.startTime instanceof Date ? a.startTime : new Date(a.startTime),
        endTime: a.endTime instanceof Date ? a.endTime : new Date(a.endTime),
        appointmentType: a.appointmentType,
        status: a.status,
        location: a.location,
        attendeeCount: a.attendeeCount,
        hasConflict: a.hasConflict,
        linkedCaseCount: a.linkedCaseCount,
        isRecurring: a.isRecurring,
        calendarId: a.calendarId,
      }));
  }, [appointments, isCalendarVisible]);

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/calendar/${id}`);
    },
    [router]
  );

  // Task query
  const { data: taskData } = api.task.list.useQuery(
    {},
    { enabled: isAuthenticated && !authLoading, staleTime: 30_000 }
  );

  const calendarTasks: CalendarTask[] = useMemo(() => {
    if (!taskData) return [];
    const taskList = taskData.tasks ?? [];
    return taskList
      .filter((t) => t.dueDate != null)
      .filter((t) => {
        // calendarId may be present on extended task models
        const cid = (t as { calendarId?: string | null }).calendarId;
        if (cid) {
          return isCalendarVisible(cid);
        }
        return isCalendarVisible('tasks');
      })
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate as Date | string,
        priority: t.priority as CalendarTask['priority'],
        calendarId: (t as { calendarId?: string | null }).calendarId ?? undefined,
      }));
  }, [taskData, isCalendarVisible]);

  // Task create mutation
  const taskCreateMutation = api.task.create.useMutation({
    onSuccess: () => {
      setShowTaskCreate(false);
    },
  });

  const handleTaskClick = useCallback(
    (id: string) => {
      router.push(`/tasks/${id}`);
    },
    [router]
  );

  const handleCreateWithSlot = useCallback(
    (startTime: Date, endTime: Date) => {
      const params = new URLSearchParams({
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      });
      router.push(`/calendar/new?${params.toString()}`);
    },
    [router]
  );

  const handleMoreClick = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      setCalendarView('day');
    },
    [setCalendarView]
  );

  const handleCreateWithDate = useCallback((date: Date) => {
    const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    setTaskCreateDefaultDate(dateStr);
    setShowTaskCreate(true);
  }, []);

  const handleTaskCreateSubmit = useCallback(
    (formData: TaskFormData) => {
      taskCreateMutation.mutate({
        title: formData.title,
        description: formData.description || undefined,
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
        priority: formData.priority,
        leadId: formData.entityType === 'lead' && formData.entityId ? formData.entityId : undefined,
        contactId:
          formData.entityType === 'contact' && formData.entityId ? formData.entityId : undefined,
        opportunityId:
          formData.entityType === 'opportunity' && formData.entityId
            ? formData.entityId
            : undefined,
        calendarId: formData.calendarId || undefined,
      });
    },
    [taskCreateMutation]
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
        title="Calendar"
        description="Manage appointments and tasks in one view"
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
          tasks={calendarTasks}
          isLoading={isLoading}
          view={filters.calendarView}
          currentDate={currentDate}
          onViewChange={setCalendarView}
          onDateChange={setCurrentDate}
          onAppointmentClick={handleRowClick}
          onTaskClick={handleTaskClick}
          onCreateWithSlot={handleCreateWithSlot}
          onCreateWithDate={handleCreateWithDate}
          onMoreClick={handleMoreClick}
        />
      ) : (
        <AppointmentList
          appointments={appointments}
          total={total}
          isLoading={isLoading}
          stats={stats}
          tasks={calendarTasks}
          onTaskClick={handleTaskClick}
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
            // Use `in` operator so we can distinguish "field not touched" from
            // "field explicitly cleared to undefined". When only one date is
            // changed, keep the other from current state instead of wiping it.
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
      )}

      {/* Task Create Form (from month-cell click) */}
      <TaskForm
        open={showTaskCreate}
        onClose={() => setShowTaskCreate(false)}
        onSubmit={handleTaskCreateSubmit}
        initialData={taskCreateDefaultDate ? { dueDate: taskCreateDefaultDate } : null}
        mode="create"
      />
    </>
  );
}
