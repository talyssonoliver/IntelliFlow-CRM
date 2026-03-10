/**
 * @vitest-environment jsdom
 */
/**
 * CancelFlow Component Tests
 *
 * @implements PG-172 (Billing Ghost Pages — Cancel)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSubscription } from '@/test/fixtures/billing-data';

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 20);
const mockSubscription = createMockSubscription({ currentPeriodEnd: futureDate });

type MockQueryReturn<T> = { data: T | null | undefined; isLoading: boolean; error: Error | null };

const mockRefetch = vi.fn();
const mockGetSubscription = vi.fn<() => MockQueryReturn<typeof mockSubscription> & { refetch: ReturnType<typeof vi.fn> }>(() => ({
  data: mockSubscription,
  isLoading: false,
  error: null,
  refetch: mockRefetch,
}));

const mockCancelMutate = vi.fn();
const mockReactivateMutate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: { useQuery: () => mockGetSubscription() },
      cancelSubscription: { useMutation: (opts?: Record<string, unknown>) => ({
        mutate: (...args: unknown[]) => { mockCancelMutate(...args); if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function') (opts as { onSuccess: () => void }).onSuccess(); },
        isPending: false,
        isSuccess: false,
        error: null,
      })},
      updateSubscription: { useMutation: (opts?: Record<string, unknown>) => ({
        mutate: (...args: unknown[]) => { mockReactivateMutate(...args); if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function') (opts as { onSuccess: () => void }).onSuccess(); },
        isPending: false,
        isSuccess: false,
        error: null,
      })},
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

import { CancelFlow } from '../cancel-flow';

describe('CancelFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockReturnValue({ data: mockSubscription, isLoading: false, error: null, refetch: mockRefetch });
  });

  it('shows loading skeleton when data is loading', () => {
    mockGetSubscription.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: mockRefetch });
    render(<CancelFlow />);
    expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: new Error('fail'), refetch: mockRefetch });
    render(<CancelFlow />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows message when no subscription', () => {
    mockGetSubscription.mockReturnValue({ data: null, isLoading: false, error: null, refetch: mockRefetch });
    render(<CancelFlow />);
    expect(screen.getByText(/no active subscription/i)).toBeInTheDocument();
  });

  it('step 1: shows current plan details', () => {
    render(<CancelFlow />);
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('step 1: shows retention offer when >14 days remaining', () => {
    render(<CancelFlow />);
    expect(screen.getByText(/20% off/i)).toBeInTheDocument();
  });

  it('step 1: no retention offer when <=14 days', () => {
    const nearEndDate = new Date();
    nearEndDate.setDate(nearEndDate.getDate() + 10);
    mockGetSubscription.mockReturnValue({
      data: createMockSubscription({ currentPeriodEnd: nearEndDate }),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<CancelFlow />);
    expect(screen.queryByText(/20% off/i)).not.toBeInTheDocument();
  });

  it('step 1: Keep My Plan navigates to /billing', () => {
    render(<CancelFlow />);
    const keepBtn = screen.getByRole('link', { name: /keep my plan/i });
    expect(keepBtn).toHaveAttribute('href', '/billing');
  });

  it('step 2: shows reason dropdown after continuing', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    expect(screen.getByText(/too expensive/i)).toBeInTheDocument();
  });

  it('step 2: shows optional feedback textarea', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    expect(screen.getByPlaceholderText(/additional feedback/i)).toBeInTheDocument();
  });

  it('step 3: shows period-end confirmation message', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    // Select a reason
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'too_expensive' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/will remain active until/i)).toBeInTheDocument();
  });

  it('step 3: calls cancelSubscription with correct params', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'too_expensive' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel subscription/i }));
    expect(mockCancelMutate).toHaveBeenCalledWith(
      expect.objectContaining({ atPeriodEnd: true, reason: 'too_expensive' })
    );
  });

  it('shows reactivation option when cancelAtPeriodEnd is true', () => {
    mockGetSubscription.mockReturnValue({
      data: createMockSubscription({ cancelAtPeriodEnd: true, currentPeriodEnd: futureDate }),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<CancelFlow />);
    expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument();
  });

  it('calls updateSubscription on reactivate click', () => {
    mockGetSubscription.mockReturnValue({
      data: createMockSubscription({ cancelAtPeriodEnd: true, currentPeriodEnd: futureDate }),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /reactivate/i }));
    expect(mockReactivateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAtPeriodEnd: false })
    );
  });

  it('step 2: allows typing in feedback textarea', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    const textarea = screen.getByPlaceholderText(/additional feedback/i);
    fireEvent.change(textarea, { target: { value: 'too slow' } });
    expect(textarea).toHaveValue('too slow');
  });

  it('step 2: go back returns to step 1', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    expect(screen.getByText(/why are you cancelling/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(screen.getByText('Your Current Plan')).toBeInTheDocument();
  });

  it('step 3: go back returns to step 2', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'too_expensive' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(screen.getByText(/why are you cancelling/i)).toBeInTheDocument();
  });

  it('shows success state after cancellation', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByRole('button', { name: /continue cancellation/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'too_expensive' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel subscription/i }));
    expect(screen.getByText('Subscription Cancelled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to billing/i })).toHaveAttribute('href', '/billing');
  });
});
