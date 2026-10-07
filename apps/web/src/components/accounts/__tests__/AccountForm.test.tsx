/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import {
  AccountForm,
  buildCreateAccountPayload,
  buildUpdateAccountPayload,
  EMPTY_ACCOUNT_FORM_VALUES,
  toOptionsStatus,
  type AccountFormProps,
} from '../AccountForm';

const owners = [
  { id: 'u-admin', name: 'Ada Admin', title: 'Admin' },
  { id: 'u-rep', name: 'Rex Rep', title: null },
];

function renderForm(overrides: Partial<AccountFormProps> = {}) {
  const props: AccountFormProps = {
    mode: 'create',
    industryOptions: ['Retail', 'Healthcare'],
    industryStatus: 'ready',
    ownerOptions: owners,
    ownerStatus: 'ready',
    currentUser: { id: 'u-admin', role: 'ADMIN' },
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<AccountForm {...props} />);
  return props;
}

describe('buildCreateAccountPayload', () => {
  it('omits empty fields and "assign automatically"', () => {
    expect(buildCreateAccountPayload({ ...EMPTY_ACCOUNT_FORM_VALUES, name: ' Acme ' })).toEqual({
      name: 'Acme',
      website: undefined,
      industry: undefined,
      employees: undefined,
      revenue: undefined,
      description: undefined,
      country: undefined,
      region: undefined,
      postalCode: undefined,
      ownerId: undefined,
    });
  });

  it('parses numbers and keeps geography and owner', () => {
    expect(
      buildCreateAccountPayload({
        ...EMPTY_ACCOUNT_FORM_VALUES,
        name: 'Acme',
        employees: '25',
        revenue: 'abc',
        country: 'GB',
        region: 'London',
        postalCode: 'SW1A 1AA',
        ownerId: 'u-rep',
      })
    ).toMatchObject({
      employees: 25,
      revenue: undefined,
      country: 'GB',
      region: 'London',
      postalCode: 'SW1A 1AA',
      ownerId: 'u-rep',
    });
  });
});

describe('buildUpdateAccountPayload', () => {
  const initial = {
    ...EMPTY_ACCOUNT_FORM_VALUES,
    name: 'Acme',
    industry: 'Retail',
    employees: '10',
    country: 'GB',
    region: 'London',
    postalCode: 'SW1A 1AA',
  };

  it('sends only changed fields plus the id', () => {
    expect(buildUpdateAccountPayload('a1', initial, { ...initial, name: 'Acme Ltd' })).toEqual({
      id: 'a1',
      name: 'Acme Ltd',
    });
  });

  it('sends cleared geography as null and new numbers as numbers', () => {
    expect(
      buildUpdateAccountPayload('a1', initial, {
        ...initial,
        country: '',
        region: ' ',
        employees: '12',
        postalCode: 'EC1A 1BB',
      })
    ).toEqual({ id: 'a1', country: null, region: null, employees: 12, postalCode: 'EC1A 1BB' });
  });

  it('leaves out cleared non-geography fields', () => {
    expect(buildUpdateAccountPayload('a1', initial, { ...initial, industry: '' })).toEqual({
      id: 'a1',
    });
  });
});

describe('toOptionsStatus', () => {
  it('maps query state', () => {
    expect(toOptionsStatus({ isLoading: true, error: null })).toBe('loading');
    expect(toOptionsStatus({ isLoading: false, error: new Error('x') })).toBe('error');
    expect(toOptionsStatus({ isLoading: false, error: null })).toBe('ready');
  });
});

describe('AccountForm', () => {
  it('renders every field with the Location group', () => {
    renderForm();
    for (const label of [
      'Account name',
      'Website',
      'Industry',
      'Employees',
      'Annual revenue',
      'Description',
      'Country',
      'Region',
      'Postal code',
      'Account owner',
    ]) {
      expect(screen.getByLabelText(label)).toBeDefined();
    }
    expect(screen.getByRole('group', { name: 'Location' })).toBeDefined();
  });

  it('requires a name', async () => {
    const props = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByText('Account name is required.')).toBeDefined();
    expect(screen.getByLabelText('Account name').getAttribute('aria-invalid')).toBe('true');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the values with the chosen country and owner', async () => {
    const props = renderForm();
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Retail' } });
    fireEvent.change(screen.getByLabelText('Account owner'), { target: { value: 'u-rep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    expect(vi.mocked(props.onSubmit).mock.calls[0][0]).toMatchObject({
      name: 'Acme',
      country: 'GB',
      industry: 'Retail',
      ownerId: 'u-rep',
    });
  });

  it('maps the "No" options back to empty strings', async () => {
    const props = renderForm({
      initialValues: { name: 'Acme', country: 'GB', industry: 'Retail', ownerId: 'u-rep' },
    });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: '__none__' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: '__none__' } });
    fireEvent.change(screen.getByLabelText('Account owner'), { target: { value: '__auto__' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    expect(vi.mocked(props.onSubmit).mock.calls[0][0]).toMatchObject({
      country: '',
      industry: '',
      ownerId: '',
    });
  });

  it('admins see every user; non-admins see "Assign automatically" and themselves', () => {
    renderForm();
    expect(screen.getByRole('option', { name: 'Ada Admin — Admin' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Rex Rep' })).toBeDefined();
  });

  it.each([
    ['a sales rep', { id: 'u-rep', role: 'SALES_REP' }],
    ['a user whose role is still loading', { id: 'u-rep' }],
  ])('limits the owner list for %s', (_label, currentUser) => {
    renderForm({ currentUser });
    expect(screen.getByRole('option', { name: 'Assign automatically' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Rex Rep' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'Ada Admin — Admin' })).toBeNull();
  });

  it('disables submit and explains while options load', () => {
    renderForm({ industryStatus: 'loading', ownerStatus: 'loading' });
    expect(
      (screen.getByRole('button', { name: 'Create Account' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText('Loading industries…')).toBeDefined();
    expect(screen.getByText('Loading users…')).toBeDefined();
  });

  it('shows option errors without blocking submit', () => {
    renderForm({ industryStatus: 'error', ownerStatus: 'error' });
    expect(screen.getByText(/Could not load industries/)).toBeDefined();
    expect(screen.getByText(/Could not load users/)).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Create Account' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('edit mode: no owner select, Save disabled until dirty, reports dirtiness', () => {
    const onDirtyChange = vi.fn();
    renderForm({
      mode: 'edit',
      initialValues: { name: 'Acme', industry: 'Legacy' },
      onDirtyChange,
    });
    expect(screen.queryByLabelText('Account owner')).toBeNull();
    expect(screen.getByRole('option', { name: 'Legacy' })).toBeDefined();
    const save = screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Leeds' } });
    expect(save.disabled).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: '' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('shows the saving state', () => {
    renderForm({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDefined();
  });

  it('cancels', () => {
    const props = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('updates every text field', async () => {
    const props = renderForm();
    const fields: [string, string][] = [
      ['Account name', 'Acme'],
      ['Website', 'https://acme.example.invalid'],
      ['Employees', '5'],
      ['Annual revenue', '1000'],
      ['Description', 'Notes'],
      ['Region', 'London'],
      ['Postal code', 'SW1A 1AA'],
    ];
    for (const [label, value] of fields) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    expect(vi.mocked(props.onSubmit).mock.calls[0][0]).toMatchObject({
      website: 'https://acme.example.invalid',
      employees: '5',
      revenue: '1000',
      description: 'Notes',
      region: 'London',
      postalCode: 'SW1A 1AA',
    });
  });
});
