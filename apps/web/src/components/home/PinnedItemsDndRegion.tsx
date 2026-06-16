'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { EmptyState } from '@intelliflow/ui';
import { DraggablePinnedItem } from './DraggablePinnedItem';
import type { SerializedPinnedItem } from './AuthenticatedHomePage';

// =============================================================================
// PinnedSkeleton
// Exported so AuthenticatedHomePage can reference it in the dynamic() loading
// callback (phase 1: chunk download), and also used internally by PinnedSection
// (phase 2: data re-fetch after chunk is loaded).
// =============================================================================

export function PinnedSkeleton() {
  return (
    <>
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
          <div className="size-8 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-1" />
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

// =============================================================================
// PinnedSection
// Contains all DnD logic. Exported so AuthenticatedHomePage can lazy-load it
// via next/dynamic, deferring the @dnd-kit chunk until after initial paint.
// =============================================================================

export function PinnedSection({
  isLoading,
  items,
  onReorder,
  onUnpin,
  onItemClick,
}: Readonly<{
  isLoading: boolean;
  items: SerializedPinnedItem[] | undefined;
  onReorder: (reorderedItems: SerializedPinnedItem[]) => void;
  onUnpin?: (entityType: string, entityId: string) => void;
  onItemClick?: (entityType: string, entityId: string) => void;
}>) {
  const [orderedItems, setOrderedItems] = useState<SerializedPinnedItem[]>(items ?? []);

  useEffect(() => {
    setOrderedItems(items ?? []);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = orderedItems.map((item) => `${item.entityType}-${item.entityId}`);

  function handleDragEnd(event: Readonly<DragEndEvent>) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(newItems);
    onReorder(newItems);
  }

  if (isLoading) {
    return <PinnedSkeleton />;
  }

  if (!items || items.length === 0) {
    return <EmptyState entity="pinned" phase="passive" className="py-4" />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {orderedItems.map((item) => (
          <DraggablePinnedItem
            key={`${item.entityType}-${item.entityId}`}
            item={item}
            onUnpin={onUnpin}
            onItemClick={onItemClick}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
