/* ScheduledDeliveryTab tests — PG-187 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduledDeliveryTab } from '../components/ScheduledDeliveryTab';
import type { ScheduledDelivery } from '@intelliflow/validators';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Label: ({ children, htmlFor, ...props }: any) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
  Switch: ({ id, checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
  ),
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-wrapper" data-value={value}>
      {children}
      <button
        type="button"
        onClick={() => onValueChange('daily')}
        data-testid="select-trigger-daily"
      >
        select-daily
      </button>
      <button
        type="button"
        onClick={() => onValueChange('weekly')}
        data-testid="select-trigger-weekly"
      >
        select-weekly
      </button>
      <button
        type="button"
        onClick={() => onValueChange('monthly')}
        data-testid="select-trigger-monthly"
      >
        select-monthly
      </button>
    </div>
  ),
  SelectTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: () => <span>SelectValue</span>,
}));

const DEFAULT_VALUE: ScheduledDelivery = {
  enabled: false,
  frequency: 'weekly',
  dayOfWeek: 1,
  time: '09:00',
  recipients: [],
  format: 'pdf',
};

describe('ScheduledDeliveryTab (PG-187)', () => {
  it('renders enabled toggle (default off)', () => {
    render(<ScheduledDeliveryTab value={DEFAULT_VALUE} onChange={vi.fn()} />);
    const toggle = screen.getByLabelText('Enable scheduled delivery') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('fieldset is aria-disabled when enabled=false', () => {
    const { container } = render(<ScheduledDeliveryTab value={DEFAULT_VALUE} onChange={vi.fn()} />);
    const fieldset = container.querySelector('fieldset');
    expect(fieldset?.getAttribute('aria-disabled')).toBe('true');
  });

  it('fieldset NOT aria-disabled when enabled=true', () => {
    const { container } = render(
      <ScheduledDeliveryTab value={{ ...DEFAULT_VALUE, enabled: true }} onChange={vi.fn()} />
    );
    const fieldset = container.querySelector('fieldset');
    expect(fieldset?.getAttribute('aria-disabled')).toBe('false');
  });

  it('toggle calls onChange with enabled=true', () => {
    const onChange = vi.fn();
    render(<ScheduledDeliveryTab value={DEFAULT_VALUE} onChange={onChange} />);
    const toggle = screen.getByLabelText('Enable scheduled delivery');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('shows day-of-week picker only when frequency=weekly', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, frequency: 'weekly' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Day of week')).toBeInTheDocument();
  });

  it('hides day-of-week picker when frequency=daily', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, frequency: 'daily' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText('Day of week')).not.toBeInTheDocument();
  });

  it('hides day-of-week picker when frequency=monthly', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, frequency: 'monthly' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText('Day of week')).not.toBeInTheDocument();
  });

  it('time input renders with value', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, time: '14:30' }}
        onChange={vi.fn()}
      />
    );
    const time = screen.getByLabelText('Delivery time') as HTMLInputElement;
    expect(time.value).toBe('14:30');
  });

  it('changing time input calls onChange', () => {
    const onChange = vi.fn();
    render(
      <ScheduledDeliveryTab value={{ ...DEFAULT_VALUE, enabled: true }} onChange={onChange} />
    );
    const time = screen.getByLabelText('Delivery time') as HTMLInputElement;
    fireEvent.change(time, { target: { value: '10:30' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ time: '10:30' }));
  });

  it('rejects invalid email format on Add', () => {
    render(<ScheduledDeliveryTab value={{ ...DEFAULT_VALUE, enabled: true }} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Recipients');
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    const addBtn = screen.getByText('Add');
    fireEvent.click(addBtn);
    // Multiple alerts exist (empty-recipients + email-invalid); find the email one
    const alerts = screen.getAllByRole('alert');
    const emailError = alerts.find((a) => /valid email/i.test(a.textContent ?? ''));
    expect(emailError).toBeTruthy();
  });

  it('adds valid email to recipients on Add', () => {
    const onChange = vi.fn();
    render(
      <ScheduledDeliveryTab value={{ ...DEFAULT_VALUE, enabled: true }} onChange={onChange} />
    );
    const input = screen.getByLabelText('Recipients');
    fireEvent.change(input, { target: { value: 'user@example.com' } });
    const addBtn = screen.getByText('Add');
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['user@example.com'] })
    );
  });

  it('removes recipient when remove button clicked', () => {
    const onChange = vi.fn();
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, recipients: ['a@b.com', 'c@d.com'] }}
        onChange={onChange}
      />
    );
    const removeBtn = screen.getByLabelText('Remove a@b.com');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ recipients: ['c@d.com'] }));
  });

  it('shows validation error when enabled && recipients empty', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, recipients: [] }}
        onChange={vi.fn()}
      />
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => a.textContent?.toLowerCase().includes('recipient'))).toBe(true);
  });

  it('does not show validation error when enabled && recipients non-empty', () => {
    render(
      <ScheduledDeliveryTab
        value={{
          ...DEFAULT_VALUE,
          enabled: true,
          recipients: ['a@b.com'],
        }}
        onChange={vi.fn()}
      />
    );
    const alerts = screen.queryAllByRole('alert');
    // No "at least one recipient" alert should exist
    expect(
      alerts.every((a) => !a.textContent?.toLowerCase().includes('at least one recipient'))
    ).toBe(true);
  });

  it('renders format select', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, format: 'csv' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Export format')).toBeInTheDocument();
  });

  it('prevents duplicate recipients', () => {
    const onChange = vi.fn();
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, recipients: ['a@b.com'] }}
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('Recipients');
    fireEvent.change(input, { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['a@b.com', 'a@b.com'] })
    );
    expect(screen.getByRole('alert').textContent).toMatch(/already added/i);
  });

  it('has a section heading', () => {
    render(<ScheduledDeliveryTab value={DEFAULT_VALUE} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Scheduled Report Delivery/i })).toBeInTheDocument();
  });

  it('Enter key on recipient input adds recipient', () => {
    const onChange = vi.fn();
    render(
      <ScheduledDeliveryTab value={{ ...DEFAULT_VALUE, enabled: true }} onChange={onChange} />
    );
    const input = screen.getByLabelText('Recipients');
    fireEvent.change(input, { target: { value: 'x@y.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ recipients: ['x@y.com'] }));
  });

  it('renders recipients as list items', () => {
    render(
      <ScheduledDeliveryTab
        value={{ ...DEFAULT_VALUE, enabled: true, recipients: ['a@b.com', 'c@d.com'] }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
    expect(screen.getByText('c@d.com')).toBeInTheDocument();
  });

  it('shows "No recipients added yet" when empty and enabled', () => {
    render(<ScheduledDeliveryTab value={{ ...DEFAULT_VALUE, enabled: true }} onChange={vi.fn()} />);
    expect(screen.getByText(/No recipients added yet/i)).toBeInTheDocument();
  });
});
