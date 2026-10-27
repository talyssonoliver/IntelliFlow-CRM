/**
 * @vitest-environment jsdom
 *
 * PG-203 DSAR — the administrators' privacy requests page (spec Addendum A; D-AC-05/06/08).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';

function mutation() {
  return { mutateAsync: vi.fn().mockResolvedValue({ ok: true }), isPending: false };
}

const h = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  restrictions: { data: undefined as unknown },
  preview: { data: undefined as unknown },
  mutations: {} as Record<string, { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean }>,
  invalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  toast: h.toast,
}));

vi.mock('@/lib/trpc', () => {
  const m = (name: string) => ({ useMutation: () => h.mutations[name] });
  return {
    trpc: {
      useUtils: () => ({ privacy: { admin: { invalidate: h.invalidate } } }),
      privacy: {
        admin: {
          list: { useQuery: () => h.list },
          restrictions: { useQuery: () => h.restrictions },
          previewErasure: { useQuery: () => h.preview },
          complete: m('complete'),
          completeAccess: m('completeAccess'),
          extend: m('extend'),
          reject: m('reject'),
          cancelErasure: m('cancelErasure'),
          revokeExport: m('revokeExport'),
          logRequest: m('logRequest'),
          liftRestriction: m('liftRestriction'),
          exportData: m('exportData'),
        },
      },
    },
  };
});

import PrivacyRequestsContent, { actionsFor, errorCode } from '../PrivacyRequestsContent';
import { logRequestProblem, toLogRequestInput } from '../components/LogRequestDialog';
import PrivacyRequestsPage from '../page';

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clhrequest000000000',
    type: 'ERASURE',
    status: 'VERIFIED',
    source: 'PUBLIC_FORM',
    subjectEmail: 'ada@example.invalid',
    details: null,
    objectionScope: null,
    identityMethod: null,
    receivedOn: '2026-10-01',
    verifiedAt: '2026-10-01T09:00:00.000Z',
    slaDeadline: '2026-11-01T09:00:00.000Z',
    extendedUntil: null,
    effectiveDeadline: '2026-11-01T09:00:00.000Z',
    overdue: false,
    exportIssuedAt: null,
    exportLinkActive: false,
    completedAt: null,
    resolutionNote: null,
    clockBreached: false,
    createdAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.list = { data: [request()], isLoading: false, isError: false, error: null };
  h.restrictions = { data: [] };
  h.preview = { data: { counts: { leads: 1, contacts: 1 }, checklist: { tickets: 2 } } };
  h.mutations = Object.fromEntries(
    [
      'complete',
      'completeAccess',
      'extend',
      'reject',
      'cancelErasure',
      'revokeExport',
      'logRequest',
      'liftRestriction',
      'exportData',
    ].map((name) => [name, mutation()])
  );
});

describe('PrivacyRequestsContent', () => {
  it('lists open requests with their deadline and no accessibility violations', async () => {
    h.list.data = [
      request({ overdue: true }),
      request({ id: 'clhdone00000000000', status: 'COMPLETED' }),
    ];
    const { container } = render(<PrivacyRequestsContent />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy requests' })).toBeTruthy();
    expect(screen.getAllByText('ada@example.invalid').length).toBeGreaterThan(0);
    expect(screen.getByText(/Overdue since 1 Nov 2026/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Closed requests' })).toBeTruthy();
    await axeClean(container);
  });

  it('erases only after the no-hold confirmation, showing the counts first', async () => {
    h.mutations.complete!.mutateAsync.mockResolvedValue({
      erasure: { counts: { leads: 1 }, checklist: {} },
    });
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Erasure/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('leads: 1')).toBeTruthy();
    expect(within(dialog).getByText('Support tickets: 2')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Note for the record'), {
      target: { value: 'Checked with the partner' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete request' }));
    expect(
      await within(dialog).findByText('Confirm that no legal hold or retention duty applies.')
    ).toBeTruthy();
    expect(h.mutations.complete!.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete request' }));
    await waitFor(() =>
      expect(h.mutations.complete!.mutateAsync).toHaveBeenCalledWith({
        id: 'clhrequest000000000',
        note: 'Checked with the partner',
        noHoldConfirmed: true,
      })
    );
    expect(h.toast).toHaveBeenCalledWith({ title: 'Data erased and the person told' });
  });

  it('keeps a server refusal inside the dialog', async () => {
    h.mutations.reject!.mutateAsync.mockRejectedValue(new Error('This request has changed.'));
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Refuse: Erasure/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Retention duty under SRA rules' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refuse request' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByText('This request has changed.')).toBeTruthy();
  });

  it('requires the marketing stop for a marketing objection', async () => {
    h.list.data = [request({ type: 'OBJECTION', objectionScope: 'MARKETING' })];
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Objection/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note for the record'), {
      target: { value: 'Done' },
    });
    fireEvent.change(within(dialog).getByLabelText('How marketing was stopped'), {
      target: { value: 'Removed from the newsletter list' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete request' }));
    await waitFor(() =>
      expect(h.mutations.complete!.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          marketingStoppedConfirmed: true,
          marketingStopMethod: 'Removed from the newsletter list',
        })
      )
    );
  });

  it('holds an extension reason to the 500 characters the server accepts (codex)', async () => {
    h.list.data = [request({ type: 'ACCESS' })];
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Extend: Access/ }));
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).getByLabelText('Reason');
    expect(reason.getAttribute('maxlength')).toBe('500');
    fireEvent.change(reason, { target: { value: 'x'.repeat(501) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend the deadline' }));
    expect(
      await within(dialog).findByText('Keep the reason to 500 characters or fewer.')
    ).toBeTruthy();
    expect(h.mutations.extend!.mutateAsync).not.toHaveBeenCalled();
  });

  it('extends and records withheld categories on an access request', async () => {
    h.list.data = [
      request({
        type: 'ACCESS',
        exportIssuedAt: '2026-10-02T09:00:00.000Z',
        exportLinkActive: true,
      }),
    ];
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Extend: Access/ }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Two months'));
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Many records to review' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend the deadline' }));
    await waitFor(() =>
      expect(h.mutations.extend!.mutateAsync).toHaveBeenCalledWith({
        id: 'clhrequest000000000',
        months: 2,
        reason: 'Many records to review',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Access/ }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Staff notes withheld'), {
      target: { value: '2' },
    });
    fireEvent.change(within(dialog).getByLabelText('Why staff notes are withheld'), {
      target: { value: 'Legal professional privilege' },
    });
    fireEvent.change(within(dialog).getByLabelText('Note for the record'), {
      target: { value: 'Sent separately' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete access request' }));
    await waitFor(() =>
      expect(h.mutations.completeAccess!.mutateAsync).toHaveBeenCalledWith({
        id: 'clhrequest000000000',
        note: 'Sent separately',
        withheld: [{ category: 'NOTES', count: 2, reason: 'Legal professional privilege' }],
      })
    );
  });

  it('never invents a reason: a withheld count without one is refused in the dialog (codex)', async () => {
    h.list.data = [
      request({
        type: 'ACCESS',
        exportIssuedAt: '2026-10-02T09:00:00.000Z',
        exportLinkActive: true,
      }),
    ];
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Access/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Staff notes withheld'), {
      target: { value: '2' },
    });
    fireEvent.change(within(dialog).getByLabelText('Note for the record'), {
      target: { value: 'Sent separately' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete access request' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toMatch(/reason for each/i)
    );
    expect(h.mutations.completeAccess!.mutateAsync).not.toHaveBeenCalled();
    const reason = within(dialog).getByLabelText('Why staff notes are withheld');
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(reason);
  });

  it('offers the new withheld categories and shows the server refusal when one is missing (Q23, Q26)', async () => {
    h.list.data = [
      request({
        type: 'ACCESS',
        exportIssuedAt: '2026-10-02T09:00:00.000Z',
        exportLinkActive: true,
      }),
    ];
    h.mutations.completeAccess!.mutateAsync.mockRejectedValue(
      new Error('Give a count and a reason for everything the export withholds.')
    );
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Access/ }));
    const dialog = await screen.findByRole('dialog');
    for (const label of [
      'Deal and task descriptions withheld',
      'AI-written text withheld',
      'Staff tags, qualification notes, booking answers and request notes withheld',
      'Calendar events, notifications and experiment records withheld',
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeTruthy();
    }
    expect(within(dialog).getByText(/every category the export withholds/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Note for the record'), {
      target: { value: 'Sent separately' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete access request' }));
    expect(
      await within(dialog).findByText(
        'Give a count and a reason for everything the export withholds.'
      )
    ).toBeTruthy();
  });

  it('lists deals and tasks on the erasure checklist (Q23)', async () => {
    h.preview = {
      data: { counts: { leads: 1 }, checklist: { deals: 3, tasks: 2, tickets: 0 } },
    };
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Erasure/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Deals: 3')).toBeTruthy();
    expect(within(dialog).getByText('Tasks: 2')).toBeTruthy();
  });

  it('lifts a restriction only with a reason', async () => {
    h.restrictions = {
      data: [
        {
          id: 'clhrestrict0000000',
          subjectEmail: 'bob@example.invalid',
          blocksMarketing: true,
          requestCount: 1,
          since: '2026-10-01T00:00:00.000Z',
        },
      ],
    };
    render(<PrivacyRequestsContent />);
    expect(screen.getByText(/Do not send marketing/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Lift the restriction for bob@example.invalid' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lift restriction' }));
    expect(
      await within(dialog).findByText('Give a reason of at least 10 characters.')
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Accuracy confirmed with the client' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lift restriction' }));
    await waitFor(() =>
      expect(h.mutations.liftRestriction!.mutateAsync).toHaveBeenCalledWith({
        restrictionId: 'clhrestrict0000000',
        note: 'Accuracy confirmed with the client',
      })
    );
  });

  it('tells a non-administrator the page is for administrators', () => {
    h.list = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { code: 'FORBIDDEN' } },
    };
    render(<PrivacyRequestsContent />);
    expect(screen.getByText('Only administrators can see and handle data requests.')).toBeTruthy();
  });
});

describe('accessibility of validation and focus', () => {
  const describedBy = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '').split(' ');
  const describedText = (el: HTMLElement) =>
    describedBy(el)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');

  function expectFieldError(field: HTMLElement, alert: HTMLElement) {
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(alert.id).not.toBe('');
    expect(describedBy(field)).toContain(alert.id);
    expect(document.activeElement).toBe(field);
  }

  const restriction = (blocksMarketing: boolean) => ({
    data: [
      {
        id: 'clhrestrict0000000',
        subjectEmail: 'bob@example.invalid',
        blocksMarketing,
        requestCount: 1,
        since: '2026-10-01T00:00:00.000Z',
      },
    ],
  });

  async function openLog() {
    fireEvent.click(screen.getByRole('button', { name: 'Log a request' }));
    return screen.findByRole('dialog');
  }

  function fillLog(dialog: HTMLElement) {
    fireEvent.change(within(dialog).getByLabelText('Their email address'), {
      target: { value: 'ada@example.invalid' },
    });
    fireEvent.change(within(dialog).getByLabelText('Identity check details'), {
      target: { value: 'Passport checked at the front desk' },
    });
  }

  it('names the offending field in the log dialog, focuses it and keeps the summary alert', async () => {
    render(<PrivacyRequestsContent />);
    const dialog = await openLog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log request' }));
    const email = within(dialog).getByLabelText('Their email address');
    await waitFor(() => expect(document.activeElement).toBe(email));
    expectFieldError(email, within(dialog).getByRole('alert'));
    expect(within(dialog).getByRole('alert').textContent).toBe('Enter a valid email address.');

    fireEvent.change(email, { target: { value: 'ada@example.invalid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log request' }));
    const note = within(dialog).getByLabelText('Identity check details');
    await waitFor(() => expect(document.activeElement).toBe(note));
    expectFieldError(note, within(dialog).getByRole('alert'));
    expect(email.getAttribute('aria-invalid')).toBeNull();
  });

  it('gives the identity note a minimum-length hint of 20 characters', async () => {
    render(<PrivacyRequestsContent />);
    const dialog = await openLog();
    expect(describedText(within(dialog).getByLabelText('Identity check details'))).toContain(
      'At least 20 characters'
    );
  });

  it('shows a 10 character hint on reasons and points the field at its error', async () => {
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Refuse: Erasure/ }));
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).getByLabelText('Reason');
    expect(describedText(reason)).toContain('At least 10 characters');
    expect(reason.getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refuse request' }));
    await waitFor(() => expect(document.activeElement).toBe(reason));
    expectFieldError(reason, within(dialog).getByRole('alert'));
    expect(h.mutations.reject!.mutateAsync).not.toHaveBeenCalled();
  });

  it('flags the marketing stop method and the confirmation separately', async () => {
    h.list.data = [request({ type: 'OBJECTION', objectionScope: 'MARKETING' })];
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Complete: Objection/ }));
    const dialog = await screen.findByRole('dialog');
    const stop = within(dialog).getByLabelText('How marketing was stopped');
    expect(describedText(stop)).toContain('At least 10 characters');
    fireEvent.change(within(dialog).getByLabelText('Note for the record'), {
      target: { value: 'Done' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete request' }));
    await waitFor(() => expect(document.activeElement).toBe(stop));
    expectFieldError(stop, within(dialog).getByRole('alert'));

    fireEvent.change(stop, { target: { value: 'Removed from the newsletter list' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete request' }));
    const box = within(dialog).getByRole('checkbox');
    await waitFor(() => expect(document.activeElement).toBe(box));
    expectFieldError(box, within(dialog).getByRole('alert'));
    expect(stop.getAttribute('aria-invalid')).toBeNull();
  });

  it('flags the reason field in the lift dialog', async () => {
    h.restrictions = restriction(false);
    render(<PrivacyRequestsContent />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Lift the restriction for bob@example.invalid' })
    );
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).getByLabelText('Reason');
    expect(describedText(reason)).toContain('At least 10 characters');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lift restriction' }));
    await waitFor(() => expect(document.activeElement).toBe(reason));
    expectFieldError(reason, within(dialog).getByRole('alert'));
  });

  it('moves focus to the Open requests heading after a successful action', async () => {
    h.mutations.reject!.mutateAsync.mockResolvedValue({ restrictionKept: false });
    render(<PrivacyRequestsContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Refuse: Erasure/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Retention duty under SRA rules' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refuse request' }));
    const heading = screen.getByRole('heading', { name: 'Open requests', hidden: true });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('moves focus to the Open requests heading after lifting a restriction', async () => {
    h.restrictions = restriction(false);
    render(<PrivacyRequestsContent />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Lift the restriction for bob@example.invalid' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Accuracy confirmed with the client' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lift restriction' }));
    const heading = screen.getByRole('heading', { name: 'Open requests', hidden: true });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('moves focus to the Open requests heading after logging a request', async () => {
    render(<PrivacyRequestsContent />);
    const dialog = await openLog();
    fillLog(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log request' }));
    const heading = screen.getByRole('heading', { name: 'Open requests', hidden: true });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('keeps the pending log button focusable and ignores presses', async () => {
    h.mutations.logRequest!.isPending = true;
    render(<PrivacyRequestsContent />);
    const dialog = await openLog();
    fillLog(dialog);
    const button = within(dialog).getByRole('button', { name: 'Saving…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(h.mutations.logRequest!.mutateAsync).not.toHaveBeenCalled();
  });

  it('names each Download data button after its request', () => {
    h.list.data = [
      request({ type: 'ACCESS', subjectEmail: 'ada@example.invalid' }),
      request({ id: 'clhsecond0000000000', type: 'ACCESS', subjectEmail: 'bob@example.invalid' }),
    ];
    render(<PrivacyRequestsContent />);
    const buttons = screen.getAllByRole('button', { name: /^Download data: / });
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Download data: Access (a copy of their data) for ada@example.invalid',
      'Download data: Access (a copy of their data) for bob@example.invalid',
    ]);
  });
});

describe('helpers', () => {
  it('offers only the actions that apply', () => {
    expect(actionsFor(request({ status: 'COMPLETED' }) as never)).toEqual([]);
    // A completed access request whose link is still live can still be revoked (codex).
    expect(
      actionsFor(request({ type: 'ACCESS', status: 'COMPLETED', exportLinkActive: true }) as never)
    ).toEqual(['revokeExport']);
    expect(actionsFor(request() as never)).toEqual([
      'complete',
      'extend',
      'cancelErasure',
      'reject',
    ]);
    expect(
      actionsFor(
        request({
          type: 'ACCESS',
          extendedUntil: '2026-12-01',
          exportIssuedAt: '2026-10-02',
          exportLinkActive: true,
        }) as never
      )
    ).toEqual(['completeAccess', 'revokeExport', 'reject']);
    expect(errorCode({ data: { code: 'FORBIDDEN' } })).toBe('FORBIDDEN');
  });

  it('checks a logged request and builds its input', () => {
    const today = new Date().toISOString().slice(0, 10);
    const draft = {
      type: 'OBJECTION' as const,
      email: ' ada@example.invalid ',
      receivedOn: today,
      receivedOnReason: '',
      identityMethod: 'IN_PERSON_ID' as const,
      identityNote: 'Passport checked at the front desk',
      objectionScope: 'MARKETING' as const,
      details: '',
    };
    expect(logRequestProblem(draft)).toBeNull();
    expect(logRequestProblem({ ...draft, email: 'nope' })).toMatchObject({ field: 'email' });
    expect(logRequestProblem({ ...draft, identityNote: 'short' })).toMatchObject({
      field: 'identityNote',
      message: expect.stringMatching(/at least 20/),
    });
    expect(logRequestProblem({ ...draft, receivedOn: '2026-01-01' })).toMatchObject({
      field: 'receivedOnReason',
      message: expect.stringMatching(/logged after/),
    });
    expect(logRequestProblem({ ...draft, receivedOn: '2999-01-01' })).toMatchObject({
      field: 'receivedOn',
    });
    expect(toLogRequestInput(draft)).toEqual({
      type: 'OBJECTION',
      email: 'ada@example.invalid',
      receivedOn: today,
      identityMethod: 'IN_PERSON_ID',
      identityNote: 'Passport checked at the front desk',
      objectionScope: 'MARKETING',
    });
  });

  it('renders the page shell', () => {
    expect(PrivacyRequestsPage().type).toBeDefined();
  });
});
