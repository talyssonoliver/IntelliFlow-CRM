import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutomationTab, type ContactAutomationSettings } from '../AutomationTab';

const baseSettings: ContactAutomationSettings = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
};

describe('AutomationTab', () => {
  it('renders the three toggles', () => {
    render(<AutomationTab settings={baseSettings} onSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/Auto-merge on exact email match/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notify on duplicate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Restrict tag creation to admins/i)).toBeInTheDocument();
  });

  it('calls onSettingsChange when a toggle flips', () => {
    const onSettingsChange = vi.fn();
    render(<AutomationTab settings={baseSettings} onSettingsChange={onSettingsChange} />);
    fireEvent.click(screen.getByLabelText(/Auto-merge on exact email match/i));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoMergeOnExactEmail: true })
    );
  });
});
