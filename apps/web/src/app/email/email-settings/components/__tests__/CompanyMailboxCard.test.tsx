/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import type { MailboxDto } from '@intelliflow/validators';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    emailMailbox: {
      oauthStart: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      testConnection: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      disconnect: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));
vi.mock('../SmtpMailboxForm', () => ({
  SmtpMailboxForm: (p: { scope: string }) => <div data-testid="smtp-form">form for {p.scope}</div>,
}));

import { CompanyMailboxCard } from '../CompanyMailboxCard';

const teamMailbox: MailboxDto = {
  id: 'mb-team',
  scope: 'TENANT',
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'team@mail.example.invalid',
  fromName: 'Team',
  smtpHost: 'smtp.mail.example.invalid',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'team@mail.example.invalid',
  hasSmtpPassword: true,
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  hasImapPassword: false,
  bounceReadingEnabled: false,
  accountAddress: null,
  updatedAt: '2026-10-20T00:00:00.000Z',
};

function renderCard(props: Partial<Parameters<typeof CompanyMailboxCard>[0]> = {}) {
  const onAllowFallbackChange = vi.fn();
  const utils = render(
    <>
      <p id="email-settings-readonly-note">Managed by your admin.</p>
      <CompanyMailboxCard
        canEdit
        mailbox={null}
        providersAvailable={{ GMAIL: true, MICROSOFT: true }}
        allowFallback={false}
        onAllowFallbackChange={onAllowFallbackChange}
        companyMailboxAddress={null}
        onChanged={vi.fn()}
        announce={vi.fn()}
        readOnlyNoteId="email-settings-readonly-note"
        {...props}
      />
    </>
  );
  return { onAllowFallbackChange, ...utils };
}

beforeEach(() => vi.clearAllMocks());

describe('CompanyMailboxCard', () => {
  it('lets an admin connect the company mailbox', async () => {
    renderCard();
    expect(screen.getByRole('region', { name: 'Company mailbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Set Up SMTP' }));
    expect(await screen.findByTestId('smtp-form')).toHaveTextContent('form for TENANT');
  });

  it('shows the connected company mailbox to an admin', () => {
    renderCard({ mailbox: teamMailbox, companyMailboxAddress: 'team@mail.example.invalid' });
    expect(screen.getByText('team@mail.example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('toggles the member fallback', () => {
    const { onAllowFallbackChange } = renderCard({ mailbox: teamMailbox });
    const toggle = screen.getByRole('switch', {
      name: 'Members without their own mailbox can send from it',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(onAllowFallbackChange).toHaveBeenCalledWith(true);
  });

  it('is read-only for members: no connection controls, the switch is disabled and explained', () => {
    renderCard({
      canEdit: false,
      allowFallback: true,
      companyMailboxAddress: 'team@mail.example.invalid',
    });
    expect(screen.queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set Up SMTP' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('switch', {
      name: 'Members without their own mailbox can send from it',
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(/Managed by your admin\./);
    expect(
      screen.getByText(
        'If you have no mailbox of your own, your email is sent from team@mail.example.invalid.'
      )
    ).toBeInTheDocument();
  });

  it('tells members they need their own mailbox when there is no fallback', () => {
    renderCard({ canEdit: false });
    expect(
      screen.getByText('Members need to connect their own mailbox to send email.')
    ).toBeInTheDocument();
  });

  it('has no axe violations for admins and members', async () => {
    for (const canEdit of [true, false]) {
      const { container, unmount } = renderCard({ canEdit, mailbox: canEdit ? teamMailbox : null });
      const results = await axe.run(container);
      expect(results.violations).toEqual([]);
      unmount();
    }
  });
});
