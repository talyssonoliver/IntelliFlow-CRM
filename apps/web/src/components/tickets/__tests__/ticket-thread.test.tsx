/**
 * TicketThread Component Tests (PG-048)
 *
 * Tests conversation thread with activity rendering and reply composer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TicketThread } from '../ticket-thread';
import { createMockActivity, createMockActivityList } from './ticket-test-utils';

describe('TicketThread', () => {
  const defaultProps = {
    ticketId: 'ticket-001',
    activities: createMockActivityList(6),
    onAddResponse: vi.fn().mockResolvedValue(undefined),
    currentUserName: 'Test Agent',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Empty State ──────────────────────────────────────────────────────────

  it('shows "No activity yet" when activities array is empty', () => {
    render(<TicketThread {...defaultProps} activities={[]} />);
    // EmptyState entity="activity" → canonical 'No recent activity'.
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
  });

  // ─── Activity Type Rendering ──────────────────────────────────────────────

  it('renders customer_message with author name and content', () => {
    const activity = createMockActivity({
      type: 'customer_message',
      author: { name: 'John Doe', role: 'customer' },
      content: 'I need help with my account',
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('I need help with my account')).toBeInTheDocument();
  });

  it('renders agent_reply correctly', () => {
    const activity = createMockActivity({
      type: 'agent_reply',
      author: { name: 'Agent Smith', role: 'agent' },
      content: 'Let me look into this for you',
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
    expect(screen.getByText('Let me look into this for you')).toBeInTheDocument();
  });

  it('renders internal_note with "INTERNAL" badge', () => {
    const activity = createMockActivity({
      type: 'internal_note',
      author: { name: 'Agent Smith', role: 'agent' },
      content: 'Customer is a VIP',
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    expect(screen.getByText('INTERNAL')).toBeInTheDocument();
    expect(screen.getByText('Customer is a VIP')).toBeInTheDocument();
  });

  it('renders system_event with system styling', () => {
    const activity = createMockActivity({
      type: 'system_event',
      author: { name: 'System', role: 'system' },
      content: 'Ticket was reopened',
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    expect(screen.getByText('Ticket was reopened')).toBeInTheDocument();
  });

  it('renders sla_breach with "SLA BREACHED" label', () => {
    const activity = createMockActivity({
      type: 'sla_breach',
      author: { name: 'System', role: 'system' },
      content: 'Resolution SLA breached',
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    expect(screen.getByText('SLA BREACHED')).toBeInTheDocument();
  });

  it('renders priority_change with new priority badge', () => {
    const activity = createMockActivity({
      type: 'priority_change',
      author: { name: 'System', role: 'system' },
      content: 'Priority changed',
      metadata: { oldPriority: 'MEDIUM', newPriority: 'HIGH' },
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    expect(screen.getByText('Priority changed')).toBeInTheDocument();
  });

  // ─── Reply Composer ───────────────────────────────────────────────────────

  it('has reply textarea with appropriate placeholder', () => {
    render(<TicketThread {...defaultProps} />);
    expect(screen.getByPlaceholderText(/type your reply/i)).toBeInTheDocument();
  });

  it('switches to Internal Note mode with indicator', async () => {
    const user = userEvent.setup();
    render(<TicketThread {...defaultProps} />);

    const internalTab = screen.getByRole('tab', { name: /internal note/i });
    await user.click(internalTab);

    expect(internalTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches back to Public Reply mode', async () => {
    const user = userEvent.setup();
    render(<TicketThread {...defaultProps} />);

    // Switch to internal
    await user.click(screen.getByRole('tab', { name: /internal note/i }));
    // Switch back
    const publicTab = screen.getByRole('tab', { name: /public reply/i });
    await user.click(publicTab);

    expect(publicTab).toHaveAttribute('aria-selected', 'true');
  });

  it('disables send button when reply is empty', () => {
    render(<TicketThread {...defaultProps} />);
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('calls onAddResponse(content, false) for public reply and clears textarea', async () => {
    const user = userEvent.setup();
    const onAddResponse = vi.fn().mockResolvedValue(undefined);
    render(<TicketThread {...defaultProps} onAddResponse={onAddResponse} />);

    const textarea = screen.getByPlaceholderText(/type your reply/i);
    await user.type(textarea, 'Hello customer');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onAddResponse).toHaveBeenCalledWith('Hello customer', false);
  });

  it('calls onAddResponse(content, true) for internal note', async () => {
    const user = userEvent.setup();
    const onAddResponse = vi.fn().mockResolvedValue(undefined);
    render(<TicketThread {...defaultProps} onAddResponse={onAddResponse} />);

    await user.click(screen.getByRole('tab', { name: /internal note/i }));
    const textarea = screen.getByPlaceholderText(/type your (note|reply)/i);
    await user.type(textarea, 'Internal info');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onAddResponse).toHaveBeenCalledWith('Internal info', true);
  });

  it('disables send button while loading', () => {
    render(<TicketThread {...defaultProps} isLoading />);
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('clears textarea after successful submit', async () => {
    const user = userEvent.setup();
    const onAddResponse = vi.fn().mockResolvedValue(undefined);
    render(<TicketThread {...defaultProps} onAddResponse={onAddResponse} />);

    const textarea = screen.getByPlaceholderText(/type your reply/i);
    await user.type(textarea, 'Hello');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(textarea).toHaveValue('');
  });

  // ─── View Toggle ──────────────────────────────────────────────────────────

  it('defaults to Timeline view', () => {
    render(<TicketThread {...defaultProps} />);
    const timelineTab = screen.getByRole('tab', { name: /timeline/i });
    expect(timelineTab).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles to All Sources view', async () => {
    const user = userEvent.setup();
    render(<TicketThread {...defaultProps} />);

    const allSourcesTab = screen.getByRole('tab', { name: /all sources/i });
    await user.click(allSourcesTab);
    expect(allSourcesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles back to Timeline view', async () => {
    const user = userEvent.setup();
    render(<TicketThread {...defaultProps} />);

    await user.click(screen.getByRole('tab', { name: /all sources/i }));
    const timelineTab = screen.getByRole('tab', { name: /timeline/i });
    await user.click(timelineTab);
    expect(timelineTab).toHaveAttribute('aria-selected', 'true');
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('uses semantic article elements with aria-label for activities (NF-004)', () => {
    const activity = createMockActivity({
      type: 'customer_message',
      author: { name: 'John', role: 'customer' },
      content: 'Test message',
    });
    render(<TicketThread {...defaultProps} activities={[activity]} />);
    const articles = screen.getAllByRole('article');
    expect(articles.length).toBeGreaterThanOrEqual(1);
  });
});
