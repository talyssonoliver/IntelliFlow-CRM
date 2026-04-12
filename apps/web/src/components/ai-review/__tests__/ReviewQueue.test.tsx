import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock all external dependencies
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/ai-review',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockReviews = [
  {
    id: 'r1',
    tenantId: 't1',
    outputType: 'LEAD_SCORING',
    outputPayload: {},
    confidence: 0.9,
    status: 'PENDING',
    slaDeadline: new Date(Date.now() + 3600_000),
    escalationDepth: 0,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: null,
    reviewDecision: null,
    reviewNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockStats = {
  pending: 5,
  inReview: 2,
  approved: 10,
  rejected: 1,
  escalated: 1,
  expired: 0,
  slaBreachedCount: 2,
  totalReviews: 19,
};

let mockHookReturn = {
  reviews: mockReviews,
  total: 1,
  hasMore: false,
  stats: mockStats,
  isLoading: false,
  isStatsLoading: false,
  filters: { page: 1, limit: 20 },
  setFilters: vi.fn(),
  claim: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  escalate: vi.fn(),
  isMutating: false,
  getLockToken: () => null as string | null,
};

vi.mock('@/lib/ai-review/hooks', () => ({
  useReviewQueue: () => mockHookReturn,
}));

// Import after mocks
const { ReviewQueue } = await import('../ReviewQueue');

describe('ReviewQueue', () => {
  it('renders page title', () => {
    render(<ReviewQueue />);
    expect(screen.getByText('AI Review Queue')).toBeDefined();
  });

  it('renders stats cards', () => {
    const { container } = render(<ReviewQueue />);
    // Stats cards section is the grid div; stat labels are muted-foreground <p> tags
    const statLabels = container.querySelectorAll('p.text-xs.text-muted-foreground');
    const labelTexts = Array.from(statLabels).map((el) => el.textContent);
    expect(labelTexts).toContain('Pending');
    expect(labelTexts).toContain('In Review');
    expect(labelTexts).toContain('Approved');
    expect(labelTexts).toContain('Escalated');
    expect(labelTexts).toContain('SLA Breached');
  });

  it('renders stats values', () => {
    const { container } = render(<ReviewQueue />);
    // Stats values are bold <p> tags inside stat cards
    const statValues = container.querySelectorAll('p.text-2xl.font-bold');
    const valueTexts = Array.from(statValues).map((el) => el.textContent);
    expect(valueTexts).toContain('5'); // pending
    expect(valueTexts).toContain('2'); // inReview
    expect(valueTexts).toContain('10'); // approved
  });

  it('renders SearchFilterBar', () => {
    render(<ReviewQueue />);
    expect(screen.getByPlaceholderText('Search reviews...')).toBeDefined();
  });

  it('renders ReviewCard for each review', () => {
    render(<ReviewQueue />);
    // "Lead Scoring" appears in ReviewCard's output type label
    expect(screen.getAllByText('Lead Scoring').length).toBeGreaterThanOrEqual(1);
  });

  it('shows results count', () => {
    render(<ReviewQueue />);
    expect(screen.getByText(/showing 1 of 1/i)).toBeDefined();
  });

  it('renders EmptyState when no reviews', () => {
    const original = mockHookReturn;
    mockHookReturn = { ...original, reviews: [], total: 0 };
    try {
      render(<ReviewQueue />);
      expect(screen.getByText('No pending reviews')).toBeDefined();
    } finally {
      mockHookReturn = original;
    }
  });
});
