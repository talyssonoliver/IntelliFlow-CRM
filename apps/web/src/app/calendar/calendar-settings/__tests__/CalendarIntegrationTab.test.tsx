import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <button
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      data-testid={`switch-${id}`}
    >
      {checked ? 'On' : 'Off'}
    </button>
  ),
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value ?? ''} onChange={(e) => onValueChange(e.target.value || null)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children, id }: any) => <div id={id}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

import { CalendarIntegrationTab } from '../components/CalendarIntegrationTab';
import type { CalendarIntegrationSettings } from '../components/CalendarIntegrationTab';

const mockCalendars = [
  { id: 'cal_1', name: 'Work Calendar' },
  { id: 'cal_2', name: 'Personal' },
];

const defaultSettings: CalendarIntegrationSettings = {
  primaryCalendarId: null,
  syncExternalCalendars: false,
  defaultTimezone: 'UTC',
};

describe('CalendarIntegrationTab', () => {
  let onSettingsChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onSettingsChange = vi.fn();
  });

  it('renders Calendar Integration heading', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    expect(screen.getByText('Calendar Integration')).toBeInTheDocument();
  });

  it('renders sync external calendars toggle', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('sync toggle reflects syncExternalCalendars=false', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('sync toggle reflects syncExternalCalendars=true', () => {
    render(
      <CalendarIntegrationTab
        settings={{ ...defaultSettings, syncExternalCalendars: true }}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders available calendars in selector', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    expect(screen.getByText('Work Calendar')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('renders empty state when no calendars available', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={[]}
      />
    );
    expect(screen.getByText(/no calendars/i)).toBeInTheDocument();
  });

  it('renders timezone field', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    expect(screen.getByText('UTC')).toBeInTheDocument();
  });

  it('toggling sync calls onSettingsChange', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange.mock.calls[0][0].syncExternalCalendars).toBe(true);
  });

  // ── Editable timezone Select (PG-189 AC-007) ─────────────

  it('renders an editable timezone Select populated with options', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={mockCalendars}
      />
    );
    // The Label is rendered for 'defaultTimezone' — its native <select> must exist
    const tzLabel = screen.getByText('Default Timezone');
    expect(tzLabel).toBeInTheDocument();
    // Native selects render as comboboxes. The primary-calendar select also
    // uses the same mock, so we assert on >=1 and that at least one option is UTC.
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('option').some((o) => o.textContent === 'UTC')).toBe(true);
  });

  it('emits onSettingsChange with the new timezone when user selects', () => {
    render(
      <CalendarIntegrationTab
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        availableCalendars={[]}
      />
    );
    // With availableCalendars=[], only ONE <select> renders (the timezone one).
    const combobox = screen.getByRole('combobox');
    fireEvent.change(combobox, { target: { value: 'America/New_York' } });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultTimezone: 'America/New_York' })
    );
  });
});
