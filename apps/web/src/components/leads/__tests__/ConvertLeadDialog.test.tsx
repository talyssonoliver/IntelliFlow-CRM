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
  contactOpts: {} as Opts,
  dealOpts: {} as Opts,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock('@/lib/api', () => ({
  api: {
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

  it.each([
    ['', /Enter the deal value/],
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
