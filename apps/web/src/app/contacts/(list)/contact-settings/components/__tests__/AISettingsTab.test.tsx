import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AISettingsTab } from '../AISettingsTab';
import type { ContactAutomationSettingsInput } from '@intelliflow/validators';

const baseSettings: ContactAutomationSettingsInput = {
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

describe('AISettingsTab', () => {
  it('renders all five AI toggles', () => {
    render(<AISettingsTab settings={baseSettings} onSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/AI duplicate detection/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AI data enrichment/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AI tag suggestions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AI insights/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AI reply drafting/i)).toBeInTheDocument();
  });

  it('toggling aiEnrichment fires onSettingsChange', () => {
    const onSettingsChange = vi.fn();
    render(<AISettingsTab settings={baseSettings} onSettingsChange={onSettingsChange} />);
    fireEvent.click(screen.getByLabelText(/AI data enrichment/i));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ aiEnrichment: true })
    );
  });
});
