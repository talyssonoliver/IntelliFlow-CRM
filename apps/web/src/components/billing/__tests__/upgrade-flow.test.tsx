/**
 * @vitest-environment jsdom
 */
/**
 * UpgradeFlow Component Tests
 *
 * @implements PG-172 (Billing Ghost Pages — Upgrade)
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

const mockMutate = vi.fn();
const mockPush = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: { useQuery: () => mockGetSubscription() },
      updateSubscription: {
        useMutation: (opts?: Record<string, unknown>) => ({
          mutate: (...args: unknown[]) => {
            mockMutate(...args);
            if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function')
              (opts as { onSuccess: () => void }).onSuccess();
          },
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
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

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('plan=enterprise')),
  useRouter: vi.fn(() => ({ push: mockPush, replace: vi.fn() })),
}));

import { UpgradeFlow } from '../upgrade-flow';

describe('UpgradeFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockReturnValue({
      data: mockSubscription,
      isLoading: false,
      error: null,
    });
  });

  // --- Guard states ---

  it('shows loading skeleton when data is loading', () => {
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<UpgradeFlow />);
    expect(screen.queryByText('Estimated Cost')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetSubscription.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('fail'),
    });
    render(<UpgradeFlow />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  // --- Mode 1: No ?plan= → full plan cards ---

  it('shows full plan cards when no ?plan= param', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>
    );
    render(<UpgradeFlow />);
    expect(screen.getAllByText('Starter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Professional').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Enterprise').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Custom tier card when no ?plan= param', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>
    );
    render(<UpgradeFlow />);
    expect(screen.getAllByText('Custom').length).toBeGreaterThanOrEqual(1);
  });

  it('shows plan cards with features (non-compact) when no ?plan= param', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>
    );
    render(<UpgradeFlow />);
    // Features should be visible (non-compact cards)
    expect(screen.getAllByText(/users/i).length).toBeGreaterThan(0);
  });

  it('shows plan cards when no subscription (new user)', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>
    );
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<UpgradeFlow />);
    expect(screen.getAllByText('Upgrade').length).toBe(3);
  });

  it('does not show Compare Plans or FAQ', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>
    );
    render(<UpgradeFlow />);
    expect(screen.queryByText('Compare Plans')).not.toBeInTheDocument();
    expect(screen.queryByText('Frequently Asked Questions')).not.toBeInTheDocument();
  });

  // --- Mode 2: ?plan=X → confirmation ---

  it('shows confirmation view with ?plan= param', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText('Estimated Cost')).toBeInTheDocument();
    expect(screen.getByText(/estimated prorated charge/i)).toBeInTheDocument();
  });

  it('shows current plan summary when switching plans', () => {
    render(<UpgradeFlow />);
    expect(screen.getAllByText('Professional').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
  });

  it('shows new plan card with features', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText('New Plan')).toBeInTheDocument();
  });

  it('shows direction indicator', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText('Upgrade')).toBeInTheDocument();
  });

  it('calls updateSubscription on confirm', () => {
    render(<UpgradeFlow />);
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('shows downgrade direction for lower plan', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('plan=starter') as unknown as ReturnType<typeof useSearchParams>
    );
    render(<UpgradeFlow />);
    expect(screen.getByText('Downgrade')).toBeInTheDocument();
  });

  it('shows price difference for target plan', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText(/price difference/i)).toBeInTheDocument();
  });

  it('has Cancel link back to /billing/plans', () => {
    render(<UpgradeFlow />);
    const cancelLink = screen.getByRole('link', { name: /cancel/i });
    expect(cancelLink).toHaveAttribute('href', '/billing/plans');
  });

  it('shows Subscribe button for new subscriptions', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<UpgradeFlow />);
    expect(screen.getByText(/Subscribe to Enterprise/)).toBeInTheDocument();
  });

  it('does not show proration for new subscriptions', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<UpgradeFlow />);
    expect(screen.queryByText('Estimated Cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Current Plan')).not.toBeInTheDocument();
  });
});
