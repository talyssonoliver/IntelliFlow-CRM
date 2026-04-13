'use client';

/**
 * NodePalette — responsive drag source.
 *
 *   Desktop (≥ lg): rendered inline as a left rail (Card + entries).
 *   Mobile  (< lg): hidden inline; a floating "+ Add node" FAB surfaces
 *                   the same entries inside a bottom Sheet.
 *
 * Each entry uses @dnd-kit/core `useDraggable`. The drop target is the
 * ReactFlow canvas (`canvas-drop-zone`), wired in ReactFlowComponent.
 */

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
} from '@intelliflow/ui';
import { PALETTE_ITEMS, type PaletteItem } from '@/lib/workflow-types';
import { useIsMobile } from '@/hooks/useIsMobile';

// ---------------------------------------------------------------------------
// Single draggable palette item
// ---------------------------------------------------------------------------

function PaletteItem({ item, onActivate }: { item: PaletteItem; onActivate?: () => void }) {
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
        onClickCapture={onActivate}
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
// Palette entries (shared between desktop + mobile sheet)
// ---------------------------------------------------------------------------

function PaletteEntries({ onActivate }: { onActivate?: () => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {PALETTE_ITEMS.map((item) => (
        <PaletteItem key={item.nodeType} item={item} onActivate={onActivate} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function NodePalette() {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!isMobile) {
    // Desktop: left rail
    return (
      <aside
        className="hidden lg:block w-56 flex-shrink-0 p-3 overflow-y-auto"
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
            <PaletteEntries />
          </CardContent>
        </Card>
      </aside>
    );
  }

  // Mobile: floating FAB + bottom sheet
  return (
    <>
      <Button
        type="button"
        size="lg"
        onClick={() => setSheetOpen(true)}
        aria-label="Add node"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full p-0 shadow-lg lg:hidden"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Add a node</SheetTitle>
            <SheetDescription>
              Tap a node to add it, or long-press and drag onto the canvas.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 overflow-y-auto">
            <PaletteEntries onActivate={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
