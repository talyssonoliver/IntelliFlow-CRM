'use client';

/**
 * Appointment Detail Page — tRPC integration wrapper (PG-139)
 *
 * Route: /calendar/[id]
 */

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useCallback } from 'react';
import { Card, Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { AppointmentDetail } from '@/components/appointments';
import type { AppointmentDetailData } from '@/components/appointments/types';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';
import {
  getTypeConfig,
  formatTimeRange,
  formatDuration,
} from '@/lib/appointments/appointment-utils';

export default function AppointmentDetailPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const appointmentId = params.id as string;

  const utils = (api as Record<string, any>).useUtils?.() ?? {};

  // tRPC queries
  const { data: appointmentData, isLoading } = (
    api as Record<string, any>
  ).appointments?.getById?.useQuery?.({ id: appointmentId }) ?? {
    data: undefined,
    isLoading: false,
  };

  // Mutations
  const invalidateAll = useCallback(() => {
    utils.appointments?.getById?.invalidate?.({ id: appointmentId });
    utils.appointments?.list?.invalidate?.();
    utils.appointments?.stats?.invalidate?.();
  }, [utils, appointmentId]);

  const confirmMutation = (api as Record<string, any>).appointments?.confirm?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };
  const completeMutation = (api as Record<string, any>).appointments?.complete?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };
  const cancelMutation = (api as Record<string, any>).appointments?.cancel?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };
  const noShowMutation = (api as Record<string, any>).appointments?.markNoShow?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };
  const rescheduleMutation = (api as Record<string, any>).appointments?.reschedule?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };
  const addAttendeeMutation = (api as Record<string, any>).appointments?.addAttendee?.useMutation?.(
    { onSuccess: invalidateAll }
  ) ?? { mutateAsync: async () => {} };
  const removeAttendeeMutation = (
    api as Record<string, any>
  ).appointments?.removeAttendee?.useMutation?.({ onSuccess: invalidateAll }) ?? {
    mutateAsync: async () => {},
  };
  const linkCaseMutation = (api as Record<string, any>).appointments?.linkCase?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };
  const unlinkCaseMutation = (api as Record<string, any>).appointments?.unlinkCase?.useMutation?.({
    onSuccess: invalidateAll,
  }) ?? { mutateAsync: async () => {} };

  const handleConfirm = useCallback(async () => {
    await confirmMutation.mutateAsync({ id: appointmentId });
  }, [confirmMutation, appointmentId]);

  const handleComplete = useCallback(
    async (notes?: string) => {
      await completeMutation.mutateAsync({ id: appointmentId, notes });
    },
    [completeMutation, appointmentId]
  );

  const handleCancel = useCallback(
    async (reason?: string) => {
      await cancelMutation.mutateAsync({ id: appointmentId, reason });
    },
    [cancelMutation, appointmentId]
  );

  const handleMarkNoShow = useCallback(async () => {
    await noShowMutation.mutateAsync({ id: appointmentId });
  }, [noShowMutation, appointmentId]);

  const handleReschedule = useCallback(
    async (newStart: Date, newEnd: Date, reason?: string) => {
      await rescheduleMutation.mutateAsync({
        id: appointmentId,
        startTime: newStart,
        endTime: newEnd,
        reason,
      });
    },
    [rescheduleMutation, appointmentId]
  );

  const handleAddAttendee = useCallback(
    async (userId: string) => {
      await addAttendeeMutation.mutateAsync({ appointmentId, userId });
    },
    [addAttendeeMutation, appointmentId]
  );

  const handleRemoveAttendee = useCallback(
    async (attendeeId: string) => {
      await removeAttendeeMutation.mutateAsync({ appointmentId, attendeeId });
    },
    [removeAttendeeMutation, appointmentId]
  );

  const handleLinkCase = useCallback(
    async (caseId: string) => {
      await linkCaseMutation.mutateAsync({ appointmentId, caseId });
    },
    [linkCaseMutation, appointmentId]
  );

  const handleUnlinkCase = useCallback(
    async (caseId: string) => {
      await unlinkCaseMutation.mutateAsync({ appointmentId, caseId });
    },
    [unlinkCaseMutation, appointmentId]
  );

  const detailData = useMemo((): AppointmentDetailData | null => {
    if (!appointmentData) return null;
    const d = appointmentData as never as AppointmentDetailData;
    return {
      ...d,
      startTime: new Date(d.startTime),
      endTime: new Date(d.endTime),
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
      attendees: d.attendees ?? [],
      linkedCases: d.linkedCases ?? [],
    };
  }, [appointmentData]);

  const headerDescription = useMemo(() => {
    if (!detailData) {
      return 'Review appointment schedule, attendees, linked cases, and status actions.';
    }

    const appointmentTypeLabel = getTypeConfig(detailData.appointmentType).label;
    const dateLabel = detailData.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${appointmentTypeLabel} - ${dateLabel} - ${formatTimeRange(detailData.startTime, detailData.endTime)} (${formatDuration(detailData.startTime, detailData.endTime)})`;
  }, [detailData]);

  const pageHeader = (
    <PageHeader
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Calendar', href: '/calendar' },
        { label: 'Appointment Detail' },
      ]}
      title={detailData?.title ?? 'Appointment Detail'}
      description={headerDescription}
      actions={[
        {
          label: 'Back to Calendar',
          icon: 'arrow_back',
          variant: 'secondary',
          href: '/calendar',
        },
        {
          label: 'New Appointment',
          icon: 'add',
          variant: 'primary',
          href: '/calendar/new',
        },
      ]}
    />
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-6 w-64 mb-4" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {pageHeader}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Skeleton className="h-80 rounded-xl" />
          </div>
          <div className="col-span-6">
            <Skeleton className="h-96 rounded-xl" />
          </div>
          <div className="col-span-3">
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="flex flex-col gap-6">
        {pageHeader}
        <Card className="p-8 text-center rounded-xl">
          <span className="material-symbols-outlined text-4xl text-muted-foreground/50 mb-3">
            search_off
          </span>
          <p className="text-muted-foreground">Appointment not found</p>
          <button
            onClick={() => router.push('/calendar')}
            className="mt-4 text-primary hover:underline text-sm font-medium"
          >
            Back to Calendar
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pageHeader}
      <AppointmentDetail
        appointment={detailData}
        isLoading={isLoading}
        onConfirm={handleConfirm}
        onComplete={handleComplete}
        onCancel={handleCancel}
        onMarkNoShow={handleMarkNoShow}
        onReschedule={handleReschedule}
        onAddAttendee={handleAddAttendee}
        onRemoveAttendee={handleRemoveAttendee}
        onLinkCase={handleLinkCase}
        onUnlinkCase={handleUnlinkCase}
      />
    </div>
  );
}
