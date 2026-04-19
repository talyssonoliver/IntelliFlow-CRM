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
  TAG_COLOR_TOKENS,
  type TagColorToken,
  type CreateDealTagInput,
  type UpdateDealTagInput,
} from '@intelliflow/validators';

export interface TagsTabHandle {
  openCreate: () => void;
}

export interface DealTagRow {
  id: string;
  name: string;
  colorToken: TagColorToken;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface DealTagsCardProps {
  readonly tags: DealTagRow[];
  readonly onCreate: (input: CreateDealTagInput) => void | Promise<void>;
  readonly onUpdate: (input: UpdateDealTagInput) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
  readonly isBusy?: boolean;
}

const COLOR_SWATCH_CLASSES: Record<TagColorToken, string> = {
  slate: 'bg-slate-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  lime: 'bg-lime-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  purple: 'bg-purple-500',
  fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500',
  rose: 'bg-rose-500',
};

export function swatchClass(token: string): string {
  return COLOR_SWATCH_CLASSES[token as TagColorToken] ?? COLOR_SWATCH_CLASSES.slate;
}

interface DialogState {
  open: boolean;
  editing?: DealTagRow;
  name: string;
  colorToken: TagColorToken;
  description: string;
}

const EMPTY: DialogState = { open: false, name: '', colorToken: 'slate', description: '' };

export const DealTagsCard = forwardRef<TagsTabHandle, DealTagsCardProps>(function DealTagsCard(
  { tags, onCreate, onUpdate, onDelete, isBusy = false },
  ref
) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY);

  const openCreate = () => setDialog({ ...EMPTY, open: true });
  useImperativeHandle(ref, () => ({ openCreate }));

  const openEdit = (tag: DealTagRow) => {
    const tokenAllowed = (TAG_COLOR_TOKENS as readonly string[]).includes(tag.colorToken);
    setDialog({
      open: true,
      editing: tag,
      name: tag.name,
      colorToken: tokenAllowed ? tag.colorToken : 'slate',
      description: tag.description ?? '',
    });
  };

  const close = () => setDialog(EMPTY);

  const submit = async () => {
    const name = dialog.name.trim();
    if (!name) return;
    const description = dialog.description.trim() || undefined;
    if (dialog.editing) {
      await onUpdate({
        id: dialog.editing.id,
        name,
        colorToken: dialog.colorToken,
        description,
      });
    } else {
      await onCreate({ name, colorToken: dialog.colorToken, description });
    }
    close();
  };

  return (
    <div className="space-y-3">
      {tags.length === 0 ? (
        <EmptyState
          entity="pinned"
          size="sm"
          phase="passive"
          title="No tags yet"
          description="Add your first deal tag."
          className="py-4 px-3 gap-2"
        />
      ) : (
        <Card className="divide-y divide-border">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`deal-tag-row-${tag.id}`}
            >
              <span
                className={`inline-block w-3 h-3 rounded-full ${swatchClass(tag.colorToken)}`}
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
              <label htmlFor="deal-tag-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="deal-tag-name"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Enterprise"
              />
            </div>
            <div>
              <label htmlFor="deal-tag-color" className="text-sm font-medium">
                Color
              </label>
              <Select
                value={dialog.colorToken}
                onValueChange={(v) => setDialog((d) => ({ ...d, colorToken: v as TagColorToken }))}
              >
                <SelectTrigger id="deal-tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAG_COLOR_TOKENS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="deal-tag-desc" className="text-sm font-medium">
                Description (optional)
              </label>
              <Input
                id="deal-tag-desc"
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
});
