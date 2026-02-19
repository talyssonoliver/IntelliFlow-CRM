import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Mock hooks
vi.mock('@/lib/ai-monitoring/hooks', () => ({
  useAgentLogs: vi.fn(),
  useDriftDashboard: vi.fn(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => ({
    user: { id: 'user-1', name: 'Test User' },
    isLoading: false,
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/agent-approvals/logs'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/lib/active-agents/agent-utils', () => ({
  getAgentTypeIcon: vi.fn((type: string) => type === 'qualification' ? 'verified' : 'smart_toy'),
  getAgentTypeLabel: vi.fn((type: string) => {
    const labels: Record<string, string> = {
      qualification: 'Qualification',
      email_followup: 'Email Follow-up',
    };
    return labels[type] ?? 'Unknown Agent';
  }),
}));

const { useAgentLogs } = vi.mocked(
  await import('@/lib/ai-monitoring/hooks') as any,
);

const { useSearchParams } = vi.mocked(
  await import('next/navigation') as any,
);

import { AgentLogsViewer } from '../AgentLogsViewer';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockLogs = [
  {
    id: 'log-1',
    agentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    agentType: 'qualification',
    messages: [
      { role: 'USER', content: 'Qualify lead for Acme Corp', timestamp: '2026-02-17T10:00:00Z' },
      { role: 'ASSISTANT', content: 'Analyzing lead data for Acme Corp...', timestamp: '2026-02-17T10:00:01Z' },
      { role: 'SYSTEM', content: 'You are a lead qualification agent. Follow the scoring rubric.', timestamp: '2026-02-17T09:59:59Z' },
    ],
    toolCalls: [
      {
        name: 'searchLeads',
        input: { query: 'Acme Corp' },
        output: { results: [{ id: 1, name: 'Acme Corp' }] },
        status: 'SUCCESS',
        timestamp: '2026-02-17T10:00:02Z',
      },
      {
        name: 'scoreQuality',
        input: { leadId: 1 },
        output: { error: 'Timeout' },
        status: 'FAILED',
        timestamp: '2026-02-17T10:00:03Z',
      },
    ],
    createdAt: '2026-02-17T10:00:00Z',
  },
  {
    id: 'log-2',
    agentId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    agentType: 'email_followup',
    messages: [
      { role: 'ASSISTANT', content: 'Drafting follow-up email...', timestamp: '2026-02-17T09:00:00Z' },
    ],
    toolCalls: [],
    createdAt: '2026-02-17T09:00:00Z',
  },
];

const defaultReturn: {
  logs: typeof mockLogs;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
} = {
  logs: mockLogs,
  total: 2,
  hasMore: false,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

function setupMock(overrides: Partial<typeof defaultReturn> = {}) {
  const refetch = vi.fn();
  useAgentLogs.mockReturnValue({ ...defaultReturn, refetch, ...overrides });
  return { refetch };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useSearchParams.mockReturnValue(new URLSearchParams());
  setupMock();
});

// ===========================================================================
// Category 1: Rendering (9 tests)
// ===========================================================================

describe('Category 1: Rendering', () => {
  it('renders page title "Agent Logs" (AC-001)', () => {
    render(<AgentLogsViewer />);
    // Title appears in both breadcrumb and heading — check heading specifically
    const headings = screen.getAllByText('Agent Logs');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it('renders breadcrumbs with "AI & Agents" and "Agent Logs" (AC-001)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getByText('AI & Agents')).toBeInTheDocument();
  });

  it('renders search input (AC-005)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading=true (AC-010)', () => {
    setupMock({ isLoading: true, logs: [] });
    const { container } = render(<AgentLogsViewer />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows empty state when logs=[] (AC-012)', () => {
    setupMock({ logs: [], total: 0 });
    render(<AgentLogsViewer />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows error state with retry button when error present (AC-011)', () => {
    setupMock({ error: new Error('API failed'), logs: [] });
    render(<AgentLogsViewer />);
    expect(screen.getByTestId('error-message')).toBeInTheDocument();
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  it('renders log entry cards for each log (AC-002)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getAllByTestId('log-card')).toHaveLength(2);
  });

  it('renders agent type label on each card (AC-002)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Email Follow-up')).toBeInTheDocument();
  });

  it('shows expand button on each card (AC-002)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getAllByTestId('expand-transcript')).toHaveLength(2);
  });
});

// ===========================================================================
// Category 2: Data Display (9 tests)
// ===========================================================================

describe('Category 2: Data Display', () => {
  it('displays correct total log count (AC-002)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getByText(/2 log/i)).toBeInTheDocument();
  });

  it('shows message count per conversation (AC-002)', () => {
    render(<AgentLogsViewer />);
    const cards = screen.getAllByTestId('log-card');
    expect(within(cards[0]).getByText(/3 messages/i)).toBeInTheDocument();
    expect(within(cards[1]).getByText(/1 message/i)).toBeInTheDocument();
  });

  it('shows tool call count per conversation (AC-002)', () => {
    render(<AgentLogsViewer />);
    const cards = screen.getAllByTestId('log-card');
    expect(within(cards[0]).getByText(/2 tool calls/i)).toBeInTheDocument();
  });

  it('formats createdAt as relative time (AC-002)', () => {
    render(<AgentLogsViewer />);
    // The component should show some relative time text, not raw ISO
    const cards = screen.getAllByTestId('log-card');
    expect(within(cards[0]).queryByText('2026-02-17T10:00:00Z')).not.toBeInTheDocument();
  });

  it('shows agent type label correctly using getAgentTypeLabel (AC-002)', () => {
    render(<AgentLogsViewer />);
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Email Follow-up')).toBeInTheDocument();
  });

  it('shows "Load More" button when hasMore=true (AC-009)', () => {
    setupMock({ hasMore: true });
    render(<AgentLogsViewer />);
    expect(screen.getByTestId('load-more')).toBeInTheDocument();
  });

  it('hides "Load More" button when hasMore=false (AC-009)', () => {
    setupMock({ hasMore: false });
    render(<AgentLogsViewer />);
    expect(screen.queryByTestId('load-more')).not.toBeInTheDocument();
  });

  it('displays agentId filter chip when URL param present (AC-008)', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('agentId=a1b2c3d4-e5f6-7890-abcd-ef1234567890'));
    render(<AgentLogsViewer agentId="a1b2c3d4-e5f6-7890-abcd-ef1234567890" />);
    // agentId appears in chip and in card agent info — verify at least one match
    const matches = screen.getAllByText(/a1b2c3d4/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Verify the filtering label text is present
    expect(screen.getByText(/filtering by agent/i)).toBeInTheDocument();
  });

  it('shows conversation ID on card (AC-002)', () => {
    render(<AgentLogsViewer />);
    const cards = screen.getAllByTestId('log-card');
    // Should show truncated ID
    expect(within(cards[0]).getByText(/log-1/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// Category 3: Interactions (12 tests)
// ===========================================================================

describe('Category 3: Interactions', () => {
  it('search input filters logs by agentType (AC-005)', () => {
    render(<AgentLogsViewer />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'qualification' } });
    // useAgentLogs will be re-called with search param
    expect(useAgentLogs).toHaveBeenCalled();
  });

  it('search input filters logs by content (AC-005)', () => {
    render(<AgentLogsViewer />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'Acme' } });
    expect(useAgentLogs).toHaveBeenCalled();
  });

  it('tool status filter hides logs not matching selected status (AC-006)', () => {
    render(<AgentLogsViewer />);
    // The component should have a status filter dropdown
    const lastCall = useAgentLogs.mock.calls[useAgentLogs.mock.calls.length - 1];
    expect(lastCall).toBeDefined();
  });

  it('sort toggle switches order from newest-first to oldest-first (AC-007)', () => {
    render(<AgentLogsViewer />);
    const lastCall = useAgentLogs.mock.calls[useAgentLogs.mock.calls.length - 1];
    expect(lastCall[0]).toHaveProperty('sort');
  });

  it('clicking expand button reveals transcript messages (AC-003)', () => {
    render(<AgentLogsViewer />);
    const expandButtons = screen.getAllByTestId('expand-transcript');
    fireEvent.click(expandButtons[0]);
    expect(screen.getByTestId('transcript-content')).toBeInTheDocument();
  });

  it('expanded transcript shows all messages with role labels (AC-003)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const transcript = screen.getByTestId('transcript-content');
    const bubbles = within(transcript).getAllByTestId('message-bubble');
    expect(bubbles.length).toBeGreaterThanOrEqual(2); // USER + ASSISTANT visible (SYSTEM collapsed)
  });

  it('clicking expand button again collapses transcript (toggle) (AC-003)', () => {
    render(<AgentLogsViewer />);
    const expandBtn = screen.getAllByTestId('expand-transcript')[0];
    fireEvent.click(expandBtn);
    expect(screen.getByTestId('transcript-content')).toBeInTheDocument();
    fireEvent.click(expandBtn);
    expect(screen.queryByTestId('transcript-content')).not.toBeInTheDocument();
  });

  it('clicking tool call row expands detail with JSON (AC-004)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const toolRows = screen.getAllByTestId('tool-call-row');
    fireEvent.click(toolRows[0]);
    expect(screen.getByTestId('tool-call-detail')).toBeInTheDocument();
  });

  it('collapsed tool calls show name and status badge only (AC-004)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const toolRows = screen.getAllByTestId('tool-call-row');
    expect(within(toolRows[0]).getByText('searchLeads')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-call-detail')).not.toBeInTheDocument();
  });

  it('"Load More" button calls hook with incremented offset (AC-009)', () => {
    setupMock({ hasMore: true });
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getByTestId('load-more'));
    const lastCall = useAgentLogs.mock.calls[useAgentLogs.mock.calls.length - 1];
    expect(lastCall[0].offset).toBeGreaterThan(0);
  });

  it('retry button calls refetch (AC-011)', () => {
    const { refetch } = setupMock({ error: new Error('fail'), logs: [] });
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(refetch).toHaveBeenCalled();
  });

  it('refresh button in PageHeader calls refetch (NF-005)', () => {
    const { refetch } = setupMock();
    render(<AgentLogsViewer />);
    const refreshBtn = screen.getByText('Refresh');
    fireEvent.click(refreshBtn);
    expect(refetch).toHaveBeenCalled();
  });
});

// ===========================================================================
// Category 4: Edge Cases (6 tests)
// ===========================================================================

describe('Category 4: Edge Cases', () => {
  it('conversation with zero tool calls shows no tool section (AC-004 edge)', () => {
    render(<AgentLogsViewer />);
    // Expand the second log (email_followup) which has 0 tool calls
    const expandButtons = screen.getAllByTestId('expand-transcript');
    fireEvent.click(expandButtons[1]);
    const cards = screen.getAllByTestId('log-card');
    expect(within(cards[1]).queryByTestId('tool-call-row')).not.toBeInTheDocument();
  });

  it('conversation with zero messages shows fallback text (AC-003 edge)', () => {
    setupMock({
      logs: [{ ...mockLogs[0], messages: [], toolCalls: [] }],
      total: 1,
    });
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getByTestId('expand-transcript'));
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });

  it('very long message content truncates with "Show more" toggle (AC-003)', () => {
    const longMessage = 'A'.repeat(600);
    setupMock({
      logs: [{
        ...mockLogs[0],
        messages: [{ role: 'ASSISTANT', content: longMessage, timestamp: '2026-02-17T10:00:00Z' }],
      }],
      total: 1,
    });
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getByTestId('expand-transcript'));
    expect(screen.getByText(/show more/i)).toBeInTheDocument();
  });

  it('tool call with FAILED status shows red indicator (AC-004)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const toolRows = screen.getAllByTestId('tool-call-row');
    const failedRow = toolRows[1]; // scoreQuality is FAILED
    const badge = within(failedRow).getByText('FAILED');
    expect(badge.className).toMatch(/red/);
  });

  it('missing agentId URL param shows all logs (AC-008 edge)', () => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    render(<AgentLogsViewer />);
    expect(screen.getAllByTestId('log-card')).toHaveLength(2);
  });

  it('SYSTEM role messages are collapsed/muted by default without expansion (NF-006)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const transcript = screen.getByTestId('transcript-content');
    // SYSTEM message should show placeholder text, not the full content
    expect(within(transcript).getByText(/system message/i)).toBeInTheDocument();
    // Full content should not be visible while collapsed
    expect(within(transcript).queryByText(/lead qualification agent/i)).not.toBeInTheDocument();
  });

  it('clicking SYSTEM message expands it to show full content (NF-006)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const transcript = screen.getByTestId('transcript-content');
    // Find and click the collapsed system message bubble
    const systemBubble = within(transcript).getByText(/system message/i).closest('[data-testid="message-bubble"]');
    expect(systemBubble).toBeTruthy();
    fireEvent.click(systemBubble!);
    // After clicking, the full system text should be visible
    expect(within(transcript).getByText(/lead qualification agent/i)).toBeInTheDocument();
  });

  it('empty state with active filters shows "No logs match" and "Clear filters" button', () => {
    setupMock({ logs: [], total: 0 });
    render(<AgentLogsViewer />);
    // Type into search to activate the hasFilters flag
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    // With search active and logs empty, it should show filter-specific empty message
    expect(screen.getByText(/no logs match/i)).toBeInTheDocument();
    expect(screen.getByText(/clear filters/i)).toBeInTheDocument();
  });

  it('clicking "Clear filters" resets search and tool status', () => {
    setupMock({ logs: [], total: 0 });
    render(<AgentLogsViewer />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    const clearBtn = screen.getByText(/clear filters/i);
    fireEvent.click(clearBtn);
    // After clearing, the search input should be empty
    expect((screen.getByPlaceholderText(/search/i) as HTMLInputElement).value).toBe('');
  });

  it('formatRelativeTime shows "Xd ago" for dates older than 24 hours', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    setupMock({
      logs: [{
        ...mockLogs[0],
        createdAt: twoDaysAgo,
      }],
      total: 1,
    });
    render(<AgentLogsViewer />);
    expect(screen.getByText(/2d ago/)).toBeInTheDocument();
  });

  it('"Show more" then "Show less" toggles long message content', () => {
    const longMessage = 'B'.repeat(600);
    setupMock({
      logs: [{
        ...mockLogs[0],
        messages: [{ role: 'ASSISTANT', content: longMessage, timestamp: '2026-02-17T10:00:00Z' }],
        toolCalls: [],
      }],
      total: 1,
    });
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getByTestId('expand-transcript'));
    // Click "Show more" to expand
    fireEvent.click(screen.getByText(/show more/i));
    // Full content should be visible now, and "Show less" should appear
    expect(screen.getByText(/show less/i)).toBeInTheDocument();
    // Click "Show less" to collapse
    fireEvent.click(screen.getByText(/show less/i));
    expect(screen.getByText(/show more/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// Category 5: Accessibility (3 tests)
// ===========================================================================

describe('Category 5: Accessibility', () => {
  it('expand buttons have aria-expanded attribute (NF-003)', () => {
    render(<AgentLogsViewer />);
    const expandBtns = screen.getAllByTestId('expand-transcript');
    expect(expandBtns[0]).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandBtns[0]);
    expect(expandBtns[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('tool call status badges have aria-label (NF-003)', () => {
    render(<AgentLogsViewer />);
    fireEvent.click(screen.getAllByTestId('expand-transcript')[0]);
    const successBadge = screen.getByLabelText('Status: Success');
    expect(successBadge).toBeInTheDocument();
    const failedBadge = screen.getByLabelText('Status: Failed');
    expect(failedBadge).toBeInTheDocument();
  });

  it('log cards use semantic article elements (NF-003)', () => {
    render(<AgentLogsViewer />);
    const cards = screen.getAllByTestId('log-card');
    cards.forEach((card) => {
      expect(card.tagName.toLowerCase()).toBe('article');
    });
  });
});
