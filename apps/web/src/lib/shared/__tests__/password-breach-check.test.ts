import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkPasswordBreach,
  createDebouncedBreachCheck,
  formatBreachCount,
} from '../password-breach-check';

describe('password-breach-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkPasswordBreach', () => {
    it('returns not breached for empty password', async () => {
      const result = await checkPasswordBreach('');
      expect(result.breached).toBe(false);
    });

    it('returns not breached for short password', async () => {
      const result = await checkPasswordBreach('abc');
      expect(result.breached).toBe(false);
    });

    it('returns breached when suffix found in API response', async () => {
      // Hash of "password" SHA-1 starts with 5BAA6
      // Mock the fetch to return a matching suffix
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            '003D68EB55068C33ACE09247EE4C639306B:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nZZZZZ:0'
          ),
      });
      globalThis.fetch = mockFetch;

      // "password" SHA-1 = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
      const result = await checkPasswordBreach('password');
      expect(result.breached).toBe(true);
      expect(result.count).toBe(9545824);
    });

    it('returns not breached when suffix not found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('AAAAA:1\r\nBBBBB:2\r\nCCCCC:3'),
      });
      globalThis.fetch = mockFetch;

      const result = await checkPasswordBreach('my-very-unique-password-12345');
      expect(result.breached).toBe(false);
    });

    it('handles API error gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      globalThis.fetch = mockFetch;

      const result = await checkPasswordBreach('testpassword');
      expect(result.breached).toBe(false);
      expect(result.error).toContain('503');
    });

    it('handles network error gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
      globalThis.fetch = mockFetch;

      const result = await checkPasswordBreach('testpassword');
      expect(result.breached).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('sends correct prefix to API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('AAAAA:0'),
      });
      globalThis.fetch = mockFetch;

      await checkPasswordBreach('testpassword');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Add-Padding': 'true' }),
        })
      );
    });

    it('handles non-Error thrown values', async () => {
      const mockFetch = vi.fn().mockRejectedValue('string error');
      globalThis.fetch = mockFetch;

      const result = await checkPasswordBreach('testpassword');
      expect(result.breached).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('createDebouncedBreachCheck', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns a function', () => {
      const fn = createDebouncedBreachCheck();
      expect(typeof fn).toBe('function');
    });

    it('debounces calls with default 500ms delay', () => {
      const fn = createDebouncedBreachCheck();
      const cb = vi.fn();
      fn('test', cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it('accepts custom delay', () => {
      const fn = createDebouncedBreachCheck(1000);
      const cb = vi.fn();
      fn('test', cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it('returns cancel function', () => {
      const fn = createDebouncedBreachCheck();
      const cancel = fn('test', vi.fn());
      expect(typeof cancel).toBe('function');
      cancel();
    });
  });

  describe('formatBreachCount', () => {
    it('formats millions', () => {
      expect(formatBreachCount(1500000)).toBe('1.5M');
    });

    it('formats thousands', () => {
      expect(formatBreachCount(1500)).toBe('1.5K');
    });

    it('formats small numbers', () => {
      expect(formatBreachCount(42)).toBe('42');
    });

    it('formats exactly 1M', () => {
      expect(formatBreachCount(1000000)).toBe('1.0M');
    });

    it('formats exactly 1K', () => {
      expect(formatBreachCount(1000)).toBe('1.0K');
    });

    it('formats zero', () => {
      expect(formatBreachCount(0)).toBe('0');
    });
  });
});
