/**
 * @vitest-environment jsdom
 */
/**
 * PlanComparison Component Tests
 *
 * Tests the plan selection grid with billing toggle, comparison table,
 * FAQ, and links to /billing/upgrade.
 *
 * @implements PG-172 (Billing Ghost Pages — Plans)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSubscription } from '@/test/fixtures/billing-data';

const mockSubscription = createMockSubscription();

type MockQueryReturn<T> = {
  data: T | null | undefined;
  isLoading: boolean;
  error: Error | null;
};

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

import { PlanComparison } from '../plan-comparison';

describe('PlanComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockReturnValue({
      data: mockSubscription,
      isLoading: false,
      error: null,
    });
  });

  it('shows loading skeleton when data is loading', () => {
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<PlanComparison />);
    expect(screen.queryByText('Monthly')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetSubscription.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('fail'),
    });
    render(<PlanComparison />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders 3 plan cards', () => {
    render(<PlanComparison />);
    expect(screen.getAllByText('Starter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Professional').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Enterprise').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Popular badge on Professional plan', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('has monthly/annual billing toggle with Save 17% badge', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Annual')).toBeInTheDocument();
    expect(screen.getByText('Save 17%')).toBeInTheDocument();
  });

  it('updates prices when toggling to annual', () => {
    render(<PlanComparison />);
    fireEvent.click(screen.getByText('Annual'));
    expect(screen.getAllByText(/\/year/).length).toBeGreaterThan(0);
  });

  it('shows annual savings percentage', () => {
    render(<PlanComparison />);
    fireEvent.click(screen.getByText('Annual'));
    expect(screen.getAllByText(/saved/).length).toBeGreaterThan(0);
  });

  it('highlights current plan with disabled CTA', () => {
    render(<PlanComparison />);
    const currentBtn = screen.getByRole('button', { name: /current plan/i });
    expect(currentBtn).toBeDisabled();
  });

  it('links Upgrade to /billing/upgrade?plan=enterprise', () => {
    render(<PlanComparison />);
    const upgradeLink = screen.getByRole('link', { name: /upgrade/i });
    expect(upgradeLink).toHaveAttribute('href', '/billing/upgrade?plan=enterprise');
  });

  it('links Downgrade to /billing/upgrade?plan=starter', () => {
    render(<PlanComparison />);
    const downgradeLink = screen.getByRole('link', { name: /downgrade/i });
    expect(downgradeLink).toHaveAttribute('href', '/billing/upgrade?plan=starter');
  });

  it('renders feature lists for each plan', () => {
    render(<PlanComparison />);
    expect(screen.getAllByText(/users/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/contacts/i).length).toBeGreaterThan(0);
  });

  it('renders the comparison table', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Compare Plans')).toBeInTheDocument();
    expect(screen.getByText('Core CRM')).toBeInTheDocument();
  });

  it('renders the FAQ section', () => {
    render(<PlanComparison />);
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
    expect(screen.getByText('Can I change plans later?')).toBeInTheDocument();
  });
});
