'use client';

import { useState, useEffect } from 'react';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';
import { TASK_STATUSES, TASK_PRIORITIES } from '@intelliflow/domain';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@intelliflow/ui';
import { EntitySearchField } from './EntitySearchField';
import { useCalendarVisibilityOptional } from '@/hooks/useCalendarVisibility';

export interface TaskFormData {
  readonly title: string;
  readonly description: string;
  readonly dueDate: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly entityType: 'none' | 'lead' | 'contact' | 'opportunity';
  readonly entityId: string;
  readonly entityName: string;
  readonly calendarId: string;
}

export interface TaskFormProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: TaskFormData) => void;
  readonly initialData?: Partial<TaskFormData> | null;
  readonly mode: 'create' | 'edit';
}

const DEFAULT_FORM: TaskFormData = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'MEDIUM' as TaskPriority,
  status: 'PENDING' as TaskStatus,
  entityType: 'none',
  entityId: '',
  entityName: '',
  calendarId: '',
};

export function TaskForm({ open, onClose, onSubmit, initialData, mode }: Readonly<TaskFormProps>) {
  const [form, setForm] = useState<TaskFormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { dbCalendars } = useCalendarVisibilityOptional();

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setForm({ ...DEFAULT_FORM, ...initialData });
      } else {
        setForm(DEFAULT_FORM);
      }
      setErrors({});
    }
  }, [open, mode, initialData]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (form.title.length > 200) {
      newErrors.title = 'Title must be 200 characters or less';
    }
    if (form.description && form.description.length > 2000) {
      newErrors.description = 'Description must be 2000 characters or less';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  }

  function handleClose() {
    setForm(DEFAULT_FORM);
    setErrors({});
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-lg flex flex-col overflow-hidden p-0 gap-0"
        aria-label={mode === 'create' ? 'Create task' : 'Edit task'}
      >
        <div className="p-6 border-b flex-shrink-0">
          <SheetTitle>{mode === 'create' ? 'New Task' : 'Edit Task'}</SheetTitle>
          <SheetDescription>
            {mode === 'create' ? 'Create a new task.' : 'Update task details.'}
          </SheetDescription>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="task-title" className="block text-sm font-medium text-foreground mb-1">
              Title{' '}<span className="text-destructive">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Enter task title"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
            {errors.title && (
              <p id="title-error" className="text-xs text-destructive mt-1">
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-description"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="task-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
              placeholder="Enter task description"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'desc-error' : undefined}
            />
            {errors.description && (
              <p id="desc-error" className="text-xs text-destructive mt-1">
                {errors.description}
              </p>
            )}
          </div>

          {/* Due Date */}
          <div>
            <label
              htmlFor="task-duedate"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Due Date
            </label>
            <input
              id="task-duedate"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Calendar */}
          <div>
            <label
              htmlFor="task-calendar"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Calendar
            </label>
            <select
              id="task-calendar"
              value={form.calendarId}
              onChange={(e) => setForm((f) => ({ ...f, calendarId: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Tasks (Default)</option>
              {dbCalendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="task-priority"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Priority
            </label>
            <select
              id="task-priority"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Status (edit only) */}
          {mode === 'edit' && (
            <div>
              <label
                htmlFor="task-status"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Status
              </label>
              <select
                id="task-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Entity Linking */}
          <fieldset>
            <legend className="text-sm font-medium text-foreground mb-2">Link to Entity</legend>
            <div className="flex gap-4 flex-wrap mb-3">
              {(['none', 'lead', 'contact', 'opportunity'] as const).map((type) => (
                <label
                  key={type}
                  className="inline-flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="entityType"
                    value={type}
                    checked={form.entityType === type}
                    onChange={() =>
                      setForm((f) => ({ ...f, entityType: type, entityId: '', entityName: '' }))
                    }
                    className="accent-primary"
                  />
                  {type === 'none' ? 'None' : type.charAt(0).toUpperCase() + type.slice(1)}
                </label>
              ))}
            </div>
            {form.entityType !== 'none' && (
              <EntitySearchField
                entityType={form.entityType}
                value={form.entityId}
                valueName={form.entityName || ''}
                onChange={(id, name) => setForm((f) => ({ ...f, entityId: id, entityName: name }))}
              />
            )}
          </fieldset>
        </form>

        <div className="p-6 border-t flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-md border hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {mode === 'create' ? 'Create Task' : 'Save Changes'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
