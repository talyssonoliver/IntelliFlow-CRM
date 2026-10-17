/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import axe from 'axe-core';

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
    tags: { data: [] as any[] },
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
vi.mock('../components/ContactTypeList', () => ({
  ContactTypeList: React.forwardRef((props: Record<string, any>, ref) => {
    h.listProps = props;
    React.useImperativeHandle(ref, () => ({ openCreate: h.openCreate }));
    return (
      <ul data-testid="contact-type-list">
        {props.types.map((t: { id: string; name: string }) => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ul>
    );
  }),
}));
vi.mock('../components/DeleteContactTypeDialog', () => ({
  DeleteContactTypeDialog: (props: Record<string, any>) => {
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
      useUtils: () => ({ contactTypes: { invalidate: h.invalidate } }),
      contactSettings: { tags: { list: { useQuery: () => h.tags } } },
      contactTypes: {
        list: { useQuery: () => ({ ...h.list, refetch: h.refetch }) },
        create: { useMutation: useMutation('create') },
        update: { useMutation: useMutation('update') },
        delete: { useMutation: useMutation('delete') },
        setDefault: { useMutation: useMutation('setDefault') },
      },
    },
  };
});

import ContactTypesContent, { errorCode } from '../ContactTypesContent';

function type(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    key: 'customer',
    name: 'Customer',
    colorToken: 'green',
    isSystem: true,
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    defaultStatus: null,
    defaultDepartment: null,
    defaultOwner: 'CREATOR',
    requiredFields: [],
    defaultTags: [],
    contactCount: 2,
    ...overrides,
  };
}

const input = {
  name: 'Reseller',
  colorToken: 'slate' as const,
  isActive: true,
  defaultStatus: null,
  defaultDepartment: null,
  defaultOwner: 'CREATOR' as const,
  requiredFields: [],
  defaultTagIds: [],
};

function trpcError(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { isLoading: false, isAuthenticated: true };
  h.tags = { data: [{ id: 'tag-a', name: 'supplier', isActive: true, colorToken: 'slate' }] };
  h.list = {
    data: {
      types: [
        type(),
        type({
          id: 't2',
          key: 'old',
          name: 'Old',
          isDefault: false,
          isActive: false,
          isSystem: false,
        }),
      ],
      canEdit: true,
      limits: {},
    },
    isLoading: false,
    error: null,
  };
  for (const m of Object.values(h.mutations)) {
    m.isPending = false;
  }
});

describe('ContactTypesContent', () => {
  it('shows the skeleton while loading', () => {
    h.list = { ...h.list, data: undefined, isLoading: true };
    render(<ContactTypesContent />);
    expect(screen.getByText('Loading contact types')).toBeInTheDocument();
  });

  it('shows an error with Retry', () => {
    h.list = { data: undefined, isLoading: false, error: { message: 'boom' } };
    render(<ContactTypesContent />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load contact types: boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('renders the playbook layout: breadcrumbs, one h1, h2 sections, 12-col bento, no "coming soon" (A11Y-11)', () => {
    const { container } = render(<ContactTypesContent />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'Dashboard / Contacts / Contact Types'
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Contact types' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Default contact type' })
    ).toBeInTheDocument();
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it('opens the create dialog through the list ref from the section header CTA', () => {
    render(<ContactTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Contact Type' }));
    expect(h.openCreate).toHaveBeenCalled();
  });

  it('passes the active tenant tags to the list for the default-tag picker', () => {
    render(<ContactTypesContent />);
    expect(h.listProps?.tags).toEqual([{ id: 'tag-a', name: 'supplier', isActive: true }]);
  });

  it('read-only users see a note and a disabled CTA described by it', () => {
    h.list = { ...h.list, data: { ...h.list.data, canEdit: false } };
    render(<ContactTypesContent />);
    const note = screen.getByText(/Only administrators and managers can change contact types/);
    const cta = screen.getByRole('button', { name: 'New Contact Type' });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('aria-describedby', note.id);
  });

  it('creates a type, announces it and invalidates the contactTypes router (NF-002)', async () => {
    h.mutations.create.mutateAsync.mockResolvedValueOnce({ name: 'Reseller' });
    render(<ContactTypesContent />);
    let result: unknown;
    await act(async () => {
      result = await h.listProps!.onSave(input, null);
    });
    expect(result).toEqual({ ok: true });
    expect(h.mutations.create.mutateAsync).toHaveBeenCalledWith(input);
    expect(screen.getByText('Reseller saved.')).toBeInTheDocument();
    // invalidation is wired as each mutation's onSuccess
    h.mutations.create.opts?.onSuccess?.();
    h.mutations.update.opts?.onSuccess?.();
    h.mutations.delete.opts?.onSuccess?.();
    h.mutations.setDefault.opts?.onSuccess?.();
    expect(h.invalidate).toHaveBeenCalledTimes(4);
  });

  it('updates an existing type by id', async () => {
    h.mutations.update.mutateAsync.mockResolvedValueOnce({ name: 'Customer' });
    render(<ContactTypesContent />);
    await act(async () => {
      await h.listProps!.onSave(input, 't1');
    });
    expect(h.mutations.update.mutateAsync).toHaveBeenCalledWith({ ...input, id: 't1' });
  });

  it('returns a CONFLICT to the dialog instead of a toast', async () => {
    h.mutations.create.mutateAsync.mockRejectedValueOnce(trpcError('CONFLICT', 'Name taken'));
    render(<ContactTypesContent />);
    let result: unknown;
    await act(async () => {
      result = await h.listProps!.onSave(input, null);
    });
    expect(result).toEqual({ ok: false, error: 'Name taken' });
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('toasts other save errors', async () => {
    h.mutations.create.mutateAsync.mockRejectedValueOnce(new Error('down'));
    render(<ContactTypesContent />);
    await act(async () => {
      await h.listProps!.onSave(input, null);
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('deletes through the dialog and keeps a refusal inside it', async () => {
    h.mutations.delete.mutateAsync.mockRejectedValueOnce(new Error('2 contacts use this type.'));
    render(<ContactTypesContent />);
    act(() => h.listProps!.onDelete(h.list.data.types[1]));
    await act(async () => {
      await h.deleteProps!.onConfirm();
    });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2 contacts use this type.');

    h.mutations.delete.mutateAsync.mockResolvedValueOnce({ success: true });
    await act(async () => {
      await h.deleteProps!.onConfirm();
    });
    expect(h.mutations.delete.mutateAsync).toHaveBeenLastCalledWith({ id: 't2' });
    expect(screen.getByText('Old deleted.')).toBeInTheDocument();
  });

  it('after a delete, focus moves to the New Contact Type button', async () => {
    h.mutations.delete.mutateAsync.mockResolvedValueOnce({ success: true });
    render(<ContactTypesContent />);
    act(() => h.listProps!.onDelete(h.list.data.types[1]));
    await act(async () => {
      await h.deleteProps!.onConfirm();
    });
    const event = { preventDefault: vi.fn() };
    act(() => h.deleteProps!.onCloseAutoFocus(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'New Contact Type' })).toHaveFocus();
  });

  it('sets the default type from the radio group; inactive types cannot be chosen', () => {
    render(<ContactTypesContent />);
    expect(screen.getByRole('radio', { name: 'Old (inactive)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'No default' }));
    expect(h.mutations.setDefault.mutate).toHaveBeenCalledWith({ id: null }, expect.anything());
  });

  it('the live region is silent on mount', () => {
    const { container } = render(<ContactTypesContent />);
    expect(container.querySelector('output[aria-live="polite"]')?.textContent).toBe('');
  });

  it('errorCode reads the tRPC code', () => {
    expect(errorCode(trpcError('CONFLICT', 'x'))).toBe('CONFLICT');
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ContactTypesContent />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
