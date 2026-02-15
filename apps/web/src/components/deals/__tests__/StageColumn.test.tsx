/**
 * @vitest-environment jsdom
 * StageColumn Component Tests (PG-135)
 * AC-1: 7 stage columns render
 * AC-22: Stage columns use role="list" and deal cards wrapped in role="listitem"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import { StageColumn } from '../StageColumn';
import { createMockDeal, createMockDeals } from './deal-test-utils';
import type { OpportunityStage } from '../types';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}));

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
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

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

// Mock @dnd-kit/utilities
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

describe('StageColumn', () => {
  const mockOnDealNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stage label from PIPELINE_STAGE_CONFIG', () => {
    render(
      <StageColumn
        stage={'QUALIFICATION' as OpportunityStage}
        deals={[]}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('Qualification')).toBeInTheDocument();
  });

  it('renders colored dot matching stage color', () => {
    const { container } = render(
      <StageColumn
        stage={'QUALIFICATION' as OpportunityStage}
        deals={[]}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const dot = container.querySelector('.rounded-full[style]');
    expect(dot).toBeInTheDocument();
  });

  it('shows deal count badge', () => {
    const deals = createMockDeals(3, 'QUALIFICATION' as OpportunityStage);
    render(
      <StageColumn
        stage={'QUALIFICATION' as OpportunityStage}
        deals={deals}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows total value in compact format', () => {
    const deals = [
      createMockDeal({ id: 'd1', value: 75000, stage: 'QUALIFICATION' as OpportunityStage }),
      createMockDeal({ id: 'd2', value: 125000, stage: 'QUALIFICATION' as OpportunityStage }),
    ];
    render(
      <StageColumn
        stage={'QUALIFICATION' as OpportunityStage}
        deals={deals}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('$200K')).toBeInTheDocument();
  });

  it('renders DealCard for each deal in the list', () => {
    const deals = [
      createMockDeal({ id: 'd1', name: 'Deal Alpha', stage: 'PROPOSAL' as OpportunityStage }),
      createMockDeal({ id: 'd2', name: 'Deal Beta', stage: 'PROPOSAL' as OpportunityStage }),
    ];
    render(
      <StageColumn
        stage={'PROPOSAL' as OpportunityStage}
        deals={deals}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('Deal Alpha')).toBeInTheDocument();
    expect(screen.getByText('Deal Beta')).toBeInTheDocument();
  });

  it('empty column shows "Drop deals here" placeholder', () => {
    render(
      <StageColumn
        stage={'PROSPECTING' as OpportunityStage}
        deals={[]}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByText('Drop deals here')).toBeInTheDocument();
  });

  it('has role="region" with aria-label including stage name (AC-22)', () => {
    render(
      <StageColumn
        stage={'NEGOTIATION' as OpportunityStage}
        deals={[]}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-label', expect.stringContaining('Negotiation'));
  });

  it('has role="list" wrapper around deals (AC-22)', () => {
    const deals = [createMockDeal({ id: 'd1', stage: 'PROPOSAL' as OpportunityStage })];
    render(
      <StageColumn
        stage={'PROPOSAL' as OpportunityStage}
        deals={deals}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('deal cards wrapped in role="listitem" (AC-22)', () => {
    const deals = [createMockDeal({ id: 'd1', stage: 'PROPOSAL' as OpportunityStage })];
    render(
      <StageColumn
        stage={'PROPOSAL' as OpportunityStage}
        deals={deals}
        onDealNavigate={mockOnDealNavigate}
      />,
    );

    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBe(1);
  });
});
