'use client';

/**
 * Appointment Detail Page — tRPC integration wrapper (PG-139)
 *
 * Thin wrapper that fetches a single appointment via tRPC and delegates
 * rendering to the AppointmentDetail extracted component.
 */

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useCallback } from 'react';
import { Card, Skeleton } from '@intelliflow/ui';
import { AppointmentDetail } from '@/components/appointments';
import type { AppointmentDetailData } from '@/components/appointments';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

export default function AppointmentDetailPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const appointmentId = params.id as string;

  const utils = api.useUtils();

  // tRPC queries
  const { data: appointmentData, isLoading } = api.appointments.getById.useQuery(
    { id: appointmentId },
  );

  // Mutations
  const confirmMutation = api.appointments.confirm.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
      utils.appointments.list.invalidate();
      utils.appointments.stats.invalidate();
    },
  });

  const completeMutation = api.appointments.complete.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
      utils.appointments.list.invalidate();
      utils.appointments.stats.invalidate();
    },
  });

  const cancelMutation = api.appointments.cancel.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
      utils.appointments.list.invalidate();
      utils.appointments.stats.invalidate();
    },
  });

  const noShowMutation = api.appointments.markNoShow.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
      utils.appointments.list.invalidate();
      utils.appointments.stats.invalidate();
    },
  });

  const rescheduleMutation = api.appointments.reschedule.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
      utils.appointments.list.invalidate();
    },
  });

  const addAttendeeMutation = api.appointments.addAttendee.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
    },
  });

  const removeAttendeeMutation = api.appointments.removeAttendee.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
    },
  });

  const linkCaseMutation = api.appointments.linkToCase.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
    },
  });

  const unlinkCaseMutation = api.appointments.unlinkFromCase.useMutation({
    onSuccess: () => {
      utils.appointments.getById.invalidate({ id: appointmentId });
    },
  });

  const handleConfirm = useCallback(async () => {
    await confirmMutation.mutateAsync({ id: appointmentId });
  }, [confirmMutation, appointmentId]);

  const handleComplete = useCallback(async (notes?: string) => {
    await completeMutation.mutateAsync({ id: appointmentId, notes } as never);
  }, [completeMutation, appointmentId]);

  const handleCancel = useCallback(async (reason?: string) => {
    await cancelMutation.mutateAsync({ id: appointmentId, reason } as never);
  }, [cancelMutation, appointmentId]);

  const handleMarkNoShow = useCallback(async () => {
    await noShowMutation.mutateAsync({ id: appointmentId });
  }, [noShowMutation, appointmentId]);

  const handleReschedule = useCallback(async (newStart: Date, newEnd: Date, _reason?: string) => {
    await rescheduleMutation.mutateAsync({
      id: appointmentId,
      startTime: newStart.toISOString(),
      endTime: newEnd.toISOString(),
    } as never);
  }, [rescheduleMutation, appointmentId]);

  const handleAddAttendee = useCallback(async (userId: string) => {
    await addAttendeeMutation.mutateAsync({ appointmentId, userId } as never);
  }, [addAttendeeMutation, appointmentId]);

  const handleRemoveAttendee = useCallback(async (userId: string) => {
    await removeAttendeeMutation.mutateAsync({ appointmentId, attendeeId: userId } as never);
  }, [removeAttendeeMutation, appointmentId]);

  const handleLinkCase = useCallback(async (caseId: string) => {
    await linkCaseMutation.mutateAsync({ appointmentId, caseId } as never);
  }, [linkCaseMutation, appointmentId]);

  const handleUnlinkCase = useCallback(async (caseId: string) => {
    await unlinkCaseMutation.mutateAsync({ appointmentId, caseId } as never);
  }, [unlinkCaseMutation, appointmentId]);

  const detailData = useMemo((): AppointmentDetailData | null => {
    if (!appointmentData) return null;
    const d = appointmentData as never as AppointmentDetailData;
    return {
      ...d,
      startTime: new Date(d.startTime),
      endTime: new Date(d.endTime),
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
      completedAt: d.completedAt ? new Date(d.completedAt) : undefined,
      cancelledAt: d.cancelledAt ? new Date(d.cancelledAt) : undefined,
      attendees: d.attendees ?? [],
      linkedCases: d.linkedCases ?? [],
    };
  }, [appointmentData]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-6 px-4">
          <Skeleton className="h-6 w-64 mb-4" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-6 px-4">
          <Skeleton className="h-6 w-64 mb-4" />
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
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-6 px-4">
          <Card className="p-8 text-center rounded-xl">
            <span className="material-symbols-outlined text-4xl text-muted-foreground/50 mb-3">
              search_off
            </span>
            <p className="text-muted-foreground">Appointment not found</p>
            <button
              onClick={() => router.push('/appointments')}
              className="mt-4 text-primary hover:underline text-sm font-medium"
            >
              Back to Appointments
            </button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4">
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
    </div>
  );
}
