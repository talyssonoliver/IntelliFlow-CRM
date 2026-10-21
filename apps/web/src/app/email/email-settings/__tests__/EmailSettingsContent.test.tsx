/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import type { EmailSettingsDto, MailboxDto } from '@intelliflow/validators';

type QueryState<T> = { data?: T; isLoading: boolean; error: { message: string } | null };

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  mine: vi.fn(),
  tenant: vi.fn(),
  update: { mutateAsync: vi.fn(), isPending: false },
  reset: { mutateAsync: vi.fn(), isPending: false },
  invalidate: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      emailSettings: { get: { invalidate: api.invalidate } },
      emailMailbox: {
        getMine: { invalidate: api.invalidate },
        getTenant: { invalidate: api.invalidate },
      },
    }),
    emailSettings: {
      get: { useQuery: (...a: unknown[]) => api.settings(...a) },
      update: { useMutation: () => api.update },
      resetToDefaults: { useMutation: () => api.reset },
    },
    emailMailbox: {
      getMine: { useQuery: (...a: unknown[]) => api.mine(...a) },
      getTenant: { useQuery: (...a: unknown[]) => api.tenant(...a) },
      oauthStart: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      testConnection: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      disconnect: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock('../components/SmtpMailboxForm', () => ({
  SmtpMailboxForm: () => <div data-testid="smtp-form" />,
}));
vi.mock('../components/SuppressionListCard', () => ({
  SuppressionListCard: () => (
    <section aria-label="Suppression list" data-testid="suppression-card" />
  ),
}));

import EmailSettingsContent from '../EmailSettingsContent';

const settingsDto = (over: Partial<EmailSettingsDto> = {}): EmailSettingsDto => ({
  allowTenantMailboxFallback: false,
  replyToAddress: null,
  trackOpens: false,
  trackClicks: false,
  hardBounceAction: 'SUPPRESS',
  softBounceThreshold: 3,
  notifySenderOnBounce: false,
  canEdit: true,
  companyMailboxAvailable: false,
  companyMailboxAddress: null,
  ...over,
});

const myMailbox: MailboxDto = {
  id: 'mb1',
  scope: 'USER',
  kind: 'GMAIL',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@gmail.example.invalid',
  fromName: null,
  smtpHost: null,
  smtpPort: null,
  smtpSecurity: null,
  smtpUsername: null,
  hasSmtpPassword: false,
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  hasImapPassword: false,
  bounceReadingEnabled: true,
  accountAddress: 'me@gmail.example.invalid',
  updatedAt: '2026-10-20T00:00:00.000Z',
};

const ok = <T,>(data: T): QueryState<T> => ({ data, isLoading: false, error: null });

function setup(settings: QueryState<EmailSettingsDto> = ok(settingsDto())) {
  api.settings.mockReturnValue(settings);
  api.mine.mockReturnValue(
    ok({ mailbox: myMailbox, providersAvailable: { GMAIL: true, MICROSOFT: true } })
  );
  api.tenant.mockReturnValue(ok(null));
  return render(<EmailSettingsContent />);
}

const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

beforeEach(() => {
  vi.clearAllMocks();
  api.update.isPending = false;
  api.reset.isPending = false;
  api.invalidate.mockResolvedValue(undefined);
  api.update.mutateAsync.mockImplementation(async (input: Partial<EmailSettingsDto>) =>
    settingsDto({ ...input })
  );
  api.reset.mutateAsync.mockResolvedValue(settingsDto());
});

describe('EmailSettingsContent', () => {
  it('shows the bento skeleton while loading', () => {
    setup({ isLoading: true, error: null });
    expect(screen.getByText('Loading email settings')).toBeInTheDocument();
  });

  it('shows the load error', () => {
    setup({ isLoading: false, error: { message: 'boom' } });
    expect(screen.getByText('Failed to load email settings')).toBeInTheDocument();
  });

  it('renders one h1 and a labelled section per card for an admin', async () => {
    setup();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Email Settings' })).toBeInTheDocument();
    for (const name of [
      'My mailbox',
      'Company mailbox',
      'Reply-to',
      'Tracking',
      'Bounce handling',
      'Signatures',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(await screen.findByTestId('suppression-card')).toBeInTheDocument();
    expect(api.tenant).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true }));
  });

  it('keeps My mailbox outside the fieldset that locks while saving', () => {
    api.update.isPending = true;
    setup();
    const card = screen.getByRole('region', { name: 'My mailbox' });
    expect(card.closest('fieldset')).toBeNull();
    expect(screen.getByRole('region', { name: 'Tracking' }).closest('fieldset')).toBeDisabled();
  });

  it('enables Save only when something changed, and saves the tenant settings', async () => {
    setup();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reply-to address'), {
      target: { value: 'Replies@Example.invalid' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Track opens' }));
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.update.mutateAsync).toHaveBeenCalled());
    expect(api.update.mutateAsync).toHaveBeenCalledWith({
      allowTenantMailboxFallback: false,
      replyToAddress: 'replies@example.invalid',
      trackOpens: true,
      trackClicks: false,
      hardBounceAction: 'SUPPRESS',
      softBounceThreshold: 3,
      notifySenderOnBounce: false,
    });
    // The returned settings become the new baseline.
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it('treats a cleared reply-to as "none" and not as a change from none', () => {
    setup();
    const input = screen.getByLabelText('Reply-to address');
    fireEvent.change(input, { target: { value: 'x@example.invalid' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(saveButton()).toBeDisabled();
  });

  it('flags invalid fields with linked messages and blocks Save', () => {
    setup();
    const reply = screen.getByLabelText('Reply-to address');
    fireEvent.change(reply, { target: { value: 'not-an-address' } });
    expect(reply).toHaveAttribute('aria-invalid', 'true');
    expect(reply).toHaveAccessibleDescription(/Enter a valid email address\./);
    const threshold = screen.getByLabelText('Soft bounces before suppressing');
    fireEvent.change(threshold, { target: { value: '40' } });
    expect(threshold).toHaveAttribute('aria-invalid', 'true');
    expect(threshold).toHaveAccessibleDescription(/between 1 and 10/);
    expect(saveButton()).toBeDisabled();
  });

  it('moves focus to the field the server rejected', async () => {
    api.update.mutateAsync.mockRejectedValue(
      Object.assign(new Error('Invalid input'), {
        data: {
          code: 'BAD_REQUEST',
          zodError: { fieldErrors: { replyToAddress: ['Invalid email address'] } },
        },
      })
    );
    setup();
    const reply = screen.getByLabelText('Reply-to address');
    fireEvent.change(reply, { target: { value: 'ok@example.invalid' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(document.activeElement).toBe(reply));
    expect(reply).toHaveAttribute('aria-invalid', 'true');
    expect(reply).toHaveAccessibleDescription(/Invalid email address/);
  });

  it('shows any other save failure as an alert', async () => {
    api.update.mutateAsync.mockRejectedValue(
      new Error('Only administrators and managers can change this.')
    );
    setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Track clicks' }));
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only administrators and managers can change this.'
    );
  });

  it('chooses the hard-bounce action and the sender notification', async () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Only record the bounce' }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Notify the sender when their email bounces' })
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.update.mutateAsync).toHaveBeenCalled());
    expect(api.update.mutateAsync.mock.calls[0][0]).toMatchObject({
      hardBounceAction: 'NONE',
      notifySenderOnBounce: true,
    });
  });

  it('says what Reset changes and what it keeps, then resets', async () => {
    setup(ok(settingsDto({ trackOpens: true })));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      /reply-to address, tracking, bounce handling and the company mailbox fallback/
    );
    expect(dialog).toHaveTextContent(
      /Connected mailboxes, signatures and the suppression list are kept\./
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Settings' }));
    await waitFor(() => expect(api.reset.mutateAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Track opens' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    );
  });

  it('links to the signatures page', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Manage Signatures' })).toHaveAttribute(
      'href',
      '/email/signatures'
    );
  });

  describe('as a member', () => {
    const member = () =>
      setup(
        ok(
          settingsDto({
            canEdit: false,
            allowTenantMailboxFallback: true,
            companyMailboxAvailable: true,
            companyMailboxAddress: 'team@mail.example.invalid',
          })
        )
      );

    it('hides Save and Reset, explains why and disables every tenant control', () => {
      member();
      expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset to Defaults' })).not.toBeInTheDocument();
      expect(screen.getByText(/Managed by your admin\./)).toBeInTheDocument();
      for (const control of [
        screen.getByLabelText('Reply-to address'),
        screen.getByRole('switch', { name: 'Track opens' }),
        screen.getByRole('radio', { name: 'Add it to the suppression list' }),
        screen.getByLabelText('Soft bounces before suppressing'),
      ]) {
        expect(control).toBeDisabled();
        expect(control).toHaveAccessibleDescription(/Managed by your admin\./);
      }
    });

    it('never asks for the company mailbox connection and does not load the suppression list', async () => {
      member();
      expect(api.tenant).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ enabled: false })
      );
      await screen.findByRole('region', { name: 'My mailbox' });
      expect(screen.queryByTestId('suppression-card')).not.toBeInTheDocument();
    });

    it('still manages their own mailbox', () => {
      member();
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
    });
  });

  it('has no axe violations for an admin and a member', async () => {
    for (const canEdit of [true, false]) {
      const { container, unmount } = setup(ok(settingsDto({ canEdit })));
      if (canEdit) await screen.findByTestId('suppression-card');
      const results = await axe.run(container);
      expect(results.violations).toEqual([]);
      unmount();
    }
  });

  it('has no axe violations while loading or failed', async () => {
    for (const state of [
      { isLoading: true, error: null },
      { isLoading: false, error: { message: 'boom' } },
    ]) {
      const { container, unmount } = setup(state);
      const results = await axe.run(container);
      expect(results.violations).toEqual([]);
      unmount();
    }
  });
});
