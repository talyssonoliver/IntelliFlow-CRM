/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  undoMutate: vi.fn(),
  refetch: vi.fn(),
  revalidateLead: vi.fn(async () => undefined),
  revalidateDeal: vi.fn(async () => undefined),
  status: {
    data: undefined as undefined | { canUndo: boolean; leadId: string | null; reasons: string[] },
    isFetching: false,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/app/leads/actions', () => ({ revalidateLeadConversionCaches: mocks.revalidateLead }));
vi.mock('@/app/deals/actions', () => ({ revalidateDealCaches: mocks.revalidateDeal }));
vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({ client: { leadConversion: { undo: { mutate: mocks.undoMutate } } } }),
    leadConversion: {
      status: { useQuery: () => ({ ...mocks.status, refetch: mocks.refetch }) },
    },
  },
}));
vi.mock('@intelliflow/ui', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    toast: mocks.toast,
    AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
      open ? <div>{children}</div> : null,
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
      <button type="button">{children}</button>
    ),
    AlertDialogAction: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      onClick?: (e: React.MouseEvent) => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

import { useConversionUndo, undoConversion, UNDONE_TOAST } from '../UndoConversion';

function Harness() {
  const { action, dialog } = useConversionUndo('opp-1', 'user-1');
  return (
    <div>
      {action ? (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : (
        <span>no undo</span>
      )}
      {dialog}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = { data: undefined, isFetching: false };
});

describe('useConversionUndo (MVP-003)', () => {
  it('offers nothing for a deal not converted from a lead', () => {
    mocks.status = { data: { canUndo: false, leadId: null, reasons: ['x'] }, isFetching: false };
    render(<Harness />);
    expect(screen.getByText('no undo')).toBeInTheDocument();
  });

  it('undoes, tells the user and goes back to the lead', async () => {
    mocks.status = { data: { canUndo: true, leadId: 'lead-1', reasons: [] }, isFetching: false };
    mocks.undoMutate.mockResolvedValue({ leadId: 'lead-1' });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo conversion' }));
    expect(screen.getByText(/goes back to Qualified/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo conversion' }).at(-1)!);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/leads/lead-1'));
    expect(mocks.undoMutate).toHaveBeenCalledWith({ opportunityId: 'opp-1' });
    expect(mocks.toast).toHaveBeenCalledWith(UNDONE_TOAST);
    expect(mocks.revalidateLead).toHaveBeenCalledWith('user-1');
    expect(mocks.revalidateDeal).toHaveBeenCalledWith('user-1');
  });

  it('explains why it can no longer be undone, with no undo button', () => {
    mocks.status = {
      data: {
        canUndo: false,
        leadId: 'lead-1',
        reasons: ['the deal has tasks', 'the deal has moved past Prospecting'],
      },
      isFetching: false,
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo conversion' }));
    expect(
      screen.getByText(
        'This conversion can no longer be undone: the deal has tasks; the deal has moved past Prospecting.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Undo conversion' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows the server reason when the undo is refused, and re-checks', async () => {
    mocks.status = { data: { canUndo: true, leadId: 'lead-1', reasons: [] }, isFetching: false };
    mocks.undoMutate.mockRejectedValue(
      new Error('This conversion can no longer be undone: the deal has tasks.')
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo conversion' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo conversion' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('the deal has tasks');
    expect(mocks.refetch).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('says it is checking while the status loads', () => {
    mocks.status = { data: { canUndo: true, leadId: 'lead-1', reasons: [] }, isFetching: true };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo conversion' }));
    expect(screen.getByText(/Checking whether/)).toBeInTheDocument();
  });
});

describe('undoConversion', () => {
  it('skips the cache refresh without a user', async () => {
    const client = {
      leadConversion: { undo: { mutate: vi.fn(async () => ({ leadId: 'lead-2' })) } },
    };
    expect(await undoConversion(client as never, 'opp-2')).toBe('lead-2');
    expect(mocks.revalidateLead).not.toHaveBeenCalled();
  });
});
