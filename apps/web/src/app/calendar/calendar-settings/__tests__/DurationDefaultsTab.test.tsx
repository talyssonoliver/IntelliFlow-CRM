import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  Input: ({ id, type, value, min, max, onChange }: any) => (
    <input id={id} type={type} value={value} min={min} max={max} onChange={onChange} />
  ),
}));

import { DurationDefaultsTab } from '../components/DurationDefaultsTab';
import type { DurationSettings } from '../components/DurationDefaultsTab';

const defaultSettings: DurationSettings = {
  defaultDurationMinutes: 30,
  minDurationMinutes: 5,
  maxDurationMinutes: 480,
};

describe('DurationDefaultsTab', () => {
  let onSettingsChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onSettingsChange = vi.fn();
  });

  it('renders Duration Defaults heading', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByText('Duration Defaults')).toBeInTheDocument();
  });

  it('renders all three duration fields', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Default Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum Duration (minutes)')).toBeInTheDocument();
  });

  it('reflects defaultDurationMinutes value', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Default Duration (minutes)')).toHaveValue(30);
  });

  it('reflects minDurationMinutes value', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Minimum Duration (minutes)')).toHaveValue(5);
  });

  it('reflects maxDurationMinutes value', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Maximum Duration (minutes)')).toHaveValue(480);
  });

  it('all labels have htmlFor pointing to input id', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByLabelText('Default Duration (minutes)')).not.toBeNull();
    expect(screen.getByLabelText('Minimum Duration (minutes)')).not.toBeNull();
    expect(screen.getByLabelText('Maximum Duration (minutes)')).not.toBeNull();
  });

  it('calls onSettingsChange when defaultDurationMinutes changes', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    const input = screen.getByLabelText('Default Duration (minutes)');
    fireEvent.change(input, { target: { value: '60' } });
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].defaultDurationMinutes).toBe(60);
  });

  it('calls onSettingsChange when minDurationMinutes changes', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    const input = screen.getByLabelText('Minimum Duration (minutes)');
    fireEvent.change(input, { target: { value: '10' } });
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].minDurationMinutes).toBe(10);
  });

  it('calls onSettingsChange when maxDurationMinutes changes', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    const input = screen.getByLabelText('Maximum Duration (minutes)');
    fireEvent.change(input, { target: { value: '120' } });
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].maxDurationMinutes).toBe(120);
  });

  it('min/max attributes enforce 5–480 range on default duration', () => {
    render(<DurationDefaultsTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);
    const input = screen.getByLabelText('Default Duration (minutes)');
    expect(input).toHaveAttribute('min', '5');
    expect(input).toHaveAttribute('max', '480');
  });
});
