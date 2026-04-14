'use client';

import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import {
  ACCOUNT_TAG_COLOR_TOKENS,
  type AccountTagColorToken,
  type CreateAccountTagInput,
  type UpdateAccountTagInput,
} from '@intelliflow/validators';

export interface TagRow {
  id: string;
  name: string;
  colorToken: AccountTagColorToken;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TagsTabProps {
  readonly tags: TagRow[];
  readonly onCreate: (input: CreateAccountTagInput) => void | Promise<void>;
  readonly onUpdate: (input: UpdateAccountTagInput) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
  readonly isBusy?: boolean;
}

interface DialogState {
  open: boolean;
  editing?: TagRow;
  name: string;
  colorToken: AccountTagColorToken;
  description: string;
}

const EMPTY: DialogState = { open: false, name: '', colorToken: 'slate', description: '' };

export function TagsTab({ tags, onCreate, onUpdate, onDelete, isBusy = false }: Readonly<TagsTabProps>) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY);

  const openCreate = () => setDialog({ ...EMPTY, open: true });
  const openEdit = (tag: TagRow) =>
    setDialog({
      open: true,
      editing: tag,
      name: tag.name,
      colorToken: tag.colorToken,
      description: tag.description ?? '',
    });
  const close = () => setDialog(EMPTY);

  const submit = async () => {
    const name = dialog.name.trim();
    if (!name) return;
    const description = dialog.description.trim() || undefined;
    if (dialog.editing) {
      await onUpdate({ id: dialog.editing.id, name, colorToken: dialog.colorToken, description });
    } else {
      await onCreate({ name, colorToken: dialog.colorToken, description });
    }
    close();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button type="button" size="sm" onClick={openCreate} disabled={isBusy}>
          <span className="material-symbols-outlined text-sm mr-1" aria-hidden>
            add
          </span>
          Add Tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <EmptyState icon="sell" title="No tags yet" description="Add the first account tag." />
      ) : (
        <Card className="divide-y divide-border">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`tag-row-${tag.id}`}
            >
              <span
                className={`inline-block w-3 h-3 rounded-full bg-${tag.colorToken}-500`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{tag.name}</div>
                {tag.description && (
                  <div className="text-xs text-muted-foreground truncate">{tag.description}</div>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(tag)} disabled={isBusy}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(tag.id)}
                disabled={isBusy}
              >
                Delete
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit tag' : 'Add tag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="tag-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="tag-name"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Strategic"
              />
            </div>
            <div>
              <label htmlFor="tag-color" className="text-sm font-medium">
                Color
              </label>
              <Select
                value={dialog.colorToken}
                onValueChange={(v) =>
                  setDialog((d) => ({ ...d, colorToken: v as AccountTagColorToken }))
                }
              >
                <SelectTrigger id="tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TAG_COLOR_TOKENS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="tag-desc" className="text-sm font-medium">
                Description (optional)
              </label>
              <Input
                id="tag-desc"
                value={dialog.description}
                onChange={(e) => setDialog((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={dialog.name.trim().length === 0}>
              {dialog.editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
