/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusMonitor, describeService } from '../status-monitor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('describeService', () => {
  const base = { id: 'api', name: 'API', detail: 'd' } as const;

  it('gives the measured time when a service is up', () => {
    expect(describeService({ ...base, state: 'up', ms: 12 })).toBe(
      'Operational · answered in 12 ms'
    );
    expect(describeService({ ...base, state: 'up' })).toBe('Operational');
  });

  it('adds the reason when a service is not up', () => {
    expect(describeService({ ...base, state: 'degraded', note: 'Answering, but not ready' })).toBe(
      'Degraded: Answering, but not ready'
    );
    expect(describeService({ ...base, state: 'down' })).toBe('Not responding');
    expect(describeService({ ...base, state: 'not_checked' })).toBe('Not checked');
  });
});

describe('StatusMonitor', () => {
  it('shows a loading note, then one row per checked service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              services: [
                { id: 'api', name: 'API', detail: 'Data', state: 'up', ms: 30 },
                { id: 'auth', name: 'Sign-in', detail: 'Email', state: 'down' },
              ],
            })
          )
      )
    );
    render(<StatusMonitor />);
    expect(screen.getByTestId('service-checks-loading')).toBeInTheDocument();
    expect(await screen.findByText('Operational · answered in 30 ms')).toBeInTheDocument();
    expect(screen.getByText('Not responding')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('says the checks could not run when /api/status fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 502 }))
    );
    render(<StatusMonitor />);
    expect(await screen.findByTestId('service-checks-failed')).toBeInTheDocument();
  });
});
