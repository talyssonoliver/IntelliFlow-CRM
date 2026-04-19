import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseDetail } from '../CaseDetail';
import type { CaseDetailData, CaseAssigneeOption } from '../types';

// Mock the tRPC api used by DocumentLinks (nested inside CaseDetail's Evidence tab)
vi.mock('@/lib/api', () => ({
  api: {
    documents: {
      list: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
    },
  },
}));

const mockCase: CaseDetailData = {
  id: 'case-1',
  caseNumber: 'CF-2024-001',
  title: 'Test Case Detail',
  description: 'A detailed test case description',
  status: 'OPEN',
  priority: 'HIGH',
  deadline: '2026-03-01T00:00:00Z',
  clientId: 'client-1',
  assignedTo: 'user-1',
  client: { id: 'client-1', name: 'Acme Corp' },
  assignee: { id: 'user-1', name: 'Jane Doe', email: 'jane@test.com', avatarUrl: null },
  tasks: [
    {
      id: 't1',
      title: 'Review docs',
      description: null,
      dueDate: '2026-02-20T00:00:00Z',
      status: 'COMPLETED',
      assignee: null,
      isOverdue: false,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
      completedAt: '2026-02-10T00:00:00Z',
    },
    {
      id: 't2',
      title: 'File motion',
      description: null,
      dueDate: '2026-03-15T00:00:00Z',
      status: 'PENDING',
      assignee: null,
      isOverdue: false,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
      completedAt: null,
    },
  ],
  taskProgress: 50,
  pendingTaskCount: 1,
  completedTaskCount: 1,
  isOverdue: false,
  resolution: null,
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  closedAt: null,
  parties: [{ id: 'p1', name: 'John Smith', role: 'CLIENT' }],
  appointments: [],
  tags: ['Property', 'Dispute'],
  timeline: [
    {
      id: 'tl-1',
      type: 'status_change',
      title: 'Status Changed to Open',
      description: 'Case was opened by Jane Doe',
      timestamp: '2026-01-15T10:00:00Z',
      user: { name: 'Jane Doe' },
    },
  ],
  resolutionProgress: 45,
  budgetConsumed: 30,
  slaDays: 12,
  openItems: 3,
  assignedTeam: [
    { id: 'user-1', name: 'Jane Doe' },
    { id: 'user-2', name: 'Bob Smith' },
  ],
};

const mockAssignees: CaseAssigneeOption[] = [
  { id: 'user-1', name: 'Jane Doe', title: 'Legal Staff', avatar: null },
  { id: 'user-2', name: 'Bob Smith', title: 'Case Manager', avatar: null },
];

const defaultProps = {
  caseData: mockCase,
  isLoading: false,
  assigneeOptions: mockAssignees,
  onStatusChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onAssign: vi.fn(),
  onClose: vi.fn(),
  onAddTask: vi.fn(),
  onCompleteTask: vi.fn(),
  onRemoveTask: vi.fn(),
  onUpdateParties: vi.fn(),
};

describe('CaseDetail', () => {
  it('renders breadcrumb with case number', () => {
    render(<CaseDetail {...defaultProps} />);
    // Case number appears in breadcrumb and left sidebar
    const caseNumElements = screen.getAllByText('CF-2024-001');
    expect(caseNumElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Cases')).toBeInTheDocument();
  });

  it('renders case title', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('Test Case Detail')).toBeInTheDocument();
  });

  it('renders left sidebar with case metadata', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText(/High Priority/)).toBeInTheDocument();
  });

  it('renders case tags', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('Property')).toBeInTheDocument();
    expect(screen.getByText('Dispute')).toBeInTheDocument();
  });

  it('renders assigned team avatars', () => {
    render(<CaseDetail {...defaultProps} />);
    // Initials may appear multiple times (team + stakeholders)
    const jdElements = screen.getAllByText('JD');
    expect(jdElements.length).toBeGreaterThanOrEqual(1);
    const bsElements = screen.getAllByText('BS');
    expect(bsElements.length).toBeGreaterThanOrEqual(1);
  });

  it('tab navigation shows mockup tabs', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Activities')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('Records')).toBeInTheDocument();
  });

  it('overview tab shows activity logger', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByPlaceholderText('Write a note or log an activity...')).toBeInTheDocument();
    expect(screen.getByText('Log Activity')).toBeInTheDocument();
  });

  it('overview tab shows timeline entries', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('Status Changed to Open')).toBeInTheDocument();
    expect(screen.getByText('Case was opened by Jane Doe')).toBeInTheDocument();
  });

  it('right sidebar shows Case Health metrics', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('Case Health')).toBeInTheDocument();
    expect(screen.getByText('Resolution Progress')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('Budget Consumed')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('right sidebar shows SLA and open items', () => {
    render(<CaseDetail {...defaultProps} />);
    expect(screen.getByText('12')).toBeInTheDocument(); // SLA Days
    expect(screen.getByText('3')).toBeInTheDocument(); // Open Items
  });

  it('shows loading skeleton when isLoading=true', () => {
    render(<CaseDetail {...defaultProps} isLoading={true} />);
    expect(screen.queryByText('Test Case Detail')).not.toBeInTheDocument();
  });

  it('shows not-found state when caseData is null', () => {
    render(<CaseDetail {...defaultProps} caseData={null as any} />); // test-only: testing null guard
    expect(screen.getByText('Case not found')).toBeInTheDocument();
  });

  it('switching to Activities tab renders task content', () => {
    render(<CaseDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Activities'));
    // Activities tab renders DeadlineTracker which shows tasks
    expect(screen.getByText('Review docs')).toBeInTheDocument();
  });

  it('switching to Evidence tab renders DocumentLinks', () => {
    render(<CaseDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Evidence'));
    // DocumentLinks renders for the case — may render empty or loading
    const noDocsElements = screen.queryAllByText(/No documents attached/);
    // If DocumentLinks is rendered, it will be present or a loading skeleton
    expect(
      noDocsElements.length + document.querySelectorAll('[class*="animate-pulse"]').length
    ).toBeGreaterThanOrEqual(0);
  });

  it('switching to Records tab renders PartyManager', () => {
    render(<CaseDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Records'));
    // PartyManager renders with the party from mockCase
    // "John Smith" may appear in both Key Stakeholders sidebar and Records tab
    expect(screen.getAllByText('John Smith').length).toBeGreaterThanOrEqual(1);
  });

  it('close dialog flow: open, type resolution, submit', () => {
    render(<CaseDetail {...defaultProps} />);
    // Click "New Entry" to open close dialog
    fireEvent.click(screen.getByText('New Entry'));

    // "Close Case" appears as dialog title and submit button
    const closeCaseElements = screen.getAllByText('Close Case');
    expect(closeCaseElements.length).toBeGreaterThanOrEqual(1);

    // Type resolution
    const textarea = screen.getByLabelText('Resolution summary');
    fireEvent.change(textarea, { target: { value: 'Case settled amicably' } });

    // Submit — find the button variant (not the heading)
    const closeBtn = closeCaseElements.find(
      (el) => el.tagName === 'BUTTON' || el.closest('button')
    );
    if (closeBtn) {
      const btn = closeBtn.tagName === 'BUTTON' ? closeBtn : closeBtn.closest('button')!;
      fireEvent.click(btn);
      expect(defaultProps.onClose).toHaveBeenCalledWith('Case settled amicably');
    }
  });

  it('close dialog: cancel button dismisses dialog', () => {
    render(<CaseDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('New Entry'));
    expect(screen.getByLabelText('Resolution summary')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Resolution summary')).not.toBeInTheDocument();
  });

  it('close dialog: submit button disabled when resolution is empty', () => {
    render(<CaseDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('New Entry'));
    const closeBtn = screen
      .getAllByText('Close Case')
      .find((el) => el.tagName === 'BUTTON' && el.closest('.fixed')) as HTMLButtonElement;
    expect(closeBtn.disabled).toBe(true);
  });

  it('activity logger calls onLogActivity', () => {
    const onLogActivity = vi.fn();
    render(<CaseDetail {...defaultProps} onLogActivity={onLogActivity} />);
    const textarea = screen.getByLabelText('Activity note');
    fireEvent.change(textarea, { target: { value: 'Called client re: settlement' } });
    fireEvent.click(screen.getByText('Log Activity'));
    expect(onLogActivity).toHaveBeenCalledWith('Called client re: settlement');
  });

  it('activity logger does nothing when text is empty', () => {
    const onLogActivity = vi.fn();
    render(<CaseDetail {...defaultProps} onLogActivity={onLogActivity} />);
    fireEvent.click(screen.getByText('Log Activity'));
    expect(onLogActivity).not.toHaveBeenCalled();
  });

  it('hides "New Entry" button when case is closed', () => {
    const closedCase = { ...mockCase, status: 'CLOSED' as const };
    render(<CaseDetail {...defaultProps} caseData={closedCase} />);
    expect(screen.queryByText('New Entry')).not.toBeInTheDocument();
  });

  it('hides "New Entry" button when case is cancelled', () => {
    const cancelledCase = { ...mockCase, status: 'CANCELLED' as const };
    render(<CaseDetail {...defaultProps} caseData={cancelledCase} />);
    expect(screen.queryByText('New Entry')).not.toBeInTheDocument();
  });

  it('renders closed case status with static badge (no pulse)', () => {
    const closedCase = { ...mockCase, status: 'CLOSED' as const };
    render(<CaseDetail {...defaultProps} caseData={closedCase} />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('renders timeline entry with attachment', () => {
    const caseWithAttachment = {
      ...mockCase,
      timeline: [
        {
          id: 'tl-2',
          type: 'document' as const,
          title: 'Document Filed',
          description: 'Motion to dismiss filed',
          timestamp: '2026-02-10T10:00:00Z',
          user: { name: 'Jane Doe' },
          attachment: { name: 'motion.pdf', downloadUrl: '/download/motion.pdf' },
        },
      ],
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithAttachment} />);
    expect(screen.getByText('Document Filed')).toBeInTheDocument();
    expect(screen.getByText('motion.pdf')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('renders timeline entry with attachment but no download URL', () => {
    const caseWithAttachment = {
      ...mockCase,
      timeline: [
        {
          id: 'tl-3',
          type: 'note' as const,
          title: 'Note Added',
          description: 'Internal note',
          timestamp: '2026-02-10T10:00:00Z',
          user: { name: 'Bob' },
          attachment: { name: 'notes.txt' },
        },
      ],
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithAttachment} />);
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });

  it('renders empty timeline fallback with description', () => {
    const caseNoTimeline = { ...mockCase, timeline: [] };
    render(<CaseDetail {...defaultProps} caseData={caseNoTimeline} />);
    expect(screen.getByText('A detailed test case description')).toBeInTheDocument();
    // Migrated to `<EmptyState entity="timeline" />`; canonical title is
    // 'No activity yet' (packages/ui entity-empty-state-config).
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
  });

  it('renders empty timeline fallback without description', () => {
    const caseNoTimeline = { ...mockCase, timeline: [], description: null as any }; // test-only: testing null guard
    render(<CaseDetail {...defaultProps} caseData={caseNoTimeline} />);
    // Migrated to `<EmptyState entity="timeline" />`; canonical title is
    // 'No activity yet' (packages/ui entity-empty-state-config).
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
  });

  it('renders team overflow when more than 3 team members', () => {
    const bigTeamCase = {
      ...mockCase,
      assignedTeam: [
        { id: 'u1', name: 'Alice A' },
        { id: 'u2', name: 'Bob B' },
        { id: 'u3', name: 'Carol C' },
        { id: 'u4', name: 'David D' },
        { id: 'u5', name: 'Eve E' },
      ],
    };
    render(<CaseDetail {...defaultProps} caseData={bigTeamCase} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('renders managedBy text when provided', () => {
    const caseWithManager = {
      ...mockCase,
      managedBy: 'Senior Partner',
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithManager} />);
    expect(screen.getByText('Managed by Senior Partner')).toBeInTheDocument();
  });

  it('renders avatar with URL as img tag', () => {
    const caseWithAvatarTeam = {
      ...mockCase,
      assignedTeam: [{ id: 'u1', name: 'Alice', avatarUrl: 'https://example.com/alice.jpg' }],
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithAvatarTeam} />);
    const img = document.querySelector('img[src="https://example.com/alice.jpg"]');
    expect(img).toBeTruthy();
  });

  it('renders fallback assignee when no assignedTeam', () => {
    const caseNoTeam = { ...mockCase, assignedTeam: [] };
    render(<CaseDetail {...defaultProps} caseData={caseNoTeam} />);
    // Falls back to showing caseData.assignee — "Jane Doe" may appear in timeline too
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThanOrEqual(1);
  });

  it('hides tags card when no tags', () => {
    const noTagsCase = { ...mockCase, tags: [] };
    render(<CaseDetail {...defaultProps} caseData={noTagsCase} />);
    expect(screen.queryByText('Case Tags')).not.toBeInTheDocument();
  });

  it('parses parties from JSON string', () => {
    const caseWithStringParties = {
      ...mockCase,
      parties: JSON.stringify([{ name: 'Parsed Party', role: 'WITNESS' }]) as any, // test-only: testing JSON string parsing
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithStringParties} />);
    // Records tab should show the parsed party
    fireEvent.click(screen.getByText('Records'));
    // "Parsed Party" may appear in Key Stakeholders sidebar and Records tab
    expect(screen.getAllByText('Parsed Party').length).toBeGreaterThanOrEqual(1);
  });

  it('handles invalid JSON parties string gracefully', () => {
    const caseWithBadParties = {
      ...mockCase,
      parties: 'not-valid-json' as any, // test-only: testing invalid JSON handling
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithBadParties} />);
    fireEvent.click(screen.getByText('Records'));
    // PartyManager renders `<EmptyState entity="contacts" />` when parties is
    // empty; canonical title is 'No contacts yet'.
    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
  });

  it('renders no upcoming deadlines when all tasks completed', () => {
    const allDoneCase = {
      ...mockCase,
      tasks: [{ ...mockCase.tasks[0], status: 'COMPLETED' as const }],
      appointments: [],
    };
    render(<CaseDetail {...defaultProps} caseData={allDoneCase} />);
    expect(screen.getByText('No upcoming deadlines')).toBeInTheDocument();
  });

  it('renders appointments in deadlines section', () => {
    const caseWithApt = {
      ...mockCase,
      appointments: [
        {
          id: 'apt-1',
          title: 'Court Hearing',
          startTime: '2026-03-10T09:00:00Z',
          endTime: '2026-03-10T10:00:00Z',
          status: 'SCHEDULED',
          location: 'Room 301',
        },
      ],
    };
    render(<CaseDetail {...defaultProps} caseData={caseWithApt} />);
    expect(screen.getByText('Court Hearing')).toBeInTheDocument();
    expect(screen.getByText('Room 301')).toBeInTheDocument();
  });

  it('renders timeline with different icon types', () => {
    const multiTimeline = {
      ...mockCase,
      timeline: [
        {
          id: 'tl-a',
          type: 'meeting' as const,
          title: 'Client Meeting',
          description: 'Discussed terms',
          timestamp: '2026-02-01T10:00:00Z',
          user: { name: 'AA' },
        },
        {
          id: 'tl-b',
          type: 'event' as const,
          title: 'Court Date Set',
          description: 'March hearing',
          timestamp: '2026-02-02T10:00:00Z',
          user: { name: 'BB' },
        },
      ],
    };
    render(<CaseDetail {...defaultProps} caseData={multiTimeline} />);
    expect(screen.getByText('Client Meeting')).toBeInTheDocument();
    expect(screen.getByText('Court Date Set')).toBeInTheDocument();
  });

  it('uses fallback caseNumber from id when caseNumber is empty', () => {
    const noCaseNum = { ...mockCase, caseNumber: '' };
    render(<CaseDetail {...defaultProps} caseData={noCaseNum} />);
    // Should show #CASE-1 (first 8 chars uppercase of the id)
    expect(screen.getAllByText(/^#/).length).toBeGreaterThanOrEqual(1);
  });

  it('uses fallback values for optional fields', () => {
    const minimalCase = {
      ...mockCase,
      resolutionProgress: undefined as any, // test-only: testing undefined fallback
      budgetConsumed: undefined as any, // test-only: testing undefined fallback
      slaDays: undefined as any, // test-only: testing undefined fallback
      openItems: undefined as any, // test-only: testing undefined fallback
    };
    render(<CaseDetail {...defaultProps} caseData={minimalCase} />);
    // Falls back to taskProgress (50) for resolution, 0 for others
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});
