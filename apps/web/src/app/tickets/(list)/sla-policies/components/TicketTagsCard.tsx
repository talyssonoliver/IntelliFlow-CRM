'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  Button,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { TAG_COLOR_TOKENS, type TagColorToken } from '@intelliflow/validators';

export interface TicketTagRow {
  id: string;
  name: string;
  colorToken: string;
  description?: string | null;
  isActive: boolean;
}

export interface TicketTagsCardHandle {
  openCreate: () => void;
}

interface Props {
  tags: TicketTagRow[];
  onRefresh: () => Promise<unknown> | void;
}

// 18-token swatch class map — narrows at runtime to 'slate' fallback per
// playbook §4 (never cast unknown tokens without a fallback).
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

export const TicketTagsCard = forwardRef<TicketTagsCardHandle, Props>(function TicketTagsCard(
  { tags, onRefresh },
  ref
) {
  const createTag = trpc.ticketSettings.tags.create.useMutation();
  const deleteTag = trpc.ticketSettings.tags.delete.useMutation();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<TagColorToken>('slate');

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      setDraftName('');
      setDraftColor('slate');
      setIsCreateOpen(true);
    },
  }));

  const handleCreate = async () => {
    if (!draftName.trim()) return;
    try {
      await createTag.mutateAsync({ name: draftName.trim(), colorToken: draftColor });
      setIsCreateOpen(false);
      await onRefresh();
      toast({ title: 'Tag created' });
    } catch (err) {
      toast({
        title: 'Failed to create tag',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTag.mutateAsync({ id });
      await onRefresh();
      toast({ title: 'Tag deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete tag',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
          <span
            className="material-symbols-outlined text-[20px] text-rose-600 dark:text-rose-400"
            aria-hidden="true"
          >
            sell
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Tags</h3>
          <p className="text-sm text-muted-foreground">Tag vocabulary for organizing tickets.</p>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            onClick={() => {
              setDraftName('');
              setDraftColor('slate');
              setIsCreateOpen(true);
            }}
            aria-label="Create new ticket tag"
          >
            New Tag
          </Button>
        </div>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          entity="pinned"
          phase="passive"
          size="sm"
          className="py-4 px-3 gap-2"
          title="No tags yet"
          description="Create tags to categorize tickets."
        />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
            >
              <span
                className={`h-2 w-2 rounded-full ${swatchClass(tag.colorToken)}`}
                aria-hidden="true"
              />
              <span>{tag.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(tag.id)}
                aria-label={`Delete tag ${tag.name}`}
                className="text-muted-foreground hover:text-destructive ml-1"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ticket tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="tag-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="tag-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div>
              <label htmlFor="tag-color" className="text-sm font-medium">
                Color
              </label>
              <Select value={draftColor} onValueChange={(v) => setDraftColor(v as TagColorToken)}>
                <SelectTrigger id="tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAG_COLOR_TOKENS.map((token) => (
                    <SelectItem key={token} value={token}>
                      <span className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${swatchClass(token)}`} />
                        {token}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!draftName.trim() || createTag.isPending}>
              {createTag.isPending ? 'Creating…' : 'Create Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
