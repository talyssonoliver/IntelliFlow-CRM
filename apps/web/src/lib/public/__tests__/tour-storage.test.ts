import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTourSeenAt,
  markTourSeen,
  clearTourSeen,
  tourSeenKey,
} from '../tour-storage';

describe('tour-storage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== 'undefined') window.localStorage.clear();
    vi.useRealTimers();
  });

  it('derives key as intelliflow.public.tour.{tourId}.seen', () => {
    expect(tourSeenKey('features-v1')).toBe(
      'intelliflow.public.tour.features-v1.seen'
    );
  });

  describe('SSR guard', () => {
    it('getTourSeenAt returns null when localStorage throws', () => {
      const orig = window.localStorage.getItem;
      window.localStorage.getItem = () => {
        throw new Error('blocked');
      };
      expect(getTourSeenAt('x')).toBeNull();
      window.localStorage.getItem = orig;
    });

    it('markTourSeen swallows setItem failures', () => {
      const origSet = window.localStorage.setItem;
      const origGet = window.localStorage.getItem;
      window.localStorage.getItem = () => null;
      window.localStorage.setItem = () => {
        throw new Error('quota');
      };
      expect(() => markTourSeen('x')).not.toThrow();
      window.localStorage.setItem = origSet;
      window.localStorage.getItem = origGet;
    });

    it('clearTourSeen swallows errors', () => {
      const orig = window.localStorage.removeItem;
      window.localStorage.removeItem = () => {
        throw new Error('blocked');
      };
      expect(() => clearTourSeen('x')).not.toThrow();
      window.localStorage.removeItem = orig;
    });
  });

  describe('round-trip', () => {
    it('getTourSeenAt returns null before markTourSeen', () => {
      expect(getTourSeenAt('features-v1')).toBeNull();
    });

    it('markTourSeen writes ISO timestamp readable by getTourSeenAt', () => {
      markTourSeen('features-v1');
      const stamp = getTourSeenAt('features-v1');
      expect(stamp).not.toBeNull();
      expect(() => new Date(stamp as string).toISOString()).not.toThrow();
    });

    it('markTourSeen is idempotent — first timestamp wins', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-24T10:00:00Z'));
      markTourSeen('features-v1');
      const first = getTourSeenAt('features-v1');
      vi.setSystemTime(new Date('2026-04-24T12:00:00Z'));
      markTourSeen('features-v1');
      const second = getTourSeenAt('features-v1');
      expect(second).toBe(first);
      vi.useRealTimers();
    });

    it('clearTourSeen removes the key', () => {
      markTourSeen('features-v1');
      expect(getTourSeenAt('features-v1')).not.toBeNull();
      clearTourSeen('features-v1');
      expect(getTourSeenAt('features-v1')).toBeNull();
    });

    it('different tour ids have independent storage', () => {
      markTourSeen('tour-a');
      expect(getTourSeenAt('tour-a')).not.toBeNull();
      expect(getTourSeenAt('tour-b')).toBeNull();
    });

    it('markTourSeen respects idempotency when stored value exists with getItem error', () => {
      // Force getItem to return truthy so markTourSeen early-returns.
      const orig = window.localStorage.getItem;
      window.localStorage.getItem = () => 'existing-stamp';
      const origSet = window.localStorage.setItem;
      const setSpy = vi.fn();
      window.localStorage.setItem = setSpy;
      markTourSeen('features-v1');
      expect(setSpy).not.toHaveBeenCalled();
      window.localStorage.getItem = orig;
      window.localStorage.setItem = origSet;
    });
  });
});
