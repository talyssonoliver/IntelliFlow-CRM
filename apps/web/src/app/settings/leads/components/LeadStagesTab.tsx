'use client';

import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Button, Card } from '@intelliflow/ui';
import { SortableStageItem, type StageItem } from './SortableStageItem';

interface LeadStagesTabProps {
  stages: StageItem[];
  onStagesChange: (stages: StageItem[]) => void;
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

export function LeadStagesTab({ stages, onStagesChange }: Readonly<LeadStagesTabProps>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = stages.findIndex((s) => s.stageKey === active.id);
      const newIndex = stages.findIndex((s) => s.stageKey === over.id);

      const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({
        ...s,
        sortOrder: i,
      }));

      onStagesChange(reordered);
    },
    [stages, onStagesChange]
  );

  const handleAddStage = useCallback(() => {
    const key = `CUSTOM_${Date.now()}`;
    const color = STAGE_COLORS[stages.length % STAGE_COLORS.length];
    const newStage: StageItem = {
      stageKey: key,
      displayName: '',
      color,
      sortOrder: stages.length,
      isDefault: false,
    };
    onStagesChange([...stages, newStage]);
  }, [stages, onStagesChange]);

  const handleRemoveStage = useCallback(
    (stageKey: string) => {
      onStagesChange(
        stages.filter((s) => s.stageKey !== stageKey).map((s, i) => ({ ...s, sortOrder: i }))
      );
    },
    [stages, onStagesChange]
  );

  const handleUpdateStage = useCallback(
    (stageKey: string, updates: Partial<StageItem>) => {
      onStagesChange(stages.map((s) => (s.stageKey === stageKey ? { ...s, ...updates } : s)));
    },
    [stages, onStagesChange]
  );

  const handleSetDefault = useCallback(
    (stageKey: string) => {
      onStagesChange(
        stages.map((s) => ({
          ...s,
          isDefault: s.stageKey === stageKey,
        }))
      );
    },
    [stages, onStagesChange]
  );

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Pipeline Stages</h3>
          <p className="text-sm text-muted-foreground">
            Drag to reorder stages. New leads are assigned to the default stage.
          </p>
        </div>
        <Button onClick={handleAddStage} size="sm">
          <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
            add
          </span>
          {' '}Add Stage
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={stages.map((s) => s.stageKey)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2" aria-label="Lead stages">
            {stages.map((stage) => (
              <SortableStageItem
                key={stage.stageKey}
                stage={stage}
                onRemove={() => handleRemoveStage(stage.stageKey)}
                onUpdate={(updates) => handleUpdateStage(stage.stageKey, updates)}
                onSetDefault={() => handleSetDefault(stage.stageKey)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Card>
  );
}
