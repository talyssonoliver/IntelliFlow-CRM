'use client';

// Scheduled report tags — PG-201. forwardRef + useImperativeHandle({ openCreate })
// so the parent's SectionHeader "New Tag" button opens the dialog (playbook §4).

import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  Button,
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
import type {
  CreateReportScheduleTagInput,
  ReportScheduleColorToken,
  ReportScheduleTagView,
  UpdateReportScheduleTagInput,
} from '@intelliflow/validators';
import {
  REPORT_SCHEDULE_COLOR_TOKENS,
  colorLabel,
  normalizeColorToken,
  swatchClass,
} from './schedule-colors';

export interface TagsTabHandle {
  openCreate: () => void;
}

export interface TagsTabProps {
  readonly tags: ReportScheduleTagView[];
  readonly canEdit: boolean;
  readonly onCreate: (input: CreateReportScheduleTagInput) => Promise<void>;
  readonly onUpdate: (input: UpdateReportScheduleTagInput) => Promise<void>;
  readonly onDelete: (tag: ReportScheduleTagView) => void;
  readonly isBusy?: boolean;
}

interface DialogState {
  open: boolean;
  editing?: ReportScheduleTagView;
  name: string;
  colorToken: ReportScheduleColorToken;
  description: string;
}

const EMPTY_DIALOG: DialogState = { open: false, name: '', colorToken: 'slate', description: '' };

export const TagsTab = forwardRef<TagsTabHandle, TagsTabProps>(function TagsTab(
  { tags, canEdit, onCreate, onUpdate, onDelete, isBusy = false },
  ref
) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG);

  const openCreate = () => setDialog({ ...EMPTY_DIALOG, open: true });
  useImperativeHandle(ref, () => ({ openCreate }));

  const openEdit = (tag: ReportScheduleTagView) =>
    setDialog({
      open: true,
      editing: tag,
      name: tag.name,
      colorToken: normalizeColorToken(tag.colorToken),
      description: tag.description ?? '',
    });

  const close = () => setDialog(EMPTY_DIALOG);

  const submit = async () => {
    const name = dialog.name.trim();
    if (!name) return;
    const description = dialog.description.trim() || undefined;
    try {
      if (dialog.editing) {
        await onUpdate({ id: dialog.editing.id, name, colorToken: dialog.colorToken, description });
      } else {
        await onCreate({ name, colorToken: dialog.colorToken, description });
      }
      close();
    } catch {
      // The parent reports the error (toast); keep the dialog open so nothing is lost.
    }
  };

  return (
    <div className="space-y-3">
      {tags.length === 0 ? (
        <EmptyState
          entity="pinned"
          phase="passive"
          size="sm"
          className="py-4 px-3 gap-2"
          title="No tags yet"
          description="Tags group schedules, for example by team or audience."
        />
      ) : (
        <ul
          className="divide-y divide-border rounded-lg border border-border"
          aria-label="Schedule tags"
        >
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-3 px-3 py-2.5"
              data-testid={`tag-row-${tag.id}`}
            >
              <span
                className={`inline-block h-3 w-3 shrink-0 rounded-full ${swatchClass(tag.colorToken)}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {tag.name}
                  {!tag.isActive && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (inactive)
                    </span>
                  )}
                </p>
                {tag.description && (
                  <p className="truncate text-xs text-muted-foreground">{tag.description}</p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(tag)}
                    disabled={isBusy}
                    aria-label={`Edit tag ${tag.name}`}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(tag)}
                    disabled={isBusy}
                    aria-label={`Delete tag ${tag.name}`}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Tag' : 'New Tag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-tag-name">Name</Label>
              <Input
                id="schedule-tag-name"
                value={dialog.name}
                maxLength={50}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Finance"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-tag-color">Colour</Label>
              <Select
                value={dialog.colorToken}
                onValueChange={(v) =>
                  setDialog((d) => ({ ...d, colorToken: normalizeColorToken(v) }))
                }
              >
                <SelectTrigger id="schedule-tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_SCHEDULE_COLOR_TOKENS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {colorLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-tag-description">Description (optional)</Label>
              <Input
                id="schedule-tag-description"
                value={dialog.description}
                maxLength={200}
                onChange={(e) => setDialog((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={dialog.name.trim().length === 0 || isBusy}>
              {dialog.editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
