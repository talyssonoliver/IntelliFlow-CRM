/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------
const { mockUseRequireAuth, mockCreateMutation, mockMutateAsync, mockPush } = vi.hoisted(() => {
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
import CreateNewLeadPage from '../NewLeadForm';

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
    // Restore the create mutation resolved value (the config resets
    // implementations each test) so the success path returns the new lead id.
    mockMutateAsync.mockResolvedValue({ id: 'new-lead-1' });
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
  // PG-060: auto-fill must not go stale when the email domain changes
  // (Codex review — stale-auto-fill-data).
  // -------------------------------------------------------------------------
  it('refreshes an auto-filled company/website when the email domain changes (W-5)', () => {
    // Domain-aware enrichment: derive per domain, keep any value the form passes through.
    mockEnrichFromEmail.mockImplementation((email: string, fields: Record<string, unknown>) => {
      // Exact host match (not substring .includes) so CodeQL's incomplete-URL-
      // sanitization rule stays happy — the email host is everything after '@'.
      const host = email.split('@')[1] ?? '';
      const domain = host === 'globex.com' ? 'globex' : 'acme';
      const derivedCompany = domain === 'globex' ? 'Globex' : 'Acme';
      const website = (fields.website as string | undefined)?.trim();
      const company = (fields.company as string | undefined)?.trim();
      return {
        website: website ? website : `https://${domain}.com`,
        company: company ? company : derivedCompany,
      };
    });
    render(<CreateNewLeadPage />);
    fillBasicStep(); // email sarah@acme.com
    fireEvent.blur(screen.getByLabelText(/email address/i)); // auto-fills Acme

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'sarah@globex.com' },
    });
    fireEvent.blur(screen.getByLabelText(/email address/i)); // should refresh to Globex

    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // → company
    expect((screen.getByLabelText(/company name/i) as HTMLInputElement).value).toBe('Globex');
  });

  it('keeps a hand-edited company when the email is blurred again (W-6)', () => {
    mockEnrichFromEmail.mockImplementation((_email: string, fields: Record<string, unknown>) => {
      const website = (fields.website as string | undefined)?.trim();
      const company = (fields.company as string | undefined)?.trim();
      return {
        website: website ? website : 'https://acme.com',
        company: company ? company : 'Acme',
      };
    });
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // → company
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'Manual Co' } });
    fireEvent.click(screen.getByRole('button', { name: /previous/i })); // → basic
    fireEvent.blur(screen.getByLabelText(/email address/i));

    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // → company
    expect((screen.getByLabelText(/company name/i) as HTMLInputElement).value).toBe('Manual Co');
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
  // PG-060: annualRevenue is NEVER mapped into estimatedValue (Codex review #1 —
  // HIGH wrong-field-mapping: company annual revenue != lead deal value, IFC-242).
  // -------------------------------------------------------------------------
  it.each(['<1M', '1M-10M', '10M-50M', '50M-100M', '100M+'])(
    'never maps revenue band %s into estimatedValue (distinct business metric)',
    (band) => {
      render(<CreateNewLeadPage />);
      fillBasicStep();
      fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
      fireEvent.change(screen.getByLabelText(/annual revenue/i), { target: { value: band } });
      fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

      const payload = mockCreateMutation.mock.results[0]?.value.mutateAsync.mock.calls[0]?.[0];
      expect(payload.estimatedValue).toBeUndefined();
    }
  );

  // -------------------------------------------------------------------------
  // PG-060: an unselected Lead Source is omitted (Codex review — blank-source).
  // The server schema defaults an omitted source to WEBSITE; mapping blank to
  // the explicit OTHER option would mislabel "unspecified" as "Other".
  // -------------------------------------------------------------------------
  it('omits source when none is selected (lets the API default apply)', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep(); // leaves Lead Source unselected
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const payload = mockCreateMutation.mock.results[0]?.value.mutateAsync.mock.calls[0]?.[0];
    expect(payload.source).toBeUndefined();
  });

  it('sends the selected Lead Source enum when one is chosen', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.change(screen.getByLabelText(/lead source/i), { target: { value: 'referral' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const payload = mockCreateMutation.mock.results[0]?.value.mutateAsync.mock.calls[0]?.[0];
    expect(payload.source).toBe('REFERRAL');
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

  // -------------------------------------------------------------------------
  // PG-060: full field coverage across all three steps + navigation
  // -------------------------------------------------------------------------
  it('fills every field across all three steps and submits', () => {
    render(<CreateNewLeadPage />);
    // Step 1 — Basic Info
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Sarah' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Connor' } });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'sarah@acme.com' },
    });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+1 555 000 0000' } });
    fireEvent.change(screen.getByLabelText(/job title/i), { target: { value: 'VP Marketing' } });
    fireEvent.change(screen.getByLabelText(/lead source/i), { target: { value: 'referral' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    // Step 2 — Company Details
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'https://acme.com' } });
    fireEvent.change(screen.getByLabelText(/industry/i), { target: { value: 'technology' } });
    fireEvent.change(screen.getByLabelText(/company size/i), { target: { value: '51-200' } });
    fireEvent.change(screen.getByLabelText(/annual revenue/i), { target: { value: '1M-10M' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    // Step 3 — Qualification (BANT)
    fireEvent.change(screen.getByLabelText(/^budget/i), { target: { value: '$50k-$100k' } });
    fireEvent.change(screen.getByLabelText(/^authority/i), { target: { value: 'Decision maker' } });
    fireEvent.change(screen.getByLabelText(/^need/i), { target: { value: 'CRM solution' } });
    fireEvent.change(screen.getByLabelText(/timeline/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/qualification notes/i), {
      target: { value: 'Hot lead' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    expect(mockCreateMutation.mock.results[0]?.value.mutateAsync).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // IFC-242: BANT (budget/authority/need/timeline) + annualRevenue are now
  // first-class Lead columns, sent as STRUCTURED payload fields (not packed into
  // the note). Only the "Other" source detail, company size/industry and free-text
  // notes — which still have no column — ride along as `qualificationNote`, which
  // the server persists atomically with the lead (never silently dropped).
  // -------------------------------------------------------------------------
  it('sends BANT/annualRevenue as structured fields and source detail/industry/notes in qualificationNote', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.change(screen.getByLabelText(/lead source/i), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText(/please specify/i), { target: { value: 'Podcast ad' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.change(screen.getByLabelText(/industry/i), { target: { value: 'technology' } });
    fireEvent.change(screen.getByLabelText(/annual revenue/i), { target: { value: '1M-10M' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.change(screen.getByLabelText(/^budget/i), { target: { value: '$50k-$100k' } });
    fireEvent.change(screen.getByLabelText(/^authority/i), { target: { value: 'Decision maker' } });
    fireEvent.change(screen.getByLabelText(/^need/i), { target: { value: 'CRM solution' } });
    fireEvent.change(screen.getByLabelText(/^timeline/i), { target: { value: 'immediate' } });
    fireEvent.change(screen.getByLabelText(/qualification notes/i), {
      target: { value: 'Hot lead' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    // BANT + annualRevenue as structured fields (raw select values, not labels)
    expect(payload.budget).toBe('$50k-$100k');
    expect(payload.authority).toBe('Decision maker');
    expect(payload.need).toBe('CRM solution');
    expect(payload.timeline).toBe('immediate');
    expect(payload.annualRevenue).toBe('1M-10M');
    // annualRevenue (company revenue band) is NOT conflated with estimatedValue
    expect(payload.estimatedValue).toBeUndefined();
    // note carries only the column-less fields
    expect(payload.qualificationNote).toContain('Source detail: Podcast ad');
    expect(payload.qualificationNote).toContain('Industry: Technology');
    expect(payload.qualificationNote).toContain('Notes: Hot lead');
    // BANT/revenue must no longer be packed into the note (no double-persistence)
    expect(payload.qualificationNote).not.toContain('Budget:');
    expect(payload.qualificationNote).not.toContain('Need:');
    expect(payload.qualificationNote).not.toContain('Annual revenue:');
  });

  it('omits qualificationNote from the payload when no schema-less fields are filled', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep(); // basic only; source blank, no company/BANT detail
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload.qualificationNote).toBeUndefined();
  });

  it('caps qualificationNote at the server content budget (5000 chars)', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    fireEvent.change(screen.getByLabelText(/qualification notes/i), {
      target: { value: 'x'.repeat(6000) },
    });

    fireEvent.click(screen.getByRole('button', { name: /create lead/i }));

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload.qualificationNote.length).toBeLessThanOrEqual(5000);
  });

  it('resets the form to pristine on successful create (clears the dirty registry)', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Sarah');

    // Trigger the captured onSuccess (the mock does not auto-invoke it).
    act(() => {
      mockCreateMutation.mock.results[0]?.value._onSuccess?.();
    });

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('');
  });

  it('navigates back via the step indicator and via the Previous button', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    expect(screen.getByLabelText(/company name/i)).toBeTruthy();
    // back to step 1 by clicking the completed step indicator button
    fireEvent.click(screen.getByRole('button', { name: /step 1/i }));
    expect(screen.queryByLabelText(/company name/i)).toBeNull();
    // forward, then back via the Previous button
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.queryByLabelText(/company name/i)).toBeNull();
  });

  it('reveals the "please specify" field when source is Other', () => {
    render(<CreateNewLeadPage />);
    fireEvent.change(screen.getByLabelText(/lead source/i), { target: { value: 'other' } });
    const specify = screen.getByLabelText(/please specify/i) as HTMLInputElement;
    expect(specify).toBeTruthy();
    fireEvent.change(specify, { target: { value: 'Podcast ad' } });
    expect(specify.value).toBe('Podcast ad');
  });

  it('cancels back to /leads from step 1', () => {
    render(<CreateNewLeadPage />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockPush).toHaveBeenCalledWith('/leads');
  });
});
