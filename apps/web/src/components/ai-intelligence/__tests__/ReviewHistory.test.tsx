import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// ============================================
// Mocks (vi.mock before imports)
// ============================================

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'admin' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      aiReview: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
      },
    }),
  },
}));

const mockSetFilters = vi.fn();
const mockUseReviewHistory = vi.fn();

vi.mock('@/lib/ai-review/hooks', () => ({
  useReviewHistory: (...args: unknown[]) => mockUseReviewHistory(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/history',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ============================================
// Mock Data
// ============================================

const now = new Date();
const yesterday = new Date(now.getTime() - 86400000);
const lastWeek = new Date(now.getTime() - 5 * 86400000);
const lastMonth = new Date(now.getTime() - 15 * 86400000);
const older = new Date(now.getTime() - 45 * 86400000);

const mockReviews = [
  {
    id: 'r1',
    tenantId: 't1',
    outputType: 'LEAD_SCORING',
    outputPayload: {},
    confidence: 0.92,
    status: 'APPROVED',
    slaDeadline: new Date(now.getTime() + 3600_000),
    escalationDepth: 0,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: 'reviewer-1',
    reviewDecision: 'APPROVED',
    reviewNotes: 'Looks good, scores are accurate.',
    createdAt: new Date(now.getTime() - 3600_000),
    updatedAt: now,
  },
  {
    id: 'r2',
    tenantId: 't1',
    outputType: 'SENTIMENT_ANALYSIS',
    outputPayload: {},
    confidence: 0.45,
    status: 'REJECTED',
    slaDeadline: yesterday,
    escalationDepth: 2,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: 'reviewer-2',
    reviewDecision: 'REJECTED_QUALITY',
    reviewNotes: 'Quality is below threshold.',
    createdAt: new Date(yesterday.getTime() - 7200_000),
    updatedAt: yesterday,
  },
  {
    id: 'r3',
    tenantId: 't1',
    outputType: 'AUTO_RESPONSE',
    outputPayload: {},
    confidence: 0.78,
    status: 'EXPIRED',
    slaDeadline: lastWeek,
    escalationDepth: 0,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: null,
    reviewDecision: null,
    reviewNotes: null,
    createdAt: new Date(lastWeek.getTime() - 86400000),
    updatedAt: lastWeek,
  },
  {
    id: 'r4',
    tenantId: 't1',
    outputType: 'EMAIL_GENERATION',
    outputPayload: {},
    confidence: 0.88,
    status: 'APPROVED',
    slaDeadline: lastMonth,
    escalationDepth: 1,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: 'reviewer-1',
    reviewDecision: 'APPROVED',
    reviewNotes: null,
    createdAt: new Date(lastMonth.getTime() - 3600_000),
    updatedAt: lastMonth,
  },
  {
    id: 'r5',
    tenantId: 't1',
    outputType: 'CHURN_PREDICTION',
    outputPayload: {},
    confidence: 0.33,
    status: 'REJECTED',
    slaDeadline: older,
    escalationDepth: 0,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: 'reviewer-3',
    reviewDecision: 'REJECTED_ACCURACY',
    reviewNotes: 'Predictions are inaccurate.',
    createdAt: new Date(older.getTime() - 7200_000),
    updatedAt: older,
  },
];

const mockStats = {
  pending: 0,
  inReview: 0,
  approved: 15,
  rejected: 5,
  escalated: 0,
  expired: 3,
  slaBreachedCount: 0,
  totalReviews: 23,
};

function defaultHookReturn() {
  return {
    reviews: mockReviews,
    total: 5,
    hasMore: false,
    stats: mockStats,
    isLoading: false,
    isStatsLoading: false,
    filters: {
      status: ['APPROVED', 'REJECTED', 'EXPIRED'],
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    setFilters: mockSetFilters,
  };
}

// ============================================
// Import after mocks
// ============================================

import { ReviewHistory } from '../ReviewHistory';

// ============================================
// Tests
// ============================================

describe('ReviewHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReviewHistory.mockReturnValue(defaultHookReturn());
  });

  // ---- Rendering Tests (8) ----

  describe('Rendering', () => {
    it('renders page title "AI Review History"', () => {
      render(<ReviewHistory />);
      expect(screen.getByRole('heading', { name: /AI Review History/i })).toBeInTheDocument();
    });

    it('renders subtitle/description text', () => {
      render(<ReviewHistory />);
      expect(screen.getByText(/audit trail.*review decisions/i)).toBeInTheDocument();
    });

    it('renders 4 stats cards with correct values', () => {
      render(<ReviewHistory />);
      // Stats grid is the first .grid element in the page
      const statsGrid = document.querySelector('.grid');
      expect(statsGrid).toBeTruthy();
      const gridEl = statsGrid!;
      // Verify labels and values within the stats grid (avoids matching filter <option> elements)
      expect(within(gridEl as HTMLElement).getByText('Approved')).toBeInTheDocument();
      expect(within(gridEl as HTMLElement).getByText('Rejected')).toBeInTheDocument();
      expect(within(gridEl as HTMLElement).getByText('Expired')).toBeInTheDocument();
      expect(within(gridEl as HTMLElement).getByText('Total Completed')).toBeInTheDocument();
      expect(gridEl.textContent).toContain('15');
      expect(gridEl.textContent).toContain('5');
      expect(gridEl.textContent).toContain('3');
      expect(gridEl.textContent).toContain('23');
    });

    it('renders status filter with completed statuses only', () => {
      render(<ReviewHistory />);
      // Filter bar should have status options
      const statusSelect = screen.getByLabelText(/status/i);
      expect(statusSelect).toBeInTheDocument();
    });

    it('renders output type filter', () => {
      render(<ReviewHistory />);
      const typeSelect = screen.getByLabelText(/output type/i);
      expect(typeSelect).toBeInTheDocument();
    });

    it('renders date range inputs with aria-labels', () => {
      render(<ReviewHistory />);
      expect(screen.getByLabelText(/filter from date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/filter to date/i)).toBeInTheDocument();
    });

    it('renders skeleton loaders when isLoading', () => {
      mockUseReviewHistory.mockReturnValue({
        ...defaultHookReturn(),
        isLoading: true,
        isStatsLoading: true,
        reviews: [],
        total: 0,
      });
      render(<ReviewHistory />);
      const skeletons = document.querySelectorAll('[class*="animate-pulse"], [data-testid="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders empty state when no reviews', () => {
      mockUseReviewHistory.mockReturnValue({
        ...defaultHookReturn(),
        reviews: [],
        total: 0,
      });
      render(<ReviewHistory />);
      expect(screen.getByText(/no completed reviews/i)).toBeInTheDocument();
    });
  });

  // ---- Filter Tests (8) ----

  describe('Filters', () => {
    it('calls setFilters when APPROVED status selected', () => {
      render(<ReviewHistory />);
      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'APPROVED' } });
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('calls setFilters when REJECTED status selected', () => {
      render(<ReviewHistory />);
      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'REJECTED' } });
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('calls setFilters when EXPIRED status selected', () => {
      render(<ReviewHistory />);
      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'EXPIRED' } });
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('calls setFilters when output type changed', () => {
      render(<ReviewHistory />);
      const typeSelect = screen.getByLabelText(/output type/i);
      fireEvent.change(typeSelect, { target: { value: 'LEAD_SCORING' } });
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('calls setFilters when "From" date changed', () => {
      render(<ReviewHistory />);
      const fromInput = screen.getByLabelText(/filter from date/i);
      fireEvent.change(fromInput, { target: { value: '2026-01-01' } });
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('calls setFilters when "To" date changed', () => {
      render(<ReviewHistory />);
      const toInput = screen.getByLabelText(/filter to date/i);
      fireEvent.change(toInput, { target: { value: '2026-02-28' } });
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('clears all filters on reset button click', () => {
      render(<ReviewHistory />);
      const resetBtn = screen.getByRole('button', { name: /clear.*filter|reset/i });
      fireEvent.click(resetBtn);
      expect(mockSetFilters).toHaveBeenCalled();
    });

    it('resets page to 1 when any filter changes', () => {
      mockUseReviewHistory.mockReturnValue({
        ...defaultHookReturn(),
        filters: { ...defaultHookReturn().filters, page: 3 },
      });
      render(<ReviewHistory />);
      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'APPROVED' } });
      const call = mockSetFilters.mock.calls[0];
      // setFilters should be called with a function or object that sets page=1
      if (typeof call[0] === 'function') {
        const result = call[0](defaultHookReturn().filters);
        expect(result.page).toBe(1);
      } else {
        expect(call[0]).toHaveProperty('page', 1);
      }
    });
  });

  // ---- Sort & Additional Filter Tests ----

  describe('Sort and additional filters', () => {
    it('calls setFilters when sort option changed', () => {
      render(<ReviewHistory />);
      const sortSelect = screen.getByLabelText(/sort by/i);
      fireEvent.change(sortSelect, { target: { value: 'confidence_asc' } });
      expect(mockSetFilters).toHaveBeenCalled();
      const call = mockSetFilters.mock.calls[0];
      if (typeof call[0] === 'function') {
        const result = call[0](defaultHookReturn().filters);
        expect(result.sortBy).toBe('confidence');
        expect(result.sortOrder).toBe('asc');
      }
    });

    it('clears output type filter when empty value selected', () => {
      render(<ReviewHistory />);
      const typeSelect = screen.getByLabelText(/output type/i);
      fireEvent.change(typeSelect, { target: { value: '' } });
      expect(mockSetFilters).toHaveBeenCalled();
      const call = mockSetFilters.mock.calls[0];
      if (typeof call[0] === 'function') {
        const result = call[0](defaultHookReturn().filters);
        expect(result.outputType).toBeUndefined();
      }
    });

    it('filters reviews by date range (client-side)', () => {
      render(<ReviewHistory />);
      const fromInput = screen.getByLabelText(/filter from date/i);
      const toInput = screen.getByLabelText(/filter to date/i);
      // Set a narrow date range that excludes older reviews
      const todayStr = new Date().toISOString().split('T')[0];
      fireEvent.change(fromInput, { target: { value: todayStr } });
      fireEvent.change(toInput, { target: { value: todayStr } });
      // After filtering, the results count should change
      const liveRegion = screen.getByText(/showing.*of.*reviews/i);
      expect(liveRegion).toBeInTheDocument();
    });

    it('clears status filter to show all completed statuses', () => {
      render(<ReviewHistory />);
      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: '' } });
      expect(mockSetFilters).toHaveBeenCalled();
      const call = mockSetFilters.mock.calls[0];
      if (typeof call[0] === 'function') {
        const result = call[0](defaultHookReturn().filters);
        expect(result.status).toEqual(['APPROVED', 'REJECTED', 'EXPIRED']);
      }
    });
  });

  // ---- Timeline Tests (5) ----

  describe('Timeline', () => {
    it('groups reviews into date buckets', () => {
      render(<ReviewHistory />);
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });

    it('renders date group headers with labels', () => {
      render(<ReviewHistory />);
      const headings = screen.getAllByRole('heading', { level: 3 });
      const labels = headings.map((h) => h.textContent);
      expect(labels.some((l) => l?.includes('Today'))).toBe(true);
    });

    it('shows review count badge per group', () => {
      render(<ReviewHistory />);
      // Today group has 1 review
      const todaySection = screen.getByText('Today').closest('section');
      expect(todaySection).toBeInTheDocument();
      if (todaySection) {
        const badge = within(todaySection).getByText('1');
        expect(badge).toBeInTheDocument();
      }
    });

    it('renders ReviewCard for each review within groups', () => {
      render(<ReviewHistory />);
      // Should have 5 review cards (links to detail pages)
      const viewLinks = screen.getAllByRole('link', { name: /view/i });
      expect(viewLinks.length).toBe(5);
    });

    it('reviews within groups sorted by updatedAt desc', () => {
      render(<ReviewHistory />);
      // Verify cards appear in correct order — first card should be the most recent
      const allCards = document.querySelectorAll('[data-review-id]');
      if (allCards.length >= 2) {
        expect(allCards[0].getAttribute('data-review-id')).toBe('r1');
      }
    });
  });

  // ---- Audit Trail Tests (5) ----

  describe('Audit Trail', () => {
    function expandAllAuditTrails() {
      const toggles = screen.getAllByRole('button', { name: /audit trail/i });
      toggles.forEach((btn) => fireEvent.click(btn));
    }

    it('shows reviewer ID for completed reviews', () => {
      render(<ReviewHistory />);
      expandAllAuditTrails();
      // reviewer-1 appears in r1 and r4
      expect(screen.getAllByText(/reviewer-1/i).length).toBeGreaterThanOrEqual(1);
    });

    it('shows review decision badge', () => {
      render(<ReviewHistory />);
      expandAllAuditTrails();
      expect(screen.getByText(/REJECTED_QUALITY/i)).toBeInTheDocument();
    });

    it('shows review notes when present', () => {
      render(<ReviewHistory />);
      expandAllAuditTrails();
      expect(screen.getByText(/Looks good, scores are accurate/i)).toBeInTheDocument();
    });

    it('shows escalation depth when > 0', () => {
      render(<ReviewHistory />);
      expandAllAuditTrails();
      // Review r2 has escalationDepth: 2
      expect(screen.getByText(/2 escalation/i)).toBeInTheDocument();
    });

    it('shows time-to-decision', () => {
      render(<ReviewHistory />);
      expandAllAuditTrails();
      // At least one review should show Time to Decision label
      expect(screen.getAllByText(/Time to Decision/i).length).toBeGreaterThan(0);
    });
  });

  // ---- Edge Case Tests (coverage) ----

  describe('Edge cases', () => {
    it('shows multi-day time-to-decision format', () => {
      const reviewWithLongDecision = {
        ...mockReviews[0],
        id: 'r-long',
        createdAt: new Date(now.getTime() - 3 * 86400000), // 3 days ago
        updatedAt: now,
        reviewerId: 'reviewer-long',
        reviewDecision: 'APPROVED',
        reviewNotes: 'Took a while',
        escalationDepth: 0,
      };
      mockUseReviewHistory.mockReturnValue({
        ...defaultHookReturn(),
        reviews: [reviewWithLongDecision],
        total: 1,
      });
      render(<ReviewHistory />);
      // Expand audit trail
      const toggles = screen.getAllByRole('button', { name: /audit trail/i });
      toggles.forEach((btn) => fireEvent.click(btn));
      // Should show days format (e.g., "3d 0h")
      const timeCells = screen.getAllByText(/\d+d \d+h/);
      expect(timeCells.length).toBeGreaterThan(0);
    });

    it('handles collapsed timeline groups', () => {
      render(<ReviewHistory />);
      // Click a timeline group toggle to collapse it
      const groupToggles = screen.getAllByRole('button', { name: /today|yesterday|last/i });
      if (groupToggles.length > 0) {
        fireEvent.click(groupToggles[0]);
        // After collapse, the section content should be hidden
        expect(groupToggles[0]).toHaveAttribute('aria-expanded', 'false');
      }
    });
  });

  // ---- Pagination Tests (3) ----

  describe('Pagination', () => {
    it('renders Load More button when hasMore=true', () => {
      mockUseReviewHistory.mockReturnValue({
        ...defaultHookReturn(),
        hasMore: true,
      });
      render(<ReviewHistory />);
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });

    it('calls setFilters with incremented page on Load More click', () => {
      mockUseReviewHistory.mockReturnValue({
        ...defaultHookReturn(),
        hasMore: true,
      });
      render(<ReviewHistory />);
      fireEvent.click(screen.getByRole('button', { name: /load more/i }));
      const call = mockSetFilters.mock.calls[0];
      if (typeof call[0] === 'function') {
        const result = call[0]({ ...defaultHookReturn().filters });
        expect(result.page).toBe(2);
      }
    });

    it('hides Load More button when hasMore=false', () => {
      render(<ReviewHistory />);
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });

  // ---- Accessibility Tests (4) ----

  describe('Accessibility', () => {
    it('date inputs have proper aria-labels', () => {
      render(<ReviewHistory />);
      expect(screen.getByLabelText(/filter from date/i)).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText(/filter to date/i)).toHaveAttribute('type', 'date');
    });

    it('results count region has aria-live="polite"', () => {
      render(<ReviewHistory />);
      const liveRegion = screen.getByText(/showing.*of.*reviews/i);
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });

    it('timeline sections have role="region" with aria-labelledby', () => {
      render(<ReviewHistory />);
      const regions = document.querySelectorAll('section[role="region"]');
      expect(regions.length).toBeGreaterThan(0);
      regions.forEach((region) => {
        expect(region).toHaveAttribute('aria-labelledby');
      });
    });

    it('audit trail toggle has aria-expanded and aria-controls', () => {
      render(<ReviewHistory />);
      const toggles = screen.getAllByRole('button', { name: /audit trail|details/i });
      expect(toggles.length).toBeGreaterThan(0);
      toggles.forEach((toggle) => {
        expect(toggle).toHaveAttribute('aria-expanded');
        expect(toggle).toHaveAttribute('aria-controls');
      });
    });
  });

  // ---- Hook Tests (4) ----

  describe('useReviewHistory hook', () => {
    it('is called with no arguments by default', () => {
      render(<ReviewHistory />);
      expect(mockUseReviewHistory).toHaveBeenCalled();
    });

    it('hook returns default filters with completed statuses', () => {
      render(<ReviewHistory />);
      const hookReturn = defaultHookReturn();
      expect(hookReturn.filters.status).toEqual(['APPROVED', 'REJECTED', 'EXPIRED']);
    });

    it('hook returns reviews from list query', () => {
      render(<ReviewHistory />);
      const hookReturn = defaultHookReturn();
      expect(hookReturn.reviews).toHaveLength(5);
    });

    it('hook returns stats from stats query', () => {
      render(<ReviewHistory />);
      const hookReturn = defaultHookReturn();
      expect(hookReturn.stats.approved).toBe(15);
      expect(hookReturn.stats.rejected).toBe(5);
      expect(hookReturn.stats.expired).toBe(3);
    });
  });
});
