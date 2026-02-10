'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { TaskDetail, type TaskDetailData } from '@/components/tasks/TaskDetail';
import { TaskForm, type TaskFormData } from '@/components/tasks/TaskForm';

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [editingTask, setEditingTask] = useState<TaskDetailData | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();

  const utils = api.useUtils();

  const { data: task, isLoading, error } = api.task.getById.useQuery(
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

  const handleComplete = useCallback((id: string) => {
    completeMutation.mutate({ taskId: id });
  }, [completeMutation]);

  const handleEdit = useCallback((t: TaskDetailData) => {
    setEditingTask(t);
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate({ id });
  }, [deleteMutation]);

  const handleEditSubmit = useCallback((formData: TaskFormData) => {
    if (!editingTask) return;
    updateMutation.mutate({
      id: editingTask.id,
      title: formData.title,
      description: formData.description || undefined,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      priority: formData.priority,
      status: formData.status,
    });
  }, [editingTask, updateMutation]);

  const isNotFound = !isLoading && !task && !error;

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
      />

      {/* Edit Form */}
      <TaskForm
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSubmit={handleEditSubmit}
        initialData={editingTask ? {
          title: editingTask.title,
          description: editingTask.description ?? '',
          dueDate: editingTask.dueDate ? (typeof editingTask.dueDate === 'string' ? editingTask.dueDate.split('T')[0] : '') : '',
          priority: editingTask.priority,
          status: editingTask.status,
          entityType: editingTask.lead ? 'lead' : editingTask.contact ? 'contact' : editingTask.opportunity ? 'opportunity' : 'none',
          entityId: editingTask.lead?.id ?? editingTask.contact?.id ?? editingTask.opportunity?.id ?? '',
        } : null}
        mode="edit"
      />
    </div>
  );
}
