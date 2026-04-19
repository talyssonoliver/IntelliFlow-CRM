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

import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
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
import type { PaletteItem } from '@/lib/workflow-types';
import { useIsMobile } from '@/hooks/useIsMobile';
import { api } from '@/lib/api';
import {
  clearCustomNodeTypeRegistry,
  getAllPaletteEntries,
  registerCustomNodeType,
} from './node-registry';
import type { CustomNodeTypeDescriptor } from '@intelliflow/domain';

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
      <button
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Drag ${item.label} node`}
        onClickCapture={onActivate}
        className={[
          'flex items-start gap-2 rounded-lg border border-input bg-background px-3 py-2.5 w-full text-left',
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
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Palette entries (shared between desktop + mobile sheet)
// ---------------------------------------------------------------------------

function PaletteEntries({ items, onActivate }: { items: PaletteItem[]; onActivate?: () => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <PaletteItem key={item.nodeType} item={item} onActivate={onActivate} />
      ))}
    </ul>
  );
}

/**
 * Hydrate the custom-node-type registry from tRPC and return the combined
 * palette entries (canonical + custom).
 *
 * The tRPC query is non-blocking — on first paint we show just canonical
 * entries, and re-render once custom types arrive. Failure is non-fatal.
 */
function useHydratedPaletteItems(): PaletteItem[] {
  const query = api.customNodeType.list.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  // Hydrate the registry inside useMemo (no useEffect → no setState → no
  // re-render loop when the query mock returns a fresh object reference).
  // In production react-query memoizes `data` so this only re-runs when the
  // upstream items genuinely change.
  const items = query.data?.items;
  return useMemo(() => {
    if (items) {
      clearCustomNodeTypeRegistry();
      for (const row of items) {
        if (!row.isActive) continue;
        const descriptor: CustomNodeTypeDescriptor = {
          id: row.id,
          typeId: row.typeId,
          label: row.label,
          description: row.description ?? undefined,
          iconKey: row.iconKey,
          accentClass: row.accentClass,
          configSchema: (row.configSchema as CustomNodeTypeDescriptor['configSchema']) ?? [],
          isActive: row.isActive,
        };
        registerCustomNodeType(descriptor);
      }
    }
    return getAllPaletteEntries();
  }, [items]);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function NodePalette() {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const items = useHydratedPaletteItems();

  if (!isMobile) {
    // Desktop: left rail
    return (
      <aside
        className="hidden lg:block w-56 shrink-0 p-3 overflow-y-auto"
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
            <PaletteEntries items={items} />
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
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
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
            <PaletteEntries items={items} onActivate={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
