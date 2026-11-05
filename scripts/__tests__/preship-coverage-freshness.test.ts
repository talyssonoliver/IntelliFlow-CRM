import { describe, expect, it } from 'vitest';
import { lcovIsCurrent } from '../lib/preship-coverage-freshness.mjs';

describe('lcovIsCurrent', () => {
  it('is false with no file, whatever the step did', () => {
    expect(lcovIsCurrent({ exists: false, verdict: 'PASS', cachedPass: true })).toBe(false);
  });

  it.each(['PASS', 'CACHED_PASS'])('trusts the file after %s', (verdict) => {
    expect(lcovIsCurrent({ exists: true, verdict, cachedPass: false })).toBe(true);
  });

  it('does not trust an old file when the coverage step was skipped', () => {
    expect(lcovIsCurrent({ exists: true, verdict: 'SKIPPED_PRECONDITION', cachedPass: true })).toBe(
      false
    );
  });

  it('does not trust the file after the step failed', () => {
    expect(lcovIsCurrent({ exists: true, verdict: 'FAIL', cachedPass: true })).toBe(false);
  });

  it.each([null, 'SKIPPED_NOT_SELECTED'])(
    'with the step at %s, trusts only a pass for this commit',
    (verdict) => {
      expect(lcovIsCurrent({ exists: true, verdict, cachedPass: true })).toBe(true);
      expect(lcovIsCurrent({ exists: true, verdict, cachedPass: false })).toBe(false);
    }
  );
});
