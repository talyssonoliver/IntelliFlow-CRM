'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
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
  DOCUMENT_TAG_COLOR_TOKENS,
  type DocumentTagColorToken,
  type CreateDocumentTagInput,
  type UpdateDocumentTagInput,
} from '@intelliflow/validators';

export interface TagsTabHandle {
  openCreate: () => void;
}

export interface DocumentTagRow {
  id: string;
  name: string;
  colorToken: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TagsTabProps {
  readonly tags: DocumentTagRow[];
  readonly onCreate: (input: CreateDocumentTagInput) => void | Promise<void>;
  readonly onUpdate: (input: UpdateDocumentTagInput) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
  readonly isBusy?: boolean;
}

// Normalize unknown colorToken to a valid allowlisted value
function normalizeColorToken(raw: string): DocumentTagColorToken {
  return (DOCUMENT_TAG_COLOR_TOKENS as readonly string[]).includes(raw)
    ? (raw as DocumentTagColorToken)
    : 'slate';
}

interface DialogState {
  open: boolean;
  editing?: DocumentTagRow;
  name: string;
  colorToken: DocumentTagColorToken;
  description: string;
}

const EMPTY_DIALOG: DialogState = { open: false, name: '', colorToken: 'slate', description: '' };

export const TagsTab = forwardRef<TagsTabHandle, TagsTabProps>(function TagsTab(
  { tags, onCreate, onUpdate, onDelete, isBusy = false },
  ref
) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG);

  const openCreate = () => setDialog({ ...EMPTY_DIALOG, open: true });
  useImperativeHandle(ref, () => ({ openCreate }));

  const openEdit = (tag: DocumentTagRow) =>
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
    if (dialog.editing) {
      await onUpdate({ id: dialog.editing.id, name, colorToken: dialog.colorToken, description });
    } else {
      await onCreate({ name, colorToken: dialog.colorToken, description });
    }
    close();
  };

  return (
    <div className="space-y-3">
      {tags.length === 0 ? (
        <EmptyState entity="documents" size="sm" phase="passive" className="py-4 px-3 gap-2" />
      ) : (
        <Card className="divide-y divide-border">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`tag-row-${tag.id}`}
            >
              <span
                className={`inline-block w-3 h-3 rounded-full bg-${normalizeColorToken(tag.colorToken)}-500`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{tag.name}</div>
                {tag.description && (
                  <div className="text-xs text-muted-foreground truncate">{tag.description}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEdit(tag)}
                disabled={isBusy}
                aria-label={`Edit tag ${tag.name}`}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(tag.id)}
                disabled={isBusy}
                aria-label={`Delete tag ${tag.name}`}
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
              <label htmlFor="doc-tag-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="doc-tag-name"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Contract"
              />
            </div>
            <div>
              <label htmlFor="doc-tag-color" className="text-sm font-medium">
                Color
              </label>
              <Select
                value={dialog.colorToken}
                onValueChange={(v) =>
                  setDialog((d) => ({ ...d, colorToken: v as DocumentTagColorToken }))
                }
              >
                <SelectTrigger id="doc-tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TAG_COLOR_TOKENS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="doc-tag-desc" className="text-sm font-medium">
                Description (optional)
              </label>
              <Input
                id="doc-tag-desc"
                value={dialog.description}
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
