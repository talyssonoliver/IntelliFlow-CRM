/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: vi.fn(),
  invalidate: vi.fn(),
  revalidate: vi.fn(),
  opts: {} as {
    onSuccess?: () => unknown;
    onError?: (err: { message: string }) => void;
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({ lead: { getById: { invalidate: mocks.invalidate } } }),
    lead: {
      qualify: {
        useMutation: (opts: typeof mocks.opts) => {
          mocks.opts = opts;
          return { mutate: mocks.mutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock('@/app/leads/actions', () => ({ revalidateLeadCaches: mocks.revalidate }));

vi.mock('@intelliflow/ui', () => ({
  toast: mocks.toast,
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

import { QualifyLeadButton, QualifyLeadDialog } from '../QualifyLeadDialog';

const lead = { id: 'lead-1', firstName: 'Jane', lastName: 'Roe', company: 'Acme' };

function renderDialog(onOpenChange = vi.fn()) {
  render(<QualifyLeadDialog lead={lead} userId="user-1" open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

describe('QualifyLeadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revalidate.mockResolvedValue(undefined);
  });

  it('labels the field and shows the length hint', () => {
    renderDialog();
    expect(screen.getByLabelText(/Reason for qualifying/i)).toBeInTheDocument();
    expect(screen.getByText(/10 to 500 characters/)).toBeInTheDocument();
  });

  it('does not call the API for a reason that is too short, and says why', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Reason for qualifying/i), {
      target: { value: 'too short' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Qualify Lead' }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 10/);
  });

  it('rejects a reason over 500 characters', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Reason for qualifying/i), {
      target: { value: 'a'.repeat(501) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Qualify Lead' }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at most 500/);
  });

  it('submits the trimmed reason', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Reason for qualifying/i), {
      target: { value: '  Budget confirmed with the buyer  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Qualify Lead' }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      reason: 'Budget confirmed with the buyer',
    });
  });

  it('on success refreshes the lead (so Convert enables), toasts and closes', async () => {
    const onOpenChange = renderDialog();
    await mocks.opts.onSuccess?.();
    expect(mocks.invalidate).toHaveBeenCalledWith({ id: 'lead-1' });
    expect(mocks.revalidate).toHaveBeenCalledWith('user-1');
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead qualified' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a server error inside the dialog and in a toast', () => {
    renderDialog();
    React.act(() => {
      mocks.opts.onError?.({ message: 'Lead is already qualified' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Lead is already qualified');
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Qualification failed', variant: 'destructive' })
    );
  });
});

describe('QualifyLeadButton', () => {
  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<QualifyLeadButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Qualify lead' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
