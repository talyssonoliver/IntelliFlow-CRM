/**
 * @vitest-environment jsdom
 * DealFilters Component Tests (PG-135)
 * AC-9: Filter bar supports owner filter and date range filter
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealFilters } from '../DealFilters';
import { createMockDealFilters } from './deal-test-utils';

describe('DealFilters', () => {
  const mockOnChange = vi.fn();
  const mockOnViewModeChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders owner filter dropdown', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    const ownerSelect = screen.getByLabelText('Filter by owner');
    expect(ownerSelect).toBeInTheDocument();
    expect(ownerSelect).toHaveValue('');
  });

  it('renders date range dropdown with "All Time" default', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    const dateSelect = screen.getByLabelText('Filter by date range');
    expect(dateSelect).toBeInTheDocument();
    expect(dateSelect).toHaveValue('');
  });

  it('renders view mode toggle buttons (Kanban active by default)', () => {
    render(
      <DealFilters
        value={createMockDealFilters()}
        onChange={mockOnChange}
        onViewModeChange={mockOnViewModeChange}
      />
    );

    const kanbanBtn = screen.getByLabelText('Kanban view');
    expect(kanbanBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('owner dropdown change calls onChange with updated ownerId', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    const ownerSelect = screen.getByLabelText('Filter by owner');
    fireEvent.change(ownerSelect, { target: { value: 'me' } });

    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'me' }));
  });

  it('date range dropdown change calls onChange with dateRange value', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    const dateSelect = screen.getByLabelText('Filter by date range');
    fireEvent.change(dateSelect, { target: { value: 'this_quarter' } });

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: 'this_quarter' })
    );
  });

  it('list view button is enabled and triggers view mode change', () => {
    const mockViewModeChange = vi.fn();
    render(
      <DealFilters
        value={createMockDealFilters()}
        onChange={mockOnChange}
        viewMode="kanban"
        onViewModeChange={mockViewModeChange}
      />
    );

    const listBtn = screen.getByLabelText('List view');
    expect(listBtn).not.toBeDisabled();
    fireEvent.click(listBtn);
    expect(mockViewModeChange).toHaveBeenCalledWith('list');
  });

  it('renders "More Filters" button', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    expect(screen.getByText('More Filters')).toBeInTheDocument();
  });

  it('component has accessible toolbar role', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('view mode group has correct role', () => {
    render(
      <DealFilters
        value={createMockDealFilters()}
        onChange={mockOnChange}
        onViewModeChange={mockOnViewModeChange}
      />
    );

    expect(screen.getByRole('group', { name: 'View mode' })).toBeInTheDocument();
  });
});
