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
    { id: 't1', title: 'Task 1', description: null, dueDate: '2026-02-20T00:00:00Z', status: 'COMPLETED', assignee: null, isOverdue: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: '2026-02-10T00:00:00Z' },
    { id: 't2', title: 'Task 2', description: null, dueDate: '2026-02-25T00:00:00Z', status: 'PENDING', assignee: null, isOverdue: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: null },
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
  statusFilter: [],
  onStatusChange: vi.fn(),
  priorityFilter: [],
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
    expect(screen.getByPlaceholderText('Search cases by ID, title, or client...')).toBeInTheDocument();
  });

  it('renders case items from props', () => {
    render(<CaseList {...defaultProps} />);
    // Both mobile card and desktop row render — check at least one exists
    expect(screen.getAllByText('Test Case Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CF-2024-001').length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByText('No cases found')).toBeInTheDocument();
  });

  it('row click calls onRowClick', () => {
    render(<CaseList {...defaultProps} />);
    // Both mobile card and desktop row render — click the first one
    const elements = screen.getAllByText('Test Case Alpha');
    fireEvent.click(elements[0]);
    expect(defaultProps.onRowClick).toHaveBeenCalledWith(mockCase);
  });

  it('shows status badge', () => {
    render(<CaseList {...defaultProps} />);
    // "Open" appears in stats label and table badge
    const openElements = screen.getAllByText('Open');
    expect(openElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows priority with dot indicator', () => {
    render(<CaseList {...defaultProps} />);
    // "High" appears in stats and priority column
    const highElements = screen.getAllByText('High');
    expect(highElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows assignee avatar with initials fallback', () => {
    render(<CaseList {...defaultProps} />);
    // Mobile card + desktop table both render (CSS hidden), so multiple JD initials exist
    const jdElements = screen.getAllByText('JD');
    expect(jdElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows overdue badge for overdue cases', () => {
    const overdueCase = { ...mockCase, isOverdue: true };
    render(<CaseList {...defaultProps} cases={[overdueCase]} />);
    const overdueElements = screen.getAllByText('Overdue');
    expect(overdueElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders pagination showing count', () => {
    render(<CaseList {...defaultProps} total={50} />);
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
  });
});
