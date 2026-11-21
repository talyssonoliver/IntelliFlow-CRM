/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

type Opts = {
  onSuccess?: (data: Record<string, string>) => void;
  onError?: (err: { message: string }) => void;
};

const mocks = vi.hoisted(() => ({
  contactMutate: vi.fn(),
  dealMutate: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  revalidate: vi.fn(),
  undo: vi.fn(),
  contactOpts: {} as Opts,
  dealOpts: {} as Opts,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({ client: {} }),
    lead: {
      convert: {
        useMutation: (opts: Opts) => {
          mocks.contactOpts = opts;
          return { mutate: mocks.contactMutate, isPending: false };
        },
      },
      convertToDeal: {
        useMutation: (opts: Opts) => {
          mocks.dealOpts = opts;
          return { mutate: mocks.dealMutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock('@/app/leads/actions', () => ({ revalidateLeadConversionCaches: mocks.revalidate }));
vi.mock('@/components/deals/UndoConversion', () => ({
  UNDONE_TOAST: { title: 'Conversion undone' },
  undoConversion: mocks.undo,
}));

vi.mock('@intelliflow/ui', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    toast: mocks.toast,
    ToastAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    // A hidden close control lets tests close the dialog the way Escape or a click outside does.
    AlertDialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) =>
      open ? (
        <div>
          {children}
          <button
            type="button"
            aria-hidden="true"
            data-testid="dialog-close"
            onClick={() => onOpenChange?.(false)}
          />
        </div>
      ) : null,
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

import { ConvertLeadDialog } from '../ConvertLeadDialog';

const lead = { id: 'lead-1', firstName: 'Jane', lastName: 'Roe', company: 'Acme' };

function renderDialog(onOpenChange = vi.fn()) {
  render(<ConvertLeadDialog lead={lead} userId="user-1" open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

function chooseDeal() {
  fireEvent.click(screen.getByLabelText(/Contact and deal/i));
}

describe('ConvertLeadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revalidate.mockResolvedValue(undefined);
  });

  it("pre-fills the deal value from the lead's own estimate (pence to pounds)", () => {
    render(
      <ConvertLeadDialog
        lead={{ ...lead, estimatedValue: 250000 }}
        userId="user-1"
        open
        onOpenChange={vi.fn()}
      />
    );
    chooseDeal();
    expect(screen.getByLabelText(/Deal value/i)).toHaveValue('2500');
    fireEvent.click(screen.getByRole('button', { name: 'Convert and create deal' }));
    expect(mocks.dealMutate).toHaveBeenCalledWith(expect.objectContaining({ dealValue: 2500 }));
  });

  it('leaves the deal value empty when the lead has no estimate', () => {
    renderDialog();
    chooseDeal();
    expect(screen.getByLabelText(/Deal value/i)).toHaveValue('');
  });

  it('shows the name the contact will get on the Contact line (MVP-003)', () => {
    renderDialog();
    expect(screen.getByText('Contact:').parentElement).toHaveTextContent('Contact: Jane Roe');
  });

  it('names the contact after the company when the lead has no person name (MVP-003)', () => {
    const email = 'owner@pilates.example.invalid';
    render(
      <ConvertLeadDialog
        lead={{ id: 'lead-9', company: 'Pilates Living', email }}
        userId="user-1"
        open
        onOpenChange={vi.fn()}
      />
    );
    const line = screen.getByText('Contact:').parentElement;
    expect(line).toHaveTextContent(`Contact: Pilates Living (${email})`);
    expect(line).not.toHaveTextContent(/unknown/i);
  });

  it('defaults to contact only and keeps the existing conversion call', () => {
    renderDialog();
    expect(screen.getByText('Convert Lead to Contact')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Convert Lead' }));
    expect(mocks.contactMutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      createAccount: true,
      accountName: undefined,
    });
    expect(mocks.dealMutate).not.toHaveBeenCalled();
  });

  it('shows the deal fields when "Contact and deal" is chosen', () => {
    renderDialog();
    chooseDeal();
    expect(screen.getByText('Convert Lead to Deal')).toBeInTheDocument();
    expect(screen.getByLabelText(/Deal value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Deal name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected close date/i)).toBeInTheDocument();
  });

  it('sends the convertToDeal payload with the value in whole pounds', () => {
    renderDialog();
    chooseDeal();
    fireEvent.change(screen.getByLabelText(/Deal value/i), { target: { value: '5,000' } });
    fireEvent.change(screen.getByLabelText(/Deal name/i), { target: { value: 'Acme rollout' } });
    fireEvent.change(screen.getByLabelText(/Expected close date/i), {
      target: { value: '2027-03-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Convert and create deal' }));
    expect(mocks.dealMutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      dealValue: 5000,
      createContact: true,
      dealName: 'Acme rollout',
      expectedCloseDate: new Date('2027-03-31T00:00:00.000Z'),
    });
    expect(mocks.contactMutate).not.toHaveBeenCalled();
  });

  it('converts without a value when it is left empty (MVP-003)', () => {
    renderDialog();
    chooseDeal();
    fireEvent.click(screen.getByRole('button', { name: 'Convert and create deal' }));
    expect(mocks.dealMutate).toHaveBeenCalledWith({ leadId: 'lead-1', createContact: true });
  });

  it.each([
    ['0', /greater than zero/],
    ['12.5', /whole number/],
    ['abc', /whole number/],
  ])('blocks a deal value of %j and shows why', (value, message) => {
    renderDialog();
    chooseDeal();
    fireEvent.change(screen.getByLabelText(/Deal value/i), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert and create deal' }));
    expect(mocks.dealMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('opens on the mode it is given and goes back to it each time it closes', () => {
    render(
      <ConvertLeadDialog
        lead={lead}
        userId="user-1"
        open
        onOpenChange={vi.fn()}
        initialMode="deal"
      />
    );
    expect(screen.getByLabelText(/Contact and deal/i)).toBeChecked();

    fireEvent.click(screen.getByLabelText(/Contact only/i));
    expect(screen.getByLabelText(/Contact only/i)).toBeChecked();

    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.getByLabelText(/Contact and deal/i)).toBeChecked();
  });

  it('on deal success toasts, closes and opens the new deal', () => {
    const onOpenChange = renderDialog();
    mocks.dealOpts.onSuccess?.({ opportunityId: 'opp-9' });
    expect(mocks.revalidate).toHaveBeenCalledWith('user-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lead converted to a deal' })
    );
    expect(mocks.push).toHaveBeenCalledWith('/deals/opp-9');
  });

  it("the convert toast's Undo undoes the conversion and goes back to the lead (MVP-003)", async () => {
    mocks.undo.mockResolvedValueOnce('lead-1');
    renderDialog();
    mocks.dealOpts.onSuccess?.({ opportunityId: 'opp-9' });
    const { action } = mocks.toast.mock.calls.at(-1)?.[0] as { action: React.ReactElement };
    render(action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mocks.undo).toHaveBeenCalledWith({}, 'opp-9', 'user-1');
    await vi.waitFor(() => expect(mocks.push).toHaveBeenLastCalledWith('/leads/lead-1'));
    expect(mocks.toast).toHaveBeenLastCalledWith({ title: 'Conversion undone' });
  });

  it('tells the user when the toast Undo fails', async () => {
    mocks.undo.mockRejectedValueOnce(new Error('This conversion can no longer be undone: x.'));
    renderDialog();
    mocks.dealOpts.onSuccess?.({ opportunityId: 'opp-9' });
    const { action } = mocks.toast.mock.calls.at(-1)?.[0] as { action: React.ReactElement };
    render(action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'Could not undo the conversion', variant: 'destructive' })
      )
    );
  });

  it('on contact success opens the new contact', () => {
    renderDialog();
    mocks.contactOpts.onSuccess?.({ contactId: 'c-1' });
    expect(mocks.push).toHaveBeenCalledWith('/contacts/c-1');
  });

  it('shows a mapped error inside the dialog and in a toast', () => {
    renderDialog();
    React.act(() => {
      mocks.dealOpts.onError?.({ message: 'Only qualified leads can be converted to deals' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only leads with QUALIFIED status can be converted.'
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conversion failed', variant: 'destructive' })
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
