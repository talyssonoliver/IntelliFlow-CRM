/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@intelliflow/ui', async () => {
  const R = await import('react');
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      R.createElement('div', { 'data-testid': 'card', className }, children),
  };
});

vi.mock('@/lib/leads/lead-form-utils', () => ({
  sourceOptions: [
    { value: '', label: 'Select a source...' },
    { value: 'website', label: 'Website / Organic' },
    { value: 'referral', label: 'Referral' },
    { value: 'other', label: 'Other' },
  ],
  industryOptions: [
    { value: '', label: 'Select an industry...' },
    { value: 'technology', label: 'Technology' },
  ],
  companySizeOptions: [
    { value: '', label: 'Select company size...' },
    { value: '1-10', label: '1-10 employees' },
  ],
  revenueOptions: [
    { value: '', label: 'Select annual revenue...' },
    { value: '1M-10M', label: '$1M - $10M' },
  ],
  timelineOptions: [
    { value: '', label: 'Select timeline...' },
    { value: 'immediate', label: 'Immediate (within 1 month)' },
    { value: 'short', label: 'Short-term (1-3 months)' },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { LeadForm, validateLeadFormValues, type LeadFormValues } from '../LeadForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValues(overrides: Partial<LeadFormValues> = {}): LeadFormValues {
  return {
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
    ...overrides,
  };
}

function renderCreateForm(overrides: Partial<React.ComponentProps<typeof LeadForm>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  const onCancel = vi.fn();
  render(
    <LeadForm
      mode="create"
      values={makeValues()}
      errors={{}}
      onChange={onChange}
      onSubmit={onSubmit}
      isSubmitting={false}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onChange, onSubmit, onCancel };
}

function renderEditForm(overrides: Partial<React.ComponentProps<typeof LeadForm>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  const onCancel = vi.fn();
  render(
    <LeadForm
      mode="edit"
      values={makeValues({ firstName: 'John', lastName: 'Doe' })}
      errors={{}}
      onChange={onChange}
      onSubmit={onSubmit}
      isSubmitting={false}
      onCancel={onCancel}
      readOnlyInfo={{ email: 'john@example.com', status: 'NEW', source: 'WEBSITE' }}
      {...overrides}
    />
  );
  return { onChange, onSubmit, onCancel };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeadForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Create mode — section rendering
  // -------------------------------------------------------------------------

  it('renders BasicInfoSection when visibleSections=["basic"]', () => {
    renderCreateForm({ visibleSections: ['basic'] });
    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.queryByLabelText(/company/i)).toBeNull();
    expect(screen.queryByLabelText(/budget/i)).toBeNull();
  });

  it('renders CompanyDetailsSection when visibleSections=["company"]', () => {
    renderCreateForm({ visibleSections: ['company'] });
    expect(screen.getByLabelText('Company')).toBeTruthy();
    expect(screen.getByLabelText(/industry/i)).toBeTruthy();
    expect(screen.getByLabelText(/annual revenue/i)).toBeTruthy();
    expect(screen.queryByLabelText(/first name/i)).toBeNull();
    expect(screen.queryByLabelText(/budget/i)).toBeNull();
  });

  it('renders QualificationSection when visibleSections=["qualification"]', () => {
    renderCreateForm({ visibleSections: ['qualification'] });
    expect(screen.getByLabelText(/budget/i)).toBeTruthy();
    expect(screen.getByLabelText(/authority/i)).toBeTruthy();
    expect(screen.getByLabelText(/need/i)).toBeTruthy();
    expect(screen.getByLabelText(/timeline/i)).toBeTruthy();
    expect(screen.queryByLabelText(/first name/i)).toBeNull();
    expect(screen.queryByLabelText(/company/i)).toBeNull();
  });

  it('renders all sections when visibleSections is omitted', () => {
    renderCreateForm();
    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText('Company')).toBeTruthy();
    expect(screen.getByLabelText(/budget/i)).toBeTruthy();
  });

  it('renders email input in create mode', () => {
    renderCreateForm({ visibleSections: ['basic'] });
    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput.tagName).toBe('INPUT');
  });

  it('does NOT render email input in edit mode', () => {
    renderEditForm();
    expect(screen.queryByLabelText(/email address/i)).toBeNull();
    // read-only email displayed as text
    expect(screen.getByText('john@example.com')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  it('renders read-only email / status / source in edit mode', () => {
    renderEditForm({
      readOnlyInfo: { email: 'alice@example.com', status: 'QUALIFIED', source: 'REFERRAL' },
    });
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('QUALIFIED')).toBeTruthy();
    expect(screen.getByText('REFERRAL')).toBeTruthy();
  });

  it('renders all sections + read-only info in edit mode (no visibleSections)', () => {
    renderEditForm();
    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText('Company')).toBeTruthy();
    expect(screen.getByLabelText(/budget/i)).toBeTruthy();
    expect(screen.getByText('john@example.com')).toBeTruthy();
  });

  it('renders BANT inputs in edit mode', () => {
    // BANT: budget/authority/need/timeline are in QualificationSection;
    // annualRevenue is in CompanyDetailsSection.
    renderEditForm({ visibleSections: ['company', 'qualification'] });
    expect(screen.getByLabelText(/budget/i)).toBeTruthy();
    expect(screen.getByLabelText(/authority/i)).toBeTruthy();
    expect(screen.getByLabelText(/need/i)).toBeTruthy();
    expect(screen.getByLabelText(/timeline/i)).toBeTruthy();
    expect(screen.getByLabelText(/annual revenue/i)).toBeTruthy();
  });

  it('renders estimatedValue in edit mode', () => {
    renderEditForm({ visibleSections: ['qualification'] });
    expect(screen.getByLabelText(/estimated value/i)).toBeTruthy();
  });

  it('does NOT render estimatedValue in create mode', () => {
    renderCreateForm({ visibleSections: ['qualification'] });
    expect(screen.queryByLabelText(/estimated value/i)).toBeNull();
  });

  it('renders BANT inputs in create mode', () => {
    renderCreateForm({ visibleSections: ['qualification'] });
    expect(screen.getByLabelText(/budget/i)).toBeTruthy();
    expect(screen.getByLabelText(/authority/i)).toBeTruthy();
    expect(screen.getByLabelText(/need/i)).toBeTruthy();
    expect(screen.getByLabelText(/timeline/i)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // onChange / onSubmit / onCancel
  // -------------------------------------------------------------------------

  it('calls onChange with correct field + value', () => {
    const { onChange } = renderCreateForm({ visibleSections: ['basic'] });
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Sarah' } });
    expect(onChange).toHaveBeenCalledWith('firstName', 'Sarah');
  });

  it('calls onSubmit when form is submitted', () => {
    const { onSubmit } = renderCreateForm({ visibleSections: ['basic'] });
    fireEvent.submit(screen.getByLabelText(/first name/i).closest('form')!);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const { onCancel } = renderCreateForm({ visibleSections: ['basic'] });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // onEmailBlur
  // -------------------------------------------------------------------------

  it('calls onEmailBlur when email input loses focus in create mode', () => {
    const onEmailBlur = vi.fn();
    renderCreateForm({ visibleSections: ['basic'], onEmailBlur });
    fireEvent.blur(screen.getByLabelText(/email address/i));
    expect(onEmailBlur).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Enrichment notice
  // -------------------------------------------------------------------------

  it('displays enrichmentNotice text in create mode', () => {
    renderCreateForm({
      visibleSections: ['basic'],
      enrichmentNotice: 'Auto-filled company from email domain.',
    });
    expect(screen.getByText(/auto-filled company from email domain/i)).toBeTruthy();
  });

  it('does not render enrichmentNotice when prop is empty', () => {
    renderCreateForm({ visibleSections: ['basic'], enrichmentNotice: '' });
    expect(screen.queryByText(/auto-filled/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Aria + error rendering
  // -------------------------------------------------------------------------

  it('sets aria-invalid on an error field', () => {
    renderCreateForm({
      visibleSections: ['basic'],
      errors: { firstName: 'First name is required' },
    });
    const input = screen.getByLabelText(/first name/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('sets aria-describedby to <field>-error on an error field', () => {
    renderCreateForm({
      visibleSections: ['basic'],
      errors: { firstName: 'First name is required' },
    });
    const input = screen.getByLabelText(/first name/i);
    expect(input.getAttribute('aria-describedby')).toBe('firstName-error');
  });

  it('renders error paragraph with role=alert', () => {
    renderCreateForm({
      visibleSections: ['basic'],
      errors: { firstName: 'First name is required' },
    });
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toBe('First name is required');
  });

  // -------------------------------------------------------------------------
  // Disabled prop
  // -------------------------------------------------------------------------

  it('disables submit when disabled=true', () => {
    renderEditForm({ disabled: true });
    const btn = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables submit when isSubmitting=true', () => {
    renderEditForm({ isSubmitting: true });
    const btn = screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // "Other" source field
  // -------------------------------------------------------------------------

  it('shows sourceOther input when source === "other" in create mode', () => {
    renderCreateForm({
      visibleSections: ['basic'],
      values: makeValues({ source: 'other' }),
    });
    expect(screen.getByLabelText(/please specify/i)).toBeTruthy();
  });

  it('hides sourceOther input when source !== "other"', () => {
    renderCreateForm({
      visibleSections: ['basic'],
      values: makeValues({ source: 'website' }),
    });
    expect(screen.queryByLabelText(/please specify/i)).toBeNull();
  });

  it('does not show source select in edit mode', () => {
    renderEditForm({ visibleSections: ['basic'] });
    expect(screen.queryByLabelText(/lead source/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateLeadFormValues
// ---------------------------------------------------------------------------

describe('validateLeadFormValues', () => {
  const blank = (): LeadFormValues => ({
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
  });

  // -------------------------------------------------------------------------
  // Create mode — required fields
  // -------------------------------------------------------------------------

  it('errors on missing firstName in create mode', () => {
    const errs = validateLeadFormValues(
      { ...blank(), lastName: 'Doe', email: 'a@b.com' },
      'create'
    );
    expect(errs.firstName).toBeTruthy();
  });

  it('errors on missing lastName in create mode', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', email: 'a@b.com' },
      'create'
    );
    expect(errs.lastName).toBeTruthy();
  });

  it('errors on missing email in create mode', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe' },
      'create'
    );
    expect(errs.email).toBe('Email is required');
  });

  it('errors on invalid email in create mode', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe', email: 'notanemail' },
      'create'
    );
    expect(errs.email).toBe('Please enter a valid email address');
  });

  it('accepts valid multi-label email', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe', email: 'jane@mail.acme.co.uk' },
      'create'
    );
    expect(errs.email).toBeUndefined();
  });

  it('errors on missing sourceOther when source === "other"', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe', email: 'a@b.com', source: 'other' },
      'create'
    );
    expect(errs.sourceOther).toBeTruthy();
  });

  it('does NOT error on missing sourceOther when source !== "other"', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe', email: 'a@b.com', source: 'referral' },
      'create'
    );
    expect(errs.sourceOther).toBeUndefined();
  });

  it('returns no errors for valid create values', () => {
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe', email: 'a@b.com' },
      'create'
    );
    expect(Object.keys(errs)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Create mode — section filtering
  // -------------------------------------------------------------------------

  it('does NOT validate company/BANT fields when sections=["basic"]', () => {
    // Company and BANT fields are all blank but sections=['basic'] must not error on them.
    const errs = validateLeadFormValues(
      { ...blank(), firstName: 'Jane', lastName: 'Doe', email: 'a@b.com' },
      'create',
      ['basic']
    );
    expect(errs.company).toBeUndefined();
    expect(errs.budget).toBeUndefined();
    expect(errs.need).toBeUndefined();
  });

  it('does NOT validate email when sections=["qualification"]', () => {
    // Email is blank but sections=['qualification'] — no basic-step validation.
    const errs = validateLeadFormValues(blank(), 'create', ['qualification']);
    expect(errs.email).toBeUndefined();
    expect(errs.firstName).toBeUndefined();
  });

  it('does NOT validate email when sections=["company"]', () => {
    const errs = validateLeadFormValues(blank(), 'create', ['company']);
    expect(errs.email).toBeUndefined();
  });

  it('validates basic fields when sections=["basic"] (firstName required)', () => {
    const errs = validateLeadFormValues(
      { ...blank(), email: 'a@b.com', lastName: 'Doe' },
      'create',
      ['basic']
    );
    expect(errs.firstName).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  it('returns no errors for blank edit form (all optional)', () => {
    const errs = validateLeadFormValues(blank(), 'edit');
    expect(Object.keys(errs)).toHaveLength(0);
  });

  it('returns a field error for an overly long website in edit mode', () => {
    const errs = validateLeadFormValues({ ...blank(), website: 'a'.repeat(201) }, 'edit');
    expect(errs.website).toBeTruthy();
  });
});
