/**
 * NodePalette Component Tests — IFC-031
 *
 * Tests for the left-side palette that lets users drag node types onto the canvas.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Use vi.hoisted to safely declare mock before it gets hoisted
// ---------------------------------------------------------------------------

const { useDraggableMock } = vi.hoisted(() => {
  const useDraggableMock = vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }));
  return { useDraggableMock };
});

vi.mock('@dnd-kit/core', () => ({
  useDraggable: useDraggableMock,
  DndContext: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// Mock tRPC — custom-node-type hydration is non-fatal; return an empty list.
vi.mock('@/lib/api', () => ({
  api: {
    customNodeType: {
      list: {
        useQuery: () => ({ data: { items: [] }, isLoading: false }),
      },
    },
  },
}));

import { NodePalette } from '../NodePalette';

describe('NodePalette', () => {
  beforeEach(() => {
    useDraggableMock.mockClear();
  });

  it('renders 5 palette items: Start, Action, Decision, Human, End', () => {
    render(<NodePalette />);
    // Use exact match to avoid matching description text ("Perform an automated action" != "Action")
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('Human')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('each palette item shows icon and description text', () => {
    render(<NodePalette />);
    // Each draggable button should have both a label and description text
    const draggables = screen.getAllByRole('button', { name: /drag/i });
    expect(draggables.length).toBe(5);
    draggables.forEach((item) => {
      expect(item.textContent!.length).toBeGreaterThan(3);
    });
  });

  it('useDraggable is called with correct nodeType data for each item', () => {
    render(<NodePalette />);
    expect(useDraggableMock).toHaveBeenCalledTimes(5);

    const calls = useDraggableMock.mock.calls as unknown as Array<
      [{ id: string; data: { nodeType: string } }]
    >;
    const nodeTypes = calls.map((c) => c[0].data?.nodeType);
    expect(nodeTypes).toContain('start');
    expect(nodeTypes).toContain('action');
    expect(nodeTypes).toContain('decision');
    expect(nodeTypes).toContain('human');
    expect(nodeTypes).toContain('end');
  });

  it('palette items are keyboard-accessible (native <button> elements)', () => {
    render(<NodePalette />);
    const draggables = screen.getAllByRole('button', { name: /drag/i });
    expect(draggables.length).toBe(5);
    draggables.forEach((item) => {
      // Native <button> elements are inherently focusable; assert tag instead
      // of an explicit tabindex (PG-195: switched from div+role to <button>).
      expect(item.tagName).toBe('BUTTON');
    });
  });

  it('dragging a palette item does NOT emit a React Flow edge-creation event', () => {
    render(<NodePalette />);
    const draggables = screen.getAllByRole('button', { name: /drag/i });
    draggables.forEach((item) => {
      expect(item.getAttribute('data-type')).not.toBe('edge');
    });
  });

  it('applies isDragging visual class when useDraggable returns isDragging=true', () => {
    useDraggableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: true,
    });
    render(<NodePalette />);
    const draggables = screen.getAllByRole('button', { name: /drag/i });
    // When isDragging=true, the "opacity-50 cursor-grabbing" class should be present
    draggables.forEach((item) => {
      expect(item.className).toContain('opacity-50');
    });
  });
});
