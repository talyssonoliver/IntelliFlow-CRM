/**
 * @vitest-environment jsdom
 * PipelineBoard Component Tests (PG-135)
 * AC-1: 7 stage columns render
 * AC-3: DnD moves deals between stages
 * AC-4: Invalid stage transitions are rejected
 * AC-19: @dnd-kit announcer provides screen reader feedback
 * AC-21: Kanban board uses role="region" with aria-label
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { PipelineBoard } from '../PipelineBoard';
import { createMockDeal, createMockDeals } from './deal-test-utils';
import type { OpportunityStage } from '../types';

// Capture DndContext props for testing
let capturedDndProps: Record<string, unknown> = {};

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}));

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd, onDragStart, onDragCancel, accessibility, ...props }: Record<string, unknown> & { children: React.ReactNode }) => {
    capturedDndProps = { onDragEnd, onDragStart, onDragCancel, accessibility, ...props };
    return <div data-testid="dnd-context">{children as React.ReactNode}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCorners: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

// Mock @dnd-kit/utilities
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

describe('PipelineBoard', () => {
  const mockOnStageChange = vi.fn();
  const mockOnDealNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedDndProps = {};
  });

  it('renders all 7 stage columns from OPPORTUNITY_STAGES (AC-1)', () => {
    render(
      <PipelineBoard
        deals={[]}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('Prospecting')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Needs Analysis')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText('Closed Won')).toBeInTheDocument();
    expect(screen.getByText('Closed Lost')).toBeInTheDocument();
  });

  it('groups deals correctly by stage', () => {
    const deals = [
      createMockDeal({ id: 'd1', name: 'Deal A', stage: 'PROSPECTING' as OpportunityStage }),
      createMockDeal({ id: 'd2', name: 'Deal B', stage: 'PROPOSAL' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('Deal A')).toBeInTheDocument();
    expect(screen.getByText('Deal B')).toBeInTheDocument();
  });

  it('handles empty deals array (all columns show placeholder)', () => {
    render(
      <PipelineBoard
        deals={[]}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const placeholders = screen.getAllByText('Drop deals here');
    expect(placeholders.length).toBe(7);
  });

  it('has role="region" with aria-label="Deal pipeline kanban board" (AC-21)', () => {
    render(
      <PipelineBoard
        deals={[]}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const board = screen.getByRole('region', { name: 'Deal pipeline kanban board' });
    expect(board).toBeInTheDocument();
  });

  it('DndContext has accessibility announcements configured (AC-19)', () => {
    render(
      <PipelineBoard
        deals={[]}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const accessibility = capturedDndProps.accessibility as Record<string, unknown>;
    expect(accessibility).toBeDefined();
    expect(accessibility.announcements).toBeDefined();
    expect(accessibility.screenReaderInstructions).toBeDefined();
  });

  it('DndContext has screenReaderInstructions configured (AC-19)', () => {
    render(
      <PipelineBoard
        deals={[]}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const accessibility = capturedDndProps.accessibility as Record<string, Record<string, unknown>>;
    const instructions = accessibility?.screenReaderInstructions as Record<string, string>;
    expect(instructions?.draggable).toContain('Space');
  });

  it('handleDragEnd — valid transition: calls onStageChange', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', stage: 'PROSPECTING' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Record<string, unknown>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'QUALIFICATION' },
    });

    expect(mockOnStageChange).toHaveBeenCalledWith('deal-1', 'QUALIFICATION');
  });

  it('handleDragEnd — invalid transition: does NOT call onStageChange', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', stage: 'PROSPECTING' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    // PROSPECTING cannot go directly to NEGOTIATION
    const onDragEnd = capturedDndProps.onDragEnd as (event: Record<string, unknown>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'NEGOTIATION' },
    });

    expect(mockOnStageChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd — same stage reorder: does NOT call onStageChange', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', stage: 'QUALIFICATION' as OpportunityStage }),
      createMockDeal({ id: 'deal-2', stage: 'QUALIFICATION' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Record<string, unknown>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'deal-2' },
    });

    // Same stage reorder — no stage change
    expect(mockOnStageChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd — drop on empty: does NOT call onStageChange', () => {
    render(
      <PipelineBoard
        deals={[createMockDeal({ id: 'deal-1' })]}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Record<string, unknown>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: null,
    });

    expect(mockOnStageChange).not.toHaveBeenCalled();
  });

  it('CLOSED_WON only valid from NEGOTIATION (AC-6)', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', stage: 'PROPOSAL' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Record<string, unknown>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'CLOSED_WON' },
    });

    // PROPOSAL → CLOSED_WON is invalid
    expect(mockOnStageChange).not.toHaveBeenCalled();
  });

  it('CLOSED_WON is valid from NEGOTIATION (AC-6)', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', stage: 'NEGOTIATION' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Record<string, unknown>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'CLOSED_WON' },
    });

    expect(mockOnStageChange).toHaveBeenCalledWith('deal-1', 'CLOSED_WON');
  });
});
