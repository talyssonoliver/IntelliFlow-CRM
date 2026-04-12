// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/status/incident-creator', () => ({
  createIncident: vi.fn(() => ({
    event: 'incident_created',
    errorId: 'mock-id',
    digest: null,
    message: 'mock',
    severity: 'error',
    path: '/500',
    userAgent: null,
    timestamp: '2026-01-01T00:00:00Z',
  })),
}));

vi.mock('@/lib/status/error-notifier', () => ({
  notifyTeam: vi.fn(),
}));

import { ServerIncidentReporter } from '../server-incident-reporter';
import { createIncident } from '@/lib/status/incident-creator';
import { notifyTeam } from '@/lib/status/error-notifier';

describe('ServerIncidentReporter', () => {
  it('calls createIncident on mount with error, path, and severity', () => {
    const err = new Error('boom') as Error & { digest?: string };
    err.digest = 'abc';
    render(<ServerIncidentReporter error={err} path="/500" />);

    expect(createIncident).toHaveBeenCalledOnce();
    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({ error: err, path: '/500', severity: 'error' })
    );
  });

  it('calls notifyTeam with the returned payload', () => {
    render(
      <ServerIncidentReporter error={new Error('test')} path="/test" />
    );

    expect(notifyTeam).toHaveBeenCalledOnce();
    expect(notifyTeam).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'incident_created' })
    );
  });

  it('does not throw when helpers throw internally', () => {
    vi.mocked(createIncident).mockImplementation(() => {
      throw new Error('internal failure');
    });

    expect(() =>
      render(<ServerIncidentReporter error={new Error('crash')} path="/crash" />)
    ).not.toThrow();
  });

  it('renders nothing visible (effect-only island)', () => {
    const { container } = render(
      <ServerIncidentReporter error={new Error('invisible')} path="/test" />
    );
    expect(container.textContent).toBe('');
  });
});
