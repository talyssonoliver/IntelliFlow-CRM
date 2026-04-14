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
    const w = readMaintenanceWindow({ MAINTENANCE_MODE: '  TRUE ' });
    expect(w.active).toBe(true);
    if (w.active) {
      expect(w.message).toBe(DEFAULT_MAINTENANCE_MESSAGE);
      expect(w.affectedServices).toEqual([]);
      expect(w.etaIso).toBeNull();
    }
  });

  it('parses valid ISO ETA verbatim', () => {
    const eta = '2026-08-18T04:00:00.000Z';
    const w = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_ETA: eta,
    });
    if (w.active) {
      expect(w.etaIso).toBe(eta);
    } else {
      throw new Error('window should be active');
    }
  });

  it('returns etaIso null for malformed ETA', () => {
    const w = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_ETA: 'not-a-date',
    });
    if (w.active) {
      expect(w.etaIso).toBeNull();
    } else {
      throw new Error('window should be active');
    }
  });

  it('splits affected services on commas and trims', () => {
    const w = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_AFFECTED_SERVICES: 'api, worker ,db',
    });
    if (w.active) {
      expect(w.affectedServices).toEqual(['api', 'worker', 'db']);
    } else {
      throw new Error('window should be active');
    }
  });

  it('returns empty services when unset', () => {
    const w = readMaintenanceWindow({ MAINTENANCE_MODE: 'true' });
    if (w.active) {
      expect(w.affectedServices).toEqual([]);
    } else {
      throw new Error('window should be active');
    }
  });

  it('uses custom message when provided', () => {
    const w = readMaintenanceWindow({
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_MESSAGE: 'Upgrading database engines.',
    });
    if (w.active) {
      expect(w.message).toBe('Upgrading database engines.');
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
