// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { NotificationFilters, type NotificationFiltersProps } from '../NotificationFilters';

const defaultProps: NotificationFiltersProps = {
  searchQuery: '',
  onSearchChange: vi.fn(),
  typeFilter: '',
  onTypeChange: vi.fn(),
  priorityFilter: '',
  onPriorityChange: vi.fn(),
  activeTab: 'all',
  onTabChange: vi.fn(),
  unreadCount: 0,
  highPriorityCount: 0,
  onClearFilters: vi.fn(),
};

function renderFilters(overrides: Partial<NotificationFiltersProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<NotificationFilters {...props} />);
}

describe('NotificationFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Search ---
  it('renders search input with placeholder', () => {
    renderFilters();
    expect(screen.getByPlaceholderText('Search notifications...')).toBeInTheDocument();
  });

  it('calls onSearchChange when typing in search', () => {
    const onSearchChange = vi.fn();
    renderFilters({ onSearchChange });
    const input = screen.getByPlaceholderText('Search notifications...');
    fireEvent.change(input, { target: { value: 'deal won' } });
    expect(onSearchChange).toHaveBeenCalledWith('deal won');
  });

  it('displays current search value', () => {
    renderFilters({ searchQuery: 'test query' });
    const input = screen.getByPlaceholderText('Search notifications...') as HTMLInputElement;
    expect(input.value).toBe('test query');
  });

  // --- Type filter ---
  it('renders type filter dropdown', () => {
    renderFilters();
    // SearchFilterBar renders a <select> with sr-only label "Type"
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
  });

  it('calls onTypeChange when selecting a type', () => {
    const onTypeChange = vi.fn();
    renderFilters({ onTypeChange });
    const select = screen.getByLabelText('Type');
    fireEvent.change(select, { target: { value: 'lead_assigned' } });
    expect(onTypeChange).toHaveBeenCalledWith('lead_assigned');
  });

  it('shows type filter options grouped by category', () => {
    renderFilters();
    const select = screen.getByLabelText('Type');
    // Should have optgroup elements for categories
    const optgroups = select.querySelectorAll('optgroup');
    expect(optgroups.length).toBeGreaterThanOrEqual(9); // Lead, Deal, Task, Calendar, AI, Team, System, Document, Email, Ticket, Case
  });

  // --- Priority filter ---
  it('renders priority filter dropdown', () => {
    renderFilters();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
  });

  it('calls onPriorityChange when selecting a priority', () => {
    const onPriorityChange = vi.fn();
    renderFilters({ onPriorityChange });
    const select = screen.getByLabelText('Priority');
    fireEvent.change(select, { target: { value: 'high' } });
    expect(onPriorityChange).toHaveBeenCalledWith('high');
  });

  it('has only high, normal, low priority options (no urgent/medium)', () => {
    renderFilters();
    const select = screen.getByLabelText('Priority') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('high');
    expect(optionValues).toContain('normal');
    expect(optionValues).toContain('low');
    expect(optionValues).not.toContain('urgent');
    expect(optionValues).not.toContain('medium');
  });

  // --- Tab pills ---
  it('renders All tab pill', () => {
    renderFilters();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('renders Unread tab pill', () => {
    renderFilters();
    expect(screen.getByText('Unread')).toBeInTheDocument();
  });

  it('renders High Priority tab pill', () => {
    renderFilters();
    expect(screen.getByText('High Priority')).toBeInTheDocument();
  });

  it('calls onTabChange when clicking Unread tab', () => {
    const onTabChange = vi.fn();
    renderFilters({ onTabChange });
    fireEvent.click(screen.getByText('Unread'));
    expect(onTabChange).toHaveBeenCalledWith('unread');
  });

  it('calls onTabChange when clicking High Priority tab', () => {
    const onTabChange = vi.fn();
    renderFilters({ onTabChange });
    fireEvent.click(screen.getByText('High Priority'));
    expect(onTabChange).toHaveBeenCalledWith('high');
  });

  it('does not render an urgent tab', () => {
    renderFilters();
    expect(screen.queryByText(/urgent/i)).not.toBeInTheDocument();
  });

  // --- Badge counts ---
  it('shows unread count badge when unreadCount > 0', () => {
    renderFilters({ unreadCount: 5 });
    expect(screen.getByText('Unread (5)')).toBeInTheDocument();
  });

  it('shows high priority count badge when highPriorityCount > 0', () => {
    renderFilters({ highPriorityCount: 3 });
    expect(screen.getByText('High Priority (3)')).toBeInTheDocument();
  });

  it('does not show badge when counts are 0', () => {
    renderFilters({ unreadCount: 0, highPriorityCount: 0 });
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText('High Priority')).toBeInTheDocument();
    // No parenthetical counts
    expect(screen.queryByText(/Unread \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/High Priority \(/)).not.toBeInTheDocument();
  });

  // --- Clear filters ---
  it('shows clear filters button when filters are active', () => {
    renderFilters({ searchQuery: 'something' });
    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
  });

  it('calls onClearFilters when clicking clear button', () => {
    const onClearFilters = vi.fn();
    renderFilters({ searchQuery: 'something', onClearFilters });
    fireEvent.click(screen.getByText('Clear all filters'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('does not show clear button when no filters active and tab is all', () => {
    renderFilters({ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' });
    expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
  });

  it('shows clear button when activeTab is not all', () => {
    renderFilters({ activeTab: 'unread' });
    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
  });

  // --- ARIA / Accessibility ---
  it('has role="search" on the container', () => {
    renderFilters();
    const searchRegion = screen.getByRole('search', { name: /filter notifications/i });
    expect(searchRegion).toBeInTheDocument();
  });

  it('search input has accessible label', () => {
    renderFilters();
    // The SearchFilterBar renders a sr-only label "Search notifications"
    expect(screen.getByLabelText('Search notifications')).toBeInTheDocument();
  });

  // --- No urgent/medium in rendered output ---
  it('does not render urgent anywhere in the component', () => {
    const { container } = renderFilters();
    expect(container.textContent).not.toMatch(/\burgent\b/i);
  });

  it('does not render medium anywhere in the component', () => {
    const { container } = renderFilters();
    expect(container.textContent).not.toMatch(/\bmedium\b/i);
  });
});
