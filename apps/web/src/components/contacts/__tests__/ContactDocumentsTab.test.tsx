// @vitest-environment jsdom
/**
 * ContactDocumentsTab tests (IFC-256)
 *
 * Component-level coverage for the Contact 360 Documents tab: real-data render
 * with download links + formatted size/date, and the empty state.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ContactDocumentsTab } from '../ContactDocumentsTab';
import type { DocumentViewModel } from '../contact-tab-format';

const doc = (overrides: Partial<DocumentViewModel> = {}): DocumentViewModel => ({
  id: 'doc-1',
  name: 'Enterprise License Proposal',
  fileName: 'proposal.pdf',
  fileType: 'application/pdf',
  fileSize: 2_400_000,
  fileUrl: 'https://files.example.com/proposal.pdf',
  category: 'proposal',
  createdAt: '2025-01-09T09:00:00.000Z',
  ...overrides,
});

describe('ContactDocumentsTab', () => {
  it('renders real documents with a formatted date + size and a working download link', () => {
    render(<ContactDocumentsTab documents={[doc()]} timezone="UTC" />);

    const panel = screen.getByTestId('contact-documents-tab');
    expect(panel).toHaveTextContent('Enterprise License Proposal');
    expect(panel).toHaveTextContent('9 Jan 2025');
    expect(panel).toHaveTextContent('2.3 MB');

    const link = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === 'https://files.example.com/proposal.pdf');
    expect(link).toBeDefined();
    expect(link).toHaveAttribute('aria-label', 'Download Enterprise License Proposal');
    expect(screen.queryByTestId('contact-documents-empty')).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no documents', () => {
    render(<ContactDocumentsTab documents={[]} timezone="UTC" />);
    expect(screen.getByTestId('contact-documents-empty')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise License Proposal')).not.toBeInTheDocument();
  });
});
