/**
 * @vitest-environment jsdom
 */
/**
 * UsageDashboard Component Tests
 *
 * @implements PG-172 (Billing Ghost Pages — Usage)
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockUsageMetrics, createMockSubscription } from '@/test/fixtures/billing-data';

const mockUsage = createMockUsageMetrics();
const mockSubscription = createMockSubscription();

type MockQueryReturn<T> = { data: T | null | undefined; isLoading: boolean; error: Error | null };

const mockGetUsageMetrics = vi.fn<() => MockQueryReturn<typeof mockUsage>>(() => ({
  data: mockUsage,
  isLoading: false,
  error: null,
}));
const mockGetSubscription = vi.fn<() => MockQueryReturn<typeof mockSubscription>>(() => ({
  data: mockSubscription,
  isLoading: false,
  error: null,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getUsageMetrics: { useQuery: () => mockGetUsageMetrics() },
      getSubscription: { useQuery: () => mockGetSubscription() },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: Readonly<{ children: React.ReactNode; href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Import after mocks
import { UsageDashboard } from '../usage-dashboard';

describe('UsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsageMetrics.mockReturnValue({ data: mockUsage, isLoading: false, error: null });
    mockGetSubscription.mockReturnValue({ data: mockSubscription, isLoading: false, error: null });
  });

  it('shows loading skeleton when data is loading', () => {
    mockGetUsageMetrics.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<UsageDashboard />);
    expect(screen.queryByText('API Calls')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetUsageMetrics.mockReturnValue({ data: null, isLoading: false, error: new Error('fail') });
    render(<UsageDashboard />);
    expect(screen.getByText(/failed to load usage/i)).toBeInTheDocument();
  });

  it('shows empty state when no subscription', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
    mockGetUsageMetrics.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<UsageDashboard />);
    expect(screen.getByText(/no active subscription/i)).toBeInTheDocument();
  });

  it('renders 3 usage metric cards', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('API Calls')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Active Users')).toBeInTheDocument();
  });

  it('displays progress bars with correct percentages', () => {
    render(<UsageDashboard />);
    // API: 8500/10000 = 85%
    expect(screen.getByText('85%')).toBeInTheDocument();
    // Users: 12/25 = 48%, Storage: 2.4/5 = 48% — both exist
    expect(screen.getAllByText('48%').length).toBe(2);
  });

  it('shows current plan name', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('shows upgrade CTA when near usage limit', () => {
    render(<UsageDashboard />);
    // API calls at 85% triggers near limit
    expect(screen.getByRole('link', { name: /upgrade plan/i })).toHaveAttribute('href', '/billing/upgrade');
  });

  it('displays disclaimer banner', () => {
    render(<UsageDashboard />);
    expect(screen.getByText(/usage data is approximate/i)).toBeInTheDocument();
  });

  it('applies amber color when near limit (60-80%)', () => {
    mockGetUsageMetrics.mockReturnValue({
      data: createMockUsageMetrics({ storage: { current: 3.5, limit: 5, unit: 'GB' } }),
      isLoading: false,
      error: null,
    });
    render(<UsageDashboard />);
    // Storage at 70% should have amber indicator
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('applies red color when at limit (>80%)', () => {
    mockGetUsageMetrics.mockReturnValue({
      data: createMockUsageMetrics({ apiCalls: { current: 9500, limit: 10000 } }),
      isLoading: false,
      error: null,
    });
    render(<UsageDashboard />);
    expect(screen.getByText('95%')).toBeInTheDocument();
  });
});
