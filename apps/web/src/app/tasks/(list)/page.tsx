'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@intelliflow/ui';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { taskStatusOptions, taskPriorityOptions } from '@/lib/shared/filter-utils';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { TaskList, type TaskListItem } from '@/components/tasks/TaskList';

function getEntityName(task: TaskListItem): string {
  if (task.lead) return `${task.lead.firstName} ${task.lead.lastName}`; // NOSONAR typescript:S4624 — independent template literals in separate if-branches, not nested
  if (task.contact) return `${task.contact.firstName} ${task.contact.lastName}`;
  if (task.opportunity) return task.opportunity.name;
  return '';
}

function resolveEntityIds(formData: TaskFormData): {
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
} {
  const id = formData.entityId || undefined;
  return {
    leadId: formData.entityType === 'lead' ? id : undefined,
    contactId: formData.entityType === 'contact' ? id : undefined,
    opportunityId: formData.entityType === 'opportunity' ? id : undefined,
  };
}

function getEditingTaskDueDate(task: TaskListItem | null): string {
  if (!task?.dueDate) return '';
  if (typeof task.dueDate === 'string') return task.dueDate.split('T')[0];
  return task.dueDate.toISOString().split('T')[0];
}
import { TaskForm, type TaskFormData } from '@/components/tasks/TaskForm';
import { ReminderConfig } from '@/components/tasks/ReminderConfig';

// Custom hook for debounced value
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'dueDate-asc', label: 'Due Date (Earliest)' },
  { value: 'dueDate-desc', label: 'Due Date (Latest)' },
  { value: 'priority-desc', label: 'Highest Priority' },
];

const INACTIVE_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'ARCHIVED']);

function isTaskActiveWithDue(task: TaskListItem): boolean {
  return !!(task.dueDate && !INACTIVE_STATUSES.has(task.status));
}

function normalizeDueDay(dueDate: string | Date): Date {
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getSortParams(sortOrder: string): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'dueDate-asc':
      return { sortBy: 'dueDate', sortOrder: 'asc' };
    case 'dueDate-desc':
      return { sortBy: 'dueDate', sortOrder: 'desc' };
    case 'priority-desc':
      return { sortBy: 'priority', sortOrder: 'desc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('newest');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [createDefaultDate, setCreateDefaultDate] = useState<string>('');
  const [page, setPage] = useState(1);

  // F-11: Read sidebar URL filter params on mount
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const urlPriority = searchParams.get('priority');
    const urlView = searchParams.get('view');

    if (urlStatus === 'OVERDUE') {
      setSortOrder('dueDate-asc');
    } else if (urlStatus) {
      setStatusFilter(urlStatus);
    }
    if (urlPriority) {
      setPriorityFilter(urlPriority);
    }
    if (urlView === 'my') {
      // "My tasks" view — no additional filter needed, ownerId is already the current user
    }
  }, [searchParams]);

  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const debouncedSearch = useDebounce(searchQuery, 300);

  const utils = api.useUtils();
  const sortParams = getSortParams(sortOrder);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, sortOrder]);

  // Main data query
  const { data, isLoading, error, refetch } = api.task.list.useQuery(
    {
      page,
      search: debouncedSearch || undefined,
      status: statusFilter ? [statusFilter as TaskStatus] : undefined,
      priority: priorityFilter ? [priorityFilter as TaskPriority] : undefined,
      overdue: searchParams.get('status') === 'OVERDUE' ? true : undefined,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
    },
    { enabled: isAuthenticated && !authLoading }
  );

  // Mutations
  const createMutation = api.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast({ title: 'Task Created', description: 'The task has been created successfully.' });
      setShowCreateForm(false);
    },
    onError: (err) => {
      toast({ title: 'Create Failed', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = api.task.update.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast({ title: 'Task Updated', description: 'The task has been updated successfully.' });
      setEditingTask(null);
    },
    onError: (err) => {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    },
  });

  const completeMutation = api.task.complete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast({ title: 'Task Completed', description: 'The task has been marked as complete.' });
    },
    onError: (err) => {
      toast({ title: 'Complete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = api.task.delete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast({ title: 'Task Deleted', description: 'The task has been deleted.' });
    },
    onError: (err) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const archiveMutation = api.task.archive.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast({ title: 'Task Archived', description: 'The task has been archived.' });
    },
    onError: (err) => {
      toast({ title: 'Archive Failed', description: err.message, variant: 'destructive' });
    },
  });

  const tasks = useMemo(() => {
    if (!data?.tasks) return [];
    return data.tasks;
  }, [data]);

  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter((t) => isTaskActiveWithDue(t) && normalizeDueDay(t.dueDate!) < today).length;
  }, [tasks]);

  const dueTodayCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter(
      (t) => isTaskActiveWithDue(t) && normalizeDueDay(t.dueDate!).getTime() === today.getTime()
    ).length;
  }, [tasks]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/tasks/${id}`);
    },
    [router]
  );

  const handleComplete = useCallback(
    (id: string) => {
      completeMutation.mutate({ taskId: id });
    },
    [completeMutation]
  );

  const handleEdit = useCallback((task: TaskListItem) => {
    setEditingTask(task);
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

  const handleBulkComplete = useCallback(
    (ids: string[]) => {
      Promise.allSettled(
        ids.map((id) => completeMutation.mutateAsync({ taskId: id }))
      ).then(() => {
        utils.task.list.invalidate();
      });
    },
    [completeMutation, utils]
  );

  const handleBulkDelete = useCallback(
    (ids: string[]) => {
      Promise.allSettled(
        ids.map((id) => deleteMutation.mutateAsync({ id }))
      ).then(() => {
        utils.task.list.invalidate();
      });
    },
    [deleteMutation, utils]
  );

  const handleBulkArchive = useCallback(
    (ids: string[]) => {
      Promise.allSettled(
        ids.map((id) => archiveMutation.mutateAsync({ id }))
      ).then(() => {
        utils.task.list.invalidate();
      });
    },
    [archiveMutation, utils]
  );

  const handleCreateSubmit = useCallback(
    (formData: TaskFormData) => {
      createMutation.mutate({
        title: formData.title,
        description: formData.description || undefined,
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
        priority: formData.priority,
        calendarId: formData.calendarId || undefined,
        ...resolveEntityIds(formData),
      });
    },
    [createMutation]
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
        ...resolveEntityIds(formData),
      });
    },
    [editingTask, updateMutation]
  );

  const handleReminderFilter = useCallback((filter: 'overdue' | 'today') => {
    setPriorityFilter('');
    setSearchQuery('');
    setSortOrder('dueDate-asc');
    if (filter === 'overdue') {
      setStatusFilter('');
      // Navigate with overdue param so the query picks up the `overdue: true` flag
      router.push('/tasks?status=OVERDUE');
    } else {
      setStatusFilter('');
      router.push('/tasks');
    }
  }, [router]);

  const totalItems = data?.total ?? tasks.length;
  const taskCountSuffix = totalItems > 0 ? ` (${totalItems} total)` : '';

  const editingTaskDueDateString = getEditingTaskDueDate(editingTask);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tasks' }]}
        title="Task Management"
        description={`Track and manage your tasks.${taskCountSuffix}`}

        actions={[
          {
            label: 'New Task',
            icon: 'add',
            variant: 'primary',
            onClick: () => {
              setCreateDefaultDate('');
              setShowCreateForm(true);
            },
          },
        ]}
      />

      {/* Reminder Banner */}
      <ReminderConfig
        overdueCount={overdueCount}
        dueTodayCount={dueTodayCount}
        onFilter={handleReminderFilter}
      />

      {/* Search/Filters */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={handleSearch}
        searchPlaceholder="Search tasks by title..."
        searchAriaLabel="Search tasks"
        filters={[
          {
            id: 'status',
            label: 'Status',
            icon: 'filter_list',
            options: taskStatusOptions(),
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            id: 'priority',
            label: 'Priority',
            icon: 'flag',
            options: taskPriorityOptions(),
            value: priorityFilter,
            onChange: setPriorityFilter,
          },
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: sortOrder,
          onChange: setSortOrder,
        }}
      />

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span
            className="material-symbols-outlined text-[48px] text-red-500 mb-4"
            aria-hidden="true"
          >
            error
          </span>
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
            Failed to load tasks
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center max-w-md">
            {error.message || 'An unexpected error occurred while fetching tasks.'}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              refresh
            </span>{' '}
            Try Again
          </button>
        </div>
      )}

      {/* Content */}
      {!error && (
        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          onComplete={handleComplete}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onArchive={handleArchive}
          onBulkComplete={handleBulkComplete}
          onBulkDelete={handleBulkDelete}
          onBulkArchive={handleBulkArchive}
        />
      )}

      {/* Pagination */}
      {!error && data && data.total > data.limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {Math.ceil(data.total / data.limit)}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.hasMore}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      <TaskForm
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        onSubmit={handleCreateSubmit}
        initialData={createDefaultDate ? { dueDate: createDefaultDate } : null}
        mode="create"
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
                dueDate: editingTaskDueDateString,
                priority: editingTask.priority,
                status: editingTask.status,
                entityType: (() => {
                  if (editingTask.lead) return 'lead';
                  if (editingTask.contact) return 'contact';
                  return editingTask.opportunity ? 'opportunity' : 'none';
                })(),
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
