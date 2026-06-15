/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// LeadForm mock — captures props + renders Cancel + Save buttons so the tests
// can click them without rendering the full form.
// ---------------------------------------------------------------------------
let capturedLeadFormProps: {
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onSubmit: (e: { preventDefault: () => void }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  disabled?: boolean;
  readOnlyInfo?: { email: string; status: string; source: string };
  mode: string;
} | null = null;

vi.mock('@/components/leads/LeadForm', () => ({
  EMPTY_FORM_VALUES: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    source: '',
    sourceOther: '',
    company: '',
    website: '',
    industry: '',
    companySize: '',
    annualRevenue: '',
    location: '',
    estimatedValue: '',
    tags: '',
    status: '',
    qualificationNotes: '',
    budget: '',
    authority: '',
    need: '',
    timeline: '',
  },
  LeadForm: (props: typeof capturedLeadFormProps) => {
    capturedLeadFormProps = props;
    return React.createElement(
      'div',
      { 'data-testid': 'lead-form' },
      React.createElement(
        'form',
        {
          'data-testid': 'lead-form-inner',
          onSubmit: (e: React.FormEvent) => {
            e.preventDefault();
            props?.onSubmit({ preventDefault: () => undefined });
          },
        },
        React.createElement(
          'button',
          {
            type: 'submit',
            'data-testid': 'save-btn',
            disabled: (props?.isSubmitting ?? false) || (props?.disabled ?? false),
          },
          props?.isSubmitting ? 'Saving...' : 'Save Changes'
        )
      ),
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'cancel-btn', onClick: () => props?.onCancel() },
        'Cancel'
      )
    );
  },
  validateLeadFormValues: vi.fn(() => ({})),
}));

vi.mock('@/hooks/useUnsavedChanges', () => ({ useFormUnsavedChanges: vi.fn() }));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { LeadEditor, type LeadEditorLead } from '../lead-editor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLead(overrides: Partial<LeadEditorLead> = {}): LeadEditorLead {
  return {
    email: 'john@example.com',
    status: 'NEW',
    source: 'WEBSITE',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    title: 'CTO',
    company: 'ACME Corp',
    location: 'New York',
    website: 'https://acme.com',
    estimatedValue: 5000,
    tags: ['enterprise', 'saas'],
    budget: '$50k',
    authority: 'Decision maker',
    need: 'CRM solution',
    timeline: 'immediate',
    annualRevenue: '1M-10M',
    ...overrides,
  };
}

const noop = () => undefined;

function renderEditor(props: Partial<React.ComponentProps<typeof LeadEditor>> = {}) {
  return render(
    <LeadEditor
      leadId="test-lead-id"
      lead={makeLead()}
      isSaving={false}
      onSave={vi.fn()}
      onCancel={noop}
      {...props}
    />
  );
}

// Submit the inner form via fireEvent
function submitForm() {
  const form = screen.getByTestId('lead-form-inner');
  fireEvent.submit(form);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeadEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedLeadFormProps = null;
  });

  // -------------------------------------------------------------------------
  // Seeding from lead
  // -------------------------------------------------------------------------

  it('pre-populates editable fields from the lead', () => {
    renderEditor();
    expect(capturedLeadFormProps?.values.firstName).toBe('John');
    expect(capturedLeadFormProps?.values.lastName).toBe('Doe');
    expect(capturedLeadFormProps?.values.company).toBe('ACME Corp');
    expect(capturedLeadFormProps?.values.phone).toBe('+1234567890');
    expect(capturedLeadFormProps?.values.location).toBe('New York');
  });

  it('passes mode="edit" and readOnlyInfo.email to LeadForm', () => {
    renderEditor();
    expect(capturedLeadFormProps?.mode).toBe('edit');
    expect(capturedLeadFormProps?.readOnlyInfo?.email).toBe('john@example.com');
    // No email input (email is read-only in edit)
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('shows email read-only via readOnlyInfo prop', () => {
    renderEditor();
    expect(capturedLeadFormProps?.readOnlyInfo?.email).toBe('john@example.com');
  });

  it('converts estimatedValue cents → dollars', () => {
    renderEditor({ lead: makeLead({ estimatedValue: 5000 }) });
    expect(capturedLeadFormProps?.values.estimatedValue).toBe('50');
  });

  it('seeds phone from the object form { value }', () => {
    renderEditor({ lead: makeLead({ phone: { value: '+1234567890' } }) });
    expect(capturedLeadFormProps?.values.phone).toBe('+1234567890');
  });

  it('seeds empty strings when nullable fields are null', () => {
    renderEditor({
      lead: makeLead({
        firstName: null,
        phone: null,
        location: null,
        estimatedValue: null,
        tags: null,
      }),
    });
    expect(capturedLeadFormProps?.values.firstName).toBe('');
    expect(capturedLeadFormProps?.values.phone).toBe('');
    expect(capturedLeadFormProps?.values.location).toBe('');
    expect(capturedLeadFormProps?.values.estimatedValue).toBe('');
    expect(capturedLeadFormProps?.values.tags).toBe('');
  });

  it('re-seeds the form when navigating to a different lead', () => {
    const { rerender } = render(
      <LeadEditor
        leadId="lead-a"
        lead={makeLead({ firstName: 'Alice' })}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={noop}
      />
    );
    expect(capturedLeadFormProps?.values.firstName).toBe('Alice');
    rerender(
      <LeadEditor
        leadId="lead-b"
        lead={makeLead({ firstName: 'Bob' })}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={noop}
      />
    );
    expect(capturedLeadFormProps?.values.firstName).toBe('Bob');
  });

  // -------------------------------------------------------------------------
  // BANT seeding
  // -------------------------------------------------------------------------

  it('seeds BANT fields from the lead', () => {
    renderEditor({
      lead: makeLead({
        budget: '$50k',
        authority: 'Decision maker',
        need: 'CRM solution',
        timeline: 'immediate',
        annualRevenue: '1M-10M',
      }),
    });
    expect(capturedLeadFormProps?.values.budget).toBe('$50k');
    expect(capturedLeadFormProps?.values.authority).toBe('Decision maker');
    expect(capturedLeadFormProps?.values.need).toBe('CRM solution');
    expect(capturedLeadFormProps?.values.timeline).toBe('immediate');
    expect(capturedLeadFormProps?.values.annualRevenue).toBe('1M-10M');
  });

  it('seeds empty strings for null BANT fields', () => {
    renderEditor({
      lead: makeLead({
        budget: null,
        authority: null,
        need: null,
        timeline: null,
        annualRevenue: null,
      }),
    });
    expect(capturedLeadFormProps?.values.budget).toBe('');
    expect(capturedLeadFormProps?.values.authority).toBe('');
    expect(capturedLeadFormProps?.values.need).toBe('');
    expect(capturedLeadFormProps?.values.timeline).toBe('');
    expect(capturedLeadFormProps?.values.annualRevenue).toBe('');
  });

  // -------------------------------------------------------------------------
  // Field changes
  // -------------------------------------------------------------------------

  it('updates every editable field on change', async () => {
    renderEditor();
    await act(async () => {
      capturedLeadFormProps?.onChange('firstName', 'A');
    });
    expect(capturedLeadFormProps?.values.firstName).toBe('A');

    await act(async () => {
      capturedLeadFormProps?.onChange('lastName', 'B');
    });
    expect(capturedLeadFormProps?.values.lastName).toBe('B');

    await act(async () => {
      capturedLeadFormProps?.onChange('tags', 'x, y');
    });
    expect(capturedLeadFormProps?.values.tags).toBe('x, y');
  });

  // -------------------------------------------------------------------------
  // Submit — minimal patch
  // -------------------------------------------------------------------------

  it('submits a minimal patch of only the changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    renderEditor({ onSave });
    // Change only firstName
    await act(async () => {
      capturedLeadFormProps?.onChange('firstName', 'Jane');
    });
    await act(async () => {
      submitForm();
    });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ id: 'test-lead-id', firstName: 'Jane' });
    });
  });

  it('BANT field changes round-trip to payload', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    renderEditor({ onSave, lead: makeLead({ budget: '' }) });
    await act(async () => {
      capturedLeadFormProps?.onChange('budget', '$100k');
    });
    await act(async () => {
      submitForm();
    });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-lead-id', budget: '$100k' })
      );
    });
  });

  it('clears the dirty state after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    renderEditor({ onSave });
    await act(async () => {
      capturedLeadFormProps?.onChange('firstName', 'Jane');
    });
    // Dirty: disabled=false
    expect(capturedLeadFormProps?.disabled).toBe(false);
    await act(async () => {
      submitForm();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // After save, seededSnapshot updated → isDirty=false → disabled=true
    await waitFor(() => expect(capturedLeadFormProps?.disabled).toBe(true));
  });

  it('does not call onSave when nothing changed (no no-op update)', async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    await act(async () => {
      submitForm();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables Save until the form is dirty', async () => {
    renderEditor();
    // Initially not dirty → disabled=true
    expect(capturedLeadFormProps?.disabled).toBe(true);
    // Change a field → dirty → disabled=false
    await act(async () => {
      capturedLeadFormProps?.onChange('firstName', 'Jane');
    });
    expect(capturedLeadFormProps?.disabled).toBe(false);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    renderEditor({ onCancel });
    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the saving state and disables Save while saving', () => {
    renderEditor({ isSaving: true });
    expect(screen.getByText('Saving...')).toBeTruthy();
    const saveBtn = screen.getByTestId('save-btn') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // F9 inline error (IFC-242): validation in handleSubmit (wrapper validates
  // via updateLeadSchema before calling onSave, surfaces errors in capturedProps).
  // -------------------------------------------------------------------------

  it('shows an inline error and does not call onSave when a field is invalid', async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    // Set an invalid website (>200 chars)
    await act(async () => {
      capturedLeadFormProps?.onChange('website', 'a'.repeat(201));
    });
    await act(async () => {
      submitForm();
    });

    await waitFor(() => {
      // Validation error surfaced in capturedLeadFormProps.errors
      expect(capturedLeadFormProps?.errors.website).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the inline error once the field is corrected and then saves', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    renderEditor({ onSave });
    await act(async () => {
      capturedLeadFormProps?.onChange('website', 'a'.repeat(201));
    });
    await act(async () => {
      submitForm();
    });
    await waitFor(() => expect(capturedLeadFormProps?.errors.website).toBeTruthy());

    // Correct the field — error is cleared on change
    await act(async () => {
      capturedLeadFormProps?.onChange('website', 'https://valid.example.com');
    });
    expect(capturedLeadFormProps?.errors.website).toBeUndefined();

    await act(async () => {
      submitForm();
    });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        id: 'test-lead-id',
        website: 'https://valid.example.com',
      })
    );
  });

  // -------------------------------------------------------------------------
  // Read-only info badge
  // -------------------------------------------------------------------------

  it('passes status and source to readOnlyInfo', () => {
    renderEditor({ lead: makeLead({ status: 'QUALIFIED', source: 'REFERRAL' }) });
    expect(capturedLeadFormProps?.readOnlyInfo?.status).toBe('QUALIFIED');
    expect(capturedLeadFormProps?.readOnlyInfo?.source).toBe('REFERRAL');
  });
});
