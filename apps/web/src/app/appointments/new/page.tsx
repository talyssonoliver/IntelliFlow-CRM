'use client';

/**
 * New Appointment Page
 *
 * Route: /appointments/new
 * Accessed from: calendar page, appointments list, dashboard quick actions,
 * contact/lead/case panels, entity hover card, etc.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentForm } from '@/components/appointments';
import type { AppointmentFormInput } from '@/components/appointments/types';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';
import { revalidateCalendarCache } from '@/lib/calendar/revalidate-calendar-cache';

export default function NewAppointmentPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultStartTime = useMemo(() => {
    const raw = searchParams.get('start');
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [searchParams]);

  const defaultEndTime = useMemo(() => {
    const raw = searchParams.get('end');
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [searchParams]);

  const utils = api.useUtils();

  // The form reads its buffers once on mount, so it renders after the firm defaults settle
  // (PG-202 owner Q7). If they cannot be read, the form starts without them.
  const settingsQuery = api.appointmentSettings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const firm = settingsQuery.data;
  const defaultBuffers = firm
    ? { before: firm.defaultBufferBeforeMinutes, after: firm.defaultBufferAfterMinutes }
    : undefined;

  const createMutation = api.appointments.create.useMutation({
    onSuccess: () => {
      router.push('/appointments');
      return Promise.all([
        utils.appointments.list.invalidate(),
        utils.appointments.stats.invalidate(),
        user?.id ? revalidateCalendarCache(user.id) : undefined,
      ]);
    },
  });

  const handleSubmit = useCallback(
    async (data: AppointmentFormInput) => {
      const { recurrence, calendarId, ...rest } = data;
      await createMutation.mutateAsync({
        ...rest,
        recurrence: recurrence ?? undefined,
        calendarId: calendarId ?? undefined,
      });
    },
    [createMutation]
  );

  const handleCancel = useCallback(() => {
    router.push('/appointments');
  }, [router]);

  if (authLoading || !isAuthenticated || settingsQuery.isLoading) {
    return (
      <>
        <Skeleton className="h-6 w-64 mb-4" />
        <Skeleton className="h-96 rounded-xl" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Appointments', href: '/appointments' },
          { label: 'New Appointment' },
        ]}
        title="New Appointment"
        description="Schedule a meeting, call, hearing, or consultation"
      />
      <AppointmentForm
        defaultStartTime={defaultStartTime}
        defaultEndTime={defaultEndTime}
        defaultBuffers={defaultBuffers}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
        onConflictCheck={() => {}}
      />
    </>
  );
}
