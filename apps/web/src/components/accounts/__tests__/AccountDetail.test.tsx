// @vitest-environment jsdom
/**
 * AccountDetail Tests (PG-134)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountDetail } from '../AccountDetail';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const getByIdMock = vi.fn();
const activityMock = vi.fn();
const oppsMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    account: {
      getById: { useQuery: (...args: unknown[]) => getByIdMock(...args) },
      getActivity: { useQuery: (...args: unknown[]) => activityMock(...args) },
      getOpportunities: { useQuery: (...args: unknown[]) => oppsMock(...args) },
    },
  },
}));

vi.mock('@/lib/pricing/calculator', () => ({
  formatCurrency: (v: number) => `$${v.toLocaleString()}`,
}));

vi.mock('../AccountCard', () => ({
  getAccountTier: () => 'MID_MARKET',
  TIER_CONFIG: {
    ENTERPRISE: { label: 'Enterprise', color: 'c1', dot: 'd1', avatarBg: 'a1' },
    MID_MARKET: { label: 'Mid-Market', color: 'c2', dot: 'd2', avatarBg: 'a2' },
    SMB: { label: 'SMB', color: 'c3', dot: 'd3', avatarBg: 'a3' },
    STARTUP: { label: 'Startup', color: 'c4', dot: 'd4', avatarBg: 'a4' },
    UNKNOWN: { label: 'Unknown', color: 'c5', dot: 'd5', avatarBg: 'a5' },
  },
}));

vi.mock('../AccountContactsList', () => ({
  AccountContactsList: () => <div data-testid="contacts-list">Contacts List</div>,
}));
vi.mock('../AccountOpportunitiesList', () => ({
  AccountOpportunitiesList: () => <div data-testid="opps-list">Opportunities List</div>,
}));
vi.mock('../RevenueChart', () => ({
  RevenueChart: () => <div data-testid="revenue-chart">Revenue Chart</div>,
}));
vi.mock('../AccountHierarchy', () => ({
  AccountHierarchy: () => <div data-testid="hierarchy">Hierarchy</div>,
}));

// Mock RelatedTasksCard to avoid tRPC context requirement
vi.mock('@/components/tasks/RelatedTasksCard', () => ({
  RelatedTasksCard: () => <div data-testid="related-tasks">Next Steps</div>,
}));

// Mock EntityActionSheet and MoreActionsButton to avoid tRPC context requirement
vi.mock('@/components/shared/entity-action-sheet', () => ({
  EntityActionSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="action-sheet">Action Sheet</div> : null,
}));
vi.mock('@/components/shared/more-actions-button', () => ({
  MoreActionsButton: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} data-testid="more-actions">
      More
    </button>
  ),
}));

vi.mock('@/components/home/PinButton', () => ({
  PinButton: () => <button data-testid="pin-button">Pin</button>,
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div className={`animate-pulse ${className ?? ''}`} />
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const mockAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'TechCorp Inc',
  website: { normalized: 'https://techcorp.com', withoutProtocol: 'techcorp.com' },
  industry: 'Technology',
  employees: 200,
  revenue: 5000000,
  description: 'A tech company',
  ownerId: 'owner-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  _count: { contacts: 5, opportunities: 3 },
};

const defaultProps = {
  accountId: '00000000-0000-4000-8000-000000000001',
  isAuthenticated: true,
};

describe('AccountDetail', () => {
  beforeEach(() => {
    getByIdMock.mockReset();
    activityMock.mockReset();
    oppsMock.mockReset();
    mockPush.mockReset();

    getByIdMock.mockReturnValue({
      data: mockAccount,
      isLoading: false,
      error: null,
    });
    activityMock.mockReturnValue({ data: null, isLoading: false, error: null });
    oppsMock.mockReturnValue({ data: null, isLoading: false, error: null });
  });

  it('shows loading skeleton while fetching', () => {
    getByIdMock.mockReturnValue({ data: null, isLoading: true, error: null });
    const { container } = render(<AccountDetail {...defaultProps} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows error state when account not found', () => {
    getByIdMock.mockReturnValue({ data: null, isLoading: false, error: new Error('Not found') });
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Account Not Found')).toBeInTheDocument();
  });

  it('renders account header with name and tier badge', () => {
    render(<AccountDetail {...defaultProps} />);
    // Name appears in breadcrumb, h1, h2 (profile card), and overview tab
    expect(screen.getAllByText('TechCorp Inc').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Mid-Market').length).toBeGreaterThanOrEqual(1);
  });

  it('renders key metrics in sidebar', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getAllByText('Revenue').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Employees').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Contacts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Opportunities').length).toBeGreaterThanOrEqual(1);
  });

  it('renders tab navigation', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    // "Hierarchy" appears in both the tab bar and the right sidebar heading
    expect(screen.getAllByText('Hierarchy').length).toBeGreaterThanOrEqual(1);
  });

  it('shows overview tab content by default', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Account Details')).toBeInTheDocument();
  });

  it('switches to contacts tab on click', async () => {
    const user = userEvent.setup();
    render(<AccountDetail {...defaultProps} />);
    // "Contacts" text appears in metric grid, tab bar, and sidebar — find the tab button
    const buttons = screen.getAllByRole('button');
    const contactsTab = buttons.find((b) => /^Contacts/.test(b.textContent || ''));
    await user.click(contactsTab!);
    await waitFor(() => {
      expect(screen.getByTestId('contacts-list')).toBeInTheDocument();
    });
  });

  it('switches to hierarchy tab on click', async () => {
    const user = userEvent.setup();
    render(<AccountDetail {...defaultProps} />);
    // "Hierarchy" appears as tab, sidebar heading, and quick action — find exact tab button
    const buttons = screen.getAllByRole('button');
    const hierarchyTab = buttons.find((b) => b.textContent === 'Hierarchy');
    await user.click(hierarchyTab!);
    await waitFor(() => {
      expect(screen.getByTestId('hierarchy')).toBeInTheDocument();
    });
  });

  it('renders website link in overview', () => {
    render(<AccountDetail {...defaultProps} />);
    const links = screen.getAllByText('techcorp.com');
    // There's a website link in both sidebar and overview tab
    const link = links.find((el) => el.closest('a'));
    expect(link).toBeInTheDocument();
    expect(link!.closest('a')).toHaveAttribute('href', 'https://techcorp.com');
  });

  it('shows edit button and more actions', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByTestId('more-actions')).toBeInTheDocument();
  });

  it('opens action sheet via more actions button', async () => {
    const user = userEvent.setup();
    render(<AccountDetail {...defaultProps} />);
    await user.click(screen.getByTestId('more-actions'));
    await waitFor(() => {
      expect(screen.getByTestId('action-sheet')).toBeInTheDocument();
    });
  });

  it('has breadcrumb link back to accounts list', () => {
    render(<AccountDetail {...defaultProps} />);
    const backLink = screen.getByText('Accounts').closest('a');
    expect(backLink).toHaveAttribute('href', '/accounts');
  });

  it('renders Back to Accounts link in error state', () => {
    getByIdMock.mockReturnValue({ data: null, isLoading: false, error: new Error('Not found') });
    render(<AccountDetail {...defaultProps} />);
    const backLink = screen.getByText('Back to Accounts').closest('a');
    expect(backLink).toHaveAttribute('href', '/accounts');
  });

  it('shows dash for missing revenue', () => {
    getByIdMock.mockReturnValue({
      data: { ...mockAccount, revenue: null },
      isLoading: false,
      error: null,
    });
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders 3-column grid layout', () => {
    const { container } = render(<AccountDetail {...defaultProps} />);
    const grid = container.querySelector('.grid.grid-cols-1.lg\\:grid-cols-12');
    expect(grid).not.toBeNull();
    // Left sidebar (col-span-3)
    expect(grid!.querySelector('.lg\\:col-span-3')).not.toBeNull();
    // Center content (col-span-6)
    expect(grid!.querySelector('.lg\\:col-span-6')).not.toBeNull();
  });

  it('renders account owner section', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Account Owner')).toBeInTheDocument();
  });

  it('renders quick actions in right sidebar', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('View Contacts')).toBeInTheDocument();
    expect(screen.getByText('View Opportunities')).toBeInTheDocument();
    expect(screen.getByText('View Hierarchy')).toBeInTheDocument();
  });

  it('renders account health section in right sidebar', () => {
    render(<AccountDetail {...defaultProps} />);
    expect(screen.getByText('Account Health')).toBeInTheDocument();
  });
});
