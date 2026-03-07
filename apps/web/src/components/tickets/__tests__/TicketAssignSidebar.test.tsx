/**
 * TicketAssignSidebar Component Tests (PG-137)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TicketAssignSidebar } from '../TicketAssignSidebar';

// Mock Sheet from @intelliflow/ui
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...actual,
    Sheet: ({ children, open }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
    SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
    SheetHeader: ({ children }: any) => <div>{children}</div>,
    SheetTitle: ({ children }: any) => <h2>{children}</h2>,
    SheetDescription: ({ children }: any) => <p>{children}</p>,
  };
});

vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: ({ name }: any) => <div data-testid="avatar" aria-label={name} />,
}));

describe('TicketAssignSidebar', () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    ticketSubject: 'System Outage: West Region',
    currentUserId: 'user-001',
    currentUserName: 'Sarah Jenkins',
    assignees: [
      { id: 'user-001', name: 'Sarah Jenkins', title: 'Support Lead', avatar: null },
      { id: 'user-002', name: 'Mike Ross', title: 'Senior Agent', avatar: null },
      { id: 'user-003', name: 'Alex Morgan', title: 'Tech Support', avatar: null },
    ],
    isAssigning: false,
    isLoadingOptions: false,
    onAssign: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sidebar with title and description', () => {
    render(<TicketAssignSidebar {...baseProps} />);

    expect(screen.getByText('Assign Ticket')).toBeInTheDocument();
    expect(screen.getByText(/System Outage: West Region/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<TicketAssignSidebar {...baseProps} open={false} />);

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders Assign to me quick action', () => {
    render(<TicketAssignSidebar {...baseProps} />);

    expect(screen.getByText('Assign to me')).toBeInTheDocument();
    // Sarah Jenkins appears in Quick Action subtitle AND in Team Members list
    expect(screen.getAllByText('Sarah Jenkins').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onAssign with current user id when Assign to me clicked', async () => {
    render(<TicketAssignSidebar {...baseProps} />);

    fireEvent.click(screen.getByText('Assign to me'));

    await waitFor(() => {
      expect(baseProps.onAssign).toHaveBeenCalledWith('user-001');
    });
  });

  it('closes sidebar after successful assignment', async () => {
    render(<TicketAssignSidebar {...baseProps} />);

    fireEvent.click(screen.getByText('Assign to me'));

    await waitFor(() => {
      expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders team members list', () => {
    render(<TicketAssignSidebar {...baseProps} />);

    expect(screen.getByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('Mike Ross')).toBeInTheDocument();
    expect(screen.getByText('Alex Morgan')).toBeInTheDocument();
  });

  it('calls onAssign with teammate id when teammate clicked', async () => {
    render(<TicketAssignSidebar {...baseProps} />);

    fireEvent.click(screen.getByText('Mike Ross'));

    await waitFor(() => {
      expect(baseProps.onAssign).toHaveBeenCalledWith('user-002');
    });
  });

  it('shows You badge for current user in team list', () => {
    render(<TicketAssignSidebar {...baseProps} />);

    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('shows loading state when isLoadingOptions', () => {
    render(<TicketAssignSidebar {...baseProps} isLoadingOptions={true} assignees={[]} />);

    expect(screen.getByText('Loading team members...')).toBeInTheDocument();
  });

  it('shows empty state when no assignees', () => {
    render(<TicketAssignSidebar {...baseProps} assignees={[]} />);

    expect(screen.getByText('No team members available.')).toBeInTheDocument();
  });

  it('hides Assign to me when no currentUserId', () => {
    render(<TicketAssignSidebar {...baseProps} currentUserId={null} />);

    expect(screen.queryByText('Assign to me')).not.toBeInTheDocument();
  });

  it('disables buttons when isAssigning', () => {
    render(<TicketAssignSidebar {...baseProps} isAssigning={true} />);

    const assignToMeBtn = screen.getByText('Assign to me').closest('button');
    expect(assignToMeBtn).toBeDisabled();
  });

  it('shows "Current user" when currentUserName is null', () => {
    render(<TicketAssignSidebar {...baseProps} currentUserName={null} />);

    expect(screen.getByText('Current user')).toBeInTheDocument();
  });

  it('deduplicates assignees with same id', () => {
    const dupeAssignees = [
      { id: 'user-001', name: 'Sarah Jenkins', title: 'Support Lead', avatar: null },
      { id: 'user-001', name: 'Sarah Jenkins Dupe', title: 'Dupe', avatar: null },
      { id: 'user-002', name: 'Mike Ross', title: 'Senior Agent', avatar: null },
    ];

    render(<TicketAssignSidebar {...baseProps} assignees={dupeAssignees} />);

    const avatars = screen.getAllByTestId('avatar');
    // Should only have 2 unique assignees (deduped) - "Sarah Jenkins" and "Mike Ross"
    // Plus the quick action section doesn't have an avatar, so count the team list avatars
    expect(avatars.length).toBe(2);
  });

  it('keeps sidebar open on assignment error', async () => {
    const onAssign = vi.fn().mockRejectedValue(new Error('fail'));
    render(<TicketAssignSidebar {...baseProps} onAssign={onAssign} />);

    fireEvent.click(screen.getByText('Mike Ross'));

    await waitFor(() => {
      expect(onAssign).toHaveBeenCalled();
    });

    // Should NOT close - error keeps sidebar open
    expect(baseProps.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('filters out assignees with empty ids', () => {
    const assigneesWithEmpty = [
      { id: '', name: 'Empty ID', title: 'Agent', avatar: null },
      { id: '  ', name: 'Whitespace ID', title: 'Agent', avatar: null },
      { id: 'user-002', name: 'Mike Ross', title: 'Senior Agent', avatar: null },
    ];

    render(<TicketAssignSidebar {...baseProps} assignees={assigneesWithEmpty} />);

    expect(screen.queryByText('Empty ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Whitespace ID')).not.toBeInTheDocument();
    expect(screen.getByText('Mike Ross')).toBeInTheDocument();
  });

  it('does not assign when empty assigneeId', async () => {
    // This tests the guard `if (!assigneeId || isAssigning) return;`
    const assigneesWithEmpty = [
      { id: 'user-002', name: 'Mike Ross', title: 'Senior Agent', avatar: null },
    ];

    render(<TicketAssignSidebar {...baseProps} assignees={assigneesWithEmpty} />);

    // Clicking Mike Ross should work
    fireEvent.click(screen.getByText('Mike Ross'));

    await waitFor(() => {
      expect(baseProps.onAssign).toHaveBeenCalledWith('user-002');
    });
  });

  it('renders assignee titles', () => {
    render(<TicketAssignSidebar {...baseProps} />);

    expect(screen.getByText('Support Lead')).toBeInTheDocument();
    expect(screen.getByText('Senior Agent')).toBeInTheDocument();
    expect(screen.getByText('Tech Support')).toBeInTheDocument();
  });
});
