// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceWindow } from '../maintenance-mode';
import {
  buildMaintenanceStatusPayload,
  publishStatusUpdate,
} from '../status-updater';

const FIXED_TS = '2026-04-13T12:00:00.000Z';

const activeWindow: MaintenanceWindow = {
  active: true,
  etaIso: '2026-08-18T04:00:00.000Z',
  message: 'Upgrading database engines.',
  affectedServices: ['api', 'worker'],
};

const inactiveWindow: MaintenanceWindow = { active: false };

describe('buildMaintenanceStatusPayload', () => {
  it('returns stable payload with supplied timestamp for active window', () => {
    const payload = buildMaintenanceStatusPayload({
      maintenanceWindow: activeWindow,
      timestamp: FIXED_TS,
    });

    expect(payload).toEqual({
      event: 'status_update',
      mode: 'maintenance',
      active: true,
      etaIso: '2026-08-18T04:00:00.000Z',
      message: 'Upgrading database engines.',
      affectedServices: ['api', 'worker'],
      timestamp: FIXED_TS,
    });
  });

  it('returns inactive payload with neutral defaults when window is inactive', () => {
    const payload = buildMaintenanceStatusPayload({
      maintenanceWindow: inactiveWindow,
      timestamp: FIXED_TS,
    });

    expect(payload.active).toBe(false);
    expect(payload.etaIso).toBeNull();
    expect(payload.affectedServices).toEqual([]);
    expect(payload.event).toBe('status_update');
    expect(payload.mode).toBe('maintenance');
  });

  it('fills timestamp when omitted', () => {
    const payload = buildMaintenanceStatusPayload({ maintenanceWindow: activeWindow });
    expect(typeof payload.timestamp).toBe('string');
    expect(payload.timestamp.length).toBeGreaterThan(0);
  });
});

describe('publishStatusUpdate', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.dataLayer = undefined as unknown as Array<Record<string, unknown>>;
  });

  it('pushes onto window.dataLayer when available', () => {
    const dataLayer: Array<Record<string, unknown>> = [];
    window.dataLayer = dataLayer as typeof window.dataLayer;

    publishStatusUpdate({ maintenanceWindow: activeWindow, timestamp: FIXED_TS });

    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0]).toMatchObject({
      event: 'status_update',
      mode: 'maintenance',
      active: true,
    });
  });

  it('does not push when dataLayer is not an array', () => {
    window.dataLayer = undefined as unknown as Array<Record<string, unknown>>;
    expect(() =>
      publishStatusUpdate({ maintenanceWindow: activeWindow, timestamp: FIXED_TS })
    ).not.toThrow();
  });

  it('dispatches intelliflow:status-update on window', () => {
    const listener = vi.fn();
    window.addEventListener('intelliflow:status-update', listener);

    publishStatusUpdate({ maintenanceWindow: activeWindow, timestamp: FIXED_TS });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({
      event: 'status_update',
      mode: 'maintenance',
    });
    window.removeEventListener('intelliflow:status-update', listener);
  });

  it('returns the payload even when window is undefined (SSR safety)', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulate SSR
    delete globalThis.window;
    try {
      const payload = publishStatusUpdate({
        maintenanceWindow: activeWindow,
        timestamp: FIXED_TS,
      });
      expect(payload.timestamp).toBe(FIXED_TS);
      expect(payload.event).toBe('status_update');
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
