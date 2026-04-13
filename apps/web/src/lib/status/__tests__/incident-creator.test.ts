// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildIncidentPayload, createIncident, type IncidentInput } from '../incident-creator';

describe('buildIncidentPayload', () => {
  const baseInput: IncidentInput = {
    error: new Error('test failure'),
    path: '/dashboard',
    userAgent: 'TestAgent/1.0',
    timestamp: '2026-04-12T00:00:00Z',
    errorId: 'err-123',
  };

  it('returns a payload with event "incident_created"', () => {
    const payload = buildIncidentPayload(baseInput);
    expect(payload.event).toBe('incident_created');
  });

  it('includes errorId, digest, message, severity, path, userAgent, timestamp', () => {
    const payload = buildIncidentPayload(baseInput);
    expect(payload.errorId).toBe('err-123');
    expect(payload.message).toBe('test failure');
    expect(payload.path).toBe('/dashboard');
    expect(payload.userAgent).toBe('TestAgent/1.0');
    expect(payload.timestamp).toBe('2026-04-12T00:00:00Z');
  });

  it('defaults severity to "error" when not provided', () => {
    const payload = buildIncidentPayload({ error: new Error('oops') });
    expect(payload.severity).toBe('error');
  });

  it('uses deterministic timestamp when supplied via input', () => {
    const payload = buildIncidentPayload({ ...baseInput, timestamp: '2025-01-01T00:00:00Z' });
    expect(payload.timestamp).toBe('2025-01-01T00:00:00Z');
  });

  it('generates a non-empty errorId when input omits it', () => {
    const payload = buildIncidentPayload({ error: new Error('oops') });
    expect(payload.errorId).toBeTruthy();
    expect(typeof payload.errorId).toBe('string');
  });

  it('includes digest from error object', () => {
    const err = new Error('digest test') as Error & { digest?: string };
    err.digest = 'abc-123';
    const payload = buildIncidentPayload({ error: err });
    expect(payload.digest).toBe('abc-123');
  });

  it('sets digest to null when error has no digest', () => {
    const payload = buildIncidentPayload({ error: new Error('no digest') });
    expect(payload.digest).toBeNull();
  });

  it('does NOT expose error.stack in the payload', () => {
    const payload = buildIncidentPayload(baseInput);
    expect(payload).not.toHaveProperty('stack');
    expect(JSON.stringify(payload)).not.toContain('at ');
  });

  it('truncates long error.message to cap leakage', () => {
    const long = 'x'.repeat(500);
    const payload = buildIncidentPayload({ error: new Error(long) });
    expect(payload.message.length).toBeLessThanOrEqual(301);
    expect(payload.message.endsWith('…')).toBe(true);
  });

  it('preserves short error.message unchanged', () => {
    const payload = buildIncidentPayload({ error: new Error('short msg') });
    expect(payload.message).toBe('short msg');
  });
});

describe('createIncident', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).dataLayer;
  });

  it('pushes payload to window.dataLayer when present', () => {
    createIncident({ error: new Error('test'), timestamp: '2026-01-01T00:00:00Z' });
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer![0]).toHaveProperty('event', 'incident_created');
  });

  it('dispatches intelliflow:incident-created custom event', () => {
    const handler = vi.fn();
    window.addEventListener('intelliflow:incident-created', handler);

    createIncident({ error: new Error('event test'), timestamp: '2026-01-01T00:00:00Z' });
    expect(handler).toHaveBeenCalledOnce();

    window.removeEventListener('intelliflow:incident-created', handler);
  });

  it('does NOT throw when window.dataLayer is undefined', () => {
    delete (window as Record<string, unknown>).dataLayer;
    expect(() => createIncident({ error: new Error('no datalayer') })).not.toThrow();
  });

  it('does NOT throw when global.window is removed (SSR safety)', () => {
    const origWindow = globalThis.window;
    // @ts-expect-error — simulating SSR
    delete globalThis.window;
    try {
      expect(() => createIncident({ error: new Error('ssr') })).not.toThrow();
    } finally {
      globalThis.window = origWindow;
    }
  });
});
