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

  const OWNERS = [
    { value: '11111111-1111-4111-8111-111111111111', label: 'Jane Smith (3)' },
    { value: '22222222-2222-4222-8222-222222222222', label: 'Bob Wilson (1)' },
  ];

  it('renders real owner options from the owners prop (F-12)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} owners={OWNERS} />);

    const ownerSelect = screen.getByLabelText('Filter by owner') as HTMLSelectElement;
    // "All Deals" + 2 owners
    expect(ownerSelect.options).toHaveLength(3);
    expect(screen.getByRole('option', { name: 'Jane Smith (3)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob Wilson (1)' })).toBeInTheDocument();
  });

  it('owner dropdown change calls onChange with the selected owner id (F-12)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} owners={OWNERS} />);

    const ownerSelect = screen.getByLabelText('Filter by owner');
    fireEvent.change(ownerSelect, { target: { value: OWNERS[1].value } });

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: OWNERS[1].value })
    );
  });

  it('no longer renders the hardcoded "My Deals" option (F-12)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} owners={OWNERS} />);

    expect(screen.queryByRole('option', { name: 'My Deals' })).not.toBeInTheDocument();
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

  it('renders "More Filters" button collapsed by default (F-11)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    const moreBtn = screen.getByRole('button', { name: 'More filters' });
    expect(moreBtn).toBeInTheDocument();
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('"More Filters" toggles the advanced panel (F-11)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    const moreBtn = screen.getByRole('button', { name: 'More filters' });
    fireEvent.click(moreBtn);

    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Min Value')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Value')).toBeInTheDocument();

    // Toggle closed again
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('search input changes call onChange with search (F-11)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'acme' } });

    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'acme' }));
  });

  it('min/max value inputs call onChange with numeric values (F-11)', () => {
    render(<DealFilters value={createMockDealFilters()} onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));

    fireEvent.change(screen.getByLabelText('Min Value'), { target: { value: '1000' } });
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ minValue: 1000 }));

    fireEvent.change(screen.getByLabelText('Max Value'), { target: { value: '50000' } });
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ maxValue: 50000 }));
  });

  it('clearing a value input sends undefined (F-11)', () => {
    render(
      <DealFilters value={createMockDealFilters({ minValue: 1000 })} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.change(screen.getByLabelText('Min Value'), { target: { value: '' } });

    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ minValue: undefined }));
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
