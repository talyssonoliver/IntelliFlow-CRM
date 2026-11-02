/**
 * ScheduleCadenceFields — shared cadence picker (PG-201 extraction, PG-208 reuse).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import { ScheduleCadenceFields, type ScheduleCadenceValue } from '../schedule-cadence-fields';

function value(overrides: Partial<ScheduleCadenceValue> = {}): ScheduleCadenceValue {
  return {
    cadence: 'daily',
    dayOfWeek: '1',
    dayOfMonth: '1',
    timeOfDay: '09:00',
    cronExpression: '',
    ...overrides,
  };
}

describe('ScheduleCadenceFields', () => {
  it('uses the id prefix for every field (PG-201 ids unchanged with "schedule")', () => {
    const { rerender } = render(<ScheduleCadenceFields value={value()} onChange={vi.fn()} />);
    expect(document.getElementById('schedule-cadence')).not.toBeNull();
    expect(document.getElementById('schedule-time')).not.toBeNull();
    rerender(
      <ScheduleCadenceFields
        idPrefix="rule"
        value={value({ cadence: 'weekly' })}
        onChange={vi.fn()}
      />
    );
    expect(document.getElementById('rule-cadence')).not.toBeNull();
    expect(document.getElementById('rule-day-of-week')).not.toBeNull();
  });

  it('shows day of week for weekly, day of month for monthly and quarterly, cron for custom', () => {
    const { rerender } = render(
      <ScheduleCadenceFields value={value({ cadence: 'weekly' })} onChange={vi.fn()} />
    );
    expect(screen.getByLabelText('Day of the week')).toBeTruthy();
    expect(screen.queryByLabelText('Day of the month')).toBeNull();
    rerender(<ScheduleCadenceFields value={value({ cadence: 'quarterly' })} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Day of the month')).toBeTruthy();
    rerender(
      <ScheduleCadenceFields
        value={value({ cadence: 'custom' })}
        onChange={vi.fn()}
        cronHint="Hourly at most."
      />
    );
    expect(screen.getByLabelText('Cron expression')).toBeTruthy();
    expect(screen.queryByLabelText('Time of day')).toBeNull();
    expect(screen.getByText('Hourly at most.')).toBeTruthy();
  });

  it('reports changes through onChange as a controlled field', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ScheduleCadenceFields value={value()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'monthly' } });
    expect(onChange).toHaveBeenCalledWith('cadence', 'monthly');
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '10:30' } });
    expect(onChange).toHaveBeenCalledWith('timeOfDay', '10:30');
    rerender(<ScheduleCadenceFields value={value({ cadence: 'custom' })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Cron expression'), { target: { value: '0 9 * * 1' } });
    expect(onChange).toHaveBeenCalledWith('cronExpression', '0 9 * * 1');
    rerender(<ScheduleCadenceFields value={value({ cadence: 'weekly' })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Day of the week'), { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith('dayOfWeek', '3');
    rerender(<ScheduleCadenceFields value={value({ cadence: 'monthly' })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Day of the month'), { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith('dayOfMonth', '15');
  });

  it('ignores an unknown cadence value', () => {
    const onChange = vi.fn();
    render(<ScheduleCadenceFields value={value()} onChange={onChange} />);
    const select = screen.getByLabelText('Cadence') as HTMLSelectElement;
    const option = document.createElement('option');
    option.value = 'hourly';
    select.appendChild(option);
    fireEvent.change(select, { target: { value: 'hourly' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('wires errors with aria-invalid and aria-describedby', () => {
    render(
      <ScheduleCadenceFields
        idPrefix="rule"
        value={value({ cadence: 'custom' })}
        onChange={vi.fn()}
        errors={{ cronExpression: 'Enter a cron expression.', cadence: 'Pick one.' }}
      />
    );
    const cron = screen.getByLabelText('Cron expression');
    expect(cron.getAttribute('aria-invalid')).toBe('true');
    expect(cron.getAttribute('aria-describedby')).toBe('rule-cron-hint rule-cron-error');
    expect(screen.getByText('Enter a cron expression.').id).toBe('rule-cron-error');
    expect(screen.getByText('Pick one.').id).toBe('rule-cadence-error');
  });

  it('wires the time-of-day error and disables fields', () => {
    render(
      <ScheduleCadenceFields
        value={value()}
        onChange={vi.fn()}
        errors={{ timeOfDay: 'Choose a time.' }}
        disabled
      />
    );
    const time = screen.getByLabelText('Time of day') as HTMLInputElement;
    expect(time.getAttribute('aria-describedby')).toBe('schedule-time-error');
    expect(time.disabled).toBe(true);
  });
});
