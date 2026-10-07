/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  revalidate: vi.fn(),
  invalidate: vi.fn(),
  unsaved: vi.fn(),
  auth: { isLoading: false, isAuthenticated: true, user: { id: 'u1', role: 'ADMIN' } as any },
  account: { data: undefined as any, isLoading: false, error: null as unknown },
  industry: { data: [] as unknown[] | undefined, isLoading: false, error: null as unknown },
  mutationOpts: null as null | {
    onSuccess: () => Promise<void>;
    onError: (error: { message: string }) => void;
  },
  formProps: null as null | Record<string, any>,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/hooks/useUnsavedChanges', () => ({ useFormUnsavedChanges: h.unsaved }));
vi.mock('@/app/accounts/actions', () => ({ revalidateAccountCaches: h.revalidate }));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title, breadcrumbs }: { title: string; breadcrumbs: { label: string }[] }) => (
    <h1>
      {title} {breadcrumbs.map((b) => b.label).join(' / ')}
    </h1>
  ),
}));
vi.mock('@/components/accounts/AccountForm', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  AccountForm: (props: Record<string, any>) => {
    h.formProps = props;
    return <div data-testid="account-form" />;
  },
}));
vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      account: {
        getById: { invalidate: h.invalidate },
        list: { invalidate: h.invalidate },
        stats: { invalidate: h.invalidate },
      },
    }),
    accountSettings: { industry: { list: { useQuery: () => h.industry } } },
    account: {
      getById: { useQuery: () => ({ ...h.account, refetch: h.refetch }) },
      update: {
        useMutation: (opts: typeof h.mutationOpts) => {
          h.mutationOpts = opts;
          return { mutateAsync: h.mutateAsync, isPending: false };
        },
      },
    },
  },
}));

import EditAccountForm, { toFormValues } from '../EditAccountForm';

const record = {
  name: 'Acme',
  website: 'https://acme.example.invalid',
  industry: 'Retail',
  employees: 10,
  revenue: 2500,
  description: null,
  country: 'GB',
  region: 'London',
  postalCode: 'SW1A 1AA',
};

describe('EditAccountForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.auth = { isLoading: false, isAuthenticated: true, user: { id: 'u1', role: 'ADMIN' } };
    h.account = { data: record, isLoading: false, error: null };
    h.industry = { data: [{ label: 'Retail', isActive: true }], isLoading: false, error: null };
    h.mutateAsync.mockResolvedValue({});
    h.revalidate.mockResolvedValue(undefined);
    h.invalidate.mockResolvedValue(undefined);
  });

  it('maps a record to form values', () => {
    expect(toFormValues(record)).toMatchObject({
      name: 'Acme',
      employees: '10',
      revenue: '2500',
      description: '',
      country: 'GB',
      ownerId: '',
    });
  });

  it('prefills the form from getById', () => {
    render(<EditAccountForm accountId="acc-1" />);
    expect(screen.getByText(/Edit Account Accounts \/ Acme \/ Edit/)).toBeDefined();
    expect(h.formProps).toMatchObject({
      mode: 'edit',
      industryOptions: ['Retail'],
      initialValues: expect.objectContaining({ name: 'Acme', region: 'London' }),
    });
  });

  it('shows a skeleton while loading', () => {
    h.account = { data: undefined, isLoading: true, error: null };
    const { container } = render(<EditAccountForm accountId="acc-1" />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows not-found distinctly', () => {
    h.account = { data: undefined, isLoading: false, error: { data: { code: 'NOT_FOUND' } } };
    render(<EditAccountForm accountId="acc-1" />);
    expect(screen.getByText('Account not found')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to accounts' })).toBeDefined();
  });

  it('shows a network error with Retry', () => {
    h.account = { data: undefined, isLoading: false, error: new Error('Failed to fetch') };
    render(<EditAccountForm accountId="acc-1" />);
    expect(screen.getByText('Could not load this account')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('sends only changed fields, with cleared geography as null', async () => {
    render(<EditAccountForm accountId="acc-1" />);
    await act(() =>
      h.formProps!.onSubmit({ ...toFormValues(record), region: '', name: 'Acme Ltd' })
    );
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: 'acc-1', name: 'Acme Ltd', region: null });
  });

  it('on success invalidates, toasts and returns to the account', async () => {
    render(<EditAccountForm accountId="acc-1" />);
    await act(() => h.mutationOpts!.onSuccess());
    expect(h.invalidate).toHaveBeenCalledTimes(3);
    expect(h.revalidate).toHaveBeenCalledWith('u1');
    expect(h.push).toHaveBeenCalledWith('/accounts/acc-1');
  });

  it('on success without a user skips revalidation', async () => {
    h.auth = { ...h.auth, user: null };
    render(<EditAccountForm accountId="acc-1" />);
    await act(() => h.mutationOpts!.onSuccess());
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it('shows an error toast and swallows the rejection', async () => {
    h.mutateAsync.mockRejectedValueOnce(new Error('conflict'));
    render(<EditAccountForm accountId="acc-1" />);
    await act(() => h.formProps!.onSubmit({ ...toFormValues(record), name: 'X Corp' }));
    act(() => h.mutationOpts!.onError({ message: 'conflict' }));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not update account', variant: 'destructive' })
    );
  });

  it('cancel goes back to the account and tracks dirtiness', () => {
    render(<EditAccountForm accountId="acc-1" />);
    h.formProps!.onCancel();
    expect(h.push).toHaveBeenCalledWith('/accounts/acc-1');
    act(() => h.formProps!.onDirtyChange(true));
    expect(h.unsaved).toHaveBeenLastCalledWith({ formName: 'editAccountForm', isDirty: true });
  });
});
