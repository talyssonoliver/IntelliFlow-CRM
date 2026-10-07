/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  mutateAsync: vi.fn(),
  revalidate: vi.fn(),
  invalidateList: vi.fn(),
  invalidateStats: vi.fn(),
  unsaved: vi.fn(),
  auth: {
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', role: 'ADMIN' } as { id: string; role: string } | null,
  },
  industry: { data: [] as unknown[] | undefined, isLoading: false, error: null as unknown },
  owners: { data: [] as unknown[] | undefined, isLoading: false, error: null as unknown },
  mutationOpts: null as null | {
    onSuccess: (account: { id: string; name: string }) => Promise<void>;
    onError: (error: { message: string }) => void;
  },
  formProps: null as null | Record<string, any>,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/hooks/useUnsavedChanges', () => ({ useFormUnsavedChanges: h.unsaved }));
vi.mock('@/app/accounts/actions', () => ({ revalidateAccountCaches: h.revalidate }));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
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
      account: { list: { invalidate: h.invalidateList }, stats: { invalidate: h.invalidateStats } },
    }),
    accountSettings: { industry: { list: { useQuery: () => h.industry } } },
    account: {
      assignees: { useQuery: () => h.owners },
      create: {
        useMutation: (opts: typeof h.mutationOpts) => {
          h.mutationOpts = opts;
          return { mutateAsync: h.mutateAsync, isPending: false };
        },
      },
    },
  },
}));

import NewAccountForm from '../NewAccountForm';
import { EMPTY_ACCOUNT_FORM_VALUES } from '@/components/accounts/AccountForm';

describe('NewAccountForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.auth.user = { id: 'u1', role: 'ADMIN' };
    h.industry = {
      data: [
        { label: 'Retail', isActive: true },
        { label: 'Old', isActive: false },
      ],
      isLoading: false,
      error: null,
    };
    h.owners = { data: [{ id: 'u2', name: 'Rex', title: null }], isLoading: false, error: null };
    h.mutateAsync.mockResolvedValue({ id: 'acc-9', name: 'Acme' });
    h.revalidate.mockResolvedValue(undefined);
  });

  it('renders the form with active industries, owners and the current user', () => {
    render(<NewAccountForm />);
    expect(screen.getByText('New Account')).toBeDefined();
    expect(h.formProps).toMatchObject({
      mode: 'create',
      industryOptions: ['Retail'],
      industryStatus: 'ready',
      ownerOptions: [{ id: 'u2', name: 'Rex', title: null }],
      ownerStatus: 'ready',
      currentUser: { id: 'u1', role: 'ADMIN' },
    });
    expect(h.unsaved).toHaveBeenCalledWith({ formName: 'newAccountForm', isDirty: false });
  });

  it('passes loading and error states and a null user', () => {
    h.auth.user = null;
    h.industry = { data: undefined, isLoading: true, error: null };
    h.owners = { data: undefined, isLoading: false, error: new Error('x') };
    render(<NewAccountForm />);
    expect(h.formProps).toMatchObject({
      industryOptions: [],
      industryStatus: 'loading',
      ownerOptions: [],
      ownerStatus: 'error',
      currentUser: null,
    });
  });

  it('sends the create payload without ownerId for "assign automatically"', async () => {
    render(<NewAccountForm />);
    await act(() =>
      h.formProps!.onSubmit({ ...EMPTY_ACCOUNT_FORM_VALUES, name: 'Acme', country: 'GB' })
    );
    const payload = h.mutateAsync.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Acme', country: 'GB' });
    expect(payload.ownerId).toBeUndefined();
  });

  it('on success invalidates, revalidates, toasts and redirects to the account', async () => {
    render(<NewAccountForm />);
    await act(() => h.mutationOpts!.onSuccess({ id: 'acc-9', name: 'Acme' }));
    expect(h.invalidateList).toHaveBeenCalled();
    expect(h.invalidateStats).toHaveBeenCalled();
    expect(h.revalidate).toHaveBeenCalledWith('u1');
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Account created' }));
    expect(h.push).toHaveBeenCalledWith('/accounts/acc-9');
  });

  it('skips cache revalidation without a user', async () => {
    h.auth.user = null;
    render(<NewAccountForm />);
    await act(() => h.mutationOpts!.onSuccess({ id: 'acc-9', name: 'Acme' }));
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it('shows an error toast and swallows the rejected mutation', async () => {
    h.mutateAsync.mockRejectedValueOnce(new Error('dup'));
    render(<NewAccountForm />);
    await act(() => h.formProps!.onSubmit({ ...EMPTY_ACCOUNT_FORM_VALUES, name: 'Acme' }));
    act(() => h.mutationOpts!.onError({ message: 'Account with name already exists' }));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not create account', variant: 'destructive' })
    );
  });

  it('cancel returns to the list and dirtiness feeds the unsaved-changes guard', () => {
    render(<NewAccountForm />);
    h.formProps!.onCancel();
    expect(h.push).toHaveBeenCalledWith('/accounts');
    act(() => h.formProps!.onDirtyChange(true));
    expect(h.unsaved).toHaveBeenLastCalledWith({ formName: 'newAccountForm', isDirty: true });
  });
});
