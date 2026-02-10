/**
 * TicketCard Component Tests (PG-137)
 *
 * Tests for compact ticket card with quick actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TicketCard } from '../TicketCard';
import { createMockTicketList } from './ticket-test-utils';

// Mock SLAIndicator
vi.mock('../SLAIndicator', () => ({
  SLAIndicator: ({ slaStatus }: any) => (
    <div data-testid="sla-badge">{slaStatus}</div>
  ),
}));

// Mock Card from @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className, onClick, role, ...props }: any) => (
    <div className={className} onClick={onClick} role={role} {...props}>
      {children}
    </div>
  ),
}));

describe('TicketCard', () => {
  const mockTicket = createMockTicketList(1)[0];
  // The factory cycles priorities: index 0 = 'LOW', so override for tests that need specific values
  const onClick = vi.fn();
  const onQuickAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ticket subject and contact name', () => {
    render(<TicketCard ticket={mockTicket} onClick={onClick} />);

    expect(screen.getByText(mockTicket.subject)).toBeInTheDocument();
    expect(screen.getByText(mockTicket.contactName)).toBeInTheDocument();
  });

  it('renders SLA badge', () => {
    render(<TicketCard ticket={mockTicket} onClick={onClick} />);

    expect(screen.getByTestId('sla-badge')).toBeInTheDocument();
    expect(screen.getByText(mockTicket.slaStatus)).toBeInTheDocument();
  });

  it('renders priority badge', () => {
    const criticalTicket = { ...mockTicket, priority: 'CRITICAL' as const };
    render(<TicketCard ticket={criticalTicket} onClick={onClick} />);

    expect(screen.getByText(/critical/i)).toBeInTheDocument();
  });

  it('renders assignee avatar', () => {
    const assignedTicket = { ...mockTicket, assignee: 'Sarah Jenkins', assigneeAvatar: 'SJ' };
    render(<TicketCard ticket={assignedTicket} onClick={onClick} />);

    expect(screen.getByText('SJ')).toBeInTheDocument();
    expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
  });

  it('renders unassigned state', () => {
    const unassignedTicket = { ...mockTicket, assignee: null, assigneeAvatar: null };

    render(<TicketCard ticket={unassignedTicket} onClick={onClick} />);

    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it('hides details when compact=true', () => {
    const assignedTicket = { ...mockTicket, assignee: 'Sarah Jenkins', assigneeAvatar: 'SJ' };
    render(<TicketCard ticket={assignedTicket} onClick={onClick} compact={true} />);

    // Assignee and updated time should not be visible in compact mode
    expect(screen.queryByText('Sarah Jenkins')).not.toBeInTheDocument();
  });

  it('calls onQuickAction with resolve', () => {
    render(
      <TicketCard
        ticket={mockTicket}
        onClick={onClick}
        onQuickAction={onQuickAction}
      />
    );

    const resolveButton = screen.getByRole('button', { name: /resolve ticket/i });
    fireEvent.click(resolveButton);

    expect(onQuickAction).toHaveBeenCalledWith('resolve');
  });

  it('calls onQuickAction with escalate', () => {
    render(
      <TicketCard
        ticket={mockTicket}
        onClick={onClick}
        onQuickAction={onQuickAction}
      />
    );

    const escalateButton = screen.getByRole('button', { name: /escalate ticket/i });
    fireEvent.click(escalateButton);

    expect(onQuickAction).toHaveBeenCalledWith('escalate');
  });

  it('calls onClick when card clicked', () => {
    render(<TicketCard ticket={mockTicket} onClick={onClick} />);

    const card = screen.getByRole('article');
    fireEvent.click(card);

    expect(onClick).toHaveBeenCalled();
  });

  it('has accessible card structure (role="article")', () => {
    render(<TicketCard ticket={mockTicket} onClick={onClick} />);

    const card = screen.getByRole('article');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-label', `Ticket ${mockTicket.ticketNumber}: ${mockTicket.subject}`);
  });

  it('displays ticket number', () => {
    render(<TicketCard ticket={mockTicket} onClick={onClick} />);

    expect(screen.getByText(`#${mockTicket.ticketNumber}`)).toBeInTheDocument();
  });

  it('displays updated time', () => {
    render(<TicketCard ticket={mockTicket} onClick={onClick} />);

    expect(screen.getByText(mockTicket.updatedAt)).toBeInTheDocument();
  });
});
