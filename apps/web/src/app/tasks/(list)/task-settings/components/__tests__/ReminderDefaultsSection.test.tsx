import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReminderDefaultsSection } from '../ReminderDefaultsSection';
import type { ReminderDefaults } from '@intelliflow/validators';

const enabled: ReminderDefaults = { enabled: true, minutesBefore: 60 };

describe('ReminderDefaultsSection (PG-191)', () => {
  it('renders a labelled switch reflecting the enabled state', () => {
    render(<ReminderDefaultsSection value={enabled} onChange={vi.fn()} />);
    const sw = screen.getByRole('switch', { name: /enable reminders/i });
    expect(sw).toHaveAttribute('data-state', 'checked');
  });

  it('toggles enabled via onChange', () => {
    const onChange = vi.fn();
    render(<ReminderDefaultsSection value={enabled} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /enable reminders/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('updates the lead time via onChange', () => {
    const onChange = vi.fn();
    render(<ReminderDefaultsSection value={enabled} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /lead time/i }), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minutesBefore: 120 }));
  });

  it('disables the lead-time fieldset when reminders are off', () => {
    const { container } = render(
      <ReminderDefaultsSection value={{ enabled: false, minutesBefore: 0 }} onChange={vi.fn()} />
    );
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toBeDisabled();
    // Native fieldset[disabled] removes the lead-time input from the tab order
    // AND blocks keyboard edits (aria-disabled + pointer-events would not).
    expect(screen.getByRole('spinbutton', { name: /lead time/i })).toBeDisabled();
  });

  it('shows a lead-time error tied via aria-describedby when enabled and out of range', () => {
    render(
      <ReminderDefaultsSection value={{ enabled: true, minutesBefore: 0 }} onChange={vi.fn()} />
    );
    const input = screen.getByRole('spinbutton', { name: /lead time/i });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'reminder-lead-time-error');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'reminder-lead-time-error');
  });
});
