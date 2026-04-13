'use client';

/**
 * NodePalette
 *
 * Left-side drag source palette for workflow canvas.
 * Each entry uses @dnd-kit/core useDraggable with { nodeType } data.
 *
 * Wraps the draggable list in the shared Card primitive and uses
 * CardHeader/CardTitle/CardDescription for consistent header styling —
 * no hand-rolled chrome.
 */

import { useDraggable } from '@dnd-kit/core';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@intelliflow/ui';
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
      className="w-56 flex-shrink-0 p-3 overflow-y-auto"
      aria-label="Node palette"
    >
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Nodes</CardTitle>
          <CardDescription className="text-xs">
            Drag onto the canvas to build the flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {PALETTE_ITEMS.map((item) => (
              <PaletteItem key={item.nodeType} item={item} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}
