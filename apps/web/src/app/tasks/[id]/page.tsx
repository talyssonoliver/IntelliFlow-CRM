'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { TaskDetail, type TaskDetailData } from '@/components/tasks/TaskDetail';
import { TaskForm, type TaskFormData } from '@/components/tasks/TaskForm';
import { ActivityFeed } from '@/components/shared/activity-feed';

function getEntityName(task: TaskDetailData): string {
  if (task.lead) return `${task.lead.firstName} ${task.lead.lastName}`;
  if (task.contact) return `${task.contact.firstName} ${task.contact.lastName}`;
  if (task.opportunity) return task.opportunity.name;
  return '';
}

function getEntityType(task: TaskDetailData): 'lead' | 'contact' | 'opportunity' | 'none' {
  if (task.lead) return 'lead';
  if (task.contact) return 'contact';
  if (task.opportunity) return 'opportunity';
  return 'none';
}

function getTaskDueDateString(task: TaskDetailData): string {
  if (!task.dueDate) return '';
  if (typeof task.dueDate === 'string') return task.dueDate.split('T')[0];
  return task.dueDate.toISOString().split('T')[0];
}

function buildEditInitialData(task: TaskDetailData) {
  return {
    title: task.title,
    description: task.description ?? '',
    dueDate: getTaskDueDateString(task),
    priority: task.priority,
    status: task.status,
    entityType: getEntityType(task),
    entityId: task.lead?.id ?? task.contact?.id ?? task.opportunity?.id ?? '',
    entityName: getEntityName(task),
  };
}

function isTaskNotFound(
  isLoading: boolean,
  task: unknown,
  error: { data?: { code?: string | null } | null } | null | undefined
): boolean {
  return !isLoading && !task && (!error || error.data?.code === 'NOT_FOUND');
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [editingTask, setEditingTask] = useState<TaskDetailData | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();

  const utils = api.useUtils();

  const {
    data: task,
    isLoading,
    error,
  } = api.task.getById.useQuery(
    { id: params.id },
    { enabled: isAuthenticated && !authLoading && !!params.id }
  );

  const completeMutation = api.task.complete.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: params.id });
      utils.task.list.invalidate();
      toast({ title: 'Task Completed', description: 'The task has been marked as complete.' });
    },
    onError: (err) => {
      toast({ title: 'Complete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = api.task.update.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: params.id });
      utils.task.list.invalidate();
      toast({ title: 'Task Updated', description: 'The task has been updated successfully.' });
      setEditingTask(null);
    },
    onError: (err) => {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = api.task.delete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast({ title: 'Task Deleted', description: 'The task has been deleted.' });
      router.push('/tasks');
    },
    onError: (err) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const startMutation = api.task.start.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: params.id });
      utils.task.list.invalidate();
      toast({ title: 'Task Started', description: 'The task is now in progress.' });
    },
    onError: (err) => {
      toast({ title: 'Start Failed', description: err.message, variant: 'destructive' });
    },
  });

  const archiveMutation = api.task.archive.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: params.id });
      utils.task.list.invalidate();
      toast({ title: 'Task Archived', description: 'The task has been archived.' });
      router.push('/tasks');
    },
    onError: (err) => {
      toast({ title: 'Archive Failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleStart = useCallback(
    (id: string) => {
      startMutation.mutate({ taskId: id });
    },
    [startMutation]
  );

  const handleComplete = useCallback(
    (id: string) => {
      completeMutation.mutate({ taskId: id });
    },
    [completeMutation]
  );

  const handleEdit = useCallback((t: TaskDetailData) => {
    setEditingTask(t);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({ id });
    },
    [deleteMutation]
  );

  const handleArchive = useCallback(
    (id: string) => {
      archiveMutation.mutate({ id });
    },
    [archiveMutation]
  );

  const handleEditSubmit = useCallback(
    (formData: TaskFormData) => {
      if (!editingTask) return;
      const entityIds = {
        leadId: formData.entityType === 'lead' && formData.entityId ? formData.entityId : undefined,
        contactId: formData.entityType === 'contact' && formData.entityId ? formData.entityId : undefined,
        opportunityId: formData.entityType === 'opportunity' && formData.entityId ? formData.entityId : undefined,
      };
      updateMutation.mutate({
        id: editingTask.id,
        title: formData.title,
        description: formData.description || undefined,
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
        priority: formData.priority,
        status: formData.status,
        ...entityIds,
      });
    },
    [editingTask, updateMutation]
  );

  const isNotFound = isTaskNotFound(isLoading, task, error);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Tasks', href: '/tasks' },
          { label: task?.title ?? 'Task Detail' },
        ]}
        title=""
      />

      <TaskDetail
        task={task}
        isLoading={isLoading}
        isNotFound={isNotFound}
        onComplete={handleComplete}
        onStart={handleStart}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onArchive={handleArchive}
        isCompleting={completeMutation.isPending}
        isStarting={startMutation.isPending}
        isDeleting={deleteMutation.isPending}
        isArchiving={archiveMutation.isPending}
      />

      {/* Activity Timeline */}
      {task && (
        <section aria-label="Activity timeline">
          <h2 className="text-lg font-semibold mb-3">Activity</h2>
          <ActivityFeed entityType="TASK" entityId={params.id} height={320} />
        </section>
      )}

      {/* Edit Form */}
      <TaskForm
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSubmit={handleEditSubmit}
        initialData={editingTask ? buildEditInitialData(editingTask) : null}
        mode="edit"
      />
    </div>
  );
}
