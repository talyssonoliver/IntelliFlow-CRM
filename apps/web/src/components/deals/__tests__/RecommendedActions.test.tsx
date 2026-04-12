/**
 * @vitest-environment jsdom
 * RecommendedActions Component Tests (PG-131)
 * AC-005: Priority-ordered cards with click handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendedActions } from '../forecast/RecommendedActions';
import { createMockRecommendation } from './deal-test-utils';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, ...props }: Readonly<{ children: React.ReactNode; className?: string }>) => (
    <div {...props}>{children}</div>
  ),
  Skeleton: ({ className, ...props }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
}));

describe('RecommendedActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders action cards with title and description', () => {
    const recs = [
      createMockRecommendation({
        id: 'r1',
        title: 'Schedule call',
        description: 'Follow up with decision maker',
      }),
    ];
    render(<RecommendedActions recommendations={recs} />);

    expect(screen.getByText('Schedule call')).toBeInTheDocument();
    expect(screen.getByText('Follow up with decision maker')).toBeInTheDocument();
  });

  it('shows priority badges (high/medium/low with colors)', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', priority: 'high' }),
      createMockRecommendation({ id: 'r2', priority: 'medium' }),
      createMockRecommendation({ id: 'r3', priority: 'low' }),
    ];
    render(<RecommendedActions recommendations={recs} />);

    const badges = screen.getAllByTestId('priority-badge');
    expect(badges).toHaveLength(3);
    // Sorted by priority: high first
    expect(badges[0].className).toContain('bg-red-100');
    expect(badges[1].className).toContain('bg-amber-100');
    expect(badges[2].className).toContain('bg-green-100');
  });

  it('calls onActionClick when action card clicked', () => {
    const onClick = vi.fn();
    const rec = createMockRecommendation({ id: 'r1', title: 'Do something' });
    render(<RecommendedActions recommendations={[rec]} onActionClick={onClick} />);

    fireEvent.click(screen.getByTestId('action-card'));
    expect(onClick).toHaveBeenCalledWith(rec);
  });

  it('renders empty state when no recommendations', () => {
    render(<RecommendedActions recommendations={[]} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent('No actions recommended');
  });

  it('renders loading skeleton when isLoading=true', () => {
    render(<RecommendedActions recommendations={[]} isLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  it('custom empty message via emptyMessage prop', () => {
    render(<RecommendedActions recommendations={[]} emptyMessage="Nothing to do!" />);

    expect(screen.getByText('Nothing to do!')).toBeInTheDocument();
  });

  it('orders actions by priority (high first)', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', priority: 'low', title: 'Low action' }),
      createMockRecommendation({ id: 'r2', priority: 'high', title: 'High action' }),
      createMockRecommendation({ id: 'r3', priority: 'medium', title: 'Medium action' }),
    ];
    render(<RecommendedActions recommendations={recs} />);

    const cards = screen.getAllByTestId('action-card');
    expect(cards[0]).toHaveTextContent('High action');
    expect(cards[1]).toHaveTextContent('Medium action');
    expect(cards[2]).toHaveTextContent('Low action');
  });

  it('each action card is keyboard accessible (Enter activates)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const rec = createMockRecommendation({ id: 'r1' });
    render(<RecommendedActions recommendations={[rec]} onActionClick={onClick} />);

    const card = screen.getByTestId('action-card');
    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });
});
