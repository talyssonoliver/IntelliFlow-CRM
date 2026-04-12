/**
 * @vitest-environment jsdom
 */
/**
 * UsageDashboard Component Tests
 *
 * Comprehensive usage page with plan limits, CRM data,
 * activity metrics, and content counts.
 *
 * @implements PG-172 (Billing Ghost Pages — Usage)
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockUsageMetrics, createMockSubscription } from '@/test/fixtures/billing-data';

const mockUsage = createMockUsageMetrics();
const mockSubscription = createMockSubscription();

type MockQueryReturn<T> = {
  data: T | null | undefined;
  isLoading: boolean;
  error: Error | null;
};

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
  default: ({
    children,
    href,
    ...props
  }: Readonly<{ children: React.ReactNode; href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { UsageDashboard } from '../usage-dashboard';

describe('UsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsageMetrics.mockReturnValue({ data: mockUsage, isLoading: false, error: null });
    mockGetSubscription.mockReturnValue({
      data: mockSubscription,
      isLoading: false,
      error: null,
    });
  });

  // --- Guard states ---

  it('shows loading skeleton when data is loading', () => {
    mockGetUsageMetrics.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<UsageDashboard />);
    expect(screen.queryByText('Plan Limits')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetUsageMetrics.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('fail'),
    });
    render(<UsageDashboard />);
    expect(screen.getByText(/failed to load usage/i)).toBeInTheDocument();
  });

  it('shows free tier when no subscription', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<UsageDashboard />);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  // --- Plan Limits section ---

  it('renders plan limit cards with progress bars', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('Plan Limits')).toBeInTheDocument();
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getAllByText('AI Predictions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('shows correct plan limit percentages', () => {
    render(<UsageDashboard />);
    // Users: 12/25 = 48%, Storage: 2.4/5 = 48%
    expect(screen.getAllByText('48%').length).toBe(2);
    // AI Predictions: 8500/10000 = 85%
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows plan name badge', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('shows "Unlimited" for enterprise limits', () => {
    mockGetUsageMetrics.mockReturnValue({
      data: createMockUsageMetrics({
        planLimits: {
          activeUsers: { current: 50, limit: -1 },
          contacts: { current: 25000, limit: -1 },
          aiPredictions: { current: 50000, limit: -1 },
          storage: { current: 10, limit: -1 },
        },
      }),
      isLoading: false,
      error: null,
    });
    render(<UsageDashboard />);
    expect(screen.getAllByText('Unlimited').length).toBe(4);
  });

  // --- CRM Data section ---

  it('renders CRM data counts', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('CRM Data')).toBeInTheDocument();
    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Deals')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();
  });

  it('links CRM cards to their pages', () => {
    render(<UsageDashboard />);
    expect(screen.getByRole('link', { name: /156.*leads/i })).toHaveAttribute('href', '/leads');
    expect(screen.getByRole('link', { name: /234.*deals/i })).toHaveAttribute('href', '/deals');
  });

  // --- AI section ---

  it('renders AI & Intelligence section with all metrics', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('AI & Intelligence')).toBeInTheDocument();
    expect(screen.getByText('AI Scores (total)')).toBeInTheDocument();
    expect(screen.getByText('Scores This Month')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Tool Calls')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('Lead Insights')).toBeInTheDocument();
    expect(screen.getByText('Output Reviews')).toBeInTheDocument();
    expect(screen.getByText('Monitoring Events')).toBeInTheDocument();
    expect(screen.getByText('Agent Actions')).toBeInTheDocument();
    expect(screen.getByText('Chain Versions')).toBeInTheDocument();
    expect(screen.getByText('Experiments')).toBeInTheDocument();
  });

  // --- Activity & Content section ---

  it('renders activity and content counts', () => {
    render(<UsageDashboard />);
    expect(screen.getByText('Activity & Content')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Calendar Events')).toBeInTheDocument();
  });

  // --- Upgrade CTA ---

  it('shows upgrade CTA when near plan limit', () => {
    render(<UsageDashboard />);
    expect(screen.getByRole('link', { name: /upgrade plan/i })).toHaveAttribute(
      'href',
      '/billing/upgrade'
    );
  });

  it('does not show upgrade CTA for unlimited plans', () => {
    mockGetUsageMetrics.mockReturnValue({
      data: createMockUsageMetrics({
        planLimits: {
          activeUsers: { current: 50, limit: -1 },
          contacts: { current: 25000, limit: -1 },
          aiPredictions: { current: 50000, limit: -1 },
          storage: { current: 10, limit: -1 },
        },
      }),
      isLoading: false,
      error: null,
    });
    render(<UsageDashboard />);
    expect(screen.queryByRole('link', { name: /upgrade plan/i })).not.toBeInTheDocument();
  });

  it('shows disclaimer', () => {
    render(<UsageDashboard />);
    expect(screen.getByText(/usage data updates periodically/i)).toBeInTheDocument();
  });
});
