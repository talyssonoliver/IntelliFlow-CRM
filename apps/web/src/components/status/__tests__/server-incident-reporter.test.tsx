// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    render(<ServerIncidentReporter error={new Error('test')} path="/test" />);

    expect(notifyTeam).toHaveBeenCalledOnce();
    expect(notifyTeam).toHaveBeenCalledWith(expect.objectContaining({ event: 'incident_created' }));
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

  describe('StrictMode double-invocation', () => {
    beforeEach(() => {
      vi.mocked(createIncident).mockReset();
      vi.mocked(createIncident).mockReturnValue({
        event: 'incident_created',
        errorId: 'mock-id',
        digest: null,
        message: 'mock',
        severity: 'error',
        path: '/strict',
        userAgent: null,
        timestamp: '2026-01-01T00:00:00Z',
      });
      vi.mocked(notifyTeam).mockReset();
    });

    it('fires createIncident only once under StrictMode', () => {
      render(
        <StrictMode>
          <ServerIncidentReporter error={new Error('strict')} path="/strict" />
        </StrictMode>
      );
      expect(createIncident).toHaveBeenCalledTimes(1);
      expect(notifyTeam).toHaveBeenCalledTimes(1);
    });

    it('re-fires on reset-and-rethrow (new error identity)', async () => {
      const { rerender } = render(
        <ServerIncidentReporter error={new Error('first')} path="/boundary" />
      );
      expect(createIncident).toHaveBeenCalledTimes(1);

      rerender(<ServerIncidentReporter error={new Error('second')} path="/boundary" />);
      expect(createIncident).toHaveBeenCalledTimes(2);
    });

    it('does not re-fire when the same error identity rerenders', () => {
      const err = new Error('stable');
      const { rerender } = render(<ServerIncidentReporter error={err} path="/boundary" />);
      rerender(<ServerIncidentReporter error={err} path="/boundary" />);
      expect(createIncident).toHaveBeenCalledTimes(1);
    });

    it('re-fires for a DISTINCT error object with the same signature (PG-056: no over-suppression)', () => {
      // Two genuinely distinct Error instances with identical message/digest/path/severity.
      // Signature-based dedup would have suppressed the second; object-identity dedup reports both.
      const first = new Error('recurring') as Error & { digest?: string };
      first.digest = 'same-digest';
      const { rerender } = render(<ServerIncidentReporter error={first} path="/recurring" />);
      expect(createIncident).toHaveBeenCalledTimes(1);

      const second = new Error('recurring') as Error & { digest?: string };
      second.digest = 'same-digest';
      rerender(<ServerIncidentReporter error={second} path="/recurring" />);
      expect(createIncident).toHaveBeenCalledTimes(2);
    });
  });

  describe('dev-mode console visibility', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('logs to console.error when NODE_ENV !== production', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<ServerIncidentReporter error={new Error('dev')} path="/dev" />);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('does not log to console.error in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<ServerIncidentReporter error={new Error('prod')} path="/prod" />);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
