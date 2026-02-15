/**
 * @vitest-environment jsdom
 * DealQuickView Component Tests (PG-135)
 * AC-27: 6 component files created (stub)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealQuickView } from '../DealQuickView';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
}));

describe('DealQuickView', () => {
  const mockOnClose = vi.fn();
  const mockOnNavigateToDetail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when dealId is null', () => {
    const { container } = render(
      <DealQuickView
        dealId={null}
        onClose={mockOnClose}
        onNavigateToDetail={mockOnNavigateToDetail}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders placeholder card when dealId is provided', () => {
    render(
      <DealQuickView
        dealId="deal-123"
        onClose={mockOnClose}
        onNavigateToDetail={mockOnNavigateToDetail}
      />,
    );

    expect(screen.getByText('Quick View')).toBeInTheDocument();
  });

  it('close button calls onClose', async () => {
    const user = userEvent.setup();
    render(
      <DealQuickView
        dealId="deal-123"
        onClose={mockOnClose}
        onNavigateToDetail={mockOnNavigateToDetail}
      />,
    );

    const closeButton = screen.getByLabelText('Close quick view');
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('"View Details" link calls onNavigateToDetail', async () => {
    const user = userEvent.setup();
    render(
      <DealQuickView
        dealId="deal-123"
        onClose={mockOnClose}
        onNavigateToDetail={mockOnNavigateToDetail}
      />,
    );

    const detailButton = screen.getByText('View Details');
    await user.click(detailButton);

    expect(mockOnNavigateToDetail).toHaveBeenCalledWith('deal-123');
  });
});
