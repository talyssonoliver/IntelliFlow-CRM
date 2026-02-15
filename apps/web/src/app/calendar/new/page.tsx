'use client';

/**
 * New Appointment Page — tRPC integration wrapper (PG-139)
 *
 * Route: /calendar/new
 * Accessed from: Dashboard "Schedule Meeting" button, Calendar "New Appointment" button
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentForm } from '@/components/appointments';
import type { AppointmentFormData } from '@/components/appointments/types';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

export default function NewAppointmentPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();

  const utils = (api as Record<string, any>).useUtils?.() ?? {};

  const createMutation = (api as Record<string, any>).appointments?.create?.useMutation?.({
    onSuccess: () => {
      utils.appointments?.list?.invalidate?.();
      utils.appointments?.stats?.invalidate?.();
      router.push('/calendar');
    },
  }) ?? { mutateAsync: async () => {}, isPending: false };

  const handleSubmit = useCallback(async (data: AppointmentFormData) => {
    await createMutation.mutateAsync(data);
  }, [createMutation]);

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
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
        existingAppointments={[]}
      />
    </>
  );
}
