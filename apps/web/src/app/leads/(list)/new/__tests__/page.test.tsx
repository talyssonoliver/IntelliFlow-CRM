/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------
const { mockUseRequireAuth, mockCreateMutation, mockPush } = vi.hoisted(() => {
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

// PG-060: enrichment lib mock — default returns the form unchanged so the
// existing 6 tests stay green; individual tests override the implementation.
const { mockEnrichFromEmail } = vi.hoisted(() => ({
  mockEnrichFromEmail: vi.fn((_email: string, fields: Record<string, unknown>) => fields),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/leads/lead-enrichment', () => ({
  enrichFromEmail: mockEnrichFromEmail,
}));

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
    // clearAllMocks does not reset implementations — restore the default
    // non-destructive identity so test order cannot leak a custom impl.
    mockEnrichFromEmail.mockImplementation(
      (_email: string, fields: Record<string, unknown>) => fields
    );
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

  // -------------------------------------------------------------------------
  // PG-060: enrichment wiring (W-1..W-4)
  // -------------------------------------------------------------------------
  const fillBasicStep = () => {
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Sarah' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Connor' } });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'sarah@acme.com' },
    });
  };

  it('invokes enrichFromEmail when the email field loses focus (W-1, AC-006)', () => {
    render(<CreateNewLeadPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    fireEvent.change(emailInput, { target: { value: 'sarah@acme.com' } });
    fireEvent.blur(emailInput);

    expect(mockEnrichFromEmail).toHaveBeenCalled();
    expect(mockEnrichFromEmail.mock.calls[0]?.[0]).toBe('sarah@acme.com');
  });

  it('applies the enriched company to the empty company field (W-2, AC-003)', () => {
    mockEnrichFromEmail.mockImplementation((_email: string, fields: Record<string, unknown>) => ({
      ...fields,
      company: 'Acme',
    }));
    render(<CreateNewLeadPage />);

    fillBasicStep();
    fireEvent.blur(screen.getByLabelText(/email address/i));
    // Advance to the Company step where the company input renders.
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    expect((screen.getByLabelText(/company name/i) as HTMLInputElement).value).toBe('Acme');
  });

  it('forwards the current form (incl. a pre-filled company) to enrichFromEmail (W-3, AC-005)', () => {
    render(<CreateNewLeadPage />);

    fillBasicStep();
    // Move to step 2, set a company, return to step 1, then blur email.
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'Manual Co' } });
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    fireEvent.blur(screen.getByLabelText(/email address/i));

    expect(mockEnrichFromEmail).toHaveBeenLastCalledWith(
      'sarah@acme.com',
      expect.objectContaining({ company: 'Manual Co' })
    );
  });

  it('includes the enriched website in the create payload (W-4, AC-003)', () => {
    mockEnrichFromEmail.mockImplementation((_email: string, fields: Record<string, unknown>) => ({
      ...fields,
      website: 'https://acme.com',
    }));
    render(<CreateNewLeadPage />);

    fillBasicStep();
    fireEvent.blur(screen.getByLabelText(/email address/i));
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // → company
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // → qualification
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const mutationResult = mockCreateMutation.mock.results[0]?.value;
    expect(mutationResult.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://acme.com' })
    );
  });

  // -------------------------------------------------------------------------
  // PG-060: accessibility (A-1, A-2 — AC-008)
  // -------------------------------------------------------------------------
  it('associates the email error via aria-invalid + aria-describedby (A-1, AC-008)', () => {
    render(<CreateNewLeadPage />);

    // Leave email empty and attempt to advance → validation error on email.
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = emailInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).not.toBeNull();
  });

  it('renders an aria-live region for enrichment announcements (A-2, AC-008)', () => {
    render(<CreateNewLeadPage />);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // PG-060: revenue-band -> cents mapping (Codex review #1)
  // -------------------------------------------------------------------------
  it.each([
    ['<1M', 50_000_000],
    ['1M-10M', 100_000_000],
    ['10M-50M', 1_000_000_000],
    ['50M-100M', 5_000_000_000],
    ['100M+', 10_000_000_000],
  ])('maps revenue band %s to %d cents (no parseFloat corruption)', (band, cents) => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.change(screen.getByLabelText(/annual revenue/i), { target: { value: band } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const mutationResult = mockCreateMutation.mock.results[0]?.value;
    const payload = mutationResult.mutateAsync.mock.calls[0]?.[0];
    expect(payload.estimatedValue).toBe(cents);
  });

  it('omits estimatedValue when no revenue band is selected', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const mutationResult = mockCreateMutation.mock.results[0]?.value;
    const payload = mutationResult.mutateAsync.mock.calls[0]?.[0];
    expect(payload.estimatedValue).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // PG-060: email validation parity with the server validator (Codex review #2)
  // -------------------------------------------------------------------------
  it.each(['sarah@mail.acme.com', 'user@acme.co.uk', 'x@acme.io'])(
    'accepts the valid multi-label email %s and advances to step 2',
    (email) => {
      render(<CreateNewLeadPage />);
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Sarah' } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Connor' } });
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
      fireEvent.click(screen.getByRole('button', { name: /next step/i }));
      // Reaching step 2 means validation accepted the multi-label domain.
      expect(screen.getByLabelText(/company name/i)).toBeTruthy();
    }
  );

  it('rejects an invalid email and keeps the user on step 1', () => {
    render(<CreateNewLeadPage />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Sarah' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Connor' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'notanemail' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.queryByLabelText(/company name/i)).toBeNull();
    expect(screen.getByLabelText(/email address/i).getAttribute('aria-invalid')).toBe('true');
  });
});
