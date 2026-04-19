/* DefaultRangeTab tests — PG-187 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DefaultRangeTab, type DefaultRangeValue } from '../components/DefaultRangeTab';

// Mock @intelliflow/ui primitives
vi.mock('@intelliflow/ui', () => ({
  RadioGroup: ({ children, value, onValueChange, ...props }: any) => (
    <div role="radiogroup" data-value={value} data-testid="radio-group" {...props}>
      {children}
      <button type="button" onClick={() => onValueChange('90d')} data-testid="trigger-90d">
        trigger-90d
      </button>
      <button type="button" onClick={() => onValueChange('7d')} data-testid="trigger-7d">
        trigger-7d
      </button>
    </div>
  ),
  RadioGroupItem: ({ value, id, ...props }: any) => (
    <input type="radio" id={id} value={value} {...props} />
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Label: ({ children, htmlFor, ...props }: any) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
}));

describe('DefaultRangeTab (PG-187)', () => {
  it('renders 4 range options with labels', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('14 days')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('90 days')).toBeInTheDocument();
  });

  it('renders with provided default value', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    const group = screen.getByTestId('radio-group');
    expect(group.getAttribute('data-value')).toBe('30d');
  });

  it('calls onChange when a different option is selected', () => {
    const onChange = vi.fn();
    render(<DefaultRangeTab value="30d" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('trigger-90d'));
    expect(onChange).toHaveBeenCalledWith('90d');
  });

  it('calls onChange with "7d" when 7d selected', () => {
    const onChange = vi.fn();
    render(<DefaultRangeTab value="30d" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('trigger-7d'));
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('has aria-label on radio group', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    const group = screen.getByTestId('radio-group');
    expect(group.getAttribute('aria-label')).toBe('Default report date range');
  });

  it('associates labels with radio items via htmlFor/id pairs', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    const labels = screen.getAllByText(/\d+ days/);
    labels.forEach((label) => {
      expect(label.getAttribute('for') ?? label.closest('label')?.getAttribute('for')).toMatch(
        /^range-/
      );
    });
  });

  it('shows descriptive text under each option', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    expect(screen.getByText('Last week')).toBeInTheDocument();
    expect(screen.getByText(/Last month/)).toBeInTheDocument();
    expect(screen.getByText('Last quarter')).toBeInTheDocument();
  });

  it('has a section heading', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Default Report Date Range/i })).toBeInTheDocument();
  });

  it('handles all four range values without error', () => {
    const values: DefaultRangeValue[] = ['7d', '14d', '30d', '90d'];
    values.forEach((v) => {
      const { unmount } = render(<DefaultRangeTab value={v} onChange={vi.fn()} />);
      expect(screen.getByTestId('radio-group').getAttribute('data-value')).toBe(v);
      unmount();
    });
  });

  it('has descriptive helper text', () => {
    render(<DefaultRangeTab value="30d" onChange={vi.fn()} />);
    expect(screen.getByText(/Choose the default time range/i)).toBeInTheDocument();
  });
});
