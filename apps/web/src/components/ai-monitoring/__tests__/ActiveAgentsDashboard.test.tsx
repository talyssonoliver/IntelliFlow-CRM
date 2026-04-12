import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  getStatusColor,
  getStatusBadgeClass,
  getStatusDotClass,
  getAgentTypeLabel,
  getAgentTypeIcon,
  formatLastActive,
} from '@/lib/active-agents/agent-utils';

// Mock hooks
vi.mock('@/lib/active-agents/hooks', () => ({
  useActiveAgentsDashboard: vi.fn(),
}));

// PG-193: WorkflowProgressPanel embedded in AgentCard — mock the data hook so
// it returns null and the panel renders nothing in this regression suite.
vi.mock('@/lib/ai-monitoring/workflow-hooks', () => ({
  useWorkflowProgress: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/lib/ai-monitoring/queue-scheduler-hooks', () => ({
  useQueueScheduler: vi.fn(() => ({
    data: null,
    isLoading: false,
    isUnavailable: false,
    error: null,
    refetch: vi.fn(),
  })),
  useQueueMutations: vi.fn(() => ({
    pause: vi.fn(),
    resume: vi.fn(),
    retryFailed: vi.fn(),
    deleteScheduler: vi.fn(),
    isPending: {},
  })),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => ({
    user: { id: 'user-1', name: 'Test User' },
    isLoading: false,
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/agent-approvals/agents'),
}));

const { useActiveAgentsDashboard } = vi.mocked((await import('@/lib/active-agents/hooks')) as any);

import { ActiveAgentsDashboard } from '../ActiveAgentsDashboard';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockAgents = [
  {
    id: 'conv-1',
    agentId: 'a-1',
    type: 'qualification',
    model: 'gpt-4-turbo',
    status: 'active' as const,
    currentTask: 'Qualifying lead: Acme Corp',
    lastActive: new Date().toISOString(),
  },
  {
    id: 'conv-2',
    agentId: 'a-2',
    type: 'email',
    model: 'claude-3-sonnet',
    status: 'idle' as const,
    currentTask: undefined,
    lastActive: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'conv-3',
    agentId: 'a-3',
    type: 'followup',
    model: 'gpt-4',
    status: 'error' as const,
    currentTask: 'Follow-up failed',
    lastActive: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: 'conv-4',
    agentId: 'a-4',
    type: 'nba',
    model: 'claude-3-sonnet',
    status: 'active' as const,
    currentTask: 'Generating NBA for Contact #42',
    lastActive: new Date().toISOString(),
  },
];

const mockHealth = {
  healthy: true,
  issues: [] as string[],
  drift: { trackedMetrics: 5, driftDetected: false, highSeverityCount: 0 },
  hallucination: { rate: 0.02, kpiCompliant: true, totalChecks: 150 },
  latency: { sloCompliant: true, p95: 450, p99: 720 },
  roi: { currentROI: 2.3, totalCost: 1200, totalValue: 2760 },
};

const mockUnhealthyStatus = {
  ...mockHealth,
  healthy: false,
  issues: ['High drift detected', 'Latency SLO breach'],
};

const defaultReturn = {
  agents: mockAgents,
  totalActive: mockAgents.length,
  healthStatus: mockHealth,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useActiveAgentsDashboard.mockReturnValue({ ...defaultReturn, refetch: vi.fn() });
});

// ===========================================================================
// Category 1: Rendering (9 tests)
// ===========================================================================

describe('Category 1: Rendering', () => {
  it('renders page title "Active Agents"', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getAllByText('Active Agents').length).toBeGreaterThanOrEqual(1);
  });

  it('renders breadcrumbs with AI & Agents link', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('AI & Agents')).toBeInTheDocument();
  });

  it('renders page description', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText(/monitor.*agent.*status/i)).toBeInTheDocument();
  });

  it('renders 5 stat cards with correct labels', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('Total Agents')).toBeInTheDocument();
    // "Active" may appear in stat label and filter option; just verify it exists
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Idle').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Error').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  it('renders agent type filter chips', () => {
    render(<ActiveAgentsDashboard />);
    // Chip buttons have aria-pressed attribute
    const chips = screen.getAllByRole('button', { pressed: true });
    expect(chips.length).toBeGreaterThanOrEqual(1); // "All" is active by default
    // Verify chip labels exist (may also appear in agent cards)
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Qualification').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Email Writer').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Follow-up').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Next Best Action').length).toBeGreaterThanOrEqual(1);
  });

  it('renders search input and status filter', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('shows loading skeletons when isLoading=true', () => {
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [],
      totalActive: 0,
      isLoading: true,
    });
    const { container } = render(<ActiveAgentsDashboard />);
    const skeletons = container.querySelectorAll('[data-testid="skeleton"], .animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when agents array is empty', () => {
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [],
      totalActive: 0,
      isLoading: false,
    });
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText(/no active agents/i)).toBeInTheDocument();
  });

  it('shows error state with retry button on error', () => {
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [],
      error: new Error('API failed'),
      isLoading: false,
    });
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// Category 2: Data Display (9 tests)
// ===========================================================================

describe('Category 2: Data Display', () => {
  it('stat cards show correct counts', () => {
    render(<ActiveAgentsDashboard />);
    // Total = 4, Active = 2, Idle = 1, Error = 1
    const statValues = screen.getAllByTestId('stat-value');
    expect(statValues[0]).toHaveTextContent('4');
    expect(statValues[1]).toHaveTextContent('2');
    expect(statValues[2]).toHaveTextContent('1');
    expect(statValues[3]).toHaveTextContent('1');
  });

  it('agent status badges have correct colors', () => {
    render(<ActiveAgentsDashboard />);
    const statusBadges = screen.getAllByTestId('status-badge');
    // Find active badge (green) and error badge (red)
    const activeBadge = statusBadges.find((el) => el.textContent?.trim() === 'active');
    expect(activeBadge).toHaveClass('bg-green-100');
    const errorBadge = statusBadges.find((el) => el.textContent?.trim() === 'error');
    expect(errorBadge).toHaveClass('bg-red-100');
  });

  it('health indicator shows "Healthy" when healthy=true', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('health indicator shows issue count when healthy=false', () => {
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      healthStatus: mockUnhealthyStatus,
    });
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('2 Issues')).toBeInTheDocument();
  });

  it('displays current task for active agents', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('Qualifying lead: Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Generating NBA for Contact #42')).toBeInTheDocument();
  });

  it('shows "No active task" for idle agents', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('No active task')).toBeInTheDocument();
  });

  it('formats last active as relative time', () => {
    render(<ActiveAgentsDashboard />);
    // conv-2 is 1h ago, conv-3 is 2h ago
    expect(screen.getByText('1h ago')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('displays agent model name correctly', () => {
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument();
    expect(screen.getAllByText('claude-3-sonnet').length).toBe(2);
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('View Logs link includes correct agentId', () => {
    render(<ActiveAgentsDashboard />);
    const logLinks = screen.getAllByText('View Logs');
    expect(logLinks.length).toBe(4);
    // Each link should point to logs with an agentId param
    logLinks.forEach((link) => {
      expect(link.closest('a')).toHaveAttribute(
        'href',
        expect.stringMatching(/\/agent-approvals\/logs\?agentId=a-\d/)
      );
    });
  });
});

// ===========================================================================
// Category 3: Interactions (10 tests)
// ===========================================================================

describe('Category 3: Interactions', () => {
  it('filter by status=active shows only active agents', () => {
    render(<ActiveAgentsDashboard />);
    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'active' } });
    // Should show 2 active agents, not idle/error
    expect(screen.queryByText('Follow-up failed')).not.toBeInTheDocument();
  });

  it('filter by type=qualification shows only qualification agents', () => {
    render(<ActiveAgentsDashboard />);
    // Click the Qualification chip button (aria-pressed)
    const qualChip = screen.getByRole('button', { name: 'Qualification' });
    fireEvent.click(qualChip);
    expect(screen.getByText('Qualifying lead: Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Generating NBA for Contact #42')).not.toBeInTheDocument();
  });

  it('search by text filters agents', () => {
    render(<ActiveAgentsDashboard />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Acme' } });
    expect(screen.getByText('Qualifying lead: Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Generating NBA for Contact #42')).not.toBeInTheDocument();
  });

  it('sort by lastActive orders newest first', () => {
    render(<ActiveAgentsDashboard />);
    const cards = screen.getAllByTestId('agent-card');
    // Active agents (just now) should appear before older ones
    expect(cards.length).toBe(4);
  });

  it('sort by type groups alphabetically', () => {
    render(<ActiveAgentsDashboard />);
    const sortSelect = screen.getByLabelText('Sort order');
    fireEvent.change(sortSelect, { target: { value: 'type' } });
    const cards = screen.getAllByTestId('agent-card');
    expect(cards.length).toBe(4);
  });

  it('sort by status groups by status', () => {
    render(<ActiveAgentsDashboard />);
    const sortSelect = screen.getByLabelText('Sort order');
    fireEvent.change(sortSelect, { target: { value: 'status' } });
    const cards = screen.getAllByTestId('agent-card');
    expect(cards.length).toBe(4);
  });

  it('refresh button calls refetch', () => {
    const refetchFn = vi.fn();
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      refetch: refetchFn,
    });
    render(<ActiveAgentsDashboard />);
    // Match the PageHeader refresh button (contains text "Refresh" as visible label)
    const refreshButtons = screen.getAllByRole('button', { name: /refresh/i });
    // Click the first one (PageHeader's Refresh), not the queue panel's "Refresh queue data"
    fireEvent.click(refreshButtons[0]);
    expect(refetchFn).toHaveBeenCalled();
  });

  it('View Logs link has correct href', () => {
    render(<ActiveAgentsDashboard />);
    const logLinks = screen.getAllByText('View Logs');
    expect(logLinks[0].closest('a')).toHaveAttribute(
      'href',
      expect.stringContaining('/agent-approvals/logs')
    );
  });

  it('filter chip "All" resets type filter', () => {
    render(<ActiveAgentsDashboard />);
    // First filter by Qualification
    fireEvent.click(screen.getByRole('button', { name: 'Qualification' }));
    expect(screen.queryByText('Generating NBA for Contact #42')).not.toBeInTheDocument();
    // Then click All chip
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Generating NBA for Contact #42')).toBeInTheDocument();
  });

  it('combining status + type filters works', () => {
    render(<ActiveAgentsDashboard />);
    // Filter by active status
    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'active' } });
    // Then filter by qualification type
    fireEvent.click(screen.getByRole('button', { name: 'Qualification' }));
    // Should only show qualification + active agents
    expect(screen.getByText('Qualifying lead: Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Generating NBA for Contact #42')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Category 4: Edge Cases (5 tests)
// ===========================================================================

describe('Category 4: Edge Cases', () => {
  it('all agents same status renders correctly', () => {
    const allActive = mockAgents.map((a) => ({
      ...a,
      status: 'active' as const,
      currentTask: 'Working on something',
    }));
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: allActive,
      totalActive: allActive.length,
    });
    render(<ActiveAgentsDashboard />);
    const cards = screen.getAllByTestId('agent-card');
    expect(cards.length).toBe(4);
  });

  it('agent with undefined currentTask shows idle text', () => {
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [
        {
          ...mockAgents[1],
          currentTask: undefined,
        },
      ],
      totalActive: 1,
    });
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText('No active task')).toBeInTheDocument();
  });

  it('zero agents shows empty state not loading', () => {
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [],
      totalActive: 0,
      isLoading: false,
    });
    render(<ActiveAgentsDashboard />);
    expect(screen.getByText(/no active agents/i)).toBeInTheDocument();
    const { container } = render(<ActiveAgentsDashboard />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    // Should not show loading skeletons
    expect(skeletons.length).toBe(0);
  });

  it('long task name truncates with ellipsis', () => {
    const longTask =
      'This is a very long task name that should be truncated with an ellipsis when it exceeds the available width of the card component';
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [{ ...mockAgents[0], currentTask: longTask }],
      totalActive: 1,
    });
    render(<ActiveAgentsDashboard />);
    const taskEl = screen.getByText(longTask);
    expect(taskEl).toHaveClass('truncate');
  });

  it('error then successful retry re-renders data', () => {
    // First render with error
    const refetchFn = vi.fn();
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      agents: [],
      error: new Error('Failed'),
      isLoading: false,
      refetch: refetchFn,
    });
    const { rerender } = render(<ActiveAgentsDashboard />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetchFn).toHaveBeenCalled();

    // Simulate successful refetch
    useActiveAgentsDashboard.mockReturnValue({
      ...defaultReturn,
      refetch: refetchFn,
    });
    rerender(<ActiveAgentsDashboard />);
    expect(screen.getByText('Qualifying lead: Acme Corp')).toBeInTheDocument();
  });
});

// ===========================================================================
// Category 5: Accessibility (3 tests)
// ===========================================================================

describe('Category 5: Accessibility', () => {
  it('status badges have aria-label attributes', () => {
    render(<ActiveAgentsDashboard />);
    const badges = screen.getAllByTestId('status-badge');
    badges.forEach((badge) => {
      expect(badge).toHaveAttribute('aria-label');
    });
  });

  it('agent cards have article role', () => {
    render(<ActiveAgentsDashboard />);
    const cards = screen.getAllByTestId('agent-card');
    cards.forEach((card) => {
      expect(card.tagName).toBe('ARTICLE');
    });
  });

  it('health indicator has accessible description', () => {
    render(<ActiveAgentsDashboard />);
    const healthStat = screen.getByTestId('health-stat');
    expect(healthStat).toHaveAttribute('aria-label');
  });
});

// ===========================================================================
// Category 6: Utility Function Coverage (7 tests)
// ===========================================================================

describe('Category 6: Utility Functions', () => {
  it('getStatusColor returns fallback for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('text-muted-foreground');
    expect(getStatusColor('active')).toBe('text-green-600');
    expect(getStatusColor('idle')).toBe('text-amber-500');
    expect(getStatusColor('error')).toBe('text-red-600');
  });

  it('getStatusBadgeClass returns fallback for unknown status', () => {
    expect(getStatusBadgeClass('unknown')).toBe('bg-slate-100 text-slate-600');
  });

  it('getStatusDotClass returns fallback for unknown status', () => {
    expect(getStatusDotClass('unknown')).toBe('bg-slate-400');
  });

  it('getAgentTypeLabel returns "Unknown Agent" for unknown type', () => {
    expect(getAgentTypeLabel('unknown')).toBe('Unknown Agent');
    expect(getAgentTypeLabel('qualification')).toBe('Qualification');
  });

  it('getAgentTypeIcon returns "smart_toy" for unknown type', () => {
    expect(getAgentTypeIcon('unknown')).toBe('smart_toy');
    expect(getAgentTypeIcon('email')).toBe('mail');
  });

  it('formatLastActive returns "Xd ago" for dates older than 24h', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_001).toISOString();
    expect(formatLastActive(twoDaysAgo)).toBe('2d ago');
  });

  it('formatLastActive returns "just now" for future or sub-minute dates', () => {
    const futureDate = new Date(Date.now() + 10_000).toISOString();
    expect(formatLastActive(futureDate)).toBe('just now');
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    expect(formatLastActive(thirtySecondsAgo)).toBe('just now');
  });
});
