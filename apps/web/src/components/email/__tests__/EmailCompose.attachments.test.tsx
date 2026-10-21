/**
 * PG-207 (owner ruling Q11): compose uploads every attachment to private
 * storage before sending and sends the stored paths; a failed or oversized
 * upload blocks the send visibly — nothing is dropped silently.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { armComposeMocks, createMockEmailTrpc } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();
vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));

const { EmailCompose } = await import('../EmailCompose');

let send: ReturnType<typeof vi.fn>;
let upload: ReturnType<typeof vi.fn>;

/** Picks files through the compose "Attach file" control (it opens a transient file input). */
function attach(files: File[]) {
  const created: HTMLInputElement[] = [];
  const original = document.createElement.bind(document);
  const spy = vi
    .spyOn(document, 'createElement')
    .mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = original(tag, options);
      if (tag === 'input') {
        created.push(el as HTMLInputElement);
        (el as HTMLInputElement).click = vi.fn();
      }
      return el;
    });
  fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
  spy.mockRestore();
  const input = created.find((el) => el.type === 'file') as HTMLInputElement;
  (input.onchange as (e: Event) => void)({ target: { files } } as unknown as Event);
}

function renderCompose() {
  const onSent = vi.fn();
  render(
    <EmailCompose
      mode="new"
      initialTo={[{ name: 'A', email: 'a@example.invalid' }]}
      onDiscard={vi.fn()}
      onSent={onSent}
    />
  );
  const body = screen.getByLabelText('Message body');
  body.innerHTML = '<p>See attached</p>';
  fireEvent.input(body);
  return { onSent };
}

beforeEach(() => {
  armComposeMocks(mocks);
  send = vi.fn().mockResolvedValue({ id: 'rec-1', status: 'SENT', skipped: [] });
  mocks.sendEmail.mockReturnValue({ mutateAsync: send, isPending: false });
  upload = vi.fn(
    async (input: { fileName: string; contentType: string; contentBase64: string }) => ({
      storagePath: `tenant/u-${input.fileName}`,
      fileName: input.fileName,
      contentType: input.contentType,
      size: 7,
    })
  );
  mocks.uploadAttachment.mockReturnValue({ mutateAsync: upload, isPending: false });
});

describe('EmailCompose attachments', () => {
  it('uploads each file, then sends their stored paths', async () => {
    const { onSent } = renderCompose();
    attach([new File(['content'], 'report.pdf', { type: 'application/pdf' })]);
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledWith({
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      contentBase64: btoa('content'),
    });
    expect(send.mock.calls[0][0].attachments).toEqual([
      {
        storagePath: 'tenant/u-report.pdf',
        fileName: 'report.pdf',
        contentType: 'application/pdf',
        size: 7,
      },
    ]);
  });

  it('labels a file without a type as generic binary content', async () => {
    const { onSent } = renderCompose();
    attach([new File(['x'], 'notes.dat')]);
    await screen.findByText('notes.dat');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(upload.mock.calls[0][0].contentType).toBe('application/octet-stream');
  });

  it('blocks the send with a visible error when an upload fails', async () => {
    upload.mockRejectedValue(new Error('The attachment could not be stored. Try again.'));
    const { onSent } = renderCompose();
    attach([new File(['content'], 'report.pdf', { type: 'application/pdf' })]);
    await screen.findByText('report.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'report.pdf could not be attached: The attachment could not be stored. Try again.'
    );
    expect(send).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB before uploading anything', async () => {
    renderCompose();
    const big = new File(['x'], 'big.bin', { type: 'application/octet-stream' });
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    attach([big]);
    await screen.findByText('big.bin');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'big.bin is larger than 10 MB, so it cannot be attached.'
    );
    expect(upload).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends no attachments field when nothing is attached', async () => {
    const { onSent } = renderCompose();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
  });
});
