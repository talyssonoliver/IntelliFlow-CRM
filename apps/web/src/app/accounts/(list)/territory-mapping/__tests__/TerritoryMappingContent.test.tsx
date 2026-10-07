/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

type MutationOpts = {
  onSuccess?: (...args: unknown[]) => unknown;
  onError?: (error: { message: string }) => void;
};

const h = vi.hoisted(() => {
  const mutation = (name: string) => ({
    name,
    opts: null as null | MutationOpts,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    toast: vi.fn(),
    invalidate: vi.fn(),
    fetchPreview: vi.fn(),
    refetch: vi.fn(),
    openCreate: vi.fn(),
    auth: { isLoading: false, isAuthenticated: true, user: { id: 'u1', role: 'ADMIN' } as any },
    list: { data: undefined as any, isLoading: false, error: null as null | { message: string } },
    members: { data: [] as unknown[] | undefined, isLoading: false, error: null as unknown },
    mutations: {
      create: mutation('create'),
      update: mutation('update'),
      delete: mutation('delete'),
      reorder: mutation('reorder'),
      setDefault: mutation('setDefault'),
      resetToDefaults: mutation('resetToDefaults'),
    },
    listProps: null as null | Record<string, any>,
    coverageProps: null as null | Record<string, any>,
  };
});

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
  ConfirmationDialog: (props: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
    onOpenChange: (open: boolean) => void;
  }) =>
    props.open ? (
      <div role="alertdialog" aria-label={props.title}>
        <p>{props.description}</p>
        <button onClick={() => props.onConfirm()}>{props.confirmLabel}</button>
        <button onClick={() => props.onOpenChange(false)}>Dismiss</button>
      </div>
    ) : null,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: (props: {
    title: string;
    breadcrumbs: { label: string }[];
    actions: { label: string; onClick: () => void; disabled?: boolean }[];
  }) => (
    <header>
      <nav aria-label="Breadcrumb">{props.breadcrumbs.map((b) => b.label).join(' / ')}</nav>
      <h1>{props.title}</h1>
      {props.actions.map((a) => (
        <button key={a.label} onClick={a.onClick} disabled={a.disabled}>
          {a.label}
        </button>
      ))}
    </header>
  ),
}));
vi.mock('../components/TerritoryList', () => ({
  TerritoryList: React.forwardRef((props: Record<string, any>, ref) => {
    h.listProps = props;
    React.useImperativeHandle(ref, () => ({ openCreate: h.openCreate }));
    return (
      <ol data-testid="territory-list">
        {props.territories.map((t: { id: string; name: string }) => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ol>
    );
  }),
}));
vi.mock('../components/CoverageSummary', () => ({
  CoverageSummary: (props: Record<string, any>) => {
    h.coverageProps = props;
    return <div data-testid="coverage" />;
  },
}));
vi.mock('@/lib/trpc', () => {
  const useMutation = (key: keyof typeof h.mutations) => (opts: MutationOpts) => {
    h.mutations[key].opts = opts;
    return h.mutations[key];
  };
  return {
    trpc: {
      useUtils: () => ({
        accountTerritories: {
          list: { invalidate: h.invalidate },
          preview: { fetch: h.fetchPreview },
        },
      }),
      account: { assignees: { useQuery: () => h.members } },
      accountTerritories: {
        list: { useQuery: () => ({ ...h.list, refetch: h.refetch }) },
        create: { useMutation: useMutation('create') },
        update: { useMutation: useMutation('update') },
        delete: { useMutation: useMutation('delete') },
        reorder: { useMutation: useMutation('reorder') },
        setDefault: { useMutation: useMutation('setDefault') },
        resetToDefaults: { useMutation: useMutation('resetToDefaults') },
      },
    },
  };
});

import TerritoryMappingContent from '../TerritoryMappingContent';

const territories = [
  {
    id: 't1',
    name: 'London',
    description: null,
    colorToken: 'blue',
    priority: 2,
    strategy: 'ROUND_ROBIN',
    isDefault: true,
    isActive: true,
    rules: [{ id: 'r1', country: 'GB', region: 'London', postalPrefix: null }],
    members: [{ userId: 'u1', name: 'Ada', avatar: null }],
  },
  {
    id: 't2',
    name: 'Paris',
    description: null,
    colorToken: 'rose',
    priority: 1,
    strategy: 'MANUAL',
    isDefault: false,
    isActive: false,
    rules: [
      { id: 'r2', country: 'FR', region: null, postalPrefix: null },
      { id: 'r3', country: 'BE', region: null, postalPrefix: null },
    ],
    members: [
      { userId: 'u1', name: 'Ada', avatar: null },
      { userId: 'u2', name: 'Rex', avatar: null },
    ],
  },
];

describe('TerritoryMappingContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.auth = { isLoading: false, isAuthenticated: true, user: { id: 'u1', role: 'ADMIN' } };
    h.list = {
      data: { territories, autoAssignOwner: true, limits: {} },
      isLoading: false,
      error: null,
    };
    h.members = { data: [{ id: 'u1', name: 'Ada' }], isLoading: false, error: null };
    for (const m of Object.values(h.mutations)) {
      m.isPending = false;
      m.mutateAsync.mockReset().mockResolvedValue({ ...territories[0], name: 'Saved' });
    }
    h.invalidate.mockResolvedValue(undefined);
  });

  it('renders the header, bento grid and no "coming soon" text (AC-001)', () => {
    const { container } = render(<TerritoryMappingContent />);
    expect(screen.getByRole('heading', { level: 1, name: 'Territory Mapping' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe(
      'Dashboard / Accounts / Territory Mapping'
    );
    expect(
      container.querySelector('.grid.grid-cols-1.lg\\:grid-cols-12.gap-4.sm\\:gap-5')
    ).not.toBeNull();
    expect(container.textContent).not.toMatch(/coming soon/i);
    expect(screen.getByTestId('territory-list').textContent).toBe('LondonParis');
  });

  it('passes counts and the auto-assign flag to the coverage card (AC-008)', async () => {
    render(<TerritoryMappingContent />);
    expect(h.coverageProps).toMatchObject({
      autoAssignOwner: true,
      territoryCount: 2,
      ruleCount: 3,
      memberCount: 2,
    });
    h.fetchPreview.mockResolvedValue({ matchedBy: 'none' });
    await h.coverageProps!.onPreview({ country: 'GB' });
    expect(h.fetchPreview).toHaveBeenCalledWith({ country: 'GB' });
  });

  it('opens the create dialog from the "New Territory" button (AC-002)', () => {
    render(<TerritoryMappingContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Territory' }));
    expect(h.openCreate).toHaveBeenCalled();
  });

  it('creates and updates through the list callbacks', async () => {
    render(<TerritoryMappingContent />);
    const input = {
      name: 'X',
      colorToken: 'blue',
      strategy: 'MANUAL',
      isActive: true,
      rules: [],
      memberIds: [],
    };
    await act(async () => {
      expect(await h.listProps!.onSave(input, null)).toMatchObject({ name: 'Saved' });
    });
    expect(h.mutations.create.mutateAsync).toHaveBeenCalledWith(input);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Territory created' }));
    await act(async () => {
      await h.listProps!.onSave(input, 't1');
    });
    expect(h.mutations.update.mutateAsync).toHaveBeenCalledWith({ ...input, id: 't1' });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Territory updated' }));
  });

  it('shows a toast and returns undefined when a save fails', async () => {
    h.mutations.create.mutateAsync.mockRejectedValueOnce({ message: 'A territory named X exists' });
    render(<TerritoryMappingContent />);
    let result: unknown = 'unset';
    await act(async () => {
      result = await h.listProps!.onSave({ name: 'X' }, null);
    });
    expect(result).toBeUndefined();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save territory', variant: 'destructive' })
    );
  });

  it('reorders optimistically and settles (AC-005)', () => {
    render(<TerritoryMappingContent />);
    act(() => h.listProps!.onReorder(['t2', 't1']));
    expect(h.mutations.reorder.mutate).toHaveBeenCalledWith(
      { ids: ['t2', 't1'] },
      expect.anything()
    );
    expect(screen.getByTestId('territory-list').textContent).toBe('ParisLondon');
    act(() => h.mutations.reorder.mutate.mock.calls[0][1].onSettled());
    expect(screen.getByTestId('territory-list').textContent).toBe('LondonParis');
    act(() => h.mutations.reorder.opts!.onError!({ message: 'boom' }));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not reorder territories' })
    );
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('ignores a stale optimistic order', () => {
    render(<TerritoryMappingContent />);
    act(() => h.listProps!.onReorder(['t2']));
    expect(screen.getByTestId('territory-list').textContent).toBe('LondonParis');
  });

  it('sets and clears the default through a labelled radio group (AC-006)', () => {
    render(<TerritoryMappingContent />);
    const group = screen.getByRole('radiogroup', { name: 'Default territory' });
    expect(group).toBeDefined();
    expect(screen.getByLabelText('Paris (inactive)')).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: 'Paris (inactive)' }));
    expect(h.mutations.setDefault.mutate).toHaveBeenCalledWith({ id: 't2' });
    fireEvent.click(screen.getByRole('radio', { name: 'No default' }));
    expect(h.mutations.setDefault.mutate).toHaveBeenCalledWith({ id: null });
    act(() =>
      h.mutations.setDefault.opts!.onError!({
        message: 'Activate Paris before making it the default.',
      })
    );
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Activate Paris before making it the default.' })
    );
  });

  it('confirms delete with the exact text (AC-007)', async () => {
    render(<TerritoryMappingContent />);
    act(() => h.listProps!.onDelete(territories[1]));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Paris?' });
    expect(dialog.textContent).toContain(
      'Its rules and members are removed. Accounts it already assigned keep their owners.'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(h.mutations.delete.mutateAsync).toHaveBeenCalledWith({ id: 't2' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() =>
      h.mutations.delete.opts!.onError!({ message: 'The default territory cannot be deleted.' })
    );
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not delete territory' })
    );
  });

  it('dismisses the delete confirmation', () => {
    render(<TerritoryMappingContent />);
    act(() => h.listProps!.onDelete(territories[1]));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('confirms reset with the exact text (AC-007)', async () => {
    render(<TerritoryMappingContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(screen.getByRole('alertdialog', { name: 'Reset territories?' }).textContent).toContain(
      'This deletes all territories, their rules and members. Account owners and the Auto-assign owner setting are not changed.'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    });
    expect(h.mutations.resetToDefaults.mutateAsync).toHaveBeenCalled();
    await act(async () => {
      await h.mutations.resetToDefaults.opts!.onSuccess!();
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Territories reset' }));
    act(() => h.mutations.resetToDefaults.opts!.onError!({ message: 'x' }));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not reset territories' })
    );
  });

  it('refreshes the list after successful mutations', () => {
    render(<TerritoryMappingContent />);
    for (const key of ['create', 'update', 'delete', 'reorder', 'setDefault'] as const) {
      h.mutations[key].opts!.onSuccess!();
    }
    expect(h.invalidate).toHaveBeenCalledTimes(5);
  });

  it('disables changes for non-admins and explains why', () => {
    h.auth = { ...h.auth, user: { id: 'u2', role: 'SALES_REP' } };
    render(<TerritoryMappingContent />);
    expect(screen.getByText(/Only admins and managers can change territories/)).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'New Territory' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Reset to Defaults' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(h.listProps!.canEdit).toBe(false);
  });

  it('shows the skeleton while loading (AC-009)', () => {
    h.list = { data: undefined, isLoading: true, error: null };
    render(<TerritoryMappingContent />);
    expect(screen.getByLabelText('Loading territory mapping')).toBeDefined();
  });

  it('shows an error with a Retry button (AC-009)', () => {
    h.list = { data: undefined, isLoading: false, error: { message: 'network down' } };
    render(<TerritoryMappingContent />);
    expect(screen.getByText('Failed to load territories: network down')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('treats a missing payload as an error', () => {
    h.list = { data: undefined, isLoading: false, error: null };
    render(<TerritoryMappingContent />);
    expect(screen.getByText('Failed to load territories.')).toBeDefined();
  });

  it('passes member load state to the list', () => {
    h.members = { data: undefined, isLoading: true, error: new Error('x') };
    render(<TerritoryMappingContent />);
    expect(h.listProps).toMatchObject({ members: [], membersLoading: true, membersError: true });
  });
});
