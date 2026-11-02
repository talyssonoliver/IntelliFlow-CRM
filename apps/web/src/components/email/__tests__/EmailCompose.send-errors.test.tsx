/**
 * PG-207 (AC-EM-018, CA-8): a refused send shows a coded, linked alert that
 * takes focus and keeps the draft; skipped recipients are reported after a
 * partial send. Same for InlineCompose.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { armComposeMocks, createMockEmail, createMockEmailTrpc } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();
vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  toast: mockToast,
}));

const { EmailCompose } = await import('../EmailCompose');
const { InlineCompose } = await import('../InlineCompose');

const refusal = (emailSendError: Record<string, unknown>) =>
  Object.assign(new Error('refused'), { data: { code: 'PRECONDITION_FAILED', emailSendError } });

let send: ReturnType<typeof vi.fn>;

function typeBody(label: string, html: string) {
  const body = screen.getByLabelText(label);
  body.innerHTML = html;
  fireEvent.input(body);
}

beforeEach(() => {
  armComposeMocks(mocks);
  send = vi.fn().mockResolvedValue({ id: 'rec-1', status: 'SENT', skipped: [] });
  mocks.sendEmail.mockReturnValue({ mutateAsync: send, isPending: false });
});

function renderCompose() {
  const onSent = vi.fn();
  const utils = render(
    <EmailCompose
      mode="new"
      initialTo={[{ name: 'A', email: 'a@example.invalid' }]}
      onDiscard={vi.fn()}
      onSent={onSent}
    />
  );
  typeBody('Message body', '<p>Hello there</p>');
  return { onSent, ...utils };
}

describe('EmailCompose coded send errors', () => {
  it('asks to connect a mailbox, links to Email Settings, takes focus and keeps the draft', async () => {
    send.mockRejectedValue(refusal({ code: 'NO_MAILBOX', mailboxErrorCode: null, skipped: [] }));
    const { onSent } = renderCompose();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Connect your mailbox to send');
    expect(screen.getByRole('link', { name: 'Open Email Settings' })).toHaveAttribute(
      'href',
      '/email/email-settings'
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(onSent).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message body').innerHTML).toContain('Hello there');
  });

  it('gives the mailbox reason for a failed send', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('x'), {
        data: {
          code: 'BAD_GATEWAY',
          emailSendError: { code: 'SEND_FAILED', mailboxErrorCode: 'TIMEOUT', skipped: [] },
        },
      })
    );
    renderCompose();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not respond in time/);
  });

  it('clears the alert when the next send succeeds', async () => {
    send.mockRejectedValueOnce(
      refusal({ code: 'NO_MAILBOX', mailboxErrorCode: null, skipped: [] })
    );
    const { onSent } = renderCompose();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports skipped (suppressed) recipients after a partial send', async () => {
    send.mockResolvedValue({ id: 'rec-1', status: 'SENT', skipped: ['gone@example.invalid'] });
    const { onSent } = renderCompose();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const notice =
      'Sent. 1 recipient was skipped because they are on the suppression list: gone@example.invalid.';
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Email sent', description: notice })
    );
    expect(screen.getByText(notice, { selector: 'p' })).toBeInTheDocument();
  });

  it('has no axe violations with the alert shown', async () => {
    send.mockRejectedValue(
      refusal({ code: 'MAILBOX_ERROR', mailboxErrorCode: 'AUTH_FAILED', skipped: [] })
    );
    const { container } = renderCompose();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    // Scoped to the alert: RecipientPicker's own aria-controls issue predates PG-207 (tracked separately).
    const alert = await screen.findByRole('alert');
    expect(container.contains(alert)).toBe(true);
    const results = await axe.run(alert);
    expect(results.violations).toEqual([]);
  });
});

describe('InlineCompose coded send errors', () => {
  const original = createMockEmail({ id: 'e1', from: { address: 'b@example.invalid', name: 'B' } });

  function renderInline() {
    const onSent = vi.fn();
    render(
      <InlineCompose mode="reply" originalMessage={original} onSent={onSent} onDiscard={vi.fn()} />
    );
    typeBody('Reply body', '<p>Thanks</p>');
    return { onSent };
  }

  it('shows the coded alert with the settings link and keeps the reply', async () => {
    send.mockRejectedValue(refusal({ code: 'NO_MAILBOX', mailboxErrorCode: null, skipped: [] }));
    const { onSent } = renderInline();
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    const alert = await screen.findByText('Connect your mailbox to send');
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Open Email Settings' })).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('keeps a typed forward note when the form re-renders', () => {
    render(
      <InlineCompose
        mode="forward"
        originalMessage={createMockEmail({ id: 'e2', htmlBody: '<p>Original</p>' })}
        onSent={vi.fn()}
        onDiscard={vi.fn()}
      />
    );
    const body = screen.getByLabelText('Reply body');
    body.innerHTML = '<p>FYI</p><p>Original</p>';
    fireEvent.input(body);
    fireEvent.change(screen.getByLabelText('Forward to'), {
      target: { value: 'c@example.invalid' },
    });
    expect(body.innerHTML).toContain('FYI');
  });

  it('reports skipped recipients in the success toast', async () => {
    send.mockResolvedValue({ id: 'rec-1', status: 'SENT', skipped: ['gone@example.invalid'] });
    const { onSent } = renderInline();
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reply sent',
        description:
          'Sent. 1 recipient was skipped because they are on the suppression list: gone@example.invalid.',
      })
    );
  });
});
