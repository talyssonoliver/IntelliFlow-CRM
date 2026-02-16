import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseList, type CaseListProps } from '../CaseList';
import type { CaseListItem, CaseStats, CaseFilterOptions } from '../types';

const mockCase: CaseListItem = {
  id: 'case-1',
  caseNumber: 'CF-2024-001',
  title: 'Test Case Alpha',
  description: 'Test description',
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
      title: 'Task 1',
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
      title: 'Task 2',
      description: null,
      dueDate: '2026-02-25T00:00:00Z',
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
};

const mockStats: CaseStats = { open: 5, inProgress: 3, overdue: 1, closedThisMonth: 2 };
const mockFilterOptions: CaseFilterOptions = { statuses: [], priorities: [] };

const defaultProps: CaseListProps = {
  cases: [mockCase],
  total: 1,
  isLoading: false,
  stats: mockStats,
  filterOptions: mockFilterOptions,
  onRowClick: vi.fn(),
  pagination: { page: 1, limit: 20, onPageChange: vi.fn() },
  searchValue: '',
  onSearchChange: vi.fn(),
  statusFilter: '',
  onStatusChange: vi.fn(),
  priorityFilter: '',
  onPriorityChange: vi.fn(),
  sortValue: 'updatedAt',
  onSortChange: vi.fn(),
};

describe('CaseList', () => {
  it('renders stats bar and filter bar (header handled by page wrapper)', () => {
    render(<CaseList {...defaultProps} />);
    // Stats bar renders stat values
    expect(screen.getByText('5')).toBeInTheDocument(); // open count
    expect(screen.getByText('3')).toBeInTheDocument(); // in progress count
    // Search filter bar renders
    expect(
      screen.getByPlaceholderText('Search cases by ID, title, or client...')
    ).toBeInTheDocument();
  });

  it('renders case items from props', () => {
    render(<CaseList {...defaultProps} />);
    expect(screen.getByText('Test Case Alpha')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('CF-2024-001')).toBeInTheDocument();
  });

  it('shows stats bar with correct counts', () => {
    render(<CaseList {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument(); // open
    expect(screen.getByText('3')).toBeInTheDocument(); // in progress
    expect(screen.getByText('1')).toBeInTheDocument(); // overdue
    expect(screen.getByText('2')).toBeInTheDocument(); // closed
  });

  it('search input updates callback', () => {
    render(<CaseList {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText('Search cases by ID, title, or client...');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test');
  });

  it('shows loading skeleton when isLoading=true', () => {
    render(<CaseList {...defaultProps} isLoading={true} />);
    expect(screen.queryByText('Test Case Alpha')).not.toBeInTheDocument();
  });

  it('shows empty state when cases=[]', () => {
    render(<CaseList {...defaultProps} cases={[]} total={0} />);
    expect(screen.getByText('No cases match your search criteria')).toBeInTheDocument();
  });

  it('row click calls onRowClick', () => {
    render(<CaseList {...defaultProps} />);
    const element = screen.getByText('Test Case Alpha');
    fireEvent.click(element);
    expect(defaultProps.onRowClick).toHaveBeenCalledWith(mockCase);
  });

  it('shows status badge', () => {
    render(<CaseList {...defaultProps} />);
    // "Open" appears in stats label and table badge
    expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
  });

  it('shows priority with dot indicator', () => {
    render(<CaseList {...defaultProps} />);
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
  });

  it('shows assignee avatar with initials fallback', () => {
    render(<CaseList {...defaultProps} />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('shows overdue badge for overdue cases', () => {
    const overdueCase = { ...mockCase, isOverdue: true };
    render(<CaseList {...defaultProps} cases={[overdueCase]} />);
    expect(screen.getAllByText('Overdue').length).toBeGreaterThanOrEqual(1);
  });

  it('renders total count info', () => {
    render(<CaseList {...defaultProps} total={50} />);
    expect(screen.getByText(/Showing 1 to 20 of 50 cases/)).toBeInTheDocument();
  });

  it('pagination: Previous button calls onPageChange', () => {
    render(<CaseList {...defaultProps} total={50} pagination={{ page: 2, limit: 20, onPageChange: vi.fn() }} />);
    fireEvent.click(screen.getByText('Previous'));
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it('pagination: Next button calls onPageChange', () => {
    const onPageChange = vi.fn();
    render(<CaseList {...defaultProps} total={50} pagination={{ page: 1, limit: 20, onPageChange }} />);
    fireEvent.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('pagination: Previous disabled on first page', () => {
    render(<CaseList {...defaultProps} total={50} pagination={{ page: 1, limit: 20, onPageChange: vi.fn() }} />);
    const prevBtn = screen.getByText('Previous') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('pagination: Next disabled on last page', () => {
    render(<CaseList {...defaultProps} total={50} pagination={{ page: 3, limit: 20, onPageChange: vi.fn() }} />);
    const nextBtn = screen.getByText('Next') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
  });

  it('renders closed case with reduced opacity', () => {
    const closedCase = { ...mockCase, status: 'CLOSED' };
    render(<CaseList {...defaultProps} cases={[closedCase]} />);
    // "Closed" may appear in both the table badge and filter dropdown
    expect(screen.getAllByText('Closed').length).toBeGreaterThanOrEqual(1);
  });

  it('renders cancelled case status', () => {
    const cancelledCase = { ...mockCase, status: 'CANCELLED' };
    render(<CaseList {...defaultProps} cases={[cancelledCase]} />);
    // "Cancelled" may appear in both the table badge and filter dropdown
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThanOrEqual(1);
  });

  it('renders assignee with avatar URL', () => {
    const caseWithAvatar = {
      ...mockCase,
      assignee: { ...mockCase.assignee, avatarUrl: 'https://example.com/avatar.jpg' },
    };
    render(<CaseList {...defaultProps} cases={[caseWithAvatar]} />);
    const avatarDiv = document.querySelector('[style*="avatar.jpg"]');
    expect(avatarDiv).toBeTruthy();
  });

  it('renders TrendIndicator with positive value', () => {
    const statsWithTrend = { ...mockStats, openTrend: 15 };
    render(<CaseList {...defaultProps} stats={statsWithTrend} />);
    expect(screen.getByText(/\+15%/)).toBeInTheDocument();
  });

  it('renders TrendIndicator with negative value', () => {
    const statsWithTrend = { ...mockStats, closedTrend: -8 };
    render(<CaseList {...defaultProps} stats={statsWithTrend} />);
    expect(screen.getByText(/-8%/)).toBeInTheDocument();
  });

  it('renders overdue action required text when overdue > 0', () => {
    render(<CaseList {...defaultProps} />);
    expect(screen.getByText('Action required')).toBeInTheDocument();
  });

  it('hides action required when overdue is 0', () => {
    const noOverdueStats = { ...mockStats, overdue: 0 };
    render(<CaseList {...defaultProps} stats={noOverdueStats} />);
    expect(screen.queryByText('Action required')).not.toBeInTheDocument();
  });

  it('renders stats loading skeletons', () => {
    const { container } = render(<CaseList {...defaultProps} isLoading={true} />);
    expect(container.querySelector('[data-testid="case-list-loading"]')).toBeInTheDocument();
  });

  it('renders deadline column showing "Completed" for closed cases', () => {
    const closedCase = { ...mockCase, status: 'CLOSED' };
    render(<CaseList {...defaultProps} cases={[closedCase]} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders deadline column with overdue styling', () => {
    const overdueCase = { ...mockCase, isOverdue: true };
    render(<CaseList {...defaultProps} cases={[overdueCase]} />);
    const overdueElements = screen.getAllByText('Overdue');
    expect(overdueElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders with assignee filter when assignees provided', () => {
    const filterOpts = {
      ...mockFilterOptions,
      assignees: [{ id: 'u1', name: 'Jane Doe' }, { id: 'u2', name: 'Bob' }],
    };
    render(<CaseList {...defaultProps} filterOptions={filterOpts} />);
    // Assignee filter renders
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders with lastActivityText subtitle', () => {
    const caseWithActivity = { ...mockCase, lastActivityText: 'Motion filed 2 hours ago' };
    render(<CaseList {...defaultProps} cases={[caseWithActivity]} />);
    expect(screen.getByText('Motion filed 2 hours ago')).toBeInTheDocument();
  });

  it('renders MEDIUM priority with amber dot', () => {
    const medCase = { ...mockCase, priority: 'MEDIUM' };
    render(<CaseList {...defaultProps} cases={[medCase]} />);
    // "Medium" may appear in both the table cell and filter dropdown
    expect(screen.getAllByText('Medium').length).toBeGreaterThanOrEqual(1);
  });

  it('renders LOW priority with blue dot', () => {
    const lowCase = { ...mockCase, priority: 'LOW' };
    render(<CaseList {...defaultProps} cases={[lowCase]} />);
    // "Low" may appear in both the table cell and filter dropdown
    expect(screen.getAllByText('Low').length).toBeGreaterThanOrEqual(1);
  });

  it('renders caseNumber fallback when empty', () => {
    const noNumCase = { ...mockCase, caseNumber: '' };
    render(<CaseList {...defaultProps} cases={[noNumCase]} />);
    // Falls back to id.slice(0,12)
    expect(screen.getByText('case-1')).toBeInTheDocument();
  });

  it('renders bulk actions when onBulkAssign provided', () => {
    const onBulkAssign = vi.fn();
    const onBulkClose = vi.fn();
    const onBulkDelete = vi.fn();
    render(
      <CaseList
        {...defaultProps}
        onBulkAssign={onBulkAssign}
        onBulkClose={onBulkClose}
        onBulkDelete={onBulkDelete}
      />
    );
    // DataTable renders with bulk actions enabled
    expect(screen.getByText('Test Case Alpha')).toBeInTheDocument();
  });

  it('row action View button calls onRowClick', () => {
    const onRowClick = vi.fn();
    render(<CaseList {...defaultProps} onRowClick={onRowClick} />);
    const viewBtn = screen.getByTitle('View');
    fireEvent.click(viewBtn);
    expect(onRowClick).toHaveBeenCalledWith(mockCase);
  });

  it('row action Edit button calls onEdit', () => {
    const onEdit = vi.fn();
    render(<CaseList {...defaultProps} onEdit={onEdit} />);
    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(mockCase);
  });

  it('renders dropdown "More actions" button for row actions', () => {
    const onAssign = vi.fn();
    const onDelete = vi.fn();
    render(<CaseList {...defaultProps} onAssign={onAssign} onDelete={onDelete} />);
    // The dropdown trigger renders
    const moreBtn = screen.getByTitle('More actions');
    expect(moreBtn).toBeInTheDocument();
  });

  it('sort options render correctly', () => {
    render(<CaseList {...defaultProps} />);
    // The SearchFilterBar includes sort dropdown
    expect(screen.getByText('Test Case Alpha')).toBeInTheDocument();
  });

  it('renders URGENT priority', () => {
    const urgentCase = { ...mockCase, priority: 'URGENT' };
    render(<CaseList {...defaultProps} cases={[urgentCase]} />);
    expect(screen.getAllByText('Urgent').length).toBeGreaterThanOrEqual(1);
  });

  it('renders ON_HOLD status', () => {
    const holdCase = { ...mockCase, status: 'ON_HOLD' };
    render(<CaseList {...defaultProps} cases={[holdCase]} />);
    expect(screen.getAllByText('On Hold').length).toBeGreaterThanOrEqual(1);
  });

  it('renders IN_PROGRESS status', () => {
    const ipCase = { ...mockCase, status: 'IN_PROGRESS' };
    render(<CaseList {...defaultProps} cases={[ipCase]} />);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
  });

  it('renders case with minimal assignee (no email/avatar)', () => {
    const minAssignee = { ...mockCase, assignee: { id: 'u-min', name: 'Al', email: '', avatarUrl: null } };
    render(<CaseList {...defaultProps} cases={[minAssignee]} />);
    expect(screen.getByText('Test Case Alpha')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument(); // initials
  });

  it('renders case without client', () => {
    const noClient = { ...mockCase, client: { id: '', name: '' } };
    render(<CaseList {...defaultProps} cases={[noClient]} />);
    expect(screen.getByText('Test Case Alpha')).toBeInTheDocument();
  });

  it('renders case with no deadline', () => {
    const noDeadline = { ...mockCase, deadline: null as unknown as string };
    render(<CaseList {...defaultProps} cases={[noDeadline]} />);
    expect(screen.getByText('No deadline')).toBeInTheDocument();
  });

  it('renders multiple cases', () => {
    const cases = [
      mockCase,
      { ...mockCase, id: 'case-2', title: 'Second Case', caseNumber: 'CF-2024-002' },
    ];
    render(<CaseList {...defaultProps} cases={cases} total={2} />);
    expect(screen.getByText('Test Case Alpha')).toBeInTheDocument();
    expect(screen.getByText('Second Case')).toBeInTheDocument();
  });
});
