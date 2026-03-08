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

    expect(screen.getByText('Tasks Overdue')).toBeInTheDocument();
    expect(screen.getByText('3 overdue')).toBeInTheDocument();
    expect(screen.getByText('3 tasks past due. Immediate follow-up recommended.')).toBeInTheDocument();
  });

  it('renders due today count when > 0', () => {
    render(<ReminderConfig overdueCount={0} dueTodayCount={5} onFilter={onFilter} />);

    expect(screen.getByText('Due Today')).toBeInTheDocument();
    expect(screen.getByText('5 today')).toBeInTheDocument();
  });

  it('renders due today detail inside overdue banner when both counts exist', () => {
    render(<ReminderConfig overdueCount={2} dueTodayCount={4} onFilter={onFilter} />);

    expect(screen.getByText('2 overdue')).toBeInTheDocument();
    expect(
      screen.getByText('2 tasks past due. Immediate follow-up recommended. 4 tasks due today.')
    ).toBeInTheDocument();
  });

  it('calls onFilter with overdue when overdue button clicked', () => {
    render(<ReminderConfig overdueCount={1} dueTodayCount={0} onFilter={onFilter} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onFilter).toHaveBeenCalledWith('overdue');
  });

  it('calls onFilter with today when due today button clicked', () => {
    render(<ReminderConfig overdueCount={0} dueTodayCount={2} onFilter={onFilter} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onFilter).toHaveBeenCalledWith('today');
  });

  it('has role="alert" when overdue tasks exist', () => {
    render(<ReminderConfig overdueCount={1} dueTodayCount={1} onFilter={onFilter} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has role="status" when only due-today tasks exist', () => {
    render(<ReminderConfig overdueCount={0} dueTodayCount={1} onFilter={onFilter} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
