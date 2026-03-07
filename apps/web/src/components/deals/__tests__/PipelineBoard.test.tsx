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
import { render, screen, act } from '@testing-library/react';
import { PipelineBoard } from '../PipelineBoard';
import { createMockDeal } from './deal-test-utils';
import type { OpportunityStage } from '../types';

// Capture DndContext props for testing
let capturedDndProps: Record<string, unknown> = {};

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}));

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
    onDragStart,
    onDragCancel,
    accessibility,
    ...props
  }: Record<string, unknown> & { children: React.ReactNode }) => {
    capturedDndProps = { onDragEnd, onDragStart, onDragCancel, accessibility, ...props };
    return <div data-testid="dnd-context">{children as React.ReactNode}</div>;
  },
  DragOverlay: ({ children }: Readonly<{ children: React.ReactNode }>) => (
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
  SortableContext: ({ children }: Readonly<{ children: React.ReactNode }>) => (
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
      />
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
      />
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
      />
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
      />
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
      />
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
      />
    );

    const accessibility = capturedDndProps.accessibility as Record<string, Record<string, unknown>>;
    const instructions = accessibility?.screenReaderInstructions as Record<string, string>;
    expect(instructions?.draggable).toContain('Space');
  });

  it('handleDragEnd — valid transition: calls onStageChange', () => {
    const deals = [createMockDeal({ id: 'deal-1', stage: 'PROSPECTING' as OpportunityStage })];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'QUALIFICATION' },
    });

    expect(mockOnStageChange).toHaveBeenCalledWith('deal-1', 'QUALIFICATION');
  });

  it('handleDragEnd — invalid transition: does NOT call onStageChange', () => {
    const deals = [createMockDeal({ id: 'deal-1', stage: 'PROSPECTING' as OpportunityStage })];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    // PROSPECTING cannot go directly to NEGOTIATION
    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
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
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
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
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: null,
    });

    expect(mockOnStageChange).not.toHaveBeenCalled();
  });

  it('CLOSED_WON only valid from NEGOTIATION (AC-6)', () => {
    const deals = [createMockDeal({ id: 'deal-1', stage: 'PROPOSAL' as OpportunityStage })];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'CLOSED_WON' },
    });

    // PROPOSAL → CLOSED_WON is invalid
    expect(mockOnStageChange).not.toHaveBeenCalled();
  });

  it('CLOSED_WON is valid from NEGOTIATION (AC-6)', () => {
    const deals = [createMockDeal({ id: 'deal-1', stage: 'NEGOTIATION' as OpportunityStage })];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'CLOSED_WON' },
    });

    expect(mockOnStageChange).toHaveBeenCalledWith('deal-1', 'CLOSED_WON');
  });

  // ─── IFC-064: DnD lifecycle + pendingDealId tests ──────────────────────────

  it('handleDragStart sets activeDeal — DragOverlay renders deal name (IFC-064 AC-003)', async () => {
    const deals = [
      createMockDeal({
        id: 'deal-1',
        name: 'Big Deal',
        stage: 'PROSPECTING' as OpportunityStage,
        value: 50000,
      }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragStart = capturedDndProps.onDragStart as (event: Readonly<Record<string, unknown>>) => void;
    await act(async () => {
      onDragStart({ active: { id: 'deal-1' } });
    });

    // DragOverlay should now show the active deal's name
    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay.textContent).toContain('Big Deal');
  });

  it('handleDragCancel clears activeDeal — DragOverlay empty (IFC-064 AC-003)', async () => {
    const deals = [
      createMockDeal({ id: 'deal-1', name: 'Big Deal', stage: 'PROSPECTING' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragStart = capturedDndProps.onDragStart as (event: Readonly<Record<string, unknown>>) => void;
    await act(async () => {
      onDragStart({ active: { id: 'deal-1' } });
    });

    const onDragCancel = capturedDndProps.onDragCancel as () => void;
    await act(async () => {
      onDragCancel();
    });

    // DragOverlay should be empty
    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay.textContent).toBe('');
  });

  it('passes pendingDealId through to StageColumn children (IFC-064 AC-007)', () => {
    const deals = [
      createMockDeal({
        id: 'deal-1',
        name: 'Pending Deal',
        stage: 'QUALIFICATION' as OpportunityStage,
      }),
    ];
    const { container } = render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
        pendingDealId="deal-1"
      />
    );

    // When pendingDealId matches, DealCard should get isPending=true
    // cn() mock concatenates — check for animate-pulse class on the deal card
    const dealCard = container.querySelector('[aria-label="View deal: Pending Deal"]');
    expect(dealCard?.className).toContain('animate-pulse');
  });

  it('accessibility announcements: onDragOver returns stage description (IFC-064)', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', name: 'Big Deal', stage: 'PROSPECTING' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const accessibility = capturedDndProps.accessibility as {
      announcements: {
        onDragStart: (ev: { active: { id: string } }) => string;
        onDragOver: (ev: { active: { id: string }; over: { id: string } | null }) => string;
        onDragEnd: (ev: { active: { id: string }; over: { id: string } | null }) => string;
        onDragCancel: () => string;
      };
    };

    // Test all announcement callbacks
    const startMsg = accessibility.announcements.onDragStart({ active: { id: 'deal-1' } });
    expect(startMsg).toContain('Big Deal');

    const overMsg = accessibility.announcements.onDragOver({
      active: { id: 'deal-1' },
      over: { id: 'QUALIFICATION' },
    });
    expect(overMsg).toContain('Qualification');

    const overNullMsg = accessibility.announcements.onDragOver({
      active: { id: 'deal-1' },
      over: null,
    });
    expect(overNullMsg).toContain('not over a stage');

    const endMsg = accessibility.announcements.onDragEnd({
      active: { id: 'deal-1' },
      over: { id: 'QUALIFICATION' },
    });
    expect(endMsg).toContain('Qualification');

    const endNullMsg = accessibility.announcements.onDragEnd({
      active: { id: 'deal-1' },
      over: null,
    });
    expect(endNullMsg).toContain('was dropped');

    const cancelMsg = accessibility.announcements.onDragCancel();
    expect(cancelMsg).toBe('Drag cancelled');
  });

  it('handleDragEnd — dropping on another deal in a different stage calls onStageChange', () => {
    const deals = [
      createMockDeal({ id: 'deal-1', stage: 'PROSPECTING' as OpportunityStage }),
      createMockDeal({ id: 'deal-2', stage: 'QUALIFICATION' as OpportunityStage }),
    ];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'deal-2' }, // Dropping on another deal, not a stage
    });

    // Should detect target stage from the deal being dropped on
    expect(mockOnStageChange).toHaveBeenCalledWith('deal-1', 'QUALIFICATION');
  });

  it('CLOSED_LOST drag delegates to parent via onStageChange (IFC-064 AC-005)', () => {
    const deals = [createMockDeal({ id: 'deal-1', stage: 'PROSPECTING' as OpportunityStage })];
    render(
      <PipelineBoard
        deals={deals}
        onStageChange={mockOnStageChange}
        onDealNavigate={mockOnDealNavigate}
      />
    );

    const onDragEnd = capturedDndProps.onDragEnd as (event: Readonly<Record<string, unknown>>) => void;
    onDragEnd({
      active: { id: 'deal-1', data: { current: {} } },
      over: { id: 'CLOSED_LOST' },
    });

    // PROSPECTING → CLOSED_LOST is valid, should delegate to parent
    expect(mockOnStageChange).toHaveBeenCalledWith('deal-1', 'CLOSED_LOST');
  });
});
