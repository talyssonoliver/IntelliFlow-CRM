// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { notifyTeam } from '../error-notifier';
import type { IncidentPayload } from '../incident-creator';

const mockIncident: IncidentPayload = {
  event: 'incident_created',
  errorId: 'err-abc',
  digest: 'digest-123',
  message: 'test error',
  severity: 'error',
  path: '/dashboard',
  userAgent: 'TestAgent/1.0',
  timestamp: '2026-01-01T00:00:00Z',
};

describe('notifyTeam', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).__INTELLIFLOW_INCIDENT_WEBHOOK__;
  });

  it('returns a payload with event "team_notified" and channel "sre-oncall"', () => {
    const result = notifyTeam(mockIncident);
    expect(result.event).toBe('team_notified');
    expect(result.channel).toBe('sre-oncall');
    expect(result.incident).toBe(mockIncident);
    expect(result.timestamp).toBeTruthy();
  });

  it('dispatches intelliflow:team-notified custom event on window', () => {
    const handler = vi.fn();
    window.addEventListener('intelliflow:team-notified', handler);

    notifyTeam(mockIncident);
    expect(handler).toHaveBeenCalledOnce();

    window.removeEventListener('intelliflow:team-notified', handler);
  });

  it('calls fetch with keepalive: true when webhook URL is set', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    (window as Record<string, unknown>).__INTELLIFLOW_INCIDENT_WEBHOOK__ =
      'https://hooks.example.com/sre';

    notifyTeam(mockIncident);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.example.com/sre',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
      })
    );
  });

  it('does NOT call fetch when webhook URL is absent', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    notifyTeam(mockIncident);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows fetch rejections (no-op)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net'));
    (window as Record<string, unknown>).__INTELLIFLOW_INCIDENT_WEBHOOK__ =
      'https://hooks.example.com/sre';

    expect(() => notifyTeam(mockIncident)).not.toThrow();
    // Wait for the async catch to settle
    await new Promise((r) => setTimeout(r, 10));
  });

  it('does NOT throw when global.window is removed (SSR safety)', () => {
    const origWindow = globalThis.window;
    // @ts-expect-error — simulating SSR
    delete globalThis.window;
    try {
      expect(() => notifyTeam(mockIncident)).not.toThrow();
    } finally {
      globalThis.window = origWindow;
    }
  });
});
