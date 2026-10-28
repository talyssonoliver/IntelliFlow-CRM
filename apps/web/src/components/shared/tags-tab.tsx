'use client';

// Settings tag catalogue card — PG-201 (scheduled reports), shared with PG-208 (task
// automation). forwardRef + useImperativeHandle({ openCreate }) so the parent's
// SectionHeader "New Tag" button opens the dialog (playbook §4). Texts and DOM ids
// default to PG-201's.

import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ACCOUNT_TAG_COLOR_TOKENS, type AccountTagColorToken } from '@intelliflow/validators';
import { colorLabel, swatchClass, toColorToken } from '@/lib/color-tokens';

export interface SettingsTagView {
  id: string;
  name: string;
  colorToken: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateSettingsTagInput {
  name: string;
  colorToken?: AccountTagColorToken;
  description?: string;
}

export interface UpdateSettingsTagInput {
  id: string;
  name?: string;
  colorToken?: AccountTagColorToken;
  description?: string;
  isActive?: boolean;
}

export interface TagsTabTexts {
  /** Accessible name of the tag list. */
  listLabel: string;
  emptyDescription: string;
  dialogDescription: string;
  /** DOM id prefix of the dialog fields. */
  idPrefix: string;
}

const DEFAULT_TEXTS: TagsTabTexts = {
  listLabel: 'Schedule tags',
  emptyDescription: 'Tags group schedules, for example by team or audience.',
  dialogDescription:
    'Tags group scheduled reports. The name is required; Create stays disabled until you enter one.',
  idPrefix: 'schedule-tag',
};

export interface TagsTabHandle {
  openCreate: () => void;
}

export interface TagsTabProps {
  readonly tags: SettingsTagView[];
  readonly canEdit: boolean;
  readonly onCreate: (input: CreateSettingsTagInput) => Promise<void>;
  readonly onUpdate: (input: UpdateSettingsTagInput) => Promise<void>;
  readonly onDelete: (tag: SettingsTagView) => void;
  readonly isBusy?: boolean;
  readonly texts?: Partial<TagsTabTexts>;
}

interface DialogState {
  open: boolean;
  editing?: SettingsTagView;
  name: string;
  colorToken: AccountTagColorToken;
  description: string;
}

const EMPTY_DIALOG: DialogState = { open: false, name: '', colorToken: 'slate', description: '' };

export const TagsTab = forwardRef<TagsTabHandle, TagsTabProps>(function TagsTab(
  { tags, canEdit, onCreate, onUpdate, onDelete, isBusy = false, texts },
  ref
) {
  const t = { ...DEFAULT_TEXTS, ...texts };
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG);

  const openCreate = () => setDialog({ ...EMPTY_DIALOG, open: true });
  useImperativeHandle(ref, () => ({ openCreate }));

  const openEdit = (tag: SettingsTagView) =>
    setDialog({
      open: true,
      editing: tag,
      name: tag.name,
      colorToken: toColorToken(tag.colorToken),
      description: tag.description ?? '',
    });

  const close = () => setDialog(EMPTY_DIALOG);

  const submit = async () => {
    const name = dialog.name.trim();
    if (!name) return;
    const description = dialog.description.trim();
    try {
      if (dialog.editing) {
        // An empty string clears the stored description (undefined would leave it unchanged).
        await onUpdate({ id: dialog.editing.id, name, colorToken: dialog.colorToken, description });
      } else {
        await onCreate({
          name,
          colorToken: dialog.colorToken,
          description: description || undefined,
        });
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
          description={t.emptyDescription}
        />
      ) : (
        <ul
          className="divide-y divide-border rounded-lg border border-border"
          aria-label={t.listLabel}
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
            <DialogDescription>{t.dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${t.idPrefix}-name`}>
                Name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={`${t.idPrefix}-name`}
                value={dialog.name}
                maxLength={50}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Finance"
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${t.idPrefix}-color`}>Colour</Label>
              <Select
                value={dialog.colorToken}
                onValueChange={(v) => setDialog((d) => ({ ...d, colorToken: toColorToken(v) }))}
              >
                <SelectTrigger id={`${t.idPrefix}-color`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TAG_COLOR_TOKENS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {colorLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${t.idPrefix}-description`}>Description (optional)</Label>
              <Input
                id={`${t.idPrefix}-description`}
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
