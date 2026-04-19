'use client';

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import {
  Button,
  EmptyState,
  Input,
  Label,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ConfirmationDialog,
} from '@intelliflow/ui';

export interface TagsTabHandle {
  openCreate: () => void;
}
import {
  TAG_COLOR_TOKENS,
  type CreateContactTagInput,
  type TagColorToken,
  type UpdateContactTagInput,
} from '@intelliflow/validators';

export interface TagRow {
  id: string;
  name: string;
  /** Stored as String in Prisma; Zod enum is enforced at write time.
   *  Kept wide here so legacy rows with unknown tokens don't crash the UI. */
  colorToken: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TagsTabProps {
  readonly tags: TagRow[];
  readonly onCreate: (input: CreateContactTagInput) => Promise<void> | void;
  readonly onUpdate: (input: UpdateContactTagInput) => Promise<void> | void;
  readonly onDelete: (id: string) => Promise<void> | void;
}

type DraftTag = {
  id?: string;
  name: string;
  colorToken: TagColorToken;
  description: string;
};

const EMPTY_DRAFT: DraftTag = { name: '', colorToken: 'slate', description: '' };

function swatchClass(token: string): string {
  return COLOR_SWATCH_CLASSES[token as TagColorToken] ?? COLOR_SWATCH_CLASSES.slate;
}

const COLOR_SWATCH_CLASSES: Record<TagColorToken, string> = {
  slate: 'bg-slate-200 text-slate-900',
  red: 'bg-red-200 text-red-900',
  orange: 'bg-orange-200 text-orange-900',
  amber: 'bg-amber-200 text-amber-900',
  yellow: 'bg-yellow-200 text-yellow-900',
  lime: 'bg-lime-200 text-lime-900',
  green: 'bg-green-200 text-green-900',
  emerald: 'bg-emerald-200 text-emerald-900',
  teal: 'bg-teal-200 text-teal-900',
  cyan: 'bg-cyan-200 text-cyan-900',
  sky: 'bg-sky-200 text-sky-900',
  blue: 'bg-blue-200 text-blue-900',
  indigo: 'bg-indigo-200 text-indigo-900',
  violet: 'bg-violet-200 text-violet-900',
  purple: 'bg-purple-200 text-purple-900',
  fuchsia: 'bg-fuchsia-200 text-fuchsia-900',
  pink: 'bg-pink-200 text-pink-900',
  rose: 'bg-rose-200 text-rose-900',
};

export const TagsTab = forwardRef<TagsTabHandle, TagsTabProps>(function TagsTab(
  { tags, onCreate, onUpdate, onDelete },
  ref
) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftTag>(EMPTY_DRAFT);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setNameError(null);
    setDialogOpen(true);
  }, []);

  // Canonical handle pattern (mirror of /accounts/account-settings TagsTab).
  useImperativeHandle(ref, () => ({ openCreate }), [openCreate]);

  const openEdit = useCallback((tag: TagRow) => {
    // Narrow legacy unknown tokens back to the enum before the Select trigger
    // mounts (an unknown value would render the trigger empty).
    const normalizedColor: TagColorToken = (TAG_COLOR_TOKENS as readonly string[]).includes(
      tag.colorToken
    )
      ? (tag.colorToken as TagColorToken)
      : 'slate';
    setDraft({
      id: tag.id,
      name: tag.name,
      colorToken: normalizedColor,
      description: tag.description ?? '',
    });
    setNameError(null);
    setDialogOpen(true);
  }, []);

  const submit = useCallback(async () => {
    const name = draft.name.trim();
    if (!name) {
      setNameError('Name is required.');
      return;
    }
    if (name.length > 60) {
      setNameError('Name cannot exceed 60 characters.');
      return;
    }
    if (draft.id) {
      await onUpdate({
        id: draft.id,
        name,
        colorToken: draft.colorToken,
        description: draft.description || undefined,
      });
    } else {
      await onCreate({
        name,
        colorToken: draft.colorToken,
        description: draft.description || undefined,
      });
    }
    setDialogOpen(false);
  }, [draft, onCreate, onUpdate]);

  const runDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    await onDelete(confirmDeleteId);
    setConfirmDeleteId(null);
  }, [confirmDeleteId, onDelete]);

  return (
    <div>
      <div className="space-y-2">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${swatchClass(tag.colorToken)}`}
            >
              {tag.name}
            </span>
            <span className="text-sm text-muted-foreground truncate flex-1">
              {tag.description ?? '—'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(tag)}
              aria-label={`Edit ${tag.name}`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                edit
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDeleteId(tag.id)}
              aria-label={`Delete ${tag.name}`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                delete
              </span>
            </Button>
          </div>
        ))}

        {tags.length === 0 && (
          <EmptyState
            entity="pinned"
            size="sm"
            phase="passive"
            title="No tags yet"
            description="Add your first contact tag."
            className="py-4 px-3 gap-2"
          />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit tag' : 'New tag'}</DialogTitle>
            <DialogDescription>
              Tag names are unique per workspace and up to 60 characters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={draft.name}
                onChange={(e) => {
                  setDraft({ ...draft, name: e.target.value });
                  setNameError(null);
                }}
                maxLength={60}
              />
              {nameError && (
                <p className="text-sm text-destructive mt-1" role="alert">
                  {nameError}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="tag-color">Color</Label>
              <Select
                value={draft.colorToken}
                onValueChange={(v) => setDraft({ ...draft, colorToken: v as TagColorToken })}
              >
                <SelectTrigger id="tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAG_COLOR_TOKENS.map((token) => (
                    <SelectItem key={token} value={token}>
                      {token}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="tag-description">Description</Label>
              <Textarea
                id="tag-description"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                maxLength={200}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>{draft.id ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="Delete tag"
        description="This removes the tag definition from the workspace. Contacts currently tagged keep their string value."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={runDelete}
      />
    </div>
  );
});
