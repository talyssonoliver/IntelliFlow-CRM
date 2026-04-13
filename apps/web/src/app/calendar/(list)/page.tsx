'use client';

/**
 * Calendar Page — unified visual calendar grid (month/week/day).
 *
 * Renders appointments + tasks-due side by side in the Schedule-X calendar.
 * The list/table view lives at /appointments (separate page, separate sidebar).
 *
 * Route: /calendar
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentCalendar } from '@/components/appointments';
import type {
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
    from.setDate(1);
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);
    to.setMonth(to.getMonth() + 1, 0);
    to.setDate(to.getDate() + 7);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
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
  const { filters, queryParams, setCalendarView } = useAppointmentFilters();
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
   * Expand the query range to cover the visible grid and raise the pagination
   * limit so appointments in the current view actually reach the calendar.
   * Without this, the default filter query returns only the 20 oldest
   * appointments — which rarely overlap with the month being viewed.
   */
  const calendarQueryParams = useMemo(() => {
    const range = getCalendarRange(currentDate, filters.calendarView);
    return {
      ...queryParams,
      startTimeFrom: range.from.toISOString(),
      startTimeTo: range.to.toISOString(),
      limit: 100,
      page: 1,
    };
  }, [queryParams, filters.calendarView, currentDate]);

  const { data, isLoading } = api.appointments.list.useQuery(calendarQueryParams, {
    staleTime: 30_000,
  }) as unknown as {
    data: { appointments?: Record<string, unknown>[]; total?: number } | undefined;
    isLoading: boolean;
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

  const handleAppointmentClick = useCallback(
    (id: string) => {
      router.push(`/appointments/${id}`);
    },
    [router]
  );

  // Task query — calendar shows tasks-due alongside appointments
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
      router.push(`/appointments/new?${params.toString()}`);
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
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Calendar' }]}
        title="Calendar"
        description="Visualise appointments and tasks due in a unified calendar grid"
        actions={[
          {
            label: 'Appointments List',
            icon: 'view_list',
            variant: 'secondary',
            href: '/appointments',
          },
          {
            label: 'New Appointment',
            icon: 'add',
            variant: 'primary',
            href: '/appointments/new',
          },
        ]}
      />

      <AppointmentCalendar
        appointments={calendarAppointments}
        tasks={calendarTasks}
        isLoading={isLoading}
        view={filters.calendarView}
        currentDate={currentDate}
        onViewChange={setCalendarView}
        onDateChange={setCurrentDate}
        onAppointmentClick={handleAppointmentClick}
        onTaskClick={handleTaskClick}
        onCreateWithSlot={handleCreateWithSlot}
        onCreateWithDate={handleCreateWithDate}
        onMoreClick={handleMoreClick}
      />

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
