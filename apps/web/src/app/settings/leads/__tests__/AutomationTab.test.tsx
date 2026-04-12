/**
 * AutomationTab Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests toggle switches, description text rendering,
 * and onSettingsChange propagation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AutomationSettings } from '../components/AutomationTab';

// ─── @intelliflow/ui mock ───────────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
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
}));

// Import after mocks
import { AutomationTab } from '../components/AutomationTab';

const defaultSettings: AutomationSettings = {
  autoAssignment: true,
  instantNotifications: false,
  leadRecurrence: true,
};

describe('AutomationTab', () => {
  let onSettingsChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onSettingsChange = vi.fn();
  });

  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders the Automation heading', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(screen.getByText('Automation')).toBeInTheDocument();
  });

  it('renders exactly 3 toggle switches', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(3);
  });

  it('renders Auto-assignment title', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(screen.getByText('Auto-assignment')).toBeInTheDocument();
  });

  it('renders Instant Notifications title', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(screen.getByText('Instant Notifications')).toBeInTheDocument();
  });

  it('renders Lead Recurrence Detection title', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(screen.getByText('Lead Recurrence Detection')).toBeInTheDocument();
  });

  it('renders Auto-assignment description', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(
      screen.getByText(
        'Automatically distribute new leads to available team members based on workload and expertise.'
      )
    ).toBeInTheDocument();
  });

  it('renders Instant Notifications description', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(
      screen.getByText(
        'Notify the lead owner immediately when a lead is updated or takes an action.'
      )
    ).toBeInTheDocument();
  });

  it('renders Lead Recurrence Detection description', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    expect(
      screen.getByText(
        'Detect and flag potential duplicate lead entries based on email and phone matching.'
      )
    ).toBeInTheDocument();
  });

  // ─── Switch state ─────────────────────────────────────────────────────────

  it('autoAssignment switch reflects checked=true', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const autoAssignSwitch = screen.getByTestId('switch-automation-autoAssignment');
    expect(autoAssignSwitch).toHaveAttribute('aria-checked', 'true');
  });

  it('instantNotifications switch reflects checked=false', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const notifSwitch = screen.getByTestId('switch-automation-instantNotifications');
    expect(notifSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('leadRecurrence switch reflects checked=true', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const recurrenceSwitch = screen.getByTestId('switch-automation-leadRecurrence');
    expect(recurrenceSwitch).toHaveAttribute('aria-checked', 'true');
  });

  // ─── Toggle interactions ──────────────────────────────────────────────────

  it('toggling autoAssignment switch calls onSettingsChange with updated value', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const autoAssignSwitch = screen.getByTestId('switch-automation-autoAssignment');
    fireEvent.click(autoAssignSwitch);

    expect(onSettingsChange).toHaveBeenCalledOnce();
    const updatedSettings: AutomationSettings = onSettingsChange.mock.calls[0][0];
    expect(updatedSettings.autoAssignment).toBe(false);
  });

  it('toggling instantNotifications switch calls onSettingsChange with updated value', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const notifSwitch = screen.getByTestId('switch-automation-instantNotifications');
    fireEvent.click(notifSwitch);

    expect(onSettingsChange).toHaveBeenCalledOnce();
    const updatedSettings: AutomationSettings = onSettingsChange.mock.calls[0][0];
    expect(updatedSettings.instantNotifications).toBe(true);
  });

  it('toggling leadRecurrence switch calls onSettingsChange with updated value', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const recurrenceSwitch = screen.getByTestId('switch-automation-leadRecurrence');
    fireEvent.click(recurrenceSwitch);

    expect(onSettingsChange).toHaveBeenCalledOnce();
    const updatedSettings: AutomationSettings = onSettingsChange.mock.calls[0][0];
    expect(updatedSettings.leadRecurrence).toBe(false);
  });

  it('toggling one switch does not change other settings', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    fireEvent.click(screen.getByTestId('switch-automation-autoAssignment'));

    const updatedSettings: AutomationSettings = onSettingsChange.mock.calls[0][0];
    // Only autoAssignment changed
    expect(updatedSettings.instantNotifications).toBe(defaultSettings.instantNotifications);
    expect(updatedSettings.leadRecurrence).toBe(defaultSettings.leadRecurrence);
  });

  it('renders all switches in all-off state', () => {
    const allOff: AutomationSettings = {
      autoAssignment: false,
      instantNotifications: false,
      leadRecurrence: false,
    };
    render(<AutomationTab settings={allOff} onSettingsChange={onSettingsChange} />);

    const switches = screen.getAllByRole('switch');
    switches.forEach((sw) => {
      expect(sw).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('renders all switches in all-on state', () => {
    const allOn: AutomationSettings = {
      autoAssignment: true,
      instantNotifications: true,
      leadRecurrence: true,
    };
    render(<AutomationTab settings={allOn} onSettingsChange={onSettingsChange} />);

    const switches = screen.getAllByRole('switch');
    switches.forEach((sw) => {
      expect(sw).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('each switch has an associated label via htmlFor', () => {
    render(<AutomationTab settings={defaultSettings} onSettingsChange={onSettingsChange} />);

    const autoLabel = screen.getByText('Auto-assignment');
    expect(autoLabel.tagName).toBe('LABEL');
    expect(autoLabel).toHaveAttribute('for', 'automation-autoAssignment');

    const notifLabel = screen.getByText('Instant Notifications');
    expect(notifLabel.tagName).toBe('LABEL');
    expect(notifLabel).toHaveAttribute('for', 'automation-instantNotifications');

    const recurrenceLabel = screen.getByText('Lead Recurrence Detection');
    expect(recurrenceLabel.tagName).toBe('LABEL');
    expect(recurrenceLabel).toHaveAttribute('for', 'automation-leadRecurrence');
  });
});
