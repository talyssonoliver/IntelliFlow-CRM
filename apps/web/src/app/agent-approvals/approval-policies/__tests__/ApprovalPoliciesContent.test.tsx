/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { APPROVAL_POLICY_DEFAULTS, APPROVAL_POLICY_LIMITS } from '@intelliflow/domain';
import { policyRow } from '../components/__tests__/fixtures';

type MutationOpts = { onSuccess?: (...args: unknown[]) => unknown };

const h = vi.hoisted(() => {
  const mutation = () => ({
    opts: null as null | { onSuccess?: (...args: unknown[]) => unknown },
    mutateAsync: vi.fn(),
    isPending: false,
  });
  const query = () => ({
    data: undefined as any,
    isLoading: false,
    error: null as null | { message: string },
    refetch: vi.fn().mockResolvedValue(undefined),
  });
  return {
    toast: vi.fn(),
    invalidateList: vi.fn(),
    invalidatePreview: vi.fn(),
    auth: { isLoading: false, isAuthenticated: true },
    list: query(),
    agentPreview: query(),
    draftPreview: query(),
    members: { data: [{ id: 'u1', name: 'Ada' }], isLoading: false },
    membersOptions: null as null | { enabled: boolean },
    mutations: {
      create: mutation(),
      update: mutation(),
      delete: mutation(),
      setDefault: mutation(),
      resetToDefaults: mutation(),
    },
    dialogProps: null as null | Record<string, any>,
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
vi.mock('../components/PolicyDialog', () => ({
  PolicyDialog: (props: Record<string, any>) => {
    h.dialogProps = props;
    return (
      <dialog open aria-label={props.policy ? `Edit ${props.policy.name}` : 'New Policy'}>
        <button onClick={() => props.onClose()}>Close dialog</button>
      </dialog>
    );
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
        approvalPolicies: {
          list: { invalidate: h.invalidateList },
          preview: { invalidate: h.invalidatePreview },
        },
      }),
      ticket: {
        assignees: {
          useQuery: (_: unknown, options: { enabled: boolean }) => {
            h.membersOptions = options;
            return h.members;
          },
        },
      },
      approvalPolicies: {
        list: { useQuery: () => h.list },
        preview: {
          useQuery: (input: { scope: string }) =>
            input.scope === 'AGENT_TOOL' ? h.agentPreview : h.draftPreview,
        },
        create: { useMutation: useMutation('create') },
        update: { useMutation: useMutation('update') },
        delete: { useMutation: useMutation('delete') },
        setDefault: { useMutation: useMutation('setDefault') },
        resetToDefaults: { useMutation: useMutation('resetToDefaults') },
      },
    },
  };
});

import ApprovalPoliciesContent from '../ApprovalPoliciesContent';

const agentPolicy = policyRow({ id: 'p1', name: 'Standard' });
const secondAgentPolicy = policyRow({ id: 'p2', name: 'Fast lane', isDefault: false });

function listData(overrides: Record<string, unknown> = {}) {
  return {
    policies: [agentPolicy, secondAgentPolicy],
    defaults: APPROVAL_POLICY_DEFAULTS,
    limits: APPROVAL_POLICY_LIMITS,
    canManage: true,
    ...overrides,
  };
}

const previewRow = {
  agentKey: 'create_case',
  actionType: 'CREATE',
  policyId: 'p1',
  policyName: 'Standard',
  colorToken: 'blue',
  rule: { timeoutMinutes: 60 },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { isLoading: false, isAuthenticated: true };
  h.list = { data: listData(), isLoading: false, error: null, refetch: vi.fn() };
  h.agentPreview = {
    data: [previewRow],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
  h.draftPreview = {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
  for (const m of Object.values(h.mutations)) {
    m.isPending = false;
    m.mutateAsync = vi.fn();
  }
  h.dialogProps = null;
});

const live = () => document.querySelector('output[aria-live="polite"]');

describe('ApprovalPoliciesContent', () => {
  it('shows the skeleton while auth or the list loads', () => {
    h.list = { ...h.list, isLoading: true, data: undefined };
    render(<ApprovalPoliciesContent />);
    expect(screen.getByLabelText('Loading approval policies')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with Retry when the list fails', () => {
    h.list = { data: undefined, isLoading: false, error: { message: 'down' }, refetch: vi.fn() };
    render(<ApprovalPoliciesContent />);
    expect(screen.getByText('Failed to load approval policies: down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.list.refetch).toHaveBeenCalled();
  });

  it('lays out the header, two scope cards with h2 headings and the effective rules (AC-001)', () => {
    render(<ApprovalPoliciesContent />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Approval Policies' })
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'Dashboard / AI & Agents / AI Settings / Approval Policies'
    );
    for (const title of ['Agent tool actions', 'Email auto-responses', 'Effective rules']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    const agentCard = screen.getByRole('region', { name: 'Agent tool actions' });
    expect(within(agentCard).getAllByRole('article')).toHaveLength(2);
    expect(
      screen.getByRole('table', { name: 'Effective rules for agent tool actions' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains the built-in rules with a passive empty state when a queue has no policy', () => {
    render(<ApprovalPoliciesContent />);
    const draftCard = screen.getByRole('region', { name: 'Email auto-responses' });
    expect(draftCard).toHaveTextContent(
      'No policy yet, so the built-in rules apply: drafts expire after 1 d'
    );
    expect(within(draftCard).queryByRole('article')).not.toBeInTheDocument();
  });

  it('is read-only for non-admins: no New, Edit, Delete or Reset (AC-019)', () => {
    h.list.data = listData({ canManage: false });
    render(<ApprovalPoliciesContent />);
    expect(screen.getByRole('note')).toHaveTextContent('You have view-only access.');
    expect(screen.queryByRole('button', { name: /New Policy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit|Delete|Reset/ })).not.toBeInTheDocument();
    expect(h.membersOptions).toEqual({ enabled: false });
  });

  it('opens the dialog to create in a queue, makes the first policy the default there', () => {
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Policy for email auto-responses' }));
    expect(screen.getByRole('dialog', { name: 'New Policy' })).toBeInTheDocument();
    expect(h.dialogProps).toMatchObject({
      scope: 'AUTO_RESPONSE',
      policy: null,
      makeDefault: true,
      defaultTimeoutMinutes: 1440,
      otherNames: [],
      members: [{ id: 'u1', name: 'Ada' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits a policy and announces the save in the live region', async () => {
    h.mutations.update.mutateAsync.mockResolvedValue({ ...agentPolicy, name: 'Renamed' });
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Standard' }));
    expect(h.dialogProps).toMatchObject({
      policy: agentPolicy,
      makeDefault: false,
      otherNames: ['Fast lane'],
    });

    let saved: unknown;
    await act(async () => {
      saved = await h.dialogProps!.onSave({ name: 'Renamed' });
    });
    expect(h.mutations.update.mutateAsync).toHaveBeenCalledWith({ name: 'Renamed', id: 'p1' });
    expect(saved).toMatchObject({ name: 'Renamed' });
    expect(live()).toHaveTextContent('Saved policy “Renamed”.');
  });

  it('creates a policy and refreshes both the list and the effective rules', async () => {
    h.mutations.create.mutateAsync.mockResolvedValue(policyRow({ name: 'New one' }));
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Policy for agent tool actions' }));
    await act(async () => {
      await h.dialogProps!.onSave({ name: 'New one' });
    });
    expect(h.mutations.create.mutateAsync).toHaveBeenCalledWith({ name: 'New one' });
    expect(live()).toHaveTextContent('Created policy “New one”.');

    await act(async () => {
      await h.mutations.create.opts!.onSuccess!();
    });
    expect(h.invalidateList).toHaveBeenCalled();
    expect(h.invalidatePreview).toHaveBeenCalled();
  });

  it('announces a failed save and keeps the dialog contract (returns undefined)', async () => {
    h.mutations.create.mutateAsync.mockRejectedValue(new Error('Name taken'));
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Policy for agent tool actions' }));
    let saved: unknown = 'x';
    await act(async () => {
      saved = await h.dialogProps!.onSave({ name: 'Dup' });
    });
    expect(saved).toBeUndefined();
    expect(live()).toHaveTextContent('Could not save the policy: Name taken');
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));

    h.mutations.create.mutateAsync.mockRejectedValue('weird');
    await act(async () => {
      await h.dialogProps!.onSave({ name: 'Dup' });
    });
    expect(live()).toHaveTextContent('Could not save the policy: Please try again.');
  });

  it('deletes after confirmation, and reports a failure', async () => {
    h.mutations.delete.mutateAsync.mockResolvedValue({ success: true });
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fast lane' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete Fast lane?' })).toHaveTextContent(
      'Items already waiting keep their current deadline.'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(h.mutations.delete.mutateAsync).toHaveBeenCalledWith({ id: 'p2' });
    expect(live()).toHaveTextContent('Deleted policy “Fast lane”.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    h.mutations.delete.mutateAsync.mockRejectedValue(new Error('gone'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Standard' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(live()).toHaveTextContent('Could not delete the policy: gone');
  });

  it('dismisses the delete confirmation without deleting', () => {
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fast lane' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(h.mutations.delete.mutateAsync).not.toHaveBeenCalled();
  });

  it('makes a policy the default and reports failures', async () => {
    h.mutations.setDefault.mutateAsync.mockResolvedValue({ success: true });
    render(<ApprovalPoliciesContent />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make Default' }));
    });
    expect(h.mutations.setDefault.mutateAsync).toHaveBeenCalledWith({ id: 'p2' });
    expect(live()).toHaveTextContent('“Fast lane” is now the default policy.');

    h.mutations.setDefault.mutateAsync.mockRejectedValue(new Error('nope'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make Default' }));
    });
    expect(live()).toHaveTextContent('Could not change the default policy: nope');
  });

  it('resets after a confirmation that says what is deleted and what is kept', async () => {
    h.mutations.resetToDefaults.mutateAsync.mockResolvedValue({ deleted: 2 });
    render(<ApprovalPoliciesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Reset approval policies?' });
    expect(confirm).toHaveTextContent('deletes every approval policy and override in both queues');
    expect(confirm).toHaveTextContent(
      'Items already waiting for review and the approval history are kept.'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    });
    expect(live()).toHaveTextContent('Approval policies reset to the built-in rules.');

    h.mutations.resetToDefaults.mutateAsync.mockRejectedValue(new Error('locked'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    });
    expect(live()).toHaveTextContent('Could not reset approval policies: locked');
  });

  it('disables Reset when there is nothing to reset', () => {
    h.list.data = listData({ policies: [] });
    render(<ApprovalPoliciesContent />);
    expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeDisabled();
  });

  it('keeps the page up when one queue’s effective rules fail, with its own Retry', () => {
    h.draftPreview = {
      data: undefined,
      isLoading: false,
      error: { message: 'timeout' },
      refetch: vi.fn().mockResolvedValue(undefined),
    };
    render(<ApprovalPoliciesContent />);
    expect(
      screen.getByRole('table', { name: 'Effective rules for agent tool actions' })
    ).toBeInTheDocument();
    expect(screen.getByText('Could not load the effective rules: timeout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.draftPreview.refetch).toHaveBeenCalled();
  });
});
