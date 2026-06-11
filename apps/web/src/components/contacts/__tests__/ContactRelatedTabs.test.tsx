// @vitest-environment jsdom
/**
 * ContactRelatedTabs tests (IFC-256)
 *
 * The dispatcher that normalises the contact's raw tickets/documents and renders
 * the active Contact 360 tab. Covers each tab branch, the "other tab" no-op, and
 * a null contact.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ContactRelatedTabs } from '../ContactRelatedTabs';

const contact = {
  tickets: [
    {
      id: 'tk-1',
      ticketNumber: 'T-00001',
      subject: 'Integration API question',
      status: 'OPEN',
      priority: 'HIGH',
      createdAt: '2025-01-10T09:00:00.000Z',
      resolvedAt: null,
    },
  ],
  documents: [
    {
      id: 'doc-1',
      name: 'Enterprise License Proposal',
      fileName: 'proposal.pdf',
      fileType: 'application/pdf',
      fileSize: 2_400_000,
      fileUrl: 'https://files.example.com/proposal.pdf',
      category: 'proposal',
      createdAt: '2025-01-09T09:00:00.000Z',
    },
  ],
};

describe('ContactRelatedTabs', () => {
  it('renders the Tickets tab with normalised data when active', () => {
    render(<ContactRelatedTabs activeTab="tickets" contact={contact} timezone="UTC" />);
    expect(screen.getByTestId('contact-tickets-tab')).toBeInTheDocument();
    expect(screen.getByText('Integration API question')).toBeInTheDocument();
    expect(screen.queryByTestId('contact-documents-tab')).not.toBeInTheDocument();
  });

  it('renders the Documents tab with normalised data when active', () => {
    render(<ContactRelatedTabs activeTab="documents" contact={contact} timezone="UTC" />);
    expect(screen.getByTestId('contact-documents-tab')).toBeInTheDocument();
    expect(screen.getByText('Enterprise License Proposal')).toBeInTheDocument();
    expect(screen.queryByTestId('contact-tickets-tab')).not.toBeInTheDocument();
  });

  it('renders nothing for any other tab', () => {
    const { container } = render(
      <ContactRelatedTabs activeTab="overview" contact={contact} timezone="UTC" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state when the contact has no tickets (null contact)', () => {
    render(<ContactRelatedTabs activeTab="tickets" contact={null} timezone="UTC" />);
    expect(screen.getByTestId('contact-tickets-empty')).toBeInTheDocument();
  });
});
