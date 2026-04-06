/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------
const {
  mockUseRequireAuth,
  mockCreateMutation,
  mockPush,
} = vi.hoisted(() => {
  const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'new-lead-1' });
  const mockPush = vi.fn();
  let capturedOnSuccess: (() => void) | undefined;
  let capturedOnError: ((err: { message: string }) => void) | undefined;

  return {
    mockUseRequireAuth: vi.fn(() => ({
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'u1', email: 'test@test.com' },
    })),
    mockMutateAsync,
    mockCreateMutation: vi.fn(
      (opts?: { onSuccess?: () => void; onError?: (err: { message: string }) => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        capturedOnError = opts?.onError;
        return {
          mutateAsync: mockMutateAsync,
          isPending: false,
          get _onSuccess() {
            return capturedOnSuccess;
          },
          get _onError() {
            return capturedOnError;
          },
        };
      }
    ),
    mockPush,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: mockUseRequireAuth,
}));

vi.mock('@/hooks/useUnsavedChanges', () => ({
  useFormUnsavedChanges: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    lead: {
      create: { useMutation: mockCreateMutation },
    },
  },
}));

vi.mock('@intelliflow/ui', async () => {
  const React = await import('react');
  return {
    Card: ({ children, className }: any) =>
      React.createElement('div', { 'data-testid': 'card', className }, children),
    Skeleton: ({ className }: any) =>
      React.createElement('div', { 'data-testid': 'skeleton', className }),
    ToastProvider: ({ children }: any) => React.createElement('div', null, children),
    Toast: () => null,
    ToastTitle: ({ children }: any) => React.createElement('span', null, children),
    ToastDescription: ({ children }: any) => React.createElement('span', null, children),
    ToastClose: () => null,
    ToastViewport: () => null,
  };
});

// ---------------------------------------------------------------------------
// Import component under test (AFTER mocks)
// ---------------------------------------------------------------------------
import CreateNewLeadPage from '../page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CreateNewLeadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockUseRequireAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'u1', email: 'test@test.com' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading skeleton and no input elements when auth is loading (AC-002)', () => {
    mockUseRequireAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      user: null as any,
    });

    render(<CreateNewLeadPage />);

    // Should render skeletons
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    // Should NOT render any form inputs
    const inputs = screen.queryAllByRole('textbox');
    const selects = screen.queryAllByRole('combobox');
    expect(inputs.length).toBe(0);
    expect(selects.length).toBe(0);

    // Should NOT render the form heading
    expect(screen.queryByText('Create New Lead')).toBeNull();
  });

  it('does NOT render form content when user is not authenticated (AC-001)', () => {
    mockUseRequireAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      user: null as any,
    });

    render(<CreateNewLeadPage />);

    // Auth guard must block form rendering — verify no form heading or inputs
    expect(screen.queryByText('Create New Lead')).toBeNull();
    expect(screen.queryAllByRole('textbox').length).toBe(0);

    // Should show skeleton instead (auth gate renders skeleton for !isAuthenticated)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);

    // Auth hook was invoked
    expect(mockUseRequireAuth).toHaveBeenCalled();
  });

  it('renders form with "Create New Lead" heading when authenticated', () => {
    render(<CreateNewLeadPage />);

    expect(screen.getByText('Create New Lead')).toBeTruthy();
    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
  });

  it('uses api.lead.create.useMutation (AC-003, AC-004)', () => {
    render(<CreateNewLeadPage />);

    // The mock for @/lib/api should have been called, NOT @/lib/trpc
    expect(mockCreateMutation).toHaveBeenCalled();
    // Verify onSuccess and onError handlers were provided
    const callArgs = mockCreateMutation.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty('onSuccess');
    expect(callArgs).toHaveProperty('onError');
  });

  it('redirects to /leads on successful submission', () => {
    render(<CreateNewLeadPage />);

    // Trigger the onSuccess callback captured during useMutation setup
    const mutationResult = mockCreateMutation.mock.results[0]?.value;
    act(() => {
      mutationResult?._onSuccess?.();
    });

    // Component uses setTimeout(1500ms) before router.push('/leads')
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockPush).toHaveBeenCalledWith('/leads');
  });

  it('handles submission error with onError callback', () => {
    render(<CreateNewLeadPage />);

    const mutationResult = mockCreateMutation.mock.results[0]?.value;

    // Trigger the onError callback — should not throw
    act(() => {
      mutationResult?._onError?.({ message: 'Server error' });
    });

    // Verify the mutation was set up with an error handler
    const callArgs = mockCreateMutation.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty('onError');
    expect(typeof callArgs!.onError).toBe('function');
  });
});
