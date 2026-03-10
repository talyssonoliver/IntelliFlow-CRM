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

type MockQueryReturn<T> = { data: T | null | undefined; isLoading: boolean; error: Error | null };

const mockGetSubscription = vi.fn<() => MockQueryReturn<typeof mockSubscription>>(() => ({
  data: mockSubscription,
  isLoading: false,
  error: null,
}));

const mockMutate = vi.fn();
const mockUpdateSubscription = vi.fn(() => ({
  mutate: mockMutate,
  mutateAsync: mockMutate,
  isLoading: false,
  isPending: false,
  isSuccess: false,
  error: null,
  data: null,
  reset: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: { useQuery: () => mockGetSubscription() },
      updateSubscription: { useMutation: (opts?: Record<string, unknown>) => {
        const result = mockUpdateSubscription();
        return { ...result, mutate: (...args: unknown[]) => { mockMutate(...args); if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function') (opts as { onSuccess: () => void }).onSuccess(); } };
      }},
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

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('plan=enterprise')),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

import { UpgradeFlow } from '../upgrade-flow';

describe('UpgradeFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockReturnValue({ data: mockSubscription, isLoading: false, error: null });
  });

  it('shows loading skeleton when data is loading', () => {
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<UpgradeFlow />);
    expect(screen.queryByText('Change Plan')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: new Error('fail') });
    render(<UpgradeFlow />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows subscribe first message when no subscription', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<UpgradeFlow />);
    expect(screen.getByText(/no active subscription/i)).toBeInTheDocument();
  });

  it('pre-selects plan from URL param', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText(/New plan \(Enterprise\)/)).toBeInTheDocument();
  });

  it('shows current plan summary', () => {
    render(<UpgradeFlow />);
    expect(screen.getAllByText('Professional').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
  });

  it('shows proration preview', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText('Estimated Cost')).toBeInTheDocument();
    expect(screen.getByText(/estimated prorated charge/i)).toBeInTheDocument();
  });

  it('shows disclaimer about estimated pricing', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText(/final charge calculated by payment provider/i)).toBeInTheDocument();
  });

  it('shows feature comparison', () => {
    render(<UpgradeFlow />);
    // Should show features from target plan
    expect(screen.getAllByText(/users/i).length).toBeGreaterThan(0);
  });

  it('shows direction indicator', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText('Upgrade')).toBeInTheDocument();
  });

  it('calls updateSubscription on confirm', () => {
    render(<UpgradeFlow />);
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);
    expect(mockMutate).toHaveBeenCalled();
  });

  it('shows plan selection when no URL param', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>);
    render(<UpgradeFlow />);
    expect(screen.getByText('Select a Plan')).toBeInTheDocument();
  });

  it('shows downgrade direction for lower plan', async () => {
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('plan=starter') as unknown as ReturnType<typeof useSearchParams>);
    render(<UpgradeFlow />);
    expect(screen.getByText('Downgrade')).toBeInTheDocument();
  });

  it('shows price difference for target plan', () => {
    render(<UpgradeFlow />);
    expect(screen.getByText(/price difference/i)).toBeInTheDocument();
  });
});
