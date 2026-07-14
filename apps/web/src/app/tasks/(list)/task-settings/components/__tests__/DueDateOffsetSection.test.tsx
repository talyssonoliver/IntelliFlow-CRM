import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DueDateOffsetSection } from '../DueDateOffsetSection';

describe('DueDateOffsetSection (PG-191)', () => {
  it('renders a labelled number input with the current value', () => {
    render(<DueDateOffsetSection value={5} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton', { name: /due-date offset/i });
    expect(input).toHaveValue(5);
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '365');
  });

  it('calls onChange with the parsed number', () => {
    const onChange = vi.fn();
    render(<DueDateOffsetSection value={5} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /due-date offset/i }), {
      target: { value: '12' },
    });
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('marks the field invalid and shows an error tied via aria-describedby when out of range', () => {
    render(<DueDateOffsetSection value={999} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton', { name: /due-date offset/i });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'due-date-offset-error');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'due-date-offset-error');
  });

  it('renders the header icon as decorative (aria-hidden)', () => {
    const { container } = render(<DueDateOffsetSection value={3} onChange={vi.fn()} />);
    const icon = container.querySelector('.material-symbols-outlined');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
