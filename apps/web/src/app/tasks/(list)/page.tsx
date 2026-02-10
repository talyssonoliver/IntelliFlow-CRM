'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Skeleton } from '@intelliflow/ui';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { taskStatusOptions, taskPriorityOptions } from '@/lib/shared/filter-utils';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { TaskList, type TaskListItem } from '@/components/tasks/TaskList';
import { TaskCalendar, type CalendarTask } from '@/components/tasks/TaskCalendar';
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

type ViewMode = 'list' | 'calendar';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'dueDate-asc', label: 'Due Date (Earliest)' },
  { value: 'dueDate-desc', label: 'Due Date (Latest)' },
  { value: 'priority-desc', label: 'Highest Priority' },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [createDefaultDate, setCreateDefaultDate] = useState<string>('');

  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const debouncedSearch = useDebounce(searchQuery, 300);

  const utils = api.useUtils();
  const sortParams = getSortParams(sortOrder);

  // Main data query
  const { data, isLoading, error, refetch } = api.task.list.useQuery(
    {
      search: debouncedSearch || undefined,
      status: statusFilter ? [statusFilter as TaskStatus] : undefined,
      priority: priorityFilter ? [priorityFilter as TaskPriority] : undefined,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
    },
    { enabled: isAuthenticated && !authLoading }
  );

  // Reminder counts query
  const { data: remindersData } = api.task.getReminders.useQuery(
    undefined,
    { enabled: isAuthenticated && !authLoading }
  );

  // Mutations
  const createMutation = api.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      utils.task.getReminders.invalidate();
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
      utils.task.getReminders.invalidate();
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
      utils.task.getReminders.invalidate();
      toast({ title: 'Task Completed', description: 'The task has been marked as complete.' });
    },
    onError: (err) => {
      toast({ title: 'Complete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = api.task.delete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      utils.task.getReminders.invalidate();
      toast({ title: 'Task Deleted', description: 'The task has been deleted.' });
    },
    onError: (err) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const tasks = useMemo(() => {
    if (!data?.tasks) return [];
    return data.tasks as TaskListItem[];
  }, [data]);

  const calendarTasks: CalendarTask[] = useMemo(() => {
    return tasks
      .filter((t) => t.dueDate != null)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!,
        priority: t.priority,
      }));
  }, [tasks]);

  const overdueCount = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return tasks.filter((t) => {
      if (!t.dueDate || t.status === 'COMPLETED' || t.status === 'CANCELLED') return false;
      const d = typeof t.dueDate === 'string' ? new Date(t.dueDate) : t.dueDate;
      const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dueDay < today;
    }).length;
  }, [tasks]);

  const dueTodayCount = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return tasks.filter((t) => {
      if (!t.dueDate || t.status === 'COMPLETED' || t.status === 'CANCELLED') return false;
      const d = typeof t.dueDate === 'string' ? new Date(t.dueDate) : t.dueDate;
      const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dueDay.getTime() === today.getTime();
    }).length;
  }, [tasks]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleRowClick = useCallback((id: string) => {
    router.push(`/tasks/${id}`);
  }, [router]);

  const handleComplete = useCallback((id: string) => {
    completeMutation.mutate({ taskId: id });
  }, [completeMutation]);

  const handleEdit = useCallback((task: TaskListItem) => {
    setEditingTask(task);
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate({ id });
  }, [deleteMutation]);

  const handleBulkComplete = useCallback((ids: string[]) => {
    ids.forEach((id) => completeMutation.mutate({ taskId: id }));
  }, [completeMutation]);

  const handleBulkDelete = useCallback((ids: string[]) => {
    ids.forEach((id) => deleteMutation.mutate({ id }));
  }, [deleteMutation]);

  const handleCreateSubmit = useCallback((formData: TaskFormData) => {
    createMutation.mutate({
      title: formData.title,
      description: formData.description || undefined,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      priority: formData.priority,
      leadId: formData.entityType === 'lead' && formData.entityId ? formData.entityId : undefined,
      contactId: formData.entityType === 'contact' && formData.entityId ? formData.entityId : undefined,
      opportunityId: formData.entityType === 'opportunity' && formData.entityId ? formData.entityId : undefined,
    });
  }, [createMutation]);

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

  const handleCalendarTaskClick = useCallback((id: string) => {
    router.push(`/tasks/${id}`);
  }, [router]);

  const handleCreateWithDate = useCallback((date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setCreateDefaultDate(dateStr);
    setShowCreateForm(true);
  }, []);

  const handleReminderFilter = useCallback((filter: 'overdue' | 'today') => {
    if (filter === 'overdue') {
      setStatusFilter('');
      setSortOrder('dueDate-asc');
    } else {
      setStatusFilter('');
      setSortOrder('dueDate-asc');
    }
  }, []);

  const totalItems = data?.total ?? tasks.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Tasks' },
        ]}
        title="Task Management"
        description={`Track and manage your tasks.${totalItems > 0 ? ` (${totalItems} total)` : ''}`}
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

      {/* View Mode Toggle + Search/Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">view_list</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
              aria-label="Calendar view"
              aria-pressed={viewMode === 'calendar'}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">calendar_month</span>
            </button>
          </div>
        </div>

        {viewMode === 'list' && (
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
        )}
      </div>

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span className="material-symbols-outlined text-[48px] text-red-500 mb-4" aria-hidden="true">error</span>
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
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
            Try Again
          </button>
        </div>
      )}

      {/* Content */}
      {!error && viewMode === 'list' && (
        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          onComplete={handleComplete}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onBulkComplete={handleBulkComplete}
          onBulkDelete={handleBulkDelete}
        />
      )}

      {!error && viewMode === 'calendar' && (
        isLoading ? (
          <div className="space-y-3" data-testid="calendar-skeleton">
            <Skeleton className="h-[400px] w-full rounded" />
          </div>
        ) : (
          <TaskCalendar
            tasks={calendarTasks}
            onTaskClick={handleCalendarTaskClick}
            onCreateWithDate={handleCreateWithDate}
          />
        )
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
