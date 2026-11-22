import { describe, it, expect } from 'vitest';
import { leadScoreDisplay, leadScoreFlag } from '../score-display';

describe('leadScoreFlag (register #49 bands)', () => {
  it.each([
    [0.3, 'low-confidence'],
    [0.59, 'low-confidence'],
    [0.6, 'few-signals'],
    [0.84, 'few-signals'],
    [0.85, 'none'],
    [0.97, 'none'],
  ])('confidence %s is %s', (confidence, flag) => {
    expect(leadScoreFlag('NEEDS_REVIEW', confidence)).toBe(flag);
  });

  it('a stored confidence decides, whatever the status says', () => {
    expect(leadScoreFlag('SCORED', 0.4)).toBe('low-confidence');
    expect(leadScoreFlag('SCORED', 0.9)).toBe('none');
  });

  it('NEEDS_REVIEW with no known confidence is the quiet band, never red', () => {
    expect(leadScoreFlag('NEEDS_REVIEW', null)).toBe('few-signals');
    expect(leadScoreFlag('NEEDS_REVIEW', undefined)).toBe('few-signals');
    expect(leadScoreFlag('NEEDS_REVIEW', Number.NaN)).toBe('few-signals');
  });

  it('a SCORED lead with no known confidence has no flag', () => {
    expect(leadScoreFlag('SCORED', null)).toBe('none');
  });
});

describe('leadScoreDisplay flag', () => {
  it('carries the flag and keeps needsReview for the 0.85 gate', () => {
    expect(leadScoreDisplay(40, 'NEEDS_REVIEW', 0.7)).toEqual({
      kind: 'score',
      score: 40,
      needsReview: true,
      flag: 'few-signals',
    });
  });

  it('NEEDS_REVIEW at exactly 0.85 keeps needsReview (the gate) but shows no flag', () => {
    expect(leadScoreDisplay(40, 'NEEDS_REVIEW', 0.85)).toMatchObject({
      needsReview: true,
      flag: 'none',
    });
  });

  it('not-scored leads have no flag', () => {
    expect(leadScoreDisplay(0, 'NONE', 0.2).kind).toBe('not-scored');
  });
});
