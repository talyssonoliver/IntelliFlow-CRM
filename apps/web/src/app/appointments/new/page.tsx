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
import { revalidateCalendar } from '@/app/calendar/actions';

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

  const createMutation = api.appointments.create.useMutation({
    onSuccess: () => {
      utils.appointments.list.invalidate();
      utils.appointments.stats.invalidate();
      if (user?.id) revalidateCalendar(user.id).catch(() => {});
      router.push('/appointments');
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

  if (authLoading || !isAuthenticated) {
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
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
        onConflictCheck={() => {}}
      />
    </>
  );
}
