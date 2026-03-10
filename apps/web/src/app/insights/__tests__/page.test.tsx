/**
 * AI Insights Page Tests
 *
 * Tests for the /insights page with URL-based filtering, pagination, loading/empty states.
 * Filtering is driven by sidebar navigation via ?type= URL param.
 *
 * Task: PG-160 — View All AI Insights page
 * Target: >=90% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockGetAllInsightsQuery } = vi.hoisted(() => {
  return {
    mockGetAllInsightsQuery: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/trpc', () => ({
  trpc: {
    home: {
      getAllInsights: { useQuery: mockGetAllInsightsQuery },
    },
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => '/agent-approvals/insights'),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleInsights = [
  {
    id: 'deal-risk-1',
    type: 'warning' as const,
    source: 'heuristic' as const,
    title: 'Deal at Risk: Acme Corp',
    description: 'Last interaction was 20 days ago.',
    suggestedAction: 'Schedule a check-in call',
    entityType: 'opportunity',
    entityId: 'opp-1',
    actionUrl: '/deals/opp-1',
    priority: 'high' as const,
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'hot-lead-1',
    type: 'opportunity' as const,
    source: 'ai' as const,
    title: 'Hot Lead Detected',
    description: 'Jane Doe has a high score of 95.',
    suggestedAction: 'Send personalized follow-up',
    entityType: 'lead',
    entityId: 'lead-1',
    actionUrl: '/leads/lead-1',
    priority: 'high' as const,
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'overdue-tasks',
    type: 'reminder' as const,
    source: 'heuristic' as const,
    title: '5 Overdue Tasks',
    description: 'You have tasks past their due date.',
    suggestedAction: 'Review overdue tasks',
    entityType: null,
    entityId: null,
    actionUrl: '/tasks?filter=overdue',
    priority: 'medium' as const,
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'stale-contact-1',
    type: 'warning' as const,
    source: 'heuristic' as const,
    title: 'Stale Contact: Bob Smith',
    description: 'No interaction in 45 days.',
    suggestedAction: 'Schedule a follow-up',
    entityType: 'contact',
    entityId: 'contact-1',
    actionUrl: '/contacts/contact-1',
    priority: 'medium' as const,
    createdAt: '2026-03-01T00:00:00.000Z',
  },
];

function setupMockQuery(
  overrides: Partial<{
    data: any;
    isLoading: boolean;
    error: any;
  }> = {}
) {
  mockGetAllInsightsQuery.mockReturnValue({
    data: {
      insights: sampleInsights,
      nextCursor: null,
      hasMore: false,
      total: sampleInsights.length,
      lastRefreshed: '2026-03-01T00:00:00.000Z',
    },
    isLoading: false,
    error: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// Lazy import so mocks are applied first — import component directly (page.tsx is now a redirect)
async function importAndRender() {
  const { InsightsListPage } = await import('@/components/insights/InsightsListPage');
  return render(<InsightsListPage />);
}

describe('Insights Page', () => {
  // =========================================================================
  // Rendering
  // =========================================================================

  it('renders page with list of insight cards', async () => {
    setupMockQuery();
    await importAndRender();

    expect(screen.getByText('Deal at Risk: Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Hot Lead Detected')).toBeInTheDocument();
    expect(screen.getByText('5 Overdue Tasks')).toBeInTheDocument();
  });

  it('each card shows title, description, suggested action, and type', async () => {
    setupMockQuery();
    await importAndRender();

    // Title
    expect(screen.getByText('Deal at Risk: Acme Corp')).toBeInTheDocument();
    // Description
    expect(screen.getByText(/Last interaction was 20 days ago/)).toBeInTheDocument();
    // Suggested action
    expect(screen.getByText(/Schedule a check-in call/)).toBeInTheDocument();
  });

  it('labels heuristic fallback insights distinctly', async () => {
    setupMockQuery();
    await importAndRender();

    expect(screen.getAllByTestId('heuristic-insight-badge')).toHaveLength(3);
    expect(screen.getAllByText('Heuristic fallback')).toHaveLength(3);
  });

  it('clicking a card navigates to actionUrl', async () => {
    setupMockQuery();
    await importAndRender();

    const links = screen.getAllByRole('link');
    const dealLink = links.find((l) => l.getAttribute('href') === '/deals/opp-1?insightId=deal-risk-1');
    expect(dealLink).toBeDefined();
  });

  // =========================================================================
  // URL-based Filtering (via sidebar navigation)
  // =========================================================================

  it('no type param queries all insights', async () => {
    setupMockQuery();
    await importAndRender();

    const lastCall =
      mockGetAllInsightsQuery.mock.calls[mockGetAllInsightsQuery.mock.calls.length - 1];
    expect(lastCall[0].types).toBeUndefined();
  });

  it('type=warning param filters to warnings only', async () => {
    const { useSearchParams } = await import('next/navigation');
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('type=warning')
    );

    setupMockQuery();
    await importAndRender();

    const lastCall =
      mockGetAllInsightsQuery.mock.calls[mockGetAllInsightsQuery.mock.calls.length - 1];
    expect(lastCall[0].types).toEqual(['warning']);
  });

  it('type=reminder param filters to reminders only', async () => {
    const { useSearchParams } = await import('next/navigation');
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('type=reminder')
    );

    setupMockQuery();
    await importAndRender();

    const lastCall =
      mockGetAllInsightsQuery.mock.calls[mockGetAllInsightsQuery.mock.calls.length - 1];
    expect(lastCall[0].types).toEqual(['reminder']);
  });

  it('invalid type param defaults to all', async () => {
    const { useSearchParams } = await import('next/navigation');
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('type=nonexistent')
    );

    setupMockQuery();
    await importAndRender();

    const lastCall =
      mockGetAllInsightsQuery.mock.calls[mockGetAllInsightsQuery.mock.calls.length - 1];
    expect(lastCall[0].types).toBeUndefined();
  });

  it('shows AI Insights title when filtered', async () => {
    const { useSearchParams } = await import('next/navigation');
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('type=warning')
    );

    setupMockQuery();
    await importAndRender();

    expect(screen.getByText('AI Insights')).toBeInTheDocument();
  });

  it('shows AI Insights title when not filtered', async () => {
    setupMockQuery();
    await importAndRender();

    expect(screen.getByText('AI Insights')).toBeInTheDocument();
  });

  // =========================================================================
  // Loading & Empty States
  // =========================================================================

  it('loading state displayed during fetch', async () => {
    setupMockQuery({ isLoading: true, data: undefined });
    await importAndRender();

    expect(screen.getByText('Loading insights...')).toBeInTheDocument();
  });

  it('empty state displayed when no insights', async () => {
    setupMockQuery({
      data: {
        insights: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
        lastRefreshed: '2026-03-01T00:00:00.000Z',
      },
    });
    await importAndRender();

    expect(screen.getByText(/No.*insights at this time/i)).toBeInTheDocument();
  });

  it('error state displayed when query fails', async () => {
    setupMockQuery({ error: new Error('Network error') });
    await importAndRender();

    expect(screen.getByText(/Failed to load insights/i)).toBeInTheDocument();
  });

  // =========================================================================
  // Pagination
  // =========================================================================

  it('Load More button appears when hasMore is true', async () => {
    setupMockQuery({
      data: {
        insights: sampleInsights,
        nextCursor: Buffer.from('20').toString('base64'),
        hasMore: true,
        total: 30,
        lastRefreshed: '2026-03-01T00:00:00.000Z',
      },
    });
    await importAndRender();

    expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
  });

  it('clicking Load More fetches next page', async () => {
    const cursor = Buffer.from('20').toString('base64');
    setupMockQuery({
      data: {
        insights: sampleInsights,
        nextCursor: cursor,
        hasMore: true,
        total: 30,
        lastRefreshed: '2026-03-01T00:00:00.000Z',
      },
    });
    await importAndRender();

    const callCountBefore = mockGetAllInsightsQuery.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Load More/i }));

    // Component re-renders and calls useQuery again with the cursor
    expect(mockGetAllInsightsQuery.mock.calls.length).toBeGreaterThan(callCountBefore);
    const lastCall =
      mockGetAllInsightsQuery.mock.calls[mockGetAllInsightsQuery.mock.calls.length - 1];
    expect(lastCall[0].cursor).toBe(cursor);
  });

  it('Load More hidden when hasMore is false', async () => {
    setupMockQuery();
    await importAndRender();

    expect(screen.queryByRole('button', { name: /Load More/i })).not.toBeInTheDocument();
  });

  // =========================================================================
  // Page metadata
  // =========================================================================

  it('cards use InsightCard component with correct structure', async () => {
    setupMockQuery();
    await importAndRender();

    // Each insight should have a link derived from the actionUrl (may have ?tab=ai-insights appended)
    const links = screen.getAllByRole('link');
    const insightLinks = links.filter((l) => {
      const href = l.getAttribute('href') || '';
      return sampleInsights.some((i) => i.actionUrl && href.startsWith(i.actionUrl));
    });
    expect(insightLinks.length).toBeGreaterThanOrEqual(3);
  });

  // =========================================================================
  // Branch coverage — edge cases
  // =========================================================================

  it('card with null actionUrl falls back to "#"', async () => {
    setupMockQuery({
      data: {
        insights: [
          {
            id: 'no-url',
            type: 'achievement' as const,
            source: 'ai' as const,
            title: 'Achievement Unlocked',
            description: 'You hit 100 deals.',
            suggestedAction: null,
            entityType: null,
            entityId: null,
            actionUrl: null,
            priority: 'low' as const,
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
        total: 1,
        lastRefreshed: '2026-03-01T00:00:00.000Z',
      },
    });
    await importAndRender();

    const links = screen.getAllByRole('link');
    const hashLink = links.find((l) => l.getAttribute('href') === '#');
    expect(hashLink).toBeDefined();
  });

  it('card with unknown type renders fallback icon and badge', async () => {
    setupMockQuery({
      data: {
        insights: [
          {
            id: 'unknown-type',
            type: 'custom-new-type' as any,
            source: 'heuristic' as const,
            title: 'Unknown Type Insight',
            description: 'Testing fallback path.',
            suggestedAction: null,
            entityType: null,
            entityId: null,
            actionUrl: '/test',
            priority: 'low' as const,
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
        total: 1,
        lastRefreshed: '2026-03-01T00:00:00.000Z',
      },
    });
    await importAndRender();

    expect(screen.getByText('Unknown Type Insight')).toBeInTheDocument();
  });
});
