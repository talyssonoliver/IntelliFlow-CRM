'use client';

/**
 * NodePalette — IFC-031
 *
 * Left-side drag source palette for workflow canvas.
 * Each item uses @dnd-kit/core useDraggable with { nodeType } data.
 */

import { useDraggable } from '@dnd-kit/core';
import { PALETTE_ITEMS, type PaletteItem } from '@/lib/workflow-types';

// ---------------------------------------------------------------------------
// Single draggable palette item
// ---------------------------------------------------------------------------

function PaletteItem({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.nodeType}`,
    data: { nodeType: item.nodeType },
  });

  return (
    <li className="list-none">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        tabIndex={0}
        role="button"
        aria-label={`Drag ${item.label} node`}
        className={[
          'flex items-start gap-2 rounded-lg border border-input bg-background px-3 py-2.5',
          'cursor-grab select-none transition-shadow',
          'hover:border-primary/50 hover:shadow-sm',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          isDragging ? 'opacity-50 cursor-grabbing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-none">{item.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Palette container
// ---------------------------------------------------------------------------

export function NodePalette() {
  return (
    <aside
      className="w-48 flex-shrink-0 border-r bg-muted/30 p-3 overflow-y-auto"
      aria-label="Node palette"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Nodes
      </p>
      <ul className="flex flex-col gap-2">
        {PALETTE_ITEMS.map((item) => (
          <PaletteItem key={item.nodeType} item={item} />
        ))}
      </ul>
    </aside>
  );
}
