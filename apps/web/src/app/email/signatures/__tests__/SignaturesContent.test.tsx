/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import type { EmailSignatureDto, EmailSignatureListDto } from '@intelliflow/validators';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: { mutateAsync: vi.fn(), isPending: false },
  update: { mutateAsync: vi.fn(), isPending: false },
  remove: { mutateAsync: vi.fn(), isPending: false },
  setDefault: { mutateAsync: vi.fn(), isPending: false },
  invalidate: vi.fn(),
  dialogRenders: 0,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ emailSignatures: { invalidate: api.invalidate } }),
    emailSignatures: {
      list: { useQuery: (...a: unknown[]) => api.list(...a) },
      create: { useMutation: () => api.create },
      update: { useMutation: () => api.update },
      delete: { useMutation: () => api.remove },
      setDefault: { useMutation: () => api.setDefault },
    },
  },
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

// The dialog module is loaded on demand; the stub records that and drives onSave.
vi.mock('../components/SignatureDialog', () => ({
  SignatureDialog: (p: {
    open: boolean;
    target: { kind: string; scope?: string; signature?: { name: string } };
    onSave: (input: {
      name: string;
      html: string;
      isDefault: boolean;
    }) => Promise<{ ok: boolean; nameError?: string }>;
  }) => {
    api.dialogRenders += 1;
    if (!p.open) return null;
    return (
      <div data-testid="signature-dialog">
        {p.target.kind}:{p.target.scope ?? p.target.signature?.name}
        <button
          type="button"
          onClick={async () => {
            const result = await p.onSave({ name: 'Formal', html: '<p>Hi</p>', isDefault: true });
            document.body.dataset.saveResult = JSON.stringify(result);
          }}
        >
          stub save
        </button>
      </div>
    );
  },
}));

import SignaturesContent from '../SignaturesContent';

const sig = (over: Partial<EmailSignatureDto> = {}): EmailSignatureDto => ({
  id: 'sig-1',
  scope: 'USER',
  name: 'Formal',
  html: '<p>Kind regards</p>',
  isDefault: true,
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

const listDto = (over: Partial<EmailSignatureListDto> = {}): EmailSignatureListDto => ({
  mine: [sig(), sig({ id: 'sig-2', name: 'Short', isDefault: false, html: '<p>Thanks</p>' })],
  org: [
    sig({
      id: 'sig-o',
      scope: 'ORG',
      name: 'Company',
      html: '<p>Acme Ltd</p><script>alert(1)</script>',
    }),
  ],
  canManageOrg: true,
  ...over,
});

function setup(
  state: {
    data?: EmailSignatureListDto;
    isLoading?: boolean;
    error?: { message: string } | null;
  } = { data: listDto() }
) {
  api.list.mockReturnValue({ isLoading: false, error: null, refetch: vi.fn(), ...state });
  return render(<SignaturesContent />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.dialogRenders = 0;
  delete document.body.dataset.saveResult;
  api.invalidate.mockResolvedValue(undefined);
  api.create.mutateAsync.mockResolvedValue(sig({ id: 'sig-new' }));
  api.update.mutateAsync.mockResolvedValue(sig());
  api.remove.mutateAsync.mockResolvedValue({ deleted: true });
  api.setDefault.mutateAsync.mockResolvedValue(sig({ id: 'sig-2', isDefault: true }));
});

describe('SignaturesContent', () => {
  it('shows a skeleton while loading', () => {
    setup({ isLoading: true });
    expect(screen.getByText('Loading signatures')).toBeInTheDocument();
  });

  it('shows the load error with a retry', () => {
    setup({ error: { message: 'boom' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load signatures');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders one h1 and a labelled section per scope', () => {
    setup();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'My signatures' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Organisation signatures' })).toBeInTheDocument();
  });

  it('lists signatures with the default marked in text and a sanitised preview', () => {
    const { container } = setup();
    const mine = screen.getByRole('region', { name: 'My signatures' });
    expect(within(mine).getByText('Formal', { selector: 'span.font-medium' })).toBeInTheDocument();
    expect(within(mine).getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows a passive empty state for a scope with no signatures', () => {
    setup({ data: listDto({ mine: [] }) });
    const mine = screen.getByRole('region', { name: 'My signatures' });
    expect(within(mine).getByText('No personal signatures yet')).toBeInTheDocument();
  });

  it('loads the dialog only when it is opened, then creates through it', async () => {
    setup();
    expect(api.dialogRenders).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'New Signature' }));
    expect(await screen.findByTestId('signature-dialog')).toHaveTextContent('create:USER');
    fireEvent.click(screen.getByRole('button', { name: 'stub save' }));
    await waitFor(() =>
      expect(api.create.mutateAsync).toHaveBeenCalledWith({
        scope: 'USER',
        name: 'Formal',
        html: '<p>Hi</p>',
        isDefault: true,
      })
    );
    expect(api.invalidate).toHaveBeenCalled();
    await waitFor(() => expect(document.body.dataset.saveResult).toBe('{"ok":true}'));
  });

  it('maps a name conflict back to the dialog field', async () => {
    api.create.mutateAsync.mockRejectedValue(
      Object.assign(new Error('A signature with this name already exists'), {
        data: { code: 'CONFLICT' },
      })
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'New Signature' }));
    fireEvent.click(await screen.findByRole('button', { name: 'stub save' }));
    await waitFor(() =>
      expect(document.body.dataset.saveResult).toBe(
        '{"ok":false,"nameError":"A signature with this name already exists"}'
      )
    );
  });

  it('creates an organisation signature from its own card', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'New Organisation Signature' }));
    expect(await screen.findByTestId('signature-dialog')).toHaveTextContent('create:ORG');
  });

  it('edits a signature', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Short' }));
    expect(await screen.findByTestId('signature-dialog')).toHaveTextContent('edit:Short');
    fireEvent.click(screen.getByRole('button', { name: 'stub save' }));
    await waitFor(() =>
      expect(api.update.mutateAsync).toHaveBeenCalledWith({
        id: 'sig-2',
        name: 'Formal',
        html: '<p>Hi</p>',
      })
    );
  });

  it('sets a default and announces it', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Make Default for Short' }));
    await waitFor(() => expect(api.setDefault.mutateAsync).toHaveBeenCalledWith({ id: 'sig-2' }));
    expect(await screen.findByText('Short is now your default signature.')).toBeInTheDocument();
  });

  it('confirms before deleting', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Short' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete Short?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Signature' }));
    await waitFor(() => expect(api.remove.mutateAsync).toHaveBeenCalledWith({ id: 'sig-2' }));
  });

  it('keeps organisation signatures read-only for members', () => {
    setup({ data: listDto({ canManageOrg: false }) });
    const org = screen.getByRole('region', { name: 'Organisation signatures' });
    expect(within(org).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(org).getByText('Only administrators and managers can change these.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Signature' })).toBeEnabled();
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('moves focus to the section heading after Make Default and after Delete', async () => {
    setup();
    const heading = screen.getByRole('heading', { level: 2, name: 'My signatures' });
    fireEvent.click(screen.getByRole('button', { name: 'Make Default for Short' }));
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Short' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete Signature',
      })
    );
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('keeps the page heading when the list fails to load', () => {
    setup({ error: { message: 'boom' } });
    expect(screen.getByRole('heading', { level: 1, name: 'Signatures' })).toBeInTheDocument();
  });

  it('keeps links in a preview out of the tab order', () => {
    const { container } = setup();
    expect(container.querySelector('.prose')).toHaveAttribute('inert');
  });
});
