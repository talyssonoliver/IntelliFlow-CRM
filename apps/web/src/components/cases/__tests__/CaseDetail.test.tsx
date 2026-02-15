import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseDetail } from '../CaseDetail';
import type { CaseDetailData, CaseAssigneeOption } from '../types';

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
    { id: 't1', title: 'Review docs', description: null, dueDate: '2026-02-20T00:00:00Z', status: 'COMPLETED', assignee: null, isOverdue: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: '2026-02-10T00:00:00Z' },
    { id: 't2', title: 'File motion', description: null, dueDate: '2026-03-15T00:00:00Z', status: 'PENDING', assignee: null, isOverdue: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: null },
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
    render(<CaseDetail {...defaultProps} caseData={null as unknown as CaseDetailData} />);
    expect(screen.getByText('Case not found')).toBeInTheDocument();
  });

  it('switching to Activities tab renders task content', () => {
    render(<CaseDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Activities'));
    // Activities tab renders DeadlineTracker which shows tasks
    expect(screen.getByText('Review docs')).toBeInTheDocument();
  });
});
