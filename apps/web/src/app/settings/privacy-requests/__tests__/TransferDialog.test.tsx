/**
 * @vitest-environment jsdom
 *
 * IFC-317 — the administrator's "Send to another controller" dialog (UK GDPR Art 20(2)):
 * validation before any call, the confirmation that the person asked, the one-time manual link
 * when the email path fails, the recorded steps with who and when, revoke, and the empty state.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';

function mutation(result: unknown = { ok: true }) {
  return { mutateAsync: vi.fn().mockResolvedValue(result), isPending: false };
}

const h = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: false },
  create: undefined as unknown as { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean },
  markSent: undefined as unknown as { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean },
  revoke: undefined as unknown as { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean },
  invalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  toast: h.toast,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ privacy: { admin: { transfers: { invalidate: h.invalidate } } } }),
    privacy: {
      admin: {
        transfers: { useQuery: () => h.list },
        createTransfer: { useMutation: () => h.create },
        markTransferSent: { useMutation: () => h.markSent },
        revokeTransfer: { useMutation: () => h.revoke },
      },
    },
  },
}));

import {
  TransferDialog,
  canTransfer,
  eventLine,
  toCreateInput,
  transferProblem,
} from '../components/TransferDialog';

const REQUEST = {
  id: 'clhrequest000000000',
  type: 'PORTABILITY',
  status: 'VERIFIED',
  subjectEmail: 'ada@example.invalid',
} as never;

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clhtransfer00000000',
    recipientName: 'Jones & Co',
    recipientEmail: 'privacy@jones.example.invalid',
    basis: 'Asked by email on 3 November',
    state: 'ACTIVE',
    expiresAt: '2026-12-05T10:00:00.000Z',
    createdAt: '2026-11-28T10:00:00.000Z',
    awaitingSend: false,
    events: [
      {
        kind: 'CREATED',
        actorType: 'ADMIN',
        actorLabel: 'Ada Admin',
        via: null,
        occurredAt: '2026-11-28T10:00:00.000Z',
      },
      {
        kind: 'SENT',
        actorType: 'ADMIN',
        actorLabel: 'Ada Admin',
        via: 'EMAIL',
        occurredAt: '2026-11-28T10:00:01.000Z',
      },
    ],
    ...overrides,
  };
}

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

function fill(dialog: HTMLElement, overrides: Record<string, string> = {}) {
  const values = {
    'Recipient organisation': 'Jones & Co',
    'Recipient contact email': 'Privacy@Jones.example.invalid',
    'How the person asked for this': 'Asked by email on 3 November',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  h.list = { data: [], isLoading: false, isError: false };
  h.create = mutation({
    transfer: transfer(),
    delivered: true,
    manualLink: null,
  });
  h.markSent = mutation();
  h.revoke = mutation();
});

describe('helpers', () => {
  it('offers the transfer only for a verified or completed portability request', () => {
    expect(canTransfer({ type: 'PORTABILITY', status: 'VERIFIED' })).toBe(true);
    expect(canTransfer({ type: 'PORTABILITY', status: 'COMPLETED' })).toBe(true);
    expect(canTransfer({ type: 'PORTABILITY', status: 'PENDING_VERIFICATION' })).toBe(false);
    expect(canTransfer({ type: 'PORTABILITY', status: 'REJECTED' })).toBe(false);
    expect(canTransfer({ type: 'ACCESS', status: 'VERIFIED' })).toBe(false);
  });

  it('finds the first problem, in field order, and the confirmation last', () => {
    const ok = {
      recipientName: 'Jones',
      recipientEmail: 'a@b.co',
      basis: 'Asked by email',
      confirmed: true,
    };
    expect(transferProblem(ok)).toBeNull();
    expect(transferProblem({ ...ok, recipientName: ' ' })?.field).toBe('recipientName');
    expect(transferProblem({ ...ok, recipientEmail: 'nope' })?.field).toBe('recipientEmail');
    for (const bad of ['a@b', 'a b@c.co', '@c.co', 'a@@c.co', 'a@b.', 'a@.co', 'a@b@c.co']) {
      expect(transferProblem({ ...ok, recipientEmail: bad })?.field, bad).toBe('recipientEmail');
    }
    expect(transferProblem({ ...ok, recipientEmail: 'first.last@mail.example.co.uk' })).toBeNull();
    expect(transferProblem({ ...ok, basis: 'short' })?.field).toBe('basis');
    expect(transferProblem({ ...ok, confirmed: false })?.field).toBe('confirmed');
  });

  it('builds the input trimmed and lowercased, with the confirmation literal', () => {
    expect(
      toCreateInput('r1', {
        recipientName: ' Jones ',
        recipientEmail: ' A@B.CO ',
        basis: ' Asked by email ',
        confirmed: true,
      })
    ).toEqual({
      id: 'r1',
      recipientName: 'Jones',
      recipientEmail: 'a@b.co',
      basis: 'Asked by email',
      confirmed: true,
    });
  });

  it('words each recorded step with who did it', () => {
    const base = { actorType: 'ADMIN' as const, occurredAt: 'x' };
    expect(eventLine({ ...base, kind: 'CREATED', actorLabel: 'Ada', via: null })).toBe(
      'Created by Ada'
    );
    expect(eventLine({ ...base, kind: 'SENT', actorLabel: 'Ada', via: 'MANUAL' })).toBe(
      'Link sent by Ada'
    );
    expect(eventLine({ ...base, kind: 'SENT', actorLabel: 'Ada', via: 'EMAIL' })).toContain(
      'emailed'
    );
    expect(
      eventLine({
        ...base,
        actorType: 'RECIPIENT',
        kind: 'DOWNLOADED',
        actorLabel: null,
        via: null,
      })
    ).toContain('Downloaded by the recipient');
    expect(
      eventLine({ ...base, actorType: 'SYSTEM', kind: 'EXPIRED', actorLabel: null, via: null })
    ).toBe('Link expired unused');
    expect(eventLine({ ...base, kind: 'REVOKED', actorLabel: null, via: null })).toBe(
      'Revoked by an administrator'
    );
  });
});

describe('TransferDialog', () => {
  it('shows the empty state and explains the link, with no accessibility violations', async () => {
    const { baseElement } = render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('No transfers yet')).toBeTruthy();
    expect(within(dialog).getByText(/works once and expires after 7 days/)).toBeTruthy();
    await axeClean(baseElement);
  });

  it('checks the fields and the confirmation before any call, and focuses the problem', async () => {
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    const submit = () =>
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Create transfer and send link' })
      );

    submit();
    expect(await within(dialog).findByText(/Enter the name of the organisation/)).toBeTruthy();
    fill(dialog, { 'Recipient contact email': 'nope' });
    submit();
    expect(await within(dialog).findByText(/valid contact email/)).toBeTruthy();
    fill(dialog);
    submit();
    expect(
      await within(dialog).findByText('Confirm that the person asked for this transfer.')
    ).toBeTruthy();
    expect(document.activeElement?.id).toBe('transfer-confirm');
    expect(h.create.mutateAsync).not.toHaveBeenCalled();
  });

  it('creates the transfer once everything is given, and says the email went', async () => {
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create transfer and send link' }));
    await waitFor(() =>
      expect(h.create.mutateAsync).toHaveBeenCalledWith({
        id: 'clhrequest000000000',
        recipientName: 'Jones & Co',
        recipientEmail: 'privacy@jones.example.invalid',
        basis: 'Asked by email on 3 November',
        confirmed: true,
      })
    );
    expect(
      await within(dialog).findByText(/was emailed to privacy@jones.example.invalid/)
    ).toBeTruthy();
    expect(within(dialog).queryByLabelText('Transfer link')).toBeNull();
    expect(h.toast).toHaveBeenCalledWith({ title: 'Link emailed to the recipient' });
  });

  it('when the email failed, shows the link once, can copy it, and records that it was sent', async () => {
    const link = `https://app.example.invalid/dsar/transfer#t=${'C'.repeat(43)}`;
    h.create = mutation({ transfer: transfer(), delivered: false, manualLink: link });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create transfer and send link' }));

    expect(await within(dialog).findByText(/The email could not be sent/)).toBeTruthy();
    expect(within(dialog).getByText(/shown once and is not kept/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Transfer link') as HTMLInputElement).value).toBe(link);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    fireEvent.click(within(dialog).getByRole('button', { name: 'I have sent it' }));
    await waitFor(() =>
      expect(h.markSent.mutateAsync).toHaveBeenCalledWith({ id: 'clhtransfer00000000' })
    );
    expect(within(dialog).queryByLabelText('Transfer link')).toBeNull();
    expect(h.toast).toHaveBeenCalledWith({ title: 'Recorded as sent' });
  });

  it('keeps a server refusal inside the dialog and keeps the form', async () => {
    h.create.mutateAsync.mockRejectedValue(
      new Error(
        'Only a confirmed portability request can be sent to another controller (Article 20(2)).'
      )
    );
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create transfer and send link' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByText(/confirmed portability request/)).toBeTruthy();
    expect(
      (within(dialog).getByLabelText('Recipient organisation') as HTMLInputElement).value
    ).toBe('Jones & Co');
  });

  it('lists each transfer with every recorded step, who and when', async () => {
    h.list.data = [
      transfer(),
      transfer({
        id: 'clhtransfer00000001',
        recipientName: 'Old Firm',
        state: 'DOWNLOADED',
        events: [
          {
            kind: 'CREATED',
            actorType: 'ADMIN',
            actorLabel: 'Ada Admin',
            via: null,
            occurredAt: '2026-11-20T09:00:00.000Z',
          },
          {
            kind: 'DOWNLOADED',
            actorType: 'RECIPIENT',
            actorLabel: null,
            via: null,
            occurredAt: '2026-11-21T09:30:00.000Z',
          },
        ],
      }),
    ];
    const { baseElement } = render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Link active')).toBeTruthy();
    expect(within(dialog).getByText('Downloaded')).toBeTruthy();
    expect(within(dialog).getAllByText(/Created by Ada Admin/)).toHaveLength(2);
    expect(within(dialog).getByText(/21 Nov 2026, 09:30 UTC/)).toBeTruthy();
    expect(within(dialog).getByText(/Downloaded by the recipient, link used up/)).toBeTruthy();
    // Only the live link can be revoked.
    expect(within(dialog).getAllByRole('button', { name: /^Revoke the link/ })).toHaveLength(1);
    await axeClean(baseElement);
  });

  it('tells the admin when a live link was never recorded as sent, and revokes on request', async () => {
    h.list.data = [transfer({ awaitingSend: true })];
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Nobody has recorded sending this link/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke the link to Jones & Co' }));
    await waitFor(() =>
      expect(h.revoke.mutateAsync).toHaveBeenCalledWith({ id: 'clhtransfer00000000' })
    );
    expect(h.toast).toHaveBeenCalledWith({ title: 'Link revoked' });
  });

  async function createWithManualLink() {
    const link = `https://app.example.invalid/dsar/transfer#t=${'C'.repeat(43)}`;
    h.create = mutation({ transfer: transfer(), delivered: false, manualLink: link });
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create transfer and send link' }));
    await within(dialog).findByText(/The email could not be sent/);
    return dialog;
  }

  it('says so when the link cannot be copied, and keeps the link on screen', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const dialog = await createWithManualLink();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(await within(dialog).findByText(/Could not copy/)).toBeTruthy();
    expect(within(dialog).getByLabelText('Transfer link')).toBeTruthy();
  });

  it('keeps the link and shows the reason when recording the send fails', async () => {
    h.markSent.mutateAsync.mockRejectedValue(new Error('This request has changed.'));
    const dialog = await createWithManualLink();
    fireEvent.click(within(dialog).getByRole('button', { name: 'I have sent it' }));
    expect(await within(dialog).findByText('This request has changed.')).toBeTruthy();
    expect(within(dialog).getByLabelText('Transfer link')).toBeTruthy();
  });

  it('can be closed without recording, after which the transfer shows as unsent', async () => {
    const dialog = await createWithManualLink();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close without recording' }));
    await waitFor(() => expect(within(dialog).queryByLabelText('Transfer link')).toBeNull());
    expect(within(dialog).getByLabelText('Recipient organisation')).toBeTruthy();
    expect(h.markSent.mutateAsync).not.toHaveBeenCalled();
  });

  it('returns to the form after an emailed transfer', async () => {
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create transfer and send link' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Done' }));
    expect(await within(dialog).findByLabelText('Recipient organisation')).toBeTruthy();
    // The form starts empty for the next transfer.
    expect(
      (within(dialog).getByLabelText('Recipient organisation') as HTMLInputElement).value
    ).toBe('');
  });

  it('shows the reason when a revoke is refused', async () => {
    h.list.data = [transfer()];
    h.revoke.mutateAsync.mockRejectedValue(new Error('This request has changed.'));
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Revoke the link/ }));
    expect(await within(dialog).findByText('This request has changed.')).toBeTruthy();
  });

  it('falls back to a plain message when a failure carries none', async () => {
    h.create.mutateAsync.mockRejectedValue('boom');
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create transfer and send link' }));
    expect(await within(dialog).findByText('Please try again.')).toBeTruthy();
  });

  it('says so when the list cannot be loaded', async () => {
    h.list = { data: undefined, isLoading: false, isError: true };
    render(<TransferDialog request={REQUEST} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('The transfers could not be loaded.')).toBeTruthy();
  });

  it('closes from the footer', async () => {
    const onClose = vi.fn();
    render(<TransferDialog request={REQUEST} onClose={onClose} />);
    const dialog = await screen.findByRole('dialog');
    const close = within(dialog)
      .getAllByRole('button', { name: 'Close' })
      .find((b) => b.textContent === 'Close')!;
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});
