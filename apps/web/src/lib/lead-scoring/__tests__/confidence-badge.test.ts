/**
 * Unit tests for the confidence-badge threshold mapping.
 *
 * These are the boundary assertions that `tests/e2e/ai-features/ai-scoring.spec.ts`
 * currently makes through a real browser ("boundary value at exactly 80 (HIGH)",
 * "exactly 60 (MEDIUM)", "79 (MEDIUM)"). Threshold logic is pure and belongs at
 * the BOTTOM of the pyramid — fast, deterministic, no DOM — so the E2E layer can
 * shed those cases and keep only a genuine render smoke.
 */
import { describe, it, expect } from 'vitest';
import { getConfidenceBadge } from '../confidence-badge';

describe('getConfidenceBadge — threshold boundaries', () => {
  it('>= 80 is High Confidence (inclusive boundary)', () => {
    expect(getConfidenceBadge(80).label).toBe('High Confidence');
    expect(getConfidenceBadge(100).label).toBe('High Confidence');
    expect(getConfidenceBadge(81).label).toBe('High Confidence');
  });

  it('60–79 is Medium Confidence (both boundaries)', () => {
    expect(getConfidenceBadge(79).label).toBe('Medium Confidence');
    expect(getConfidenceBadge(60).label).toBe('Medium Confidence');
    expect(getConfidenceBadge(70).label).toBe('Medium Confidence');
  });

  it('< 60 is Low Confidence by default (including zero)', () => {
    expect(getConfidenceBadge(59).label).toBe('Low Confidence');
    expect(getConfidenceBadge(1).label).toBe('Low Confidence');
    expect(getConfidenceBadge(0).label).toBe('Low Confidence');
  });

  it('carries a non-empty className for every non-hidden tier', () => {
    for (const s of [0, 59, 60, 79, 80, 100]) {
      expect(getConfidenceBadge(s).className.length).toBeGreaterThan(0);
    }
  });
});

describe('getConfidenceBadge — hideWhenZero (preview page behaviour)', () => {
  it('hides the badge for a zero/negative (unscored) action', () => {
    expect(getConfidenceBadge(0, { hideWhenZero: true })).toEqual({ label: '', className: '' });
    expect(getConfidenceBadge(-5, { hideWhenZero: true })).toEqual({ label: '', className: '' });
  });

  it('still labels a positive sub-60 score as Low', () => {
    expect(getConfidenceBadge(1, { hideWhenZero: true }).label).toBe('Low Confidence');
    expect(getConfidenceBadge(59, { hideWhenZero: true }).label).toBe('Low Confidence');
  });

  it('does not change the High/Medium tiers', () => {
    expect(getConfidenceBadge(80, { hideWhenZero: true }).label).toBe('High Confidence');
    expect(getConfidenceBadge(60, { hideWhenZero: true }).label).toBe('Medium Confidence');
  });
});
