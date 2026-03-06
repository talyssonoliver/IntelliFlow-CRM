'use client';

/**
 * New Appointment Page — tRPC integration wrapper (PG-139)
 *
 * Route: /calendar/new
 * Accessed from: Dashboard "Schedule Meeting" button, Calendar "New Appointment" button
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentForm } from '@/components/appointments';
import type { AppointmentFormInput } from '@/components/appointments/types';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

export default function NewAppointmentPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultStartTime = useMemo(() => {
    const raw = searchParams.get('start');
    if (!raw) return undefined;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d;
  }, [searchParams]);

  const defaultEndTime = useMemo(() => {
    const raw = searchParams.get('end');
    if (!raw) return undefined;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d;
  }, [searchParams]);

  const utils = api.useUtils();

  const createMutation = api.appointments.create.useMutation({
    onSuccess: () => {
      utils.appointments.list.invalidate();
      utils.appointments.stats.invalidate();
      router.push('/calendar');
    },
  });

  const handleSubmit = useCallback(
    async (data: AppointmentFormInput) => {
      // Convert null recurrence to undefined for the tRPC schema
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
    router.push('/calendar');
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
          { label: 'Calendar', href: '/calendar' },
          { label: 'New Appointment' },
        ]}
        title="Schedule Appointment"
        description="Create a new appointment, hearing, or consultation"
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
