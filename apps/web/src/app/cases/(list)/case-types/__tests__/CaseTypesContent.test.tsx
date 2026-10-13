/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

type MutationOpts = { onSuccess?: (...args: unknown[]) => unknown };

const h = vi.hoisted(() => {
  const mutation = () => ({
    opts: null as null | MutationOpts,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    toast: vi.fn(),
    invalidate: vi.fn(),
    refetch: vi.fn(),
    openCreate: vi.fn(),
    auth: { isLoading: false, isAuthenticated: true },
    list: { data: undefined as any, isLoading: false, error: null as null | { message: string } },
    mutations: {
      create: mutation(),
      update: mutation(),
      delete: mutation(),
      setDefault: mutation(),
    },
    listProps: null as null | Record<string, any>,
    deleteProps: null as null | Record<string, any>,
  };
});

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: (props: { title: string; breadcrumbs: { label: string }[] }) => (
    <header>
      <nav aria-label="Breadcrumb">{props.breadcrumbs.map((b) => b.label).join(' / ')}</nav>
      <h1>{props.title}</h1>
    </header>
  ),
}));
vi.mock('../components/CaseTypeList', () => ({
  CaseTypeList: React.forwardRef((props: Record<string, any>, ref) => {
    h.listProps = props;
    React.useImperativeHandle(ref, () => ({ openCreate: h.openCreate }));
    return (
      <ul data-testid="case-type-list">
        {props.types.map((t: { id: string; name: string }) => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ul>
    );
  }),
}));
vi.mock('../components/DeleteCaseTypeDialog', () => ({
  DeleteCaseTypeDialog: (props: Record<string, any>) => {
    h.deleteProps = props;
    return props.name ? <div role="alertdialog">{props.error ?? props.name}</div> : null;
  },
}));
vi.mock('@/lib/trpc', () => {
  const useMutation = (key: keyof typeof h.mutations) => (opts: MutationOpts) => {
    h.mutations[key].opts = opts;
    return h.mutations[key];
  };
  return {
    trpc: {
      useUtils: () => ({ caseTypes: { list: { invalidate: h.invalidate } } }),
      caseTypes: {
        list: { useQuery: () => ({ ...h.list, refetch: h.refetch }) },
        create: { useMutation: useMutation('create') },
        update: { useMutation: useMutation('update') },
        delete: { useMutation: useMutation('delete') },
        setDefault: { useMutation: useMutation('setDefault') },
      },
    },
  };
});

import CaseTypesContent, { errorCode } from '../CaseTypesContent';

function type(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Litigation',
    category: 'Disputes',
    colorToken: 'blue',
    defaultPriority: 'HIGH',
    defaultSlaDays: 14,
    requiredFields: [],
    isActive: true,
    isDefault: true,
    checklist: [],
    caseCount: 2,
    ...overrides,
  };
}

const input = {
  name: 'Advisory',
  category: null,
  colorToken: 'slate' as const,
  defaultPriority: null,
  defaultSlaDays: null,
  requiredFields: [],
  checklist: [],
  isActive: true,
};

function trpcError(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { isLoading: false, isAuthenticated: true };
  h.list = {
    data: {
      types: [type(), type({ id: 't2', name: 'Advisory', isDefault: false, isActive: false })],
      canEdit: true,
      limits: {},
    },
    isLoading: false,
    error: null,
  };
  for (const m of Object.values(h.mutations)) m.isPending = false;
});

describe('CaseTypesContent', () => {
  it('shows the skeleton while loading', () => {
    h.list = { data: undefined, isLoading: true, error: null };
    render(<CaseTypesContent />);
    expect(screen.getByText('Loading case types')).toBeDefined();
  });

  it('shows an error with Retry', () => {
    h.list = { data: undefined, isLoading: false, error: { message: 'boom' } };
    render(<CaseTypesContent />);
    expect(screen.getByRole('alert').textContent).toContain('Failed to load case types: boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('renders the header, the bento cards and the list', () => {
    const { container } = render(<CaseTypesContent />);
    expect(screen.getByRole('heading', { level: 1, name: 'Case Types' })).toBeDefined();
    expect(screen.getByLabelText('Breadcrumb').textContent).toBe('Dashboard / Cases / Case Types');
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    expect(screen.getByTestId('case-type-list').textContent).toContain('Litigation');
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it('opens the create dialog through the list ref from the section header', () => {
    render(<CaseTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Case Type' }));
    expect(h.openCreate).toHaveBeenCalled();
  });

  it('marks controls read-only for non-admins with an explanation', () => {
    h.list.data.canEdit = false;
    render(<CaseTypesContent />);
    const button = screen.getByRole('button', { name: 'New Case Type' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe('case-types-read-only-note');
    expect(document.getElementById('case-types-read-only-note')?.textContent).toContain(
      'Only administrators and managers'
    );
    expect(h.listProps?.canEdit).toBe(false);
  });

  it('lists the default choices and disables inactive types', () => {
    render(<CaseTypesContent />);
    const group = screen.getByRole('radiogroup', { name: 'Default case type' });
    expect(group).toBeDefined();
    expect(
      (screen.getByRole('radio', { name: 'Litigation' }) as HTMLButtonElement).getAttribute(
        'data-state'
      )
    ).toBe('checked');
    expect(screen.getByLabelText('Advisory (inactive)').hasAttribute('disabled')).toBe(true);
  });

  it('changes the default and announces it', () => {
    h.list.data.types[1].isActive = true;
    render(<CaseTypesContent />);
    fireEvent.click(screen.getByRole('radio', { name: 'Advisory' }));
    expect(h.mutations.setDefault.mutate).toHaveBeenCalled();
    const [args, opts] = h.mutations.setDefault.mutate.mock.calls[0];
    expect(args).toEqual({ id: 't2' });
    act(() => opts.onSuccess());
    expect(screen.getByText('Default case type set to Advisory.')).toBeDefined();
  });

  it('clears the default and reports a failure', () => {
    render(<CaseTypesContent />);
    fireEvent.click(screen.getByRole('radio', { name: 'No default' }));
    const [args, opts] = h.mutations.setDefault.mutate.mock.calls[0];
    expect(args).toEqual({ id: null });
    act(() => opts.onSuccess());
    expect(screen.getByText('Default case type cleared.')).toBeDefined();
    act(() => opts.onError({ message: 'nope' }));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not change the default case type' })
    );
  });

  it('creates and updates through the list onSave', async () => {
    render(<CaseTypesContent />);
    h.mutations.create.mutateAsync.mockResolvedValueOnce({ name: 'Advisory' });
    await act(async () => {
      expect(await h.listProps!.onSave(input, null)).toEqual({ ok: true });
    });
    expect(h.mutations.create.mutateAsync).toHaveBeenCalledWith(input);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Case type created', description: 'Advisory' });

    h.mutations.update.mutateAsync.mockResolvedValueOnce({ name: 'Advisory' });
    await act(async () => {
      expect(await h.listProps!.onSave(input, 't2')).toEqual({ ok: true });
    });
    expect(h.mutations.update.mutateAsync).toHaveBeenCalledWith({ ...input, id: 't2' });
  });

  it('returns a CONFLICT message to the dialog and toasts other failures', async () => {
    render(<CaseTypesContent />);
    h.mutations.create.mutateAsync.mockRejectedValueOnce(trpcError('CONFLICT', 'Name taken'));
    let result: unknown;
    await act(async () => {
      result = await h.listProps!.onSave(input, null);
    });
    expect(result).toEqual({ ok: false, error: 'Name taken' });

    h.mutations.create.mutateAsync.mockRejectedValueOnce(trpcError('INTERNAL', 'down'));
    await act(async () => {
      result = await h.listProps!.onSave(input, null);
    });
    expect(result).toEqual({ ok: false });
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save case type', description: 'down' })
    );

    h.mutations.create.mutateAsync.mockRejectedValueOnce('weird');
    await act(async () => {
      result = await h.listProps!.onSave(input, null);
    });
    expect(h.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: 'Please try again.' })
    );
  });

  it('deletes after confirmation and keeps a refusal inside the dialog', async () => {
    render(<CaseTypesContent />);
    act(() => h.listProps!.onDelete(h.list.data.types[1]));
    expect(screen.getByRole('alertdialog').textContent).toBe('Advisory');

    h.mutations.delete.mutateAsync.mockRejectedValueOnce(new Error('3 cases use this type.'));
    await act(async () => {
      await h.deleteProps!.onConfirm();
    });
    expect(screen.getByRole('alertdialog').textContent).toBe('3 cases use this type.');

    h.mutations.delete.mutateAsync.mockResolvedValueOnce({ success: true });
    await act(async () => {
      await h.deleteProps!.onConfirm();
    });
    expect(h.mutations.delete.mutateAsync).toHaveBeenLastCalledWith({ id: 't2' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Advisory deleted.')).toBeDefined();
    const event = { preventDefault: vi.fn() };
    act(() => h.deleteProps!.onCloseAutoFocus(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('new-case-type-button');
  });

  it('leaves focus restore to the dialog when nothing was deleted', () => {
    render(<CaseTypesContent />);
    const event = { preventDefault: vi.fn() };
    act(() => h.deleteProps!.onCloseAutoFocus(event));
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('cancels a pending delete', () => {
    render(<CaseTypesContent />);
    act(() => h.listProps!.onDelete(h.list.data.types[1]));
    act(() => h.deleteProps!.onCancel());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('ignores a confirm with nothing pending', async () => {
    render(<CaseTypesContent />);
    await act(async () => {
      await h.deleteProps!.onConfirm();
    });
    expect(h.mutations.delete.mutateAsync).not.toHaveBeenCalled();
  });

  it('invalidates the list after each mutation succeeds', () => {
    render(<CaseTypesContent />);
    h.mutations.create.opts?.onSuccess?.();
    expect(h.invalidate).toHaveBeenCalled();
  });
});

describe('errorCode', () => {
  it('reads the tRPC error code when present', () => {
    expect(errorCode(trpcError('CONFLICT', 'x'))).toBe('CONFLICT');
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode({ data: { code: 42 } })).toBeUndefined();
  });
});
