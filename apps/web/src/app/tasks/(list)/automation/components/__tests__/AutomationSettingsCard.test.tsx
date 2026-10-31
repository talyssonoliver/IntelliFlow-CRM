/**
 * @vitest-environment jsdom
 *
 * AutomationSettingsCard — PG-208 (AC-TA-014, M13): seeded from settings, not
 * re-seeded while dirty, Save only when dirty, number parsed on save, Reset
 * awaits resetToDefaults and the confirmation stays open on error.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import {
  AutomationSettingsCard,
  type AutomationSettingsCardProps,
} from '../AutomationSettingsCard';

const SETTINGS = {
  automationEnabled: true,
  notifyRuleOwnerOnFailure: false,
  maxRunsPerRulePerHour: 60,
};

function props(overrides: Partial<AutomationSettingsCardProps> = {}): AutomationSettingsCardProps {
  return {
    settings: SETTINGS,
    canEdit: true,
    isSaving: false,
    onSave: vi.fn().mockResolvedValue(undefined),
    onReset: vi.fn().mockResolvedValue(SETTINGS),
    ...overrides,
  };
}

const cap = () => screen.getByLabelText('Max runs per rule per hour') as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save Settings' });

describe('AutomationSettingsCard', () => {
  it('is seeded from settings and saves only when dirty', async () => {
    const p = props();
    render(<AutomationSettingsCard {...p} />);
    expect(cap().value).toBe('60');
    expect(screen.getByRole('switch', { name: 'Run task automation' })).toBeChecked();
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Notify the rule owner when a run fails' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Run task automation' }));
    fireEvent.change(cap(), { target: { value: ' 25 ' } });
    expect(save()).not.toBeDisabled();
    fireEvent.click(save());
    await waitFor(() =>
      expect(p.onSave).toHaveBeenCalledWith({
        automationEnabled: false,
        notifyRuleOwnerOnFailure: true,
        maxRunsPerRulePerHour: 25,
      })
    );
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it('keeps unsaved edits when the list refetches (M13), re-seeds when clean', () => {
    const p = props();
    const { rerender } = render(<AutomationSettingsCard {...p} />);
    fireEvent.change(cap(), { target: { value: '12' } });
    rerender(<AutomationSettingsCard {...p} settings={{ ...SETTINGS }} />);
    expect(cap().value).toBe('12');
    fireEvent.change(cap(), { target: { value: '60' } });
    rerender(
      <AutomationSettingsCard {...p} settings={{ ...SETTINGS, maxRunsPerRulePerHour: 90 }} />
    );
    expect(cap().value).toBe('90');
  });

  it('rejects an out-of-range hourly cap without saving', () => {
    const p = props();
    render(<AutomationSettingsCard {...p} />);
    for (const bad of ['0', '501', 'ten']) {
      fireEvent.change(cap(), { target: { value: bad } });
      fireEvent.click(save());
      expect(screen.getByText('Enter a whole number from 1 to 500.')).toBeInTheDocument();
    }
    expect(cap().getAttribute('aria-invalid')).toBe('true');
    expect(cap().getAttribute('aria-describedby')).toBe('ta-max-runs-help ta-max-runs-error');
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('keeps the draft when saving fails', async () => {
    const p = props({ onSave: vi.fn().mockRejectedValue(new Error('x')) });
    render(<AutomationSettingsCard {...p} />);
    fireEvent.change(cap(), { target: { value: '30' } });
    fireEvent.click(save());
    await waitFor(() => expect(p.onSave).toHaveBeenCalled());
    expect(cap().value).toBe('30');
  });

  it('disables the fields and Save while saving', () => {
    render(<AutomationSettingsCard {...props({ isSaving: true })} />);
    expect(cap()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('confirms the reset, says what is kept, and awaits resetToDefaults', async () => {
    const p = props({
      onReset: vi.fn().mockResolvedValue({ ...SETTINGS, maxRunsPerRulePerHour: 60 }),
    });
    render(<AutomationSettingsCard {...p} settings={{ ...SETTINGS, maxRunsPerRulePerHour: 5 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Rules, run history and tags are kept/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(p.onReset).toHaveBeenCalled();
    expect(cap().value).toBe('60');
  });

  it('keeps the reset dialog open when the reset fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = props({ onReset: vi.fn().mockRejectedValue(new Error('down')) });
    render(<AutomationSettingsCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(p.onReset).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    error.mockRestore();
  });

  it('is read-only without edit rights', () => {
    render(<AutomationSettingsCard {...props({ canEdit: false, readOnlyNoteId: 'note' })} />);
    expect(
      screen
        .getByRole('group', { name: 'Task automation settings' })
        .getAttribute('aria-describedby')
    ).toBe('note');
    expect(cap()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save Settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to Defaults' })).toBeNull();
  });
});
