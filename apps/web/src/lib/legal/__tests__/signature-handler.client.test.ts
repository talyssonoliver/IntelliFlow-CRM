// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DPA_SIGNATURE_KEY,
  hasSigned,
  recordDpaSignature,
  getStoredDpaSignature,
} from '../signature-handler.client';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('hasSigned', () => {
  it('returns false when localStorage is empty', () => {
    expect(hasSigned('v1.0')).toBe(false);
  });

  it('returns true after recordDpaSignature with matching version', () => {
    recordDpaSignature('v1.0', 'Jane Smith');
    expect(hasSigned('v1.0')).toBe(true);
  });

  it('returns false after recordDpaSignature with different version', () => {
    recordDpaSignature('v1.0', 'Jane Smith');
    expect(hasSigned('v2.0')).toBe(false);
  });

  it('returns false when localStorage contains invalid JSON', () => {
    localStorage.setItem(DPA_SIGNATURE_KEY, 'not-json');
    expect(hasSigned('v1.0')).toBe(false);
  });
});

describe('recordDpaSignature', () => {
  it('writes record with signatoryName, dpaVersion, and route "/dpa"', () => {
    recordDpaSignature('v1.0', 'Jane');
    const raw = localStorage.getItem(DPA_SIGNATURE_KEY);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw!);
    expect(record.signatoryName).toBe('Jane');
    expect(record.dpaVersion).toBe('v1.0');
    expect(record.route).toBe('/dpa');
    expect(typeof record.signedAt).toBe('string');
  });

  it('does not throw when localStorage.setItem throws (graceful degradation)', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    try {
      expect(() => recordDpaSignature('v1.0', 'Jane')).not.toThrow();
    } finally {
      setItemSpy.mockRestore();
    }
  });
});

describe('getStoredDpaSignature', () => {
  it('returns null when localStorage is empty', () => {
    expect(getStoredDpaSignature()).toBeNull();
  });

  it('returns null when localStorage value is not valid JSON', () => {
    localStorage.setItem(DPA_SIGNATURE_KEY, 'not-json');
    expect(getStoredDpaSignature()).toBeNull();
  });

  it('returns null when localStorage value is missing required fields', () => {
    localStorage.setItem(DPA_SIGNATURE_KEY, JSON.stringify({}));
    expect(getStoredDpaSignature()).toBeNull();
  });

  it('returns null when record has no signatoryName field', () => {
    localStorage.setItem(
      DPA_SIGNATURE_KEY,
      JSON.stringify({ dpaVersion: 'v1.0', signedAt: new Date().toISOString(), route: '/dpa' })
    );
    expect(getStoredDpaSignature()).toBeNull();
  });

  it('returns full record after recordDpaSignature', () => {
    recordDpaSignature('v1.0', 'Jane Smith');
    const record = getStoredDpaSignature();
    expect(record).not.toBeNull();
    expect(record!.signatoryName).toBe('Jane Smith');
    expect(record!.dpaVersion).toBe('v1.0');
    expect(record!.route).toBe('/dpa');
  });
});
