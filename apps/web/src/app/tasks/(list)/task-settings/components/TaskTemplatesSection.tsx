'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { taskPrioritySchema, type TaskTemplateInput } from '@intelliflow/validators';
import { SectionHeader } from './SectionHeader';

const PRIORITIES = [...taskPrioritySchema.options];
const MIN_OFFSET = 0;
const MAX_OFFSET = 365;
const ADD_FOCUS = '__add__';

export interface TaskTemplatesSectionProps {
  value: TaskTemplateInput[];
  onChange: (value: TaskTemplateInput[]) => void;
}

interface DraftState {
  index: number | null; // null = adding a new template
  name: string;
  defaultPriority: TaskTemplateInput['defaultPriority'];
  defaultDueOffsetDays: number;
}

const emptyDraft: DraftState = {
  index: null,
  name: '',
  defaultPriority: 'MEDIUM',
  defaultDueOffsetDays: 3,
};

function newTemplateId(): string {
  // crypto.randomUUID is available in browsers and jsdom (Node 22).
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tpl-${Date.now()}`;
}

export function TaskTemplatesSection({ value, onChange }: Readonly<TaskTemplatesSectionProps>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === ADD_FOCUS) {
      addButtonRef.current?.focus();
    } else {
      editButtonRefs.current.get(target)?.focus();
    }
  }, [value]);

  const openAdd = () => {
    setDraft(emptyDraft);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (index: number) => {
    const t = value[index];
    setDraft({
      index,
      name: t.name,
      defaultPriority: t.defaultPriority,
      defaultDueOffsetDays: t.defaultDueOffsetDays,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const validateDraft = (): string | null => {
    const name = draft.name.trim();
    if (!name) return 'Template name is required.';
    if (name.length > 80) return 'Template name must be 80 characters or fewer.';
    const dup = value.some(
      (t, i) => i !== draft.index && t.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (dup) return 'A template with this name already exists.';
    if (
      !Number.isInteger(draft.defaultDueOffsetDays) ||
      draft.defaultDueOffsetDays < MIN_OFFSET ||
      draft.defaultDueOffsetDays > MAX_OFFSET
    ) {
      return `Due-date offset must be a whole number between ${MIN_OFFSET} and ${MAX_OFFSET}.`;
    }
    return null;
  };

  const saveDraft = () => {
    const error = validateDraft();
    if (error) {
      setFormError(error);
      return;
    }
    const entry: TaskTemplateInput = {
      id: draft.index === null ? newTemplateId() : value[draft.index].id,
      name: draft.name.trim(),
      defaultPriority: draft.defaultPriority,
      defaultDueOffsetDays: draft.defaultDueOffsetDays,
    };
    const next =
      draft.index === null
        ? [...value, entry]
        : value.map((t, i) => (i === draft.index ? entry : t));
    onChange(next);
    setDialogOpen(false);
  };

  const removeAt = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    // Focus the row that shifts into this slot, else the previous row, else Add.
    if (next.length === 0) {
      pendingFocus.current = ADD_FOCUS;
    } else {
      const focusIndex = Math.min(index, next.length - 1);
      pendingFocus.current = next[focusIndex].id;
    }
    onChange(next);
  };

  return (
    <Card className="lg:col-span-12 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          icon="assignment"
          iconBg="bg-emerald-50 dark:bg-emerald-950"
          iconFg="text-emerald-600 dark:text-emerald-400"
          title="Task Templates"
          description="Reusable presets applied when creating a task (name, priority, due offset)."
        />
        <Button ref={addButtonRef} type="button" variant="outline" onClick={openAdd}>
          <span className="material-symbols-outlined text-[18px] mr-1" aria-hidden="true">
            add
          </span>
          <span>Add template</span>
        </Button>
      </div>

      {value.length === 0 ? (
        <EmptyState
          entity="tasks"
          size="sm"
          phase="passive"
          title="No task templates"
          description="Add a template above to speed up task creation."
          className="py-4 px-3 gap-2"
        />
      ) : (
        <Card className="divide-y divide-border">
          {value.map((template, index) => (
            <div key={template.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.defaultPriority} · due in {template.defaultDueOffsetDays} day
                  {template.defaultDueOffsetDays === 1 ? '' : 's'}
                </p>
              </div>
              <Button
                ref={(el) => {
                  if (el) editButtonRefs.current.set(template.id, el);
                  else editButtonRefs.current.delete(template.id);
                }}
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit template ${template.name}`}
                onClick={() => openEdit(index)}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete template ${template.name}`}
                onClick={() => removeAt(index)}
              >
                Delete
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.index === null ? 'Add template' : 'Edit template'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="template-name"
                value={draft.name}
                maxLength={80}
                aria-invalid={formError !== null}
                aria-describedby={formError ? 'template-form-error' : undefined}
                onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-priority" className="text-sm font-medium">
                Default priority
              </Label>
              <Select
                value={draft.defaultPriority}
                onValueChange={(v) =>
                  setDraft({ ...draft, defaultPriority: v as TaskTemplateInput['defaultPriority'] })
                }
              >
                <SelectTrigger id="template-priority" aria-label="Default priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-offset" className="text-sm font-medium">
                Default due-date offset (days)
              </Label>
              <Input
                id="template-offset"
                type="number"
                min={MIN_OFFSET}
                max={MAX_OFFSET}
                step={1}
                value={Number.isNaN(draft.defaultDueOffsetDays) ? '' : draft.defaultDueOffsetDays}
                onChange={(e) =>
                  setDraft({ ...draft, defaultDueOffsetDays: e.currentTarget.valueAsNumber })
                }
              />
            </div>

            {formError && (
              <p id="template-form-error" role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveDraft}>
              {draft.index === null ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
