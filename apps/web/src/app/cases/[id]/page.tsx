'use client';

/**
 * Case Detail Page — tRPC integration wrapper (PG-138)
 *
 * Thin wrapper that fetches a single case via tRPC and delegates
 * rendering to the CaseDetail extracted component. The component
 * renders its own breadcrumb + header matching the case-detail.html mockup.
 */

import { useParams, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Card, Skeleton } from '@intelliflow/ui';
import { CaseDetail } from '@/components/cases';
import type { CaseDetailData, CaseAssigneeOption, PartyData } from '@/components/cases';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

export default function CaseDetailPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const utils = api.useUtils();

  // tRPC queries
  const { data: caseData, isLoading } = api.cases.getById.useQuery({ id: caseId });
  const { data: assigneeOptions = [] } = api.cases.assignees.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Mutations
  const updateMutation = api.cases.update.useMutation({
    onSuccess: () => {
      utils.cases.getById.invalidate({ id: caseId });
      utils.cases.list.invalidate();
      utils.cases.stats.invalidate();
    },
  });

  const changeStatusMutation = api.cases.changeStatus.useMutation({
    onSuccess: () => {
      utils.cases.getById.invalidate({ id: caseId });
      utils.cases.list.invalidate();
      utils.cases.stats.invalidate();
    },
  });

  const closeMutation = api.cases.close.useMutation({
    onSuccess: () => {
      utils.cases.getById.invalidate({ id: caseId });
      utils.cases.list.invalidate();
      utils.cases.stats.invalidate();
    },
  });

  const addTaskMutation = api.cases.addTask.useMutation({
    onSuccess: () => {
      utils.cases.getById.invalidate({ id: caseId });
    },
  });

  const completeTaskMutation = api.cases.completeTask.useMutation({
    onSuccess: () => {
      utils.cases.getById.invalidate({ id: caseId });
    },
  });

  const removeTaskMutation = api.cases.removeTask.useMutation({
    onSuccess: () => {
      utils.cases.getById.invalidate({ id: caseId });
    },
  });

  const handleStatusChange = (status: string) => {
    changeStatusMutation.mutate({ caseId, status } as never);
  };

  const handlePriorityChange = (priority: string) => {
    updateMutation.mutate({ id: caseId, priority } as never);
  };

  const handleAssign = (userId: string) => {
    updateMutation.mutate({ id: caseId, assignedTo: userId } as never);
  };

  const handleClose = (resolution: string) => {
    closeMutation.mutate({ caseId, resolution });
  };

  const handleAddTask = (task: {
    title: string;
    description?: string;
    dueDate?: Date;
    assignee?: string;
  }) => {
    addTaskMutation.mutate({ caseId, ...task });
  };

  const handleCompleteTask = (taskId: string) => {
    completeTaskMutation.mutate({ caseId, taskId });
  };

  const handleRemoveTask = (taskId: string) => {
    removeTaskMutation.mutate({ caseId, taskId });
  };

  const handleUpdateParties = (parties: PartyData[]) => {
    updateMutation.mutate({ id: caseId, parties } as never);
  };

  const detailData = useMemo((): CaseDetailData | null => {
    if (!caseData) return null;
    const d = caseData as never as CaseDetailData;
    return {
      ...d,
      caseNumber: d.caseNumber ?? `CF-${d.id?.slice(0, 8)?.toUpperCase()}`,
      appointments: d.appointments ?? [],
      parties: d.parties ?? null,
      tags: d.tags ?? [],
      timeline: d.timeline ?? [],
      resolutionProgress: d.resolutionProgress ?? 0,
      budgetConsumed: d.budgetConsumed ?? 0,
      slaDays: d.slaDays ?? 0,
      openItems: d.openItems ?? 0,
      assignedTeam: d.assignedTeam ?? [],
    };
  }, [caseData]);

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
            <p className="text-muted-foreground">Case not found</p>
            <button
              onClick={() => router.push('/cases')}
              className="mt-4 text-primary hover:underline text-sm font-medium"
            >
              Back to Cases
            </button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4">
        <CaseDetail
          caseData={detailData}
          isLoading={isLoading}
          assigneeOptions={(assigneeOptions as CaseAssigneeOption[]) ?? []}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onAssign={handleAssign}
          onClose={handleClose}
          onAddTask={handleAddTask}
          onCompleteTask={handleCompleteTask}
          onRemoveTask={handleRemoveTask}
          onUpdateParties={handleUpdateParties}
        />
      </div>
    </div>
  );
}
