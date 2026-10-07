'use client';

/**
 * Territories in evaluation order (PG-197, AC-002/003/005). Reorder by drag
 * (dnd-kit, keyboard sensor included) or by the up/down buttons; each move is
 * announced in an always-mounted polite live region. The create/edit dialog
 * lives here and is opened from the page header through the `openCreate`
 * handle; focus returns to whatever opened it.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge, Button, EmptyState } from '@intelliflow/ui';
import type { TerritoryStrategy } from '@intelliflow/domain';
import { swatchClass } from './territory-colors';
import { STRATEGY_LABELS, TerritoryDialog, type TerritorySaveInput } from './TerritoryDialog';
import type { MemberOption } from './MemberMultiSelect';

export interface TerritoryRow {
  id: string;
  name: string;
  description: string | null;
  /** Stored as a string; unknown tokens render as slate. */
  colorToken: string;
  priority: number;
  strategy: TerritoryStrategy;
  isDefault: boolean;
  isActive: boolean;
  rules: { id: string; country: string; region: string | null; postalPrefix: string | null }[];
  members: { userId: string; name: string; avatar: string | null }[];
}

export interface TerritoryListHandle {
  openCreate: () => void;
}

export interface TerritoryListProps {
  territories: TerritoryRow[];
  members: MemberOption[];
  membersLoading?: boolean;
  membersError?: boolean;
  canEdit: boolean;
  isBusy: boolean;
  isSaving: boolean;
  onSave: (input: TerritorySaveInput, id: string | null) => Promise<TerritoryRow | undefined>;
  onDelete: (territory: TerritoryRow) => void;
  onReorder: (ids: string[]) => void;
}

/** "GB · London; US" — at most two rules, then "+N more". */
export function summarizeRules(rules: TerritoryRow['rules']): string {
  if (rules.length === 0) return 'No rules (fallback only)';
  const parts = rules
    .slice(0, 2)
    .map((rule) =>
      [rule.country, rule.region, rule.postalPrefix ? `${rule.postalPrefix}…` : null]
        .filter(Boolean)
        .join(' · ')
    );
  const more = rules.length > 2 ? ` +${rules.length - 2} more` : '';
  return parts.join('; ') + more;
}

function memberCountLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`;
}

interface RowProps {
  territory: TerritoryRow;
  index: number;
  total: number;
  canEdit: boolean;
  isBusy: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onEdit: (territory: TerritoryRow, trigger: HTMLElement) => void;
  onDelete: (territory: TerritoryRow) => void;
}

function TerritoryListRow({
  territory,
  index,
  total,
  canEdit,
  isBusy,
  onMove,
  onEdit,
  onDelete,
}: Readonly<RowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: territory.id,
    disabled: !canEdit || isBusy,
  });
  const locked = !canEdit || isBusy;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-3 px-3 py-3 ${isDragging ? 'opacity-60' : ''}`}
      data-testid={`territory-row-${territory.id}`}
    >
      <button
        type="button"
        className="cursor-grab p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
        aria-label={`Drag to reorder ${territory.name}`}
        style={{ touchAction: 'none' }}
        disabled={locked}
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          drag_indicator
        </span>
      </button>
      <span className="text-xs tabular-nums text-muted-foreground w-5 text-right">{index + 1}</span>
      <span
        className={`inline-block w-3 h-3 rounded-full shrink-0 ${swatchClass(territory.colorToken)}`}
        aria-hidden="true"
        data-testid="territory-swatch"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{territory.name}</span>
          {territory.isDefault && <Badge variant="secondary">Default</Badge>}
          {!territory.isActive && <Badge variant="outline">Inactive</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {STRATEGY_LABELS[territory.strategy].label} · {summarizeRules(territory.rules)} ·{' '}
          {memberCountLabel(territory.members.length)}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Move ${territory.name} up`}
          disabled={locked || index === 0}
          onClick={() => onMove(index, -1)}
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_upward
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Move ${territory.name} down`}
          disabled={locked || index === total - 1}
          onClick={() => onMove(index, 1)}
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_downward
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={(event) => onEdit(territory, event.currentTarget)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => onDelete(territory)}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export const TerritoryList = forwardRef<TerritoryListHandle, TerritoryListProps>(
  function TerritoryList(
    {
      territories,
      members,
      membersLoading,
      membersError,
      canEdit,
      isBusy,
      isSaving,
      onSave,
      onDelete,
      onReorder,
    },
    ref
  ) {
    const [dialog, setDialog] = useState<{ open: boolean; territory: TerritoryRow | null }>({
      open: false,
      territory: null,
    });
    const [announcement, setAnnouncement] = useState('');
    const returnFocus = useRef<HTMLElement | null>(null);

    const open = (territory: TerritoryRow | null, trigger: Element | null) => {
      returnFocus.current = trigger instanceof HTMLElement ? trigger : null;
      setDialog({ open: true, territory });
    };
    useImperativeHandle(ref, () => ({
      openCreate: () => open(null, document.activeElement),
    }));

    const close = () => {
      setDialog((current) => ({ ...current, open: false }));
      const target = returnFocus.current;
      if (target) setTimeout(() => target.focus(), 0);
    };

    const commitOrder = (ids: string[], movedId: string) => {
      const position = ids.indexOf(movedId) + 1;
      const name = territories.find((t) => t.id === movedId)?.name ?? 'Territory';
      setAnnouncement(`${name} moved to position ${position} of ${ids.length}.`);
      onReorder(ids);
    };

    const move = (index: number, delta: -1 | 1) => {
      const ids = arrayMove(
        territories.map((t) => t.id),
        index,
        index + delta
      );
      commitOrder(ids, territories[index].id);
    };

    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const ids = territories.map((t) => t.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      commitOrder(arrayMove(ids, from, to), String(active.id));
    };

    const otherNames = territories.filter((t) => t.id !== dialog.territory?.id).map((t) => t.name);

    return (
      <div className="space-y-3">
        <output aria-live="polite" className="sr-only">
          {announcement}
        </output>
        {territories.length === 0 ? (
          <EmptyState entity="rules" phase="passive" size="sm" className="py-4 px-3 gap-2" />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={territories.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol
                className="divide-y divide-border rounded-lg border border-border"
                aria-label="Territories in evaluation order"
              >
                {territories.map((territory, index) => (
                  <TerritoryListRow
                    key={territory.id}
                    territory={territory}
                    index={index}
                    total={territories.length}
                    canEdit={canEdit}
                    isBusy={isBusy}
                    onMove={move}
                    onEdit={(row, trigger) => open(row, trigger)}
                    onDelete={onDelete}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        <TerritoryDialog
          open={dialog.open}
          territory={dialog.territory}
          otherNames={otherNames}
          members={members}
          membersLoading={membersLoading}
          membersError={membersError}
          isSaving={isSaving}
          onSave={(input) => onSave(input, dialog.territory?.id ?? null)}
          onClose={close}
        />
      </div>
    );
  }
);
