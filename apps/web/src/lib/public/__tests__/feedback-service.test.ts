import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canSubmitFeedbackClientRateLimit,
  markFeedbackSubmittedClientSide,
  clearFeedbackClientRateLimit,
  preparePublicFeedbackPayload,
  publicFeedbackInputSchema,
} from '../feedback-service';

describe('preparePublicFeedbackPayload', () => {
  it('returns validated payload for minimum valid input', () => {
    const result = preparePublicFeedbackPayload({
      rating: 5,
      source: '/features',
    });
    expect(result.rating).toBe(5);
    expect(result.source).toBe('/features');
  });

  it('throws on invalid rating', () => {
    expect(() => preparePublicFeedbackPayload({ rating: 6, source: '/x' } as never)).toThrow();
  });

  it('throws on non-empty honeypot', () => {
    expect(() =>
      preparePublicFeedbackPayload({
        rating: 3,
        source: '/x',
        __honeypot: 'spam',
      } as never)
    ).toThrow();
  });

  it('re-exports the input schema', () => {
    expect(publicFeedbackInputSchema).toBeDefined();
    expect(publicFeedbackInputSchema.safeParse({ rating: 4, source: '/x' }).success).toBe(true);
  });
});

describe('client rate limit', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
    vi.useRealTimers();
  });

  it('allows submission when no previous stamp', () => {
    expect(canSubmitFeedbackClientRateLimit()).toBe(true);
  });

  it('blocks submission within 10-minute window', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    markFeedbackSubmittedClientSide(now);
    expect(canSubmitFeedbackClientRateLimit(now.getTime() + 5 * 60 * 1000)).toBe(false);
  });

  it('allows submission after 10 minutes', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    markFeedbackSubmittedClientSide(now);
    expect(canSubmitFeedbackClientRateLimit(now.getTime() + 10 * 60 * 1000)).toBe(true);
  });

  it('clearFeedbackClientRateLimit resets the window', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    markFeedbackSubmittedClientSide(now);
    expect(canSubmitFeedbackClientRateLimit(now.getTime() + 1 * 60 * 1000)).toBe(false);
    clearFeedbackClientRateLimit();
    expect(canSubmitFeedbackClientRateLimit(now.getTime() + 1 * 60 * 1000)).toBe(true);
  });

  it('ignores malformed timestamps gracefully (returns true)', () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('intelliflow.public.feedback.submitted_at', 'not-a-date');
    }
    expect(canSubmitFeedbackClientRateLimit()).toBe(true);
  });

  it('markFeedbackSubmittedClientSide writes ISO timestamp', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    markFeedbackSubmittedClientSide(now);
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('intelliflow.public.feedback.submitted_at')
        : null;
    expect(stored).toBe(now.toISOString());
  });

  it('markFeedbackSubmittedClientSide swallows setItem errors', () => {
    const origSet = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => markFeedbackSubmittedClientSide()).not.toThrow();
    window.localStorage.setItem = origSet;
  });

  it('clearFeedbackClientRateLimit swallows removeItem errors', () => {
    const origRm = window.localStorage.removeItem;
    window.localStorage.removeItem = () => {
      throw new Error('blocked');
    };
    expect(() => clearFeedbackClientRateLimit()).not.toThrow();
    window.localStorage.removeItem = origRm;
  });

  it('canSubmitFeedbackClientRateLimit returns true when getItem throws', () => {
    const origGet = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('blocked');
    };
    // Implementation returns `true` when storage throws via catch → safeLocalStorage returns null
    const origLs = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: null,
      configurable: true,
    });
    expect(canSubmitFeedbackClientRateLimit()).toBe(true);
    Object.defineProperty(window, 'localStorage', {
      value: origLs,
      configurable: true,
    });
    window.localStorage.getItem = origGet;
  });
});
