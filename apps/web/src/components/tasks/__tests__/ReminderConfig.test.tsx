/**
 * ReminderConfig Component Tests (PG-136)
 *
 * Tests for task reminder banner showing overdue and due-today counts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReminderConfig } from '../ReminderConfig';

describe('ReminderConfig', () => {
  const onFilter = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when both counts are 0', () => {
    const { container } = render(
      <ReminderConfig overdueCount={0} dueTodayCount={0} onFilter={onFilter} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders overdue count when > 0', () => {
    render(<ReminderConfig overdueCount={3} dueTodayCount={0} onFilter={onFilter} />);

    expect(screen.getByText('3 overdue')).toBeInTheDocument();
  });

  it('renders due today count when > 0', () => {
    render(<ReminderConfig overdueCount={0} dueTodayCount={5} onFilter={onFilter} />);

    expect(screen.getByText('5 due today')).toBeInTheDocument();
  });

  it('renders both counts with separator', () => {
    render(<ReminderConfig overdueCount={2} dueTodayCount={4} onFilter={onFilter} />);

    expect(screen.getByText('2 overdue')).toBeInTheDocument();
    expect(screen.getByText('4 due today')).toBeInTheDocument();
    expect(screen.getByText('|')).toBeInTheDocument();
  });

  it('calls onFilter with overdue when overdue button clicked', () => {
    render(<ReminderConfig overdueCount={1} dueTodayCount={0} onFilter={onFilter} />);

    fireEvent.click(screen.getByText('1 overdue'));
    expect(onFilter).toHaveBeenCalledWith('overdue');
  });

  it('calls onFilter with today when due today button clicked', () => {
    render(<ReminderConfig overdueCount={0} dueTodayCount={2} onFilter={onFilter} />);

    fireEvent.click(screen.getByText('2 due today'));
    expect(onFilter).toHaveBeenCalledWith('today');
  });

  it('has role="status" for accessibility', () => {
    render(<ReminderConfig overdueCount={1} dueTodayCount={1} onFilter={onFilter} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
