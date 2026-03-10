/**
 * @vitest-environment jsdom
 */
/**
 * PlanComparison Component Tests
 *
 * @implements PG-172 (Billing Ghost Pages — Plans)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSubscription } from '@/test/fixtures/billing-data';

const mockSubscription = createMockSubscription();

type MockQueryReturn<T> = { data: T | null | undefined; isLoading: boolean; error: Error | null };

const mockGetSubscription = vi.fn<() => MockQueryReturn<typeof mockSubscription>>(() => ({
  data: mockSubscription,
  isLoading: false,
  error: null,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
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

import { PlanComparison } from '../plan-comparison';

describe('PlanComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockReturnValue({ data: mockSubscription, isLoading: false, error: null });
  });

  it('shows loading skeleton when data is loading', () => {
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<PlanComparison />);
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: new Error('fail') });
    render(<PlanComparison />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders 3 plan cards', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });

  it('shows Popular badge on Professional plan', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('has monthly/annual billing toggle', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Annual')).toBeInTheDocument();
  });

  it('updates prices when toggling to annual', () => {
    render(<PlanComparison />);
    fireEvent.click(screen.getByText('Annual'));
    // Annual prices should now show /year
    expect(screen.getAllByText(/\/year/).length).toBeGreaterThan(0);
  });

  it('shows annual savings percentage', () => {
    render(<PlanComparison />);
    fireEvent.click(screen.getByText('Annual'));
    // Savings should be visible
    expect(screen.getAllByText(/saved/).length).toBeGreaterThan(0);
  });

  it('highlights current plan with disabled CTA', () => {
    render(<PlanComparison />);
    // Professional is current plan
    const currentBtn = screen.getByRole('button', { name: /current plan/i });
    expect(currentBtn).toBeDisabled();
  });

  it('shows Upgrade/Downgrade CTAs for other plans', () => {
    render(<PlanComparison />);
    // Starter should show Downgrade, Enterprise should show Upgrade
    const links = screen.getAllByRole('link');
    const upgradeLink = links.find(l => l.getAttribute('href')?.includes('/billing/upgrade?plan=enterprise'));
    const downgradeLink = links.find(l => l.getAttribute('href')?.includes('/billing/upgrade?plan=starter'));
    expect(upgradeLink).toBeDefined();
    expect(downgradeLink).toBeDefined();
  });

  it('renders feature lists for each plan', () => {
    render(<PlanComparison />);
    // Feature from starter
    expect(screen.getAllByText(/users/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/contacts/i).length).toBeGreaterThan(0);
  });
});
