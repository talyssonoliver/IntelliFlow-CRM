/**
 * @vitest-environment jsdom
 *
 * WebhookSecretDialog + RotateSecretDialog — PG-208 (AC-TA-006, -017): copy
 * success / failure fallback, outside click ignored, Esc and Done close, the
 * secret leaves the DOM after close; rotation with or without revoke.
 */
import { useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { RotateSecretDialog, WebhookSecretDialog } from '../WebhookSecretDialog';

const URL_VALUE = 'https://api.example.invalid/webhooks/task-automation/' + 'a'.repeat(8);
const SECRET = 'placeholder-' + 'b'.repeat(8);

function Harness({ onClosed }: { onClosed: () => void }) {
  const [creds, setCreds] = useState<{
    webhookUrl: string | null;
    signingSecret: string | null;
  } | null>({ webhookUrl: URL_VALUE, signingSecret: SECRET });
  return (
    <WebhookSecretDialog
      credentials={creds}
      ruleName="Intake"
      onClose={() => {
        setCreds(null);
        onClosed();
      }}
    />
  );
}

function stubClipboard(writeText: (v: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('WebhookSecretDialog', () => {
  it('shows the URL, the secret and signing instructions; copy is announced', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<Harness onClosed={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Webhook for “Intake”' })).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    expect(screen.getByText('X-IntelliFlow-Signature: t=<unix>,v1=<hex>')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Signing secret' }));
    expect(await screen.findByText('Signing secret copied.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(SECRET);
  });

  it('selects the value with a hint when copying fails', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<Harness onClosed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Webhook URL' }));
    expect(await screen.findByText(/Could not copy automatically/)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Webhook URL'));
  });

  it('ignores an outside click', () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    fireEvent.pointerDown(document.body);
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes with Esc and the secret leaves the DOM', async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('closes with Done', async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
  });

  it('renders nothing without credentials', () => {
    render(<WebhookSecretDialog credentials={null} ruleName="" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('RotateSecretDialog', () => {
  it('explains the grace period and rotates with or without revoke', () => {
    const onConfirm = vi.fn();
    render(
      <RotateSecretDialog
        ruleName="Intake"
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/keeps working for 24 hours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Secret' }));
    expect(onConfirm).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Revoke the old secret now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Secret' }));
    expect(onConfirm).toHaveBeenLastCalledWith(true);
  });

  it('cancels with the button or Esc, and disables while pending', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <RotateSecretDialog
        ruleName="Intake"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(2));
    rerender(
      <RotateSecretDialog ruleName="Intake" isPending onConfirm={vi.fn()} onCancel={onCancel} />
    );
    expect(screen.getByRole('button', { name: 'Rotate Secret' })).toBeDisabled();
  });
});
