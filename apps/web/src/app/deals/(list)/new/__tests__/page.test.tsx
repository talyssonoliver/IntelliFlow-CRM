/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
// vi.hoisted ensures these mocks are initialised before hoisted vi.mock factories run,
// avoiding the TDZ where `() => mockUseRequireAuth()` captured an undefined reference.
const { mockUseRequireAuth, mockUseFormUnsavedChanges } = vi.hoisted(() => ({
  mockUseRequireAuth: vi.fn().mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1' },
  }),
  mockUseFormUnsavedChanges: vi.fn(),
}));

const validFormData = {
  name: 'Enterprise License',
  value: { amount: 50000, currency: 'GBP' },
  stage: 'PROPOSAL' as const,
  probability: 60,
  expectedCloseDate: '2026-06-15',
  accountId: 'acc-1',
  accountName: 'Acme Corp',
  contactId: 'contact-1',
  contactName: 'Alice Doe',
  description: 'Large expansion opportunity',
};

let capturedMutationConfig: {
  onSuccess?: (data: { id: string; name: string }) => void;
  onError?: (error: Error) => void;
} = {};

const mockCreateMutation = {
  mutate: vi.fn(),
  isPending: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: mockUseRequireAuth,
}));

vi.mock('@/hooks/useUnsavedChanges', () => ({
  useFormUnsavedChanges: mockUseFormUnsavedChanges,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    opportunity: {
      create: {
        useMutation: (config: typeof capturedMutationConfig) => {
          capturedMutationConfig = config;
          return mockCreateMutation;
        },
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ToastViewport: () => <div data-testid="toast-viewport" />,
  Toast: ({
    children,
    open,
    variant,
  }: {
    children: React.ReactNode;
    open?: boolean;
    variant?: string;
  }) =>
    open ? (
      <div data-testid="toast" data-variant={variant}>
        {children}
      </div>
    ) : null,
  ToastTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-title">{children}</div>
  ),
  ToastDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-description">{children}</div>
  ),
  ToastClose: () => <button data-testid="toast-close">Close</button>,
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    breadcrumbs,
  }: {
    title: string;
    breadcrumbs: Array<{ label: string }>;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <nav data-testid="breadcrumbs">
        {breadcrumbs.map((breadcrumb, index) => (
          <span key={index} data-testid={`breadcrumb-${index}`}>
            {breadcrumb.label}
          </span>
        ))}
      </nav>
    </div>
  ),
}));

vi.mock('@/components/deals/DealForm', () => ({
  DealForm: ({
    onSubmit,
    onDirtyChange,
    isSubmitting,
  }: {
    onSubmit: (data: typeof validFormData) => void;
    onDirtyChange?: (isDirty: boolean) => void;
    isSubmitting: boolean;
  }) => (
    <div data-testid="deal-form">
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Mark Dirty
      </button>
      <button type="button" onClick={() => onSubmit(validFormData)}>
        Submit Deal
      </button>
      <span data-testid="submitting-state">{String(isSubmitting)}</span>
    </div>
  ),
}));

import NewDealPage from '../page';

describe('NewDealPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply mock return values — vitest.config.ts sets `mockReset: true` which
    // clears mockReturnValue between tests, so module-level mockReturnValue is wiped.
    mockUseRequireAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'user-1' },
    });
    capturedMutationConfig = {};
    mockCreateMutation.isPending = false;
  });

  it('renders the page shell and deal form', () => {
    render(<NewDealPage />);

    expect(screen.getByRole('heading', { name: 'New Deal' })).toBeInTheDocument();
    expect(screen.getByTestId('deal-form')).toBeInTheDocument();
  });

  it('calls useRequireAuth', () => {
    render(<NewDealPage />);

    expect(mockUseRequireAuth).toHaveBeenCalled();
  });

  it('submits the create mutation with the full deal payload', () => {
    render(<NewDealPage />);

    fireEvent.click(screen.getByText('Submit Deal'));

    expect(mockCreateMutation.mutate).toHaveBeenCalledWith({
      name: 'Enterprise License',
      value: { amount: 50000, currency: 'GBP' },
      stage: 'PROPOSAL',
      probability: 60,
      expectedCloseDate: new Date('2026-06-15'),
      accountId: 'acc-1',
      contactId: 'contact-1',
      description: 'Large expansion opportunity',
    });
  });

  it('tracks dirty state through useFormUnsavedChanges and clears it on success', async () => {
    render(<NewDealPage />);

    expect(mockUseFormUnsavedChanges).toHaveBeenLastCalledWith({
      formName: 'newDealForm',
      isDirty: false,
    });

    fireEvent.click(screen.getByText('Mark Dirty'));

    await waitFor(() => {
      expect(mockUseFormUnsavedChanges).toHaveBeenLastCalledWith({
        formName: 'newDealForm',
        isDirty: true,
      });
    });

    act(() => {
      capturedMutationConfig.onSuccess?.({ id: 'deal-123', name: 'Enterprise License' });
    });

    await waitFor(() => {
      expect(mockUseFormUnsavedChanges).toHaveBeenLastCalledWith({
        formName: 'newDealForm',
        isDirty: false,
      });
    });
  });

  it('navigates to the new deal after a successful create', async () => {
    render(<NewDealPage />);

    act(() => {
      capturedMutationConfig.onSuccess?.({ id: 'deal-123', name: 'Enterprise License' });
    });

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/deals/deal-123');
      },
      { timeout: 1000 }
    );
  });

  it('shows a success toast on create', async () => {
    render(<NewDealPage />);

    act(() => {
      capturedMutationConfig.onSuccess?.({ id: 'deal-123', name: 'Enterprise License' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeInTheDocument();
      expect(screen.getByTestId('toast-title')).toHaveTextContent('Deal created');
    });
  });

  it('shows an error toast when create fails', async () => {
    render(<NewDealPage />);

    act(() => {
      capturedMutationConfig.onError?.(new Error('Server error'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeInTheDocument();
      expect(screen.getByTestId('toast')).toHaveAttribute('data-variant', 'destructive');
      expect(screen.getByTestId('toast-title')).toHaveTextContent('Failed to create deal');
    });
  });

  it('renders the expected breadcrumbs', () => {
    render(<NewDealPage />);

    expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Dashboard');
    expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Deals');
    expect(screen.getByTestId('breadcrumb-2')).toHaveTextContent('New Deal');
  });
});
