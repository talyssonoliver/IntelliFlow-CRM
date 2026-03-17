/**
 * @vitest-environment jsdom
 */
/**
 * CancelFlow Component Tests
 *
 * Tests the 3-step cancellation flow with stepper, dynamic feature
 * loss cards, radio button survey, and 3-button confirmation step.
 *
 * @implements PG-172 (Billing Ghost Pages — Cancel)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSubscription } from '@/test/fixtures/billing-data';

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 20);
const mockSubscription = createMockSubscription({ currentPeriodEnd: futureDate });

type MockQueryReturn<T> = {
  data: T | null | undefined;
  isLoading: boolean;
  error: Error | null;
};

const mockRefetch = vi.fn();
const mockGetSubscription = vi.fn<
  () => MockQueryReturn<typeof mockSubscription> & { refetch: ReturnType<typeof vi.fn> }
>(() => ({
  data: mockSubscription,
  isLoading: false,
  error: null,
  refetch: mockRefetch,
}));

const mockCancelMutate = vi.fn();
const mockCancelIsSuccess = { value: false };
const mockReactivateMutate = vi.fn();
const mockPauseMutate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getSubscription: { useQuery: () => mockGetSubscription() },
      cancelSubscription: {
        useMutation: (opts?: Record<string, unknown>) => ({
          mutate: (...args: unknown[]) => {
            mockCancelMutate(...args);
            if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function')
              (opts as { onSuccess: () => void }).onSuccess();
          },
          isPending: false,
          isSuccess: mockCancelIsSuccess.value,
          error: null,
        }),
      },
      updateSubscription: {
        useMutation: (opts?: Record<string, unknown>) => ({
          mutate: (...args: unknown[]) => {
            mockReactivateMutate(...args);
            if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function')
              (opts as { onSuccess: () => void }).onSuccess();
          },
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
      pauseSubscription: {
        useMutation: (opts?: Record<string, unknown>) => ({
          mutate: (...args: unknown[]) => {
            mockPauseMutate(...args);
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

import { CancelFlow } from '../cancel-flow';

describe('CancelFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelIsSuccess.value = false;
    mockGetSubscription.mockReturnValue({
      data: mockSubscription,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  // --- Guard States ---

  it('shows loading skeleton when data is loading', () => {
    mockGetSubscription.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });
    render(<CancelFlow />);
    expect(screen.queryByText('Your Current Plan')).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetSubscription.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('fail'),
      refetch: mockRefetch,
    });
    render(<CancelFlow />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows enhanced empty state when no subscription', () => {
    mockGetSubscription.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<CancelFlow />);
    expect(screen.getByText('No Active Subscription')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to billing/i })).toHaveAttribute(
      'href',
      '/billing'
    );
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/billing/plans'
    );
  });

  // --- Stepper ---

  it('renders 3-step stepper with correct labels', () => {
    render(<CancelFlow />);
    expect(screen.getByText('Your Plan')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  // --- Step 1: Your Plan ---

  it('step 1: shows current plan name', () => {
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

  it('step 1: shows dynamic feature loss cards for plan', () => {
    render(<CancelFlow />);
    // Professional plan has 6 included features
    expect(screen.getByText("What you'll lose access to:")).toBeInTheDocument();
    expect(screen.getByText('Up to 25 users')).toBeInTheDocument();
    expect(screen.getByText('Workflow automation')).toBeInTheDocument();
  });

  it('step 1: "Back to Billing" link goes to /billing', () => {
    render(<CancelFlow />);
    const backLink = screen.getByRole('link', { name: /back to billing/i });
    expect(backLink).toHaveAttribute('href', '/billing');
  });

  it('step 1: "Continue Cancellation" button advances to step 2', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    expect(screen.getByText('Why are you canceling?')).toBeInTheDocument();
  });

  // --- Step 2: Feedback ---

  it('step 2: renders all cancellation reason radio buttons', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(6);
  });

  it('step 2: shows labels matching design system', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    expect(screen.getByText("It's too expensive")).toBeInTheDocument();
    expect(screen.getByText('Switching to another CRM')).toBeInTheDocument();
    expect(screen.getByText('Missing necessary features')).toBeInTheDocument();
  });

  it('step 2: allows selecting a reason via radio', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    const radio = screen.getByDisplayValue('too_expensive');
    fireEvent.click(radio);
    expect(radio).toBeChecked();
  });

  it('step 2: shows additional feedback textarea', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    expect(screen.getByPlaceholderText(/additional feedback/i)).toBeInTheDocument();
  });

  it('step 2: allows typing feedback', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    const textarea = screen.getByPlaceholderText(/additional feedback/i);
    fireEvent.change(textarea, { target: { value: 'too slow' } });
    expect(textarea).toHaveValue('too slow');
  });

  it('step 2: "Next Step" disabled until reason selected', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    const nextBtn = screen.getByText('Next Step').closest('button');
    expect(nextBtn).toBeDisabled();
  });

  it('step 2: "Next Step" enabled after selecting reason', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    const nextBtn = screen.getByText('Next Step').closest('button');
    expect(nextBtn).not.toBeDisabled();
  });

  it('step 2: "Previous" button returns to step 1', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByText('Previous'));
    expect(screen.getByText('Your Current Plan')).toBeInTheDocument();
  });

  // --- Step 3: Confirm ---

  it('step 3: shows confirmation warning with plan name', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    expect(screen.getByText(/will remain active until/i)).toBeInTheDocument();
    expect(screen.getByText(/Professional features/i)).toBeInTheDocument();
  });

  it('step 3: shows selected reason in summary', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    expect(screen.getByText("It's too expensive")).toBeInTheDocument();
  });

  it('step 3: has 3 action buttons (Previous + Confirm + Keep)', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm cancellation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /keep my plan/i })).toBeInTheDocument();
  });

  it('step 3: "Keep My Plan" link goes to /billing', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    const keepLink = screen.getByRole('link', { name: /keep my plan/i });
    expect(keepLink).toHaveAttribute('href', '/billing');
  });

  it('step 3: first "Confirm Cancellation" shows pause modal instead of cancelling directly', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));
    // Should NOT call cancel yet — pause modal intercepts
    expect(mockCancelMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Pause Your Subscription')).toBeInTheDocument();
  });

  // --- Reactivation ---

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

  // --- Pause Modal ---

  it('step 3: shows pause modal on first "Confirm Cancellation" click', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));
    // Modal should appear
    expect(screen.getByText('Pause Your Subscription')).toBeInTheDocument();
    expect(screen.getByText('1 Month')).toBeInTheDocument();
    expect(screen.getByText('2 Months')).toBeInTheDocument();
    expect(screen.getByText('3 Months')).toBeInTheDocument();
  });

  it('step 3: "Continue to cancel" dismisses modal and cancels', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));
    // Click "Continue to cancel" in modal
    fireEvent.click(screen.getByText('Continue to cancel'));
    expect(mockCancelMutate).toHaveBeenCalledWith(
      expect.objectContaining({ atPeriodEnd: true, reason: 'too_expensive' })
    );
  });

  it('step 3: "Pause Subscription" button calls pauseSubscription', () => {
    render(<CancelFlow />);
    fireEvent.click(screen.getByText('Continue Cancellation'));
    fireEvent.click(screen.getByDisplayValue('too_expensive'));
    fireEvent.click(screen.getByText('Next Step'));
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));
    // Click "Pause Subscription" in modal
    fireEvent.click(screen.getByRole('button', { name: /pause subscription/i }));
    expect(mockPauseMutate).toHaveBeenCalledWith({ durationMonths: 2 });
  });
});
