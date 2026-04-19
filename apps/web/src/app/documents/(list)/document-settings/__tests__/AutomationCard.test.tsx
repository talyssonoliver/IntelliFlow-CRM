/**
 * AutomationCard Tests - PG-186
 *
 * Verifies the Cat-1 (wired) vs Cat-2 (deferred to IFC-310/IFC-311) toggle
 * split that landed when the audit found notifyOnDuplicate +
 * notifyOnOwnerChange were dead settings.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationCard } from '../components/AutomationCard';

const baseSettings = {
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  restrictTagCreationToAdmins: false,
  notifyOnDuplicate: true,
  notifyOnOwnerChange: false,
  // Cat-2 / follow-up toggles — present on the type but not rendered in
  // AutomationCard yet (shipped by IFC-310/IFC-311/IFC-312). Keep them in the
  // fixture so it satisfies LocalAutomationSettings.
  autoVersionOnCollision: false,
  autoDetectDuplicates: false,
  autoExtractText: false,
  autoClassifyCategory: false,
  autoDetectPii: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

describe('AutomationCard', () => {
  it('renders the 3 Cat-1 toggles as enabled, interactive switches', () => {
    render(<AutomationCard settings={baseSettings} onSettingsChange={vi.fn()} />);

    const normalize = screen.getByRole('switch', { name: /Normalize filename/i });
    const preventDelete = screen.getByRole('switch', { name: /Prevent delete if referenced/i });
    const restrictTag = screen.getByRole('switch', { name: /Restrict tag creation to admins/i });

    [normalize, preventDelete, restrictTag].forEach((sw) => {
      expect(sw).not.toHaveAttribute('aria-disabled', 'true');
      expect(sw).not.toBeDisabled();
    });
  });

  it('renders Cat-2 toggles aria-disabled and labelled with "Pending IFC-..." badge', () => {
    render(<AutomationCard settings={baseSettings} onSettingsChange={vi.fn()} />);

    expect(screen.getByText('Pending IFC-310')).toBeInTheDocument();
    expect(screen.getByText('Pending IFC-311')).toBeInTheDocument();

    const dupSwitch = screen.getByRole('switch', {
      name: /Notify on duplicate \(pending IFC-310\)/i,
    });
    const ownerSwitch = screen.getByRole('switch', {
      name: /Notify on owner change \(pending IFC-311\)/i,
    });

    [dupSwitch, ownerSwitch].forEach((sw) => {
      expect(sw).toBeDisabled();
    });
  });

  it('Cat-1 toggle change calls onSettingsChange with merged payload', () => {
    const onChange = vi.fn();
    render(<AutomationCard settings={baseSettings} onSettingsChange={onChange} />);

    const normalize = screen.getByRole('switch', { name: /Normalize filename/i });
    normalize.click();

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ normalizeFilename: false }));
  });
});
