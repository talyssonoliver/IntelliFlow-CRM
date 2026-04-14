import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutomationTab, type ContactAutomationSettings } from '../AutomationTab';

const baseSettings: ContactAutomationSettings = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizePhoneNumbers: true,
  autoCapitalizeNames: true,
  preventDeleteWithOpenDeals: true,
  notifyOnOwnerChange: false,
  aiDuplicateDetection: true,
  aiEnrichment: false,
  aiTagSuggestions: true,
  aiInsightGeneration: true,
  aiAutoReplyDrafting: false,
};

describe('AutomationTab', () => {
  it('renders all seven toggles', () => {
    render(<AutomationTab settings={baseSettings} onSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/Auto-merge on exact email match/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notify on duplicate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notify on owner change/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Normalize phone numbers/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Auto-capitalize names/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Prevent delete with open deals/i)).toBeInTheDocument();
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
