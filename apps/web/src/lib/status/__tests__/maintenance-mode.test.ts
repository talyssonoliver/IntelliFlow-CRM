import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  isMaintenanceModeActive,
  readMaintenanceWindow,
} from '../maintenance-mode';

describe('readMaintenanceWindow', () => {
  it('returns inactive when MAINTENANCE_MODE is unset', () => {
    expect(readMaintenanceWindow({})).toEqual({ active: false });
  });

  it('returns inactive for "false" value', () => {
    expect(readMaintenanceWindow({ MAINTENANCE_MODE: 'false' })).toEqual({ active: false });
  });

  it('returns inactive for empty string', () => {
    expect(readMaintenanceWindow({ MAINTENANCE_MODE: '' })).toEqual({ active: false });
  });

  it('returns inactive for arbitrary non-"true" value', () => {
    expect(readMaintenanceWindow({ MAINTENANCE_MODE: 'yes' })).toEqual({ active: false });
  });

  it('returns active for "true" (case-insensitive with whitespace)', () => {
    const window = readMaintenanceWindow({ MAINTENANCE_MODE: '  TRUE ' });
    expect(window.active).toBe(true);
    if (window.active) {
      expect(window.message).toBe(DEFAULT_MAINTENANCE_MESSAGE);
      expect(window.affectedServices).toEqual([]);
      expect(window.etaIso).toBeNull();
      expect(typeof window.startedAtIso).toBe('string');
    }
  });

  it('parses valid ISO ETA verbatim', () => {
    const eta = '2026-08-18T04:00:00.000Z';
    const window = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_ETA: eta,
    });
    if (window.active) {
      expect(window.etaIso).toBe(eta);
    } else {
      throw new Error('window should be active');
    }
  });

  it('returns etaIso null for malformed ETA', () => {
    const window = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_ETA: 'not-a-date',
    });
    if (window.active) {
      expect(window.etaIso).toBeNull();
    } else {
      throw new Error('window should be active');
    }
  });

  it('splits affected services on commas and trims', () => {
    const window = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_AFFECTED_SERVICES: 'api, worker ,db',
    });
    if (window.active) {
      expect(window.affectedServices).toEqual(['api', 'worker', 'db']);
    } else {
      throw new Error('window should be active');
    }
  });

  it('returns empty services when unset', () => {
    const window = readMaintenanceWindow({ MAINTENANCE_MODE: 'true' });
    if (window.active) {
      expect(window.affectedServices).toEqual([]);
    } else {
      throw new Error('window should be active');
    }
  });

  it('uses custom message when provided', () => {
    const window = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_MESSAGE: 'Upgrading database engines.',
    });
    if (window.active) {
      expect(window.message).toBe('Upgrading database engines.');
    } else {
      throw new Error('window should be active');
    }
  });

  it('uses startedAt from env when valid', () => {
    const started = '2026-08-18T03:30:00.000Z';
    const window = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_STARTED_AT: started,
    });
    if (window.active) {
      expect(window.startedAtIso).toBe(started);
    } else {
      throw new Error('window should be active');
    }
  });
});

describe('isMaintenanceModeActive', () => {
  it('returns true when MAINTENANCE_MODE is "true"', () => {
    expect(isMaintenanceModeActive({ MAINTENANCE_MODE: 'true' })).toBe(true);
  });

  it('returns false when MAINTENANCE_MODE is missing', () => {
    expect(isMaintenanceModeActive({})).toBe(false);
  });
});
