/**
 * CustomerPortalView Component Tests (PG-137)
 *
 * Tests for customer-facing ticket detail view (limited permissions).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerPortalView } from '../CustomerPortalView';
import type { TicketDetailData } from '../types';

// Mock Card from @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

// Mock SLAIndicator
vi.mock('../SLAIndicator', () => ({
  SLAIndicator: ({ slaStatus }: any) => (
    <div data-testid="sla-indicator">{slaStatus}</div>
  ),
}));

describe('CustomerPortalView', () => {
  const mockTicket = {
    id: 'ticket-001',
    ticketNumber: '1001',
    subject: 'Test Ticket Subject',
    description: 'Test ticket description',
    status: 'OPEN' as const,
    priority: 'HIGH' as const,
    category: 'TECHNICAL',
    channel: 'EMAIL',
    slaStatus: 'ON_TRACK' as const,
    slaTimeRemaining: 120,
    slaResponseDue: null,
    slaResolutionDue: null,
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    assignee: null,
    assigneeAvatar: null,
    createdAt: '2 hours ago',
    updatedAt: '30 minutes ago',
    tags: ['bug'],
    type: 'Request',
    customer: {
      id: 'customer-001',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Acme Corp',
      title: 'CTO',
      isVIP: false,
      totalTickets: 5,
    },
    account: {
      id: 'account-001',
      name: 'Acme Corp',
      industry: 'Technology',
      tier: 'Enterprise',
    },
    assigneeInfo: null,
    sla: {
      firstResponse: { target: 30, actual: 15, met: true },
      resolution: { status: 'ON_TRACK' as const, target: 240, remaining: 120 },
    },
    activities: [
      {
        id: 'activity-001',
        type: 'customer_message' as const,
        author: { name: 'John Doe', role: 'customer' as const },
        content: 'This is a customer message',
        timestamp: '1 hour ago',
      },
      {
        id: 'activity-002',
        type: 'agent_reply' as const,
        author: { name: 'Support Agent', role: 'agent' as const },
        content: 'This is an agent reply',
        timestamp: '30 minutes ago',
      },
      {
        id: 'activity-003',
        type: 'internal_note' as const,
        author: { name: 'Agent', role: 'agent' as const },
        content: 'Internal note should not be visible',
        timestamp: '15 minutes ago',
      },
    ],
    attachments: [
      {
        id: 'file-001',
        name: 'document.pdf',
        type: 'pdf',
        size: '1.2 MB',
        uploader: 'John Doe',
      },
    ],
    nextSteps: [],
    relatedTickets: [],
    aiInsights: {
      escalationRisk: 'low' as const,
      predictedResolutionTime: '2 hours',
      suggestedSolutions: [],
      sentiment: 'neutral' as const,
      similarResolvedTickets: 0,
    },
    firstResponseAt: null,
    resolvedAt: null,
  } satisfies TicketDetailData;

  const onReply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ticket subject and description', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByText(mockTicket.subject)).toBeInTheDocument();
    expect(screen.getByText(mockTicket.description!)).toBeInTheDocument();
  });

  it('renders simplified SLA status (badge without timer)', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByTestId('sla-indicator')).toBeInTheDocument();
  });

  it('shows customer messages', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByText('This is a customer message')).toBeInTheDocument();
  });

  it('shows agent replies', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByText('This is an agent reply')).toBeInTheDocument();
  });

  it('filters out internal notes', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(
      screen.queryByText(/Internal note should not be visible/i)
    ).not.toBeInTheDocument();
  });

  it('calls onReply when reply submitted', async () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    const replyInput = screen.getByLabelText(/reply message/i) as HTMLTextAreaElement;
    fireEvent.change(replyInput, { target: { value: 'My reply message' } });

    const submitButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(submitButton);

    expect(onReply).toHaveBeenCalledWith('My reply message');
  });

  it('does not render admin actions', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    // Should not show escalate, change priority, assign, etc.
    expect(screen.queryByRole('button', { name: /escalate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change priority/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).not.toBeInTheDocument();
  });

  it('shows ticket number for reference', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByText(/Ticket #1001/i)).toBeInTheDocument();
  });

  it('displays attachments', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={false}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <CustomerPortalView
        ticket={mockTicket}
        isLoading={true}
        onReply={onReply}
        customerName="John Doe"
      />
    );

    expect(screen.getByText(/progress_activity/i)).toBeInTheDocument();
  });
});
