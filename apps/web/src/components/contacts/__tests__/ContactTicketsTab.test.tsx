// @vitest-environment jsdom
/**
 * ContactTicketsTab tests (IFC-256)
 *
 * Component-level coverage for the Contact 360 Tickets tab: real-data render,
 * empty state, status-colour branches, and the relative-time formatter wiring.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ContactTicketsTab } from '../ContactTicketsTab';
import type { TicketViewModel } from '../contact-tab-format';

const ticket = (overrides: Partial<TicketViewModel> = {}): TicketViewModel => ({
  id: 'tk-1',
  ticketNumber: 'T-00001',
  subject: 'Integration API question',
  status: 'RESOLVED',
  priority: 'MEDIUM',
  createdAt: '2025-01-10T09:00:00.000Z',
  ...overrides,
});

describe('ContactTicketsTab', () => {
  it('renders real tickets with humanised meta and a relative created-time', () => {
    render(
      <ContactTicketsTab
        timezone="UTC"
        tickets={[
          ticket(),
          ticket({
            id: 'tk-2',
            ticketNumber: 'T-00002',
            subject: 'Billing discrepancy',
            status: 'OPEN',
            priority: 'HIGH',
          }),
        ]}
      />
    );

    const panel = screen.getByTestId('contact-tickets-tab');
    expect(panel).toHaveTextContent('Integration API question');
    expect(panel).toHaveTextContent('T-00001 • Resolved • Medium Priority');
    // open ticket exercises the non-resolved status-colour branch
    expect(panel).toHaveTextContent('Billing discrepancy');
    expect(panel).toHaveTextContent('T-00002 • Open • High Priority');
    // the old hardcoded created-time literal must not appear
    expect(screen.queryByText(/Dec 15, 2024/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('contact-tickets-empty')).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no tickets', () => {
    render(<ContactTicketsTab tickets={[]} timezone="UTC" />);
    expect(screen.getByTestId('contact-tickets-empty')).toBeInTheDocument();
    expect(screen.queryByText('Integration API question')).not.toBeInTheDocument();
  });
});
