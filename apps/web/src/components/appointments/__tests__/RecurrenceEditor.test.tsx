import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecurrenceEditor } from '../RecurrenceEditor';
import type { RecurrencePattern } from '../types';

describe('RecurrenceEditor', () => {
  it('renders "Add recurrence" button when value is null', () => {
    render(<RecurrenceEditor value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/Add recurrence/)).toBeInTheDocument();
  });

  it('calls onChange with default pattern when Add clicked', () => {
    const onChange = vi.fn();
    render(<RecurrenceEditor value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Add recurrence/));
    expect(onChange).toHaveBeenCalledWith({ frequency: 'WEEKLY', interval: 1 });
  });

  it('renders frequency options when value is set', () => {
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Yearly')).toBeInTheDocument();
  });

  it('renders "Remove recurrence" button', () => {
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByText(/Remove recurrence/)).toBeInTheDocument();
  });

  it('calls onChange(null) when Remove clicked', () => {
    const onChange = vi.fn();
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Remove recurrence/));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('changes frequency when radio selected', () => {
    const onChange = vi.fn();
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={onChange} />);
    fireEvent.click(screen.getByText('Daily'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'DAILY' }));
  });

  it('shows day-of-week checkboxes for WEEKLY frequency', () => {
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 1, daysOfWeek: [] };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('toggles day of week', () => {
    const onChange = vi.fn();
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 1, daysOfWeek: ['MONDAY'] };
    render(<RecurrenceEditor value={pattern} onChange={onChange} />);
    fireEvent.click(screen.getByText('Wed'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        daysOfWeek: ['MONDAY', 'WEDNESDAY'],
      })
    );
  });

  it('shows day of month selector for MONTHLY', () => {
    const pattern: RecurrencePattern = { frequency: 'MONTHLY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/On day/)).toBeInTheDocument();
  });

  it('shows month/day selectors for YEARLY', () => {
    const pattern: RecurrencePattern = { frequency: 'YEARLY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
  });

  it('shows end condition radios', () => {
    const pattern: RecurrencePattern = { frequency: 'DAILY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('On date')).toBeInTheDocument();
  });

  it('shows recurrence preview text', () => {
    const pattern: RecurrencePattern = { frequency: 'DAILY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    expect(screen.getByTestId('recurrence-preview')).toHaveTextContent('Repeats every day');
  });

  it('renders interval input', () => {
    const pattern: RecurrencePattern = { frequency: 'WEEKLY', interval: 2 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Every');
    expect(input).toHaveValue(2);
  });

  it('disables controls when disabled prop is true', () => {
    const pattern: RecurrencePattern = { frequency: 'DAILY', interval: 1 };
    render(<RecurrenceEditor value={pattern} onChange={vi.fn()} disabled />);
    expect(screen.getByText(/Remove recurrence/)).toBeDisabled();
  });
});
