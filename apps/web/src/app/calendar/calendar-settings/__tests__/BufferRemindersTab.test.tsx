import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  Input: ({ id, type, value, min, max, onChange, ...rest }: any) => (
    <input
      id={id}
      type={type}
      value={value ?? ''}
      min={min}
      max={max}
      onChange={onChange}
      {...rest}
    />
  ),
}));

import { BufferRemindersTab } from '../components/BufferRemindersTab';
import type { ReminderSettings } from '../components/BufferRemindersTab';

const defaultSettings: ReminderSettings = { defaultReminderMinutes: 15 };

describe('BufferRemindersTab (reminders only, PG-202)', () => {
  let onSettingsChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onSettingsChange = vi.fn();
  });

  it('renders the Reminders heading', () => {
    render(
      <BufferRemindersTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        firmBuffers={null}
      />
    );
    expect(screen.getByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
  });

  it('no longer renders buffer inputs', () => {
    render(
      <BufferRemindersTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        firmBuffers={{ before: 10, after: 5 }}
      />
    );
    expect(screen.queryByLabelText('Buffer Before (minutes)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Buffer After (minutes)')).not.toBeInTheDocument();
  });

  it('shows the current firm buffers as text and links to Availability', () => {
    render(
      <BufferRemindersTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        firmBuffers={{ before: 10, after: 5 }}
      />
    );
    expect(screen.getByText(/10 min before and 5 min after each appointment/)).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'Manage working hours, buffers and timezone in Availability',
    });
    expect(link).toHaveAttribute('href', '/calendar/availability');
  });

  it('renders the link without values while settings are loading', () => {
    render(
      <BufferRemindersTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        firmBuffers={null}
      />
    );
    expect(screen.queryByText(/min before/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Manage working hours, buffers and timezone in Availability',
      })
    ).toBeInTheDocument();
  });

  it('reflects and edits the reminder', () => {
    render(
      <BufferRemindersTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        firmBuffers={null}
      />
    );
    const reminder = screen.getByLabelText('Default Reminder (minutes)');
    expect(reminder).toHaveValue(15);
    expect(reminder).toHaveAttribute('aria-describedby', 'defaultReminderMinutes-help');
    fireEvent.change(reminder, { target: { value: '30' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ defaultReminderMinutes: 30 });
  });

  it('maps a cleared reminder to null (no reminder)', () => {
    render(
      <BufferRemindersTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        firmBuffers={null}
      />
    );
    fireEvent.change(screen.getByLabelText('Default Reminder (minutes)'), {
      target: { value: '' },
    });
    expect(onSettingsChange).toHaveBeenCalledWith({ defaultReminderMinutes: null });
  });

  it('renders a null reminder as an empty input', () => {
    render(
      <BufferRemindersTab
        settings={{ defaultReminderMinutes: null }}
        onSettingsChange={onSettingsChange}
        firmBuffers={null}
      />
    );
    expect(screen.getByLabelText('Default Reminder (minutes)')).toHaveValue(null);
  });
});
