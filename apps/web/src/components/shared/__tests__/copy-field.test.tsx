/**
 * @vitest-environment jsdom
 *
 * CopyField — clipboard copy with a select-and-hint fallback (PG-208).
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { CopyField } from '../copy-field';

const VALUE = 'https://api.example.invalid/webhooks/task-automation/abc';

function stubClipboard(writeText: (v: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('CopyField', () => {
  it('copies the value and announces it, then resets', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyField label="Webhook URL" value={VALUE} help="Paste it into the sender." />);

    const input = screen.getByLabelText('Webhook URL') as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-help`);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Webhook URL' }));

    await waitFor(() => expect(screen.getByText('Webhook URL copied.')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(VALUE);
    // The name follows the visible text while it says "Copied".
    expect(screen.getByRole('button', { name: 'Copied Webhook URL' }).textContent).toBe('Copied');
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByText('Webhook URL copied.')).toBeNull();
  });

  it('selects the value with a hint when the clipboard refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<CopyField id="secret" label="Signing secret" value="placeholder-value" />);
    const input = screen.getByLabelText('Signing secret') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Copy Signing secret' }));
    await waitFor(() =>
      expect(screen.getByText(/Could not copy automatically/)).toBeInTheDocument()
    );
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe('placeholder-value'.length);
  });

  it('falls back when there is no clipboard API and clears its timer on unmount', async () => {
    const { unmount } = render(<CopyField label="Signing secret" value="x" mono={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Signing secret' }));
    await waitFor(() =>
      expect(screen.getByText(/Could not copy automatically/)).toBeInTheDocument()
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Signing secret' }));
    await waitFor(() => expect(screen.getByText('Signing secret copied.')).toBeInTheDocument());
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
