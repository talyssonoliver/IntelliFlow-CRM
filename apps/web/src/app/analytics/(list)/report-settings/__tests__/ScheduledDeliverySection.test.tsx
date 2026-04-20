/**
 * ScheduledDeliverySection Tests — PG-187
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  scheduledDeliveryFrequencySchema,
  scheduledDeliveryFormatSchema,
  type ScheduledDelivery,
} from '@intelliflow/validators';
import { ScheduledDeliverySection } from '../components/ScheduledDeliverySection';

const baseValue: ScheduledDelivery = {
  enabled: false,
  frequency: 'weekly',
  dayOfWeek: 1,
  time: '09:00',
  recipients: [],
  format: 'pdf',
};

function enabledValue(overrides: Partial<ScheduledDelivery> = {}): ScheduledDelivery {
  return { ...baseValue, enabled: true, recipients: ['ops@example.com'], ...overrides };
}

describe('ScheduledDeliverySection', () => {
  it('renders with fieldset aria-disabled when disabled', () => {
    const { container } = render(
      <ScheduledDeliverySection value={baseValue} onChange={() => {}} />
    );
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders with fieldset enabled when enabled=true', () => {
    const { container } = render(
      <ScheduledDeliverySection value={enabledValue()} onChange={() => {}} />
    );
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toHaveAttribute('aria-disabled', 'false');
  });

  it('Switch has aria-label', () => {
    render(<ScheduledDeliverySection value={baseValue} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: /enable scheduled delivery/i })).toBeInTheDocument();
  });

  it('toggling Switch calls onChange with enabled flipped', () => {
    const onChange = vi.fn();
    render(<ScheduledDeliverySection value={baseValue} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /enable scheduled delivery/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('frequency options derive from scheduledDeliveryFrequencySchema.options', () => {
    expect([...scheduledDeliveryFrequencySchema.options]).toEqual(['daily', 'weekly', 'monthly']);
  });

  it('format options derive from scheduledDeliveryFormatSchema.options', () => {
    expect([...scheduledDeliveryFormatSchema.options]).toEqual(['pdf', 'csv', 'excel']);
  });

  it('adds recipient when Add button clicked with valid email', () => {
    const onChange = vi.fn();
    render(<ScheduledDeliverySection value={enabledValue()} onChange={onChange} />);
    const input = screen.getByLabelText(/recipients/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: expect.arrayContaining(['ops@example.com', 'new@example.com']),
      })
    );
  });

  it('shows role="alert" on invalid email', () => {
    render(<ScheduledDeliverySection value={enabledValue()} onChange={() => {}} />);
    const input = screen.getByLabelText(/recipients/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /valid email/i.test(a.textContent ?? ''))).toBe(true);
  });

  it('shows role="alert" when adding duplicate recipient', () => {
    render(
      <ScheduledDeliverySection
        value={enabledValue({ recipients: ['ops@example.com'] })}
        onChange={() => {}}
      />
    );
    const input = screen.getByLabelText(/recipients/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ops@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /already added/i.test(a.textContent ?? ''))).toBe(true);
  });

  it('removes recipient when chip remove button is clicked', () => {
    const onChange = vi.fn();
    render(
      <ScheduledDeliverySection
        value={enabledValue({ recipients: ['ops@example.com', 'bob@example.com'] })}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove ops@example.com/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['bob@example.com'] })
    );
  });

  it('renders recipients-invalid alert when enabled=true and recipients empty', () => {
    render(
      <ScheduledDeliverySection
        value={{ ...baseValue, enabled: true, recipients: [] }}
        onChange={() => {}}
      />
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /at least one recipient/i.test(a.textContent ?? ''))).toBe(true);
  });

  it('day-of-week select is visible when frequency=weekly', () => {
    render(
      <ScheduledDeliverySection value={enabledValue({ frequency: 'weekly' })} onChange={() => {}} />
    );
    expect(screen.getByLabelText(/day of week/i)).toBeInTheDocument();
  });

  it('day-of-week select is hidden when frequency=daily', () => {
    render(
      <ScheduledDeliverySection value={enabledValue({ frequency: 'daily' })} onChange={() => {}} />
    );
    expect(screen.queryByLabelText(/day of week/i)).not.toBeInTheDocument();
  });

  it('rejects invalid time format with role="alert"', () => {
    render(<ScheduledDeliverySection value={enabledValue()} onChange={() => {}} />);
    const time = screen.getByLabelText(/delivery time/i) as HTMLInputElement;
    fireEvent.blur(time, { target: { value: '25:99' } });
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /HH:MM/i.test(a.textContent ?? ''))).toBe(true);
  });

  it('all labeled controls have matching htmlFor/id', () => {
    const { container } = render(
      <ScheduledDeliverySection value={enabledValue()} onChange={() => {}} />
    );
    const labels = container.querySelectorAll('label[for]');
    for (const label of Array.from(labels)) {
      const id = label.getAttribute('for')!;
      expect(document.getElementById(id), `control id="${id}" should exist`).toBeTruthy();
    }
  });
});
