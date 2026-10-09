/**
 * @vitest-environment jsdom
 */
/**
 * TicketDetail: confirming the Delete / Archive dialogs must call the parent's
 * onDelete / onArchive handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from '@intelliflow/ui';
import { TicketDetail } from '../TicketDetail';
import type { TicketDetailData } from '../types';

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Render the extra actions as plain buttons so the test can reach Delete/Archive.
vi.mock('@/components/shared/entity-action-sheet', () => ({
  EntityActionSheet: ({ open, extraActions }: any) =>
    open ? (
      <div data-testid="action-sheet">
        {extraActions.map((a: any) => (
          <button key={a.label} onClick={a.onClick}>
            {`action:${a.label}`}
          </button>
        ))}
      </div>
    ) : null,
}));

vi.mock('@/components/shared/more-actions-button', () => ({
  MoreActionsButton: ({ onClick }: any) => (
    <button data-testid="more-actions" onClick={onClick}>
      More Actions
    </button>
  ),
}));

vi.mock('@/components/shared/app-avatar', () => ({ AppAvatar: () => null }));
vi.mock('../TicketAssignSidebar', () => ({ TicketAssignSidebar: () => null }));
vi.mock('@/components/shared/assign-sheet', () => ({ AssignSheet: () => null }));
vi.mock('@/components/home/PinButton', () => ({ PinButton: () => null }));
vi.mock('@/components/shared/activity-feed', () => ({ ActivityFeed: () => null }));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  toast: vi.fn(),
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

function buildTicket(status: string): TicketDetailData {
  return {
    id: 'ticket-001',
    ticketNumber: '1001',
    subject: 'System Outage',
    description: 'Dashboard is down',
    status,
    priority: 'HIGH',
    category: 'TECHNICAL',
    channel: 'EMAIL',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 120,
    slaResponseDue: null,
    slaResolutionDue: null,
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    createdAt: '2 hours ago',
    updatedAt: '30 minutes ago',
    tags: [],
    type: 'Incident',
    customer: {
      id: 'c-001',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Acme Corp',
      title: 'CTO',
      isVIP: false,
      totalTickets: 5,
    },
    account: { id: 'a-001', name: 'Acme Corp', industry: 'Technology', tier: 'Enterprise' },
    assigneeInfo: { name: 'Sarah Jenkins', title: 'Support Lead' },
    sla: {
      firstResponse: { target: 30, actual: 15, met: true },
      resolution: { status: 'ON_TRACK', target: 240, remaining: 120 },
    },
    activities: [],
    attachments: [],
    nextSteps: [],
    relatedTickets: [],
    aiInsights: {
      escalationRisk: 'low',
      predictedResolutionTime: '4 hours',
      suggestedSolutions: [],
      sentiment: 'neutral',
      similarResolvedTickets: 0,
    },
    firstResponseAt: new Date('2026-02-10T16:45:00Z'),
    resolvedAt: null,
  } as unknown as TicketDetailData;
}

const handlers = {
  onStatusChange: vi.fn().mockResolvedValue(undefined),
  onPriorityChange: vi.fn().mockResolvedValue(undefined),
  onAssign: vi.fn().mockResolvedValue(undefined),
  onAddResponse: vi.fn().mockResolvedValue(undefined),
  onResolve: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn().mockResolvedValue(undefined),
};

describe('TicketDetail confirm dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onDelete after confirming deletion of an open ticket', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <TicketDetail
        ticket={buildTicket('OPEN')}
        isLoading={false}
        onDelete={onDelete}
        {...handlers}
      />
    );

    fireEvent.click(screen.getByTestId('more-actions'));
    fireEvent.click(screen.getByText('action:Delete'));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('calls onArchive after confirming archive of a resolved ticket', () => {
    const onArchive = vi.fn().mockResolvedValue(undefined);
    render(
      <TicketDetail
        ticket={buildTicket('RESOLVED')}
        isLoading={false}
        onArchive={onArchive}
        {...handlers}
      />
    );

    fireEvent.click(screen.getByTestId('more-actions'));
    fireEvent.click(screen.getByText('action:Archive'));
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['onDelete', 'OPEN', 'action:Delete', 'Delete', 'Delete failed'],
    ['onArchive', 'RESOLVED', 'action:Archive', 'Archive', 'Archive failed'],
  ])(
    'toasts instead of leaving an unhandled rejection when %s rejects',
    async (prop, status, actionLabel, confirmLabel, expectedTitle) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing = vi.fn().mockRejectedValue(new Error('boom'));
      render(
        <TicketDetail
          ticket={buildTicket(status)}
          isLoading={false}
          {...{ [prop]: failing }}
          {...handlers}
        />
      );

      fireEvent.click(screen.getByTestId('more-actions'));
      fireEvent.click(screen.getByText(actionLabel));
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: expectedTitle, variant: 'destructive' })
        )
      );
      errorSpy.mockRestore();
    }
  );
});
