'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { TaskDetail, type TaskDetailData } from '@/components/tasks/TaskDetail';
import { TaskForm, type TaskFormData } from '@/components/tasks/TaskForm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getEntityName(task: TaskDetailData): string {
  if (task.lead) return `${task.lead.firstName} ${task.lead.lastName}`;
  if (task.contact) return `${task.contact.firstName} ${task.contact.lastName}`;
  if (task.opportunity) return task.opportunity.name;
  return '';
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [editingTask, setEditingTask] = useState<TaskDetailData | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();

  const utils = api.useUtils();

  const isValidId = UUID_REGEX.test(params.id ?? '');

  const {
    data: task,
    isLoading,
    error,
  } = api.task.getById.useQuery(
    { id: params.id },
    { enabled: isAuthenticated && !authLoading && !!params.id && isValidId }
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
      updateMutation.mutate({
        id: editingTask.id,
        title: formData.title,
        description: formData.description || undefined,
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
        priority: formData.priority,
        status: formData.status,
      });
    },
    [editingTask, updateMutation]
  );

  const isNotFound =
    !isLoading && !task && (!error || !isValidId || error.data?.code === 'NOT_FOUND');

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
        task={task as TaskDetailData | null | undefined}
        isLoading={isLoading}
        isNotFound={isNotFound}
        onComplete={handleComplete}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onArchive={handleArchive}
      />

      {/* Edit Form */}
      <TaskForm
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSubmit={handleEditSubmit}
        initialData={
          editingTask
            ? {
                title: editingTask.title,
                description: editingTask.description ?? '',
                dueDate: editingTask.dueDate
                  ? typeof editingTask.dueDate === 'string'
                    ? editingTask.dueDate.split('T')[0]
                    : ''
                  : '',
                priority: editingTask.priority,
                status: editingTask.status,
                entityType: editingTask.lead
                  ? 'lead'
                  : editingTask.contact
                    ? 'contact'
                    : editingTask.opportunity
                      ? 'opportunity'
                      : 'none',
                entityId:
                  editingTask.lead?.id ??
                  editingTask.contact?.id ??
                  editingTask.opportunity?.id ??
                  '',
                entityName: getEntityName(editingTask),
              }
            : null
        }
        mode="edit"
      />
    </div>
  );
}
