import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  Input: ({ id, type, value, min, max, onChange }: any) => (
    <input id={id} type={type} value={value ?? ''} min={min} max={max} onChange={onChange} />
  ),
}));

import { BufferRemindersTab } from '../components/BufferRemindersTab';
import type { BufferSettings } from '../components/BufferRemindersTab';

const defaultSettings: BufferSettings = {
  defaultBufferBeforeMinutes: 0,
  defaultBufferAfterMinutes: 0,
  defaultReminderMinutes: 15,
};

describe('BufferRemindersTab', () => {
  let onSettingsChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onSettingsChange = vi.fn();
  });

  it('renders Buffer & Reminders heading', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByText('Buffer & Reminders')).toBeInTheDocument();
  });

  it('renders buffer before, buffer after, and reminder fields', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Buffer Before (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Buffer After (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Reminder (minutes)')).toBeInTheDocument();
  });

  it('reflects defaultBufferBeforeMinutes value', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Buffer Before (minutes)')).toHaveValue(0);
  });

  it('reflects defaultReminderMinutes value', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Default Reminder (minutes)')).toHaveValue(15);
  });

  it('all labels have htmlFor pointing to input id', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Buffer Before (minutes)')).not.toBeNull();
    expect(screen.getByLabelText('Buffer After (minutes)')).not.toBeNull();
    expect(screen.getByLabelText('Default Reminder (minutes)')).not.toBeNull();
  });

  it('calls onSettingsChange when bufferBefore changes', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    fireEvent.change(screen.getByLabelText('Buffer Before (minutes)'), { target: { value: '15' } });
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].defaultBufferBeforeMinutes).toBe(15);
  });

  it('calls onSettingsChange when bufferAfter changes', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    fireEvent.change(screen.getByLabelText('Buffer After (minutes)'), { target: { value: '10' } });
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].defaultBufferAfterMinutes).toBe(10);
  });

  it('calls onSettingsChange when reminder changes', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    fireEvent.change(screen.getByLabelText('Default Reminder (minutes)'), {
      target: { value: '30' },
    });
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].defaultReminderMinutes).toBe(30);
  });

  it('max attribute enforces 240-minute limit on buffer fields', () => {
    render(<BufferRemindersTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Buffer Before (minutes)')).toHaveAttribute('max', '240');
    expect(screen.getByLabelText('Buffer After (minutes)')).toHaveAttribute('max', '240');
  });

  it('renders null reminder as empty input', () => {
    render(
      <BufferRemindersTab
        settings={{ ...defaultSettings, defaultReminderMinutes: null }}
        onSettingsChange={onSettingsChange}
      />
    );
    const reminderInput = screen.getByLabelText('Default Reminder (minutes)');
    expect(reminderInput).toHaveValue(null);
  });
});
