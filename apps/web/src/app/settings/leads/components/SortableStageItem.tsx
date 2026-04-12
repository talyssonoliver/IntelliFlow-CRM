'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Input } from '@intelliflow/ui';

export interface StageItem {
  stageKey: string;
  displayName: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
}

interface SortableStageItemProps {
  stage: StageItem;
  onRemove: () => void;
  onUpdate: (updates: Partial<StageItem>) => void;
  onSetDefault: () => void;
}

const STAGE_COLORS = [
  '#3B82F6',
  '#F59E0B',
  '#22C55E',
  '#6366F1',
  '#64748B',
  '#EF4444',
  '#9CA3AF',
  '#EC4899',
  '#14B8A6',
  '#8B5CF6',
];

export function SortableStageItem({
  stage,
  onRemove,
  onUpdate,
  onSetDefault,
}: Readonly<SortableStageItemProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.stageKey,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Drag to reorder ${stage.displayName}`}
        style={{ touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          drag_indicator
        </span>
      </button>

      {/* Color picker */}
      <div className="relative flex-shrink-0">
        <button
          type="button"
          className="w-6 h-6 rounded-full border-2 border-background shadow-sm"
          style={{ backgroundColor: stage.color }}
          aria-label={`Change color for ${stage.displayName}`}
          onClick={() => {
            const currentIndex = STAGE_COLORS.indexOf(stage.color);
            const nextColor = STAGE_COLORS[(currentIndex + 1) % STAGE_COLORS.length];
            onUpdate({ color: nextColor });
          }}
        />
      </div>

      {/* Name input */}
      <Input
        value={stage.displayName}
        onChange={(e) => onUpdate({ displayName: e.target.value })}
        className="flex-1 h-8"
        aria-label={`Stage name for ${stage.stageKey}`}
      />

      {/* Default badge / set default button */}
      {stage.isDefault ? (
        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded whitespace-nowrap">
          Default Stage
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSetDefault}
          className="text-xs text-muted-foreground whitespace-nowrap"
        >
          Set Default
        </Button>
      )}

      {/* Delete button (disabled for default stage) */}
      {!stage.isDefault && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${stage.displayName}`}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            close
          </span>
        </Button>
      )}
    </div>
  );
}
