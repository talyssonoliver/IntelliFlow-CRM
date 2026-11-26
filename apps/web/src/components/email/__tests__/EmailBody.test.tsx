// @vitest-environment jsdom
/**
 * The shared email body renderer: a sandboxed frame, images blocked until shown, the text as the
 * fallback, and attachments fetched through the on-demand proxy (never stored).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ fetch: vi.fn(), toast: vi.fn() }));
vi.mock('@intelliflow/ui', () => ({ toast: m.toast }));
vi.mock('@/lib/trpc', () => ({
  trpc: { useUtils: () => ({ emailAttachments: { fetch: { fetch: m.fetch } } }) },
}));

import { EmailBody } from '../EmailBody';

const frame = () => screen.getByTitle('Email content') as HTMLIFrameElement;
const PNG_B64 = 'iVBORw0KGgo=';

beforeEach(() => {
  vi.clearAllMocks();
  m.fetch.mockResolvedValue({
    fileName: 'quote.pdf',
    contentType: 'application/pdf',
    size: 3,
    contentBase64: Buffer.from('pdf').toString('base64'),
  });
});

describe('EmailBody', () => {
  it('renders the HTML in a sandboxed frame with no scripts and no same-origin', () => {
    render(<EmailBody emailId="e1" htmlBody="<p>Hello <b>Robert</b></p>" textBody="Hello" />);
    const sandbox = frame().getAttribute('sandbox') ?? '';
    expect(sandbox.split(/\s+/)).not.toContain('allow-scripts');
    expect(sandbox.split(/\s+/)).not.toContain('allow-same-origin');
    expect(frame().getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame().getAttribute('srcdoc')).toContain('<b>Robert</b>');
    expect(frame().getAttribute('srcdoc')).toContain("default-src 'none'");
    // The HTML is not injected into the page itself.
    expect(screen.queryByText('Robert')).toBeNull();
  });

  it('falls back to the text when the mail has no HTML', () => {
    render(<EmailBody emailId="e1" textBody="Plain words" />);
    expect(screen.queryByTitle('Email content')).toBeNull();
    expect(screen.getByText('Plain words')).toBeTruthy();
  });

  it('blocks external images until Show images is clicked', () => {
    render(
      <EmailBody
        emailId="e1"
        htmlBody='<img src="https://cdn.example.invalid/hero.png" width="600">'
      />
    );
    expect(frame().getAttribute('srcdoc')).not.toContain('cdn.example.invalid');
    expect(frame().getAttribute('srcdoc')).toContain('img-src data:;');
    fireEvent.click(screen.getByRole('button', { name: 'Show images' }));
    expect(frame().getAttribute('srcdoc')).toContain('https://cdn.example.invalid/hero.png');
    expect(frame().getAttribute('srcdoc')).toContain('img-src data: https:;');
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
  });

  it('offers no Show images control when the mail has no external images', () => {
    render(<EmailBody emailId="e1" htmlBody="<p>No pictures</p>" />);
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
  });

  it('resolves cid: images through the attachment proxy, once, without any click', async () => {
    m.fetch.mockResolvedValue({
      fileName: 'shot.png',
      contentType: 'image/png',
      size: 8,
      contentBase64: PNG_B64,
    });
    const attachments = [
      {
        id: 'att-1',
        filename: 'shot.png',
        contentType: 'image/png',
        size: 8,
        isInline: true,
        contentId: 'Shot1',
        onDemand: true,
      },
    ];
    const { rerender } = render(
      <EmailBody emailId="e1" htmlBody='<img src="cid:shot1">' attachments={attachments} />
    );
    await waitFor(() =>
      expect(frame().getAttribute('srcdoc')).toContain(`data:image/png;base64,${PNG_B64}`)
    );
    expect(m.fetch).toHaveBeenCalledWith({ emailId: 'e1', attachmentId: 'att-1' });
    // A new array with the same content (as the callers pass) does not fetch again.
    rerender(
      <EmailBody emailId="e1" htmlBody='<img src="cid:shot1">' attachments={[...attachments]} />
    );
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not embed an inline "image" that is not a raster image', async () => {
    m.fetch.mockResolvedValue({
      fileName: 'x.svg',
      contentType: 'image/svg+xml',
      size: 8,
      contentBase64: 'PHN2Zz4=',
    });
    render(
      <EmailBody
        emailId="e1"
        htmlBody='<img src="cid:x">'
        attachments={[
          {
            id: 'a',
            filename: 'x.svg',
            contentType: 'image/svg+xml',
            size: 8,
            isInline: true,
            contentId: 'x',
            onDemand: true,
          },
        ]}
      />
    );
    await waitFor(() => expect(m.fetch).toHaveBeenCalled());
    expect(frame().getAttribute('srcdoc')).not.toContain('svg');
  });

  it('lists files (not inline images) and downloads one on click through the proxy', async () => {
    const createUrl = vi.fn(() => 'blob:test');
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <EmailBody
        emailId="e1"
        htmlBody="<p>See attached</p>"
        attachments={[
          {
            id: 'att-1',
            filename: 'quote.pdf',
            contentType: 'application/pdf',
            size: 2048,
            onDemand: true,
          },
          {
            id: 'att-2',
            filename: 'logo.png',
            contentType: 'image/png',
            size: 10,
            isInline: true,
            contentId: 'l',
            onDemand: true,
          },
        ]}
      />
    );
    expect(screen.getByText('1 attachment(s)')).toBeTruthy();
    expect(screen.queryByText('logo.png')).toBeNull();
    // Nothing was fetched just by showing the list.
    expect(m.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download quote.pdf' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(m.fetch).toHaveBeenCalledWith({ emailId: 'e1', attachmentId: 'att-1' });
    expect(createUrl).toHaveBeenCalled();
    click.mockRestore();
  });

  it('says so when the provider cannot give the file, and does not download', async () => {
    m.fetch.mockRejectedValue(
      new Error('Reconnect the mailbox this email came from to open its attachments.')
    );
    render(
      <EmailBody
        emailId="e1"
        htmlBody="<p>x</p>"
        attachments={[
          { id: 'a', filename: 'a.pdf', contentType: 'application/pdf', size: 1, onDemand: true },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download a.pdf' }));
    await waitFor(() =>
      expect(m.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not open the attachment', variant: 'destructive' })
      )
    );
  });

  it('shows the name only for an older attachment that is not on demand', () => {
    render(
      <EmailBody
        emailId="e1"
        textBody="x"
        attachments={[
          { id: 'o', filename: 'old.docx', contentType: 'application/msword', size: 1 },
        ]}
      />
    );
    expect(screen.getByText('old.docx')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download old.docx' })).toBeNull();
  });
});
