/**
 * @vitest-environment jsdom
 * DraggablePinnedItem Component Tests (PG-158)
 * T-003: useSortable attributes (ref, listeners, transform)
 * T-009: isDragging visual state
 * T-011: Accessibility — aria-label on drag handle
 * T-003b: touch-action: none on drag handle
 * T-003c: Content wrapped in Link
 * T-003d: isDragDisabled prevents drag
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Captured useSortable values for assertion
// ---------------------------------------------------------------------------
let capturedSortableArgs: Record<string, unknown> = {};
const mockSetNodeRef = vi.fn();
const mockListeners = { onPointerDown: vi.fn(), onKeyDown: vi.fn() };
const mockAttributes = { role: 'button', tabIndex: 0, 'aria-roledescription': 'sortable' };

// Control isDragging from test scope
let mockIsDragging = false;

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: (args: Readonly<Record<string, unknown>>) => {
    capturedSortableArgs = args;
    return {
      attributes: mockAttributes,
      listeners: args.disabled ? null : mockListeners,
      setNodeRef: mockSetNodeRef,
      transform: { x: 0, y: 10, scaleX: 1, scaleY: 1 },
      transition: 'transform 200ms ease',
      isDragging: mockIsDragging,
    };
  },
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: (t: unknown) => (t ? 'translate3d(0px, 10px, 0)' : '') },
    Transition: { toString: () => 'transform 200ms ease' },
  },
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock PinnedItemsSheet getPinnedIcon
vi.mock('../PinnedItemsSheet', () => ({
  getPinnedIcon: (entityType: string) => ({
    icon: `icon-${entityType}`,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  }),
}));

import { DraggablePinnedItem } from '../DraggablePinnedItem';
import type { SerializedPinnedItem } from '../AuthenticatedHomePage';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const mockItem: SerializedPinnedItem = {
  id: 'pin-1',
  entityType: 'lead',
  entityId: 'lead-1',
  title: 'Acme Corp Lead',
  subtitle: 'High priority',
  icon: null,
  url: '/leads/lead-1',
  pinnedAt: '2026-01-15T00:00:00Z',
  position: 0,
};

describe('DraggablePinnedItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSortableArgs = {};
    mockIsDragging = false;
  });

  // T-003: useSortable receives composite ID and attributes are applied
  it('calls useSortable with composite entityType-entityId', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    expect(capturedSortableArgs.id).toBe('lead-lead-1');
  });

  it('applies setNodeRef to container element', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    expect(mockSetNodeRef).toHaveBeenCalled();
  });

  it('applies transform style from useSortable', () => {
    const { container } = render(<DraggablePinnedItem item={mockItem} />);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.style.transform).toBe('translate3d(0px, 10px, 0)');
  });

  // T-009: isDragging visual state — opacity reduced
  it('applies opacity-50 class when isDragging is true', () => {
    mockIsDragging = true;
    const { container } = render(<DraggablePinnedItem item={mockItem} />);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).toContain('opacity-50');
  });

  it('does not apply opacity-50 when not dragging', () => {
    mockIsDragging = false;
    const { container } = render(<DraggablePinnedItem item={mockItem} />);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).not.toContain('opacity-50');
  });

  // T-011: Accessibility — drag handle has aria-label
  it('renders drag handle with correct aria-label', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    const handle = screen.getByRole('button', { name: /drag to reorder acme corp lead/i });
    expect(handle).toBeInTheDocument();
  });

  // T-003b: Drag handle has touch-action: none
  it('drag handle has touch-action: none style', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    const handle = screen.getByRole('button', { name: /drag to reorder/i });
    expect(handle.style.touchAction).toBe('none');
  });

  // T-003c: Content area wrapped in Link
  it('renders item title within a Link to item.url', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    const link = screen.getByText('Acme Corp Lead').closest('a');
    expect(link).toHaveAttribute('href', '/leads/lead-1');
  });

  it('renders item subtitle', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    expect(screen.getByText('High priority')).toBeInTheDocument();
  });

  it('renders drag_indicator icon on handle', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    const handle = screen.getByRole('button', { name: /drag to reorder/i });
    expect(handle.querySelector('.material-symbols-outlined')).toBeInTheDocument();
    expect(handle.textContent).toContain('drag_indicator');
  });

  // T-003d: isDragDisabled prevents drag (no listeners)
  it('passes disabled flag to useSortable when isDragDisabled', () => {
    render(<DraggablePinnedItem item={mockItem} isDragDisabled />);
    expect(capturedSortableArgs.disabled).toBe(true);
  });

  it('renders cursor-grab class on drag handle', () => {
    render(<DraggablePinnedItem item={mockItem} />);
    const handle = screen.getByRole('button', { name: /drag to reorder/i });
    expect(handle.className).toContain('cursor-grab');
  });

  it('does not render subtitle when null', () => {
    const itemNoSub = { ...mockItem, subtitle: null };
    render(<DraggablePinnedItem item={itemNoSub} />);
    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
  });

  // PG-159: Stale pin rendering tests (T-009 through T-015)
  describe('unavailable items (PG-159)', () => {
    const unavailableItem: SerializedPinnedItem = {
      ...mockItem,
      isAvailable: false,
      title: 'Deleted Lead',
    };

    it('renders with muted/grayed appearance when unavailable (T-009)', () => {
      const { container } = render(<DraggablePinnedItem item={unavailableItem} />);
      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv.className).toContain('opacity-50');
    });

    it('shows "Item unavailable" subtitle when unavailable (T-010)', () => {
      render(<DraggablePinnedItem item={unavailableItem} />);
      expect(screen.getByText('Item unavailable')).toBeInTheDocument();
    });

    it('does NOT render as a navigable Link when unavailable (T-011)', () => {
      render(<DraggablePinnedItem item={unavailableItem} />);
      // Should not have any <a> element wrapping the content
      const link = screen.queryByText('Deleted Lead')?.closest('a');
      expect(link).toBeNull();
    });

    it('shows inline unpin button with close icon when unavailable (T-012)', () => {
      render(<DraggablePinnedItem item={unavailableItem} />);
      const unpinBtn = screen.getByRole('button', { name: /unpin unavailable item/i });
      expect(unpinBtn).toBeInTheDocument();
      expect(unpinBtn.textContent).toContain('close');
    });

    it('calls onUnpin(entityType, entityId) when unpin button clicked (T-013)', () => {
      const onUnpin = vi.fn();
      render(<DraggablePinnedItem item={unavailableItem} onUnpin={onUnpin} />);
      const unpinBtn = screen.getByRole('button', { name: /unpin unavailable item/i });
      unpinBtn.click();
      expect(onUnpin).toHaveBeenCalledWith('lead', 'lead-1');
    });

    it('renders available items exactly as before with navigation link (T-014)', () => {
      const availableItem: SerializedPinnedItem = { ...mockItem, isAvailable: true };
      render(<DraggablePinnedItem item={availableItem} />);
      const link = screen.getByText('Acme Corp Lead').closest('a');
      expect(link).toHaveAttribute('href', '/leads/lead-1');
      // Should not show "Item unavailable"
      expect(screen.queryByText('Item unavailable')).not.toBeInTheDocument();
    });

    it('drag handle still works on unavailable items (T-015)', () => {
      render(<DraggablePinnedItem item={unavailableItem} />);
      const handle = screen.getByRole('button', { name: /drag to reorder/i });
      expect(handle).toBeInTheDocument();
      expect(handle.style.touchAction).toBe('none');
    });
  });
});
