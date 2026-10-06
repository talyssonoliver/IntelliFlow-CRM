/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import StatusPage, { metadata } from '../page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatusPage (Aurora)', () => {
  it('checks the web app live and says what it measured', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    render(<StatusPage />);
    expect(await screen.findByText(/Operational · answered in \d+ ms/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { cache: 'no-store' });
    expect(screen.getByText(/Checked from your browser at/)).toBeInTheDocument();
  });

  it('reports the web app as not responding when the check fails, and can check again', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    render(<StatusPage />);
    expect(await screen.findByText('Not responding')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByText(/Operational/)).toBeInTheDocument());
  });

  it('marks services with no public check as pending, and shows no invented figures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'ok' })))
    );
    const { container } = render(<StatusPage />);
    await screen.findByText(/Operational/);
    expect(screen.getAllByText('Pending: no public check yet')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/99\.\d+%|uptime|All Systems Operational/i);
    expect(screen.getByText(/No incident history is published yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Report a problem' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('carries Aurora metadata', () => {
    expect(metadata.title).toBe('System status');
    expect(JSON.stringify(metadata)).not.toMatch(/IntelliFlow|—/);
  });
});
