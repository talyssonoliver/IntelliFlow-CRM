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
    let healthCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/status') return new Response('{}', { status: 500 });
      healthCalls += 1;
      if (healthCalls === 1) throw new Error('offline');
      return new Response(JSON.stringify({ status: 'ok' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StatusPage />);
    expect(await screen.findByText('Not responding')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByText(/Operational/)).toBeInTheDocument());
  });

  it('shows the server checks of the API, AI agents and sign-in, and no invented figures', async () => {
    const services = [
      { id: 'api', name: 'API', detail: 'd', state: 'up', ms: 42 },
      {
        id: 'ai',
        name: 'AI agents',
        detail: 'd',
        state: 'degraded',
        ms: 50,
        note: '1 of 7 AI queues have no worker',
      },
      {
        id: 'auth',
        name: 'Sign-in',
        detail: 'd',
        state: 'not_checked',
        note: 'No address configured',
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/status'
          ? new Response(JSON.stringify({ services }))
          : new Response(JSON.stringify({ status: 'ok' }))
      )
    );
    const { container } = render(<StatusPage />);
    expect(await screen.findByTestId('service-checks')).toBeInTheDocument();
    expect(screen.getByText('Operational · answered in 42 ms')).toBeInTheDocument();
    expect(screen.getByText('Degraded: 1 of 7 AI queues have no worker')).toBeInTheDocument();
    expect(screen.getByText('Not checked: No address configured')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/99\.\d+%|uptime|All Systems Operational/i);
    expect(screen.getByText(/No incident history is published yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Report a problem' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('says when the server checks could not run, and can try again', async () => {
    let statusCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url !== '/api/status') return new Response(JSON.stringify({ status: 'ok' }));
        statusCalls += 1;
        if (statusCalls === 1) throw new Error('offline');
        if (statusCalls === 2) return new Response(JSON.stringify({ nope: true }));
        return new Response(
          JSON.stringify({
            services: [{ id: 'api', name: 'API', detail: 'd', state: 'down' }],
          })
        );
      })
    );
    render(<StatusPage />);
    expect(await screen.findByTestId('service-checks-failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(statusCalls).toBe(2));
    expect(await screen.findByTestId('service-checks-failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Not responding')).toBeInTheDocument();
  });

  it('carries the aurora-site scope itself, so it is styled inside the signed-in app shell', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'ok', services: [] })))
    );
    const { container } = render(<StatusPage />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('aurora-site');
    expect(root).toHaveClass('aurora-status');
  });

  it('carries Aurora metadata', () => {
    expect(metadata.title).toBe('System status');
    expect(JSON.stringify(metadata)).not.toMatch(/IntelliFlow|—/);
  });
});
