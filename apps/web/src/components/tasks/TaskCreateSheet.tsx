'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription, toast } from '@intelliflow/ui';
import type { TaskPriority } from '@intelliflow/domain';
import type { CreateTaskInput } from '@intelliflow/validators/task';
import { TASK_PRIORITIES } from '@intelliflow/domain';
import { api } from '@/lib/api';
import { EntitySearchField } from './EntitySearchField';

export interface TaskCreateSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly defaultEntityType?: 'lead' | 'contact' | 'opportunity' | 'none';
  readonly defaultEntityId?: string;
  readonly defaultEntityName?: string;
  readonly defaultDueDate?: string;
  readonly onSuccess?: () => void;
}

interface FormState {
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  entityType: 'none' | 'lead' | 'contact' | 'opportunity';
  entityId: string;
  entityName: string;
}

const DEFAULT_FORM: FormState = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'MEDIUM' as TaskPriority,
  entityType: 'none',
  entityId: '',
  entityName: '',
};

export function TaskCreateSheet({
  open,
  onOpenChange,
  defaultEntityType = 'none',
  defaultEntityId = '',
  defaultEntityName = '',
  defaultDueDate = '',
  onSuccess,
}: Readonly<TaskCreateSheetProps>) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = api.useUtils();
  const createMutation = api.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      utils.task.getByEntity.invalidate();
      utils.task.getReminders.invalidate();
      toast({ title: 'Task created', description: form.title });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast({ title: 'Failed to create task', description: error.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (open) {
      setForm({
        ...DEFAULT_FORM,
        entityType: defaultEntityType,
        entityId: defaultEntityId,
        entityName: defaultEntityName,
        dueDate: defaultDueDate,
      });
      setErrors({});
    }
  }, [open, defaultEntityType, defaultEntityId, defaultEntityName, defaultDueDate]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateTaskInput = {
      title: form.title.trim(),
      priority: form.priority,
      status: 'PENDING',
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.dueDate) payload.dueDate = new Date(form.dueDate);
    if (form.entityType !== 'none' && form.entityId) {
      if (form.entityType === 'lead') payload.leadId = form.entityId;
      else if (form.entityType === 'contact') payload.contactId = form.entityId;
      else if (form.entityType === 'opportunity') payload.opportunityId = form.entityId;
    }

    createMutation.mutate(payload);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md flex flex-col overflow-hidden p-0 gap-0"
      >
        <div className="p-6 border-b flex-shrink-0">
          <SheetTitle>New Task</SheetTitle>
          <SheetDescription>
            Create a new task and optionally link it to an entity.
          </SheetDescription>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="sheet-task-title"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Title <span className="text-destructive">*</span>
            </label>
            <input
              id="sheet-task-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Enter task title"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'sheet-title-error' : undefined}
            />
            {errors.title && (
              <p id="sheet-title-error" className="text-xs text-destructive mt-1">
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="sheet-task-desc"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="sheet-task-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
              placeholder="Enter task description"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'sheet-desc-error' : undefined}
            />
            {errors.description && (
              <p id="sheet-desc-error" className="text-xs text-destructive mt-1">
                {errors.description}
              </p>
            )}
          </div>

          {/* Due Date */}
          <div>
            <label
              htmlFor="sheet-task-duedate"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Due Date
            </label>
            <input
              id="sheet-task-duedate"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="sheet-task-priority"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Priority
            </label>
            <select
              id="sheet-task-priority"
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
                    name="sheet-entityType"
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
                valueName={form.entityName}
                onChange={(id, name) => setForm((f) => ({ ...f, entityId: id, entityName: name }))}
              />
            )}
          </fieldset>
        </form>

        <div className="p-6 border-t flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm rounded-md border hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
