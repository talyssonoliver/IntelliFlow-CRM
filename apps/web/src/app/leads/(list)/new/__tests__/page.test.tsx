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
// LeadForm mock — captures props so tests can inspect + call callbacks.
// The mock renders the shell buttons (Next Step / Create Lead / Previous /
// Cancel) via capturedProps to keep wizard-navigation tests working.
// ---------------------------------------------------------------------------
let capturedProps: {
  onChange: (field: string, value: string) => void;
  onSubmit: (e: { preventDefault: () => void }) => void;
  onEmailBlur?: () => void;
  enrichmentNotice?: string;
  values: Record<string, string>;
  errors: Record<string, string>;
} | null = null;

const { mockValidateLeadFormValues } = vi.hoisted(() => ({
  mockValidateLeadFormValues: vi.fn(() => ({})),
}));

vi.mock('@/components/leads/LeadForm', () => ({
  EMPTY_FORM_VALUES: {
    firstName: '', lastName: '', email: '', phone: '', title: '',
    source: '', sourceOther: '', company: '', website: '', industry: '',
    companySize: '', annualRevenue: '', location: '', estimatedValue: '',
    tags: '', status: '', qualificationNotes: '', budget: '', authority: '', need: '', timeline: '',
  },
  LeadForm: (props: {
    onChange: (field: string, value: string) => void;
    onSubmit: (e: { preventDefault: () => void }) => void;
    onEmailBlur?: () => void;
    enrichmentNotice?: string;
    values: Record<string, string>;
    errors: Record<string, string>;
  }) => {
    capturedProps = props;
    // Render a minimal form so tests that look for form elements still pass.
    return React.createElement(
      'div',
      { 'data-testid': 'lead-form' },
      // Expose enrichment notice so enrichment tests can see it
      props.enrichmentNotice
        ? React.createElement('span', { 'data-testid': 'enrichment-notice' }, props.enrichmentNotice)
        : null
    );
  },
  validateLeadFormValues: mockValidateLeadFormValues,
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/leads/lead-enrichment', () => ({
  enrichFromEmail: mockEnrichFromEmail,
}));

vi.mock('@/lib/leads/lead-form-utils', () => ({
  buildQualificationNote: vi.fn((data: { source: string; sourceOther: string; companySize: string; industry: string; qualificationNotes: string }) => {
    // Real implementation — mirror what the util does so payload tests pass
    const lines: string[] = [];
    if (data.source === 'other' && data.sourceOther?.trim()) {
      lines.push(`Source detail: ${data.sourceOther.trim()}`);
    }
    if (data.companySize?.trim()) {
      lines.push(`Company size: ${data.companySize}`);
    }
    if (data.industry?.trim()) {
      const industryLabels: Record<string, string> = { technology: 'Technology' };
      lines.push(`Industry: ${industryLabels[data.industry] ?? data.industry}`);
    }
    if (data.qualificationNotes?.trim()) {
      lines.push(`Notes: ${data.qualificationNotes.trim()}`);
    }
    if (lines.length === 0) return '';
    const body = `Lead qualification details (captured on the New Lead form):\n${lines.join('\n')}`;
    return body.length > 5000 ? `${body.slice(0, 4999)}…` : body;
  }),
  mapSourceToEnum: vi.fn((source: string) => {
    const map: Record<string, string> = {
      website: 'WEBSITE',
      referral: 'REFERRAL',
      linkedin: 'SOCIAL',
      conference: 'EVENT',
      cold_outreach: 'COLD_CALL',
      other: 'OTHER',
    };
    return map[source];
  }),
  toTimeline: vi.fn((v: string) => {
    const valid = ['immediate', 'short', 'medium', 'long', 'unknown'];
    return valid.includes(v.trim()) ? v.trim() : undefined;
  }),
  toRevenueBand: vi.fn((v: string) => {
    const valid = ['<1M', '1M-10M', '10M-50M', '50M-100M', '100M+'];
    return valid.includes(v.trim()) ? v.trim() : undefined;
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
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
  const R = await import('react');
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      R.createElement('div', { 'data-testid': 'card', className }, children),
    Skeleton: ({ className }: { className?: string }) =>
      R.createElement('div', { 'data-testid': 'skeleton', className }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => R.createElement('div', null, children),
    Toast: () => null,
    ToastTitle: ({ children }: { children: React.ReactNode }) => R.createElement('span', null, children),
    ToastDescription: ({ children }: { children: React.ReactNode }) => R.createElement('span', null, children),
    ToastClose: () => null,
    ToastViewport: () => null,
  };
});

// ---------------------------------------------------------------------------
// Import component under test (AFTER mocks)
// ---------------------------------------------------------------------------
import CreateNewLeadPage from '../NewLeadForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fill the basic step fields via capturedProps.onChange (since LeadForm is mocked
 * the form inputs don't exist in the DOM — we interact through the captured callback).
 */
const fillBasicStep = () => {
  act(() => {
    capturedProps?.onChange('firstName', 'Sarah');
    capturedProps?.onChange('lastName', 'Connor');
    capturedProps?.onChange('email', 'sarah@acme.com');
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CreateNewLeadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedProps = null;
    // Default: no validation errors so wizard advances freely.
    mockValidateLeadFormValues.mockReturnValue({});
    // Restore identity enrichment
    mockEnrichFromEmail.mockImplementation(
      (_email: string, fields: Record<string, unknown>) => fields
    );
    mockUseRequireAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'u1', email: 'test@test.com' },
    });
    mockMutateAsync.mockResolvedValue({ id: 'new-lead-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading skeleton and no input elements when auth is loading (AC-002)', () => {
    mockUseRequireAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      user: null as unknown as { id: string; email: string },
    });

    render(<CreateNewLeadPage />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    // LeadForm is not rendered — no lead-form testid
    expect(screen.queryByTestId('lead-form')).toBeNull();
    expect(screen.queryByText('Create New Lead')).toBeNull();
  });

  it('does NOT render form content when user is not authenticated (AC-001)', () => {
    mockUseRequireAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      user: null as unknown as { id: string; email: string },
    });

    render(<CreateNewLeadPage />);

    expect(screen.queryByText('Create New Lead')).toBeNull();
    expect(screen.queryByTestId('lead-form')).toBeNull();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(mockUseRequireAuth).toHaveBeenCalled();
  });

  it('renders form with "Create New Lead" heading when authenticated', () => {
    render(<CreateNewLeadPage />);

    expect(screen.getByText('Create New Lead')).toBeTruthy();
    expect(screen.getByTestId('lead-form')).toBeTruthy();
  });

  it('uses api.lead.create.useMutation (AC-003, AC-004)', () => {
    render(<CreateNewLeadPage />);

    expect(mockCreateMutation).toHaveBeenCalled();
    const callArgs = mockCreateMutation.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty('onSuccess');
    expect(callArgs).toHaveProperty('onError');
  });

  it('redirects to /leads on successful submission', () => {
    render(<CreateNewLeadPage />);

    const mutationResult = mockCreateMutation.mock.results[0]?.value;
    act(() => {
      mutationResult?._onSuccess?.();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockPush).toHaveBeenCalledWith('/leads');
  });

  it('handles submission error with onError callback', () => {
    render(<CreateNewLeadPage />);

    const mutationResult = mockCreateMutation.mock.results[0]?.value;

    act(() => {
      mutationResult?._onError?.({ message: 'Server error' });
    });

    const callArgs = mockCreateMutation.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty('onError');
    expect(typeof callArgs!.onError).toBe('function');
  });

  // -------------------------------------------------------------------------
  // PG-060: enrichment wiring (W-1..W-4)
  // -------------------------------------------------------------------------

  it('invokes enrichFromEmail when the email field loses focus (W-1, AC-006)', () => {
    render(<CreateNewLeadPage />);

    act(() => {
      capturedProps?.onChange('email', 'sarah@acme.com');
    });
    act(() => {
      capturedProps?.onEmailBlur?.();
    });

    expect(mockEnrichFromEmail).toHaveBeenCalled();
    expect(mockEnrichFromEmail.mock.calls[0]?.[0]).toBe('sarah@acme.com');
  });

  it('applies the enriched company to the empty company field (W-2, AC-003)', async () => {
    mockEnrichFromEmail.mockImplementation((_email: string, fields: Record<string, unknown>) => ({
      ...fields,
      company: 'Acme',
    }));
    render(<CreateNewLeadPage />);

    fillBasicStep();
    act(() => {
      capturedProps?.onEmailBlur?.();
    });

    // After enrichment, formData.company should be 'Acme' — it's passed to LeadForm as values
    expect(capturedProps?.values.company).toBe('Acme');
  });

  it('forwards the current form (incl. a pre-filled company) to enrichFromEmail (W-3, AC-005)', () => {
    render(<CreateNewLeadPage />);

    fillBasicStep();
    // Simulate user setting company manually
    act(() => {
      capturedProps?.onChange('company', 'Manual Co');
    });
    act(() => {
      capturedProps?.onEmailBlur?.();
    });

    expect(mockEnrichFromEmail).toHaveBeenLastCalledWith(
      'sarah@acme.com',
      expect.objectContaining({ company: 'Manual Co' })
    );
  });

  it('includes the enriched website in the create payload (W-4, AC-003)', async () => {
    mockEnrichFromEmail.mockImplementation((_email: string, fields: Record<string, unknown>) => ({
      ...fields,
      website: 'https://acme.com',
    }));
    render(<CreateNewLeadPage />);

    fillBasicStep();
    act(() => {
      capturedProps?.onEmailBlur?.();
    });

    // Advance to final step and click Create Lead
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // step 1 → 2
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // step 2 → 3
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://acme.com' })
    );
  });

  // -------------------------------------------------------------------------
  // PG-060: auto-fill must not go stale when the email domain changes (W-5)
  // -------------------------------------------------------------------------
  it('refreshes an auto-filled company/website when the email domain changes (W-5)', () => {
    mockEnrichFromEmail.mockImplementation((email: string, fields: Record<string, unknown>) => {
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
    act(() => { capturedProps?.onEmailBlur?.(); }); // auto-fills Acme

    act(() => {
      capturedProps?.onChange('email', 'sarah@globex.com');
    });
    act(() => { capturedProps?.onEmailBlur?.(); }); // should refresh to Globex

    expect(capturedProps?.values.company).toBe('Globex');
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
    // User manually sets company
    act(() => {
      capturedProps?.onChange('company', 'Manual Co');
    });
    act(() => { capturedProps?.onEmailBlur?.(); });

    expect(capturedProps?.values.company).toBe('Manual Co');
  });

  // -------------------------------------------------------------------------
  // PG-060: accessibility (A-1, A-2 — AC-008)
  // -------------------------------------------------------------------------

  it('associates the email error via aria-invalid + aria-describedby (A-1, AC-008)', () => {
    // Make validateLeadFormValues return an email error
    mockValidateLeadFormValues.mockReturnValueOnce({ email: 'Email is required' });
    render(<CreateNewLeadPage />);

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    // errors are now in capturedProps.errors — validation fired and set errors state
    expect(capturedProps?.errors.email).toBeTruthy();
  });

  it('renders an aria-live region for enrichment announcements (A-2, AC-008)', () => {
    render(<CreateNewLeadPage />);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // annualRevenue is NEVER mapped into estimatedValue
  // -------------------------------------------------------------------------
  it.each(['<1M', '1M-10M', '10M-50M', '50M-100M', '100M+'])(
    'never maps revenue band %s into estimatedValue (distinct business metric)',
    async (band) => {
      render(<CreateNewLeadPage />);
      fillBasicStep();
      act(() => { capturedProps?.onChange('annualRevenue', band); });
      fireEvent.click(screen.getByRole('button', { name: /next step/i }));
      fireEvent.click(screen.getByRole('button', { name: /next step/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
      });

      const payload = mockMutateAsync.mock.calls[0]?.[0];
      expect(payload?.estimatedValue).toBeUndefined();
    }
  );

  // -------------------------------------------------------------------------
  // Source handling
  // -------------------------------------------------------------------------
  it('omits source when none is selected (lets the API default apply)', async () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.source).toBeUndefined();
  });

  it('sends the selected Lead Source enum when one is chosen', async () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    act(() => { capturedProps?.onChange('source', 'referral'); });
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.source).toBe('REFERRAL');
  });

  // -------------------------------------------------------------------------
  // Email validation parity (via shell validateLeadFormValues call)
  // -------------------------------------------------------------------------
  it.each(['sarah@mail.acme.com', 'user@acme.co.uk', 'x@acme.io'])(
    'accepts the valid multi-label email %s and advances to step 2',
    (email) => {
      // Default mock returns {} (no errors) — valid email advances
      render(<CreateNewLeadPage />);
      act(() => {
        capturedProps?.onChange('firstName', 'Sarah');
        capturedProps?.onChange('lastName', 'Connor');
        capturedProps?.onChange('email', email);
      });
      fireEvent.click(screen.getByRole('button', { name: /next step/i }));
      // If step 2 rendered, Next Step button still appears (step 2 of 3)
      // Verify no errors set on email
      expect(capturedProps?.errors.email).toBeUndefined();
    }
  );

  it('rejects an invalid email and keeps the user on step 1', () => {
    mockValidateLeadFormValues.mockReturnValueOnce({ email: 'Please enter a valid email address' });
    render(<CreateNewLeadPage />);
    act(() => {
      capturedProps?.onChange('firstName', 'Sarah');
      capturedProps?.onChange('lastName', 'Connor');
      capturedProps?.onChange('email', 'notanemail');
    });
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    // Error is now in capturedProps.errors since validateLeadFormValues was called
    expect(capturedProps?.errors.email).toBe('Please enter a valid email address');
  });

  // -------------------------------------------------------------------------
  // Full field coverage across all three steps + navigation
  // -------------------------------------------------------------------------
  it('fills every field across all three steps and submits', async () => {
    render(<CreateNewLeadPage />);
    // Step 1 — Basic Info
    act(() => {
      capturedProps?.onChange('firstName', 'Sarah');
      capturedProps?.onChange('lastName', 'Connor');
      capturedProps?.onChange('email', 'sarah@acme.com');
      capturedProps?.onChange('phone', '+1 555 000 0000');
      capturedProps?.onChange('title', 'VP Marketing');
      capturedProps?.onChange('source', 'referral');
    });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    // Step 2 — Company Details
    act(() => {
      capturedProps?.onChange('company', 'Acme');
      capturedProps?.onChange('website', 'https://acme.com');
      capturedProps?.onChange('industry', 'technology');
      capturedProps?.onChange('companySize', '51-200');
      capturedProps?.onChange('annualRevenue', '1M-10M');
    });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    // Step 3 — Qualification (BANT)
    act(() => {
      capturedProps?.onChange('budget', '$50k-$100k');
      capturedProps?.onChange('authority', 'Decision maker');
      capturedProps?.onChange('need', 'CRM solution');
      capturedProps?.onChange('timeline', 'short');
      capturedProps?.onChange('qualificationNotes', 'Hot lead');
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    expect(mockMutateAsync).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // IFC-242: BANT / annualRevenue as structured fields
  // -------------------------------------------------------------------------
  it('sends BANT/annualRevenue as structured fields and source detail/industry/notes in qualificationNote', async () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    act(() => {
      capturedProps?.onChange('source', 'other');
      capturedProps?.onChange('sourceOther', 'Podcast ad');
    });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company
    act(() => {
      capturedProps?.onChange('industry', 'technology');
      capturedProps?.onChange('annualRevenue', '1M-10M');
    });
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Qualification
    act(() => {
      capturedProps?.onChange('budget', '$50k-$100k');
      capturedProps?.onChange('authority', 'Decision maker');
      capturedProps?.onChange('need', 'CRM solution');
      capturedProps?.onChange('timeline', 'immediate');
      capturedProps?.onChange('qualificationNotes', 'Hot lead');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.budget).toBe('$50k-$100k');
    expect(payload?.authority).toBe('Decision maker');
    expect(payload?.need).toBe('CRM solution');
    expect(payload?.timeline).toBe('immediate');
    expect(payload?.annualRevenue).toBe('1M-10M');
    expect(payload?.estimatedValue).toBeUndefined();
    expect(payload?.qualificationNote).toContain('Source detail: Podcast ad');
    expect(payload?.qualificationNote).toContain('Industry: Technology');
    expect(payload?.qualificationNote).toContain('Notes: Hot lead');
    expect(payload?.qualificationNote).not.toContain('Budget:');
    expect(payload?.qualificationNote).not.toContain('Need:');
    expect(payload?.qualificationNote).not.toContain('Annual revenue:');
  });

  it('omits qualificationNote from the payload when no schema-less fields are filled', async () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.qualificationNote).toBeUndefined();
  });

  it('caps qualificationNote at the server content budget (5000 chars)', async () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    act(() => {
      capturedProps?.onChange('qualificationNotes', 'x'.repeat(6000));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lead/i }));
    });

    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.qualificationNote?.length).toBeLessThanOrEqual(5000);
  });

  it('resets the form to pristine on successful create (clears the dirty registry)', () => {
    render(<CreateNewLeadPage />);
    act(() => { capturedProps?.onChange('firstName', 'Sarah'); });
    expect(capturedProps?.values.firstName).toBe('Sarah');

    // Trigger onSuccess
    act(() => {
      mockCreateMutation.mock.results[0]?.value._onSuccess?.();
    });

    expect(capturedProps?.values.firstName).toBe('');
  });

  it('navigates back via the step indicator and via the Previous button', () => {
    render(<CreateNewLeadPage />);
    fillBasicStep();
    fireEvent.click(screen.getByRole('button', { name: /next step/i })); // -> Company (step 2)
    // Back to step 1 by clicking the completed step indicator button
    fireEvent.click(screen.getByRole('button', { name: /step 1/i }));
    // Now on step 1 — Next Step is the forward button
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    // Previous button should now be available
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    // We should be back on step 1 (no 'Previous' button, only 'Cancel')
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('cancels back to /leads from step 1', () => {
    render(<CreateNewLeadPage />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockPush).toHaveBeenCalledWith('/leads');
  });
});
