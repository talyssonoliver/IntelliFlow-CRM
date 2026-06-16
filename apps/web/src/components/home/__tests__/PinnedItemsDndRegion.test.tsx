/**
 * @vitest-environment jsdom
 * PinnedItemsDndRegion Tests (PERF-05)
 *
 * `PinnedSkeleton` and `PinnedSection` were extracted from AuthenticatedHomePage
 * into this file so the @dnd-kit chunk can be lazy-loaded — the home page now
 * pulls this region in via `next/dynamic` with `ssr: false`. Because that lazy
 * boundary renders the skeleton (not the section) in the home-page tests, these
 * unit tests render `PinnedSection` directly so the extracted DnD logic stays
 * covered. Mirrors the @dnd-kit mock pattern from DraggablePinnedItem.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SerializedPinnedItem } from '../AuthenticatedHomePage';

// Capture DndContext.onDragEnd so a reorder can be driven from the test.
let capturedOnDragEnd: ((event: unknown) => void) | undefined;

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => {
    capturedOnDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  verticalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: (arr: readonly unknown[], from: number, to: number) => {
    const next = arr.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  },
}));

vi.mock('../DraggablePinnedItem', () => ({
  DraggablePinnedItem: ({ item }: any) => (
    <div data-testid={`draggable-pinned-${item.entityType}-${item.entityId}`}>{item.title}</div>
  ),
}));

import { PinnedSection, PinnedSkeleton } from '../PinnedItemsDndRegion';

const items = [
  {
    id: 'pin-1',
    entityType: 'lead',
    entityId: 'lead-1',
    title: 'Acme Corp Lead',
    subtitle: 'High priority',
    icon: null,
    url: '/leads/lead-1',
    pinnedAt: '2026-01-15T00:00:00Z',
    position: 0,
  },
  {
    id: 'pin-2',
    entityType: 'contact',
    entityId: 'contact-1',
    title: 'Jane Doe Contact',
    subtitle: null,
    icon: null,
    url: '/contacts/contact-1',
    pinnedAt: '2026-01-16T00:00:00Z',
    position: 1,
  },
] as unknown as SerializedPinnedItem[];

describe('PinnedItemsDndRegion', () => {
  it('PinnedSkeleton renders animated placeholder rows', () => {
    const { container } = render(<PinnedSkeleton />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });

  it('renders the skeleton while loading', () => {
    const { container } = render(<PinnedSection isLoading items={items} onReorder={vi.fn()} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
    expect(screen.queryByTestId('dnd-context')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no items', () => {
    render(<PinnedSection isLoading={false} items={[]} onReorder={vi.fn()} />);
    expect(screen.queryByTestId('dnd-context')).not.toBeInTheDocument();
  });

  it('renders one draggable row per item', () => {
    render(<PinnedSection isLoading={false} items={items} onReorder={vi.fn()} />);
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    expect(screen.getByTestId('draggable-pinned-lead-lead-1')).toBeInTheDocument();
    expect(screen.getByTestId('draggable-pinned-contact-contact-1')).toBeInTheDocument();
  });

  it('drag-end reorders and calls onReorder with the new order', () => {
    const onReorder = vi.fn();
    render(<PinnedSection isLoading={false} items={items} onReorder={onReorder} />);
    capturedOnDragEnd?.({ active: { id: 'lead-lead-1' }, over: { id: 'contact-contact-1' } });
    expect(onReorder).toHaveBeenCalledTimes(1);
    const reordered = onReorder.mock.calls[0][0] as SerializedPinnedItem[];
    expect(reordered.map((i) => i.entityId)).toEqual(['contact-1', 'lead-1']);
  });

  it('drag-end without a drop target does not reorder', () => {
    const onReorder = vi.fn();
    render(<PinnedSection isLoading={false} items={items} onReorder={onReorder} />);
    capturedOnDragEnd?.({ active: { id: 'lead-lead-1' }, over: null });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
