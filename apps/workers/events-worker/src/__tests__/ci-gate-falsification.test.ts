import { describe, it, expect } from 'vitest';

// Deliberately failing: proves the affected-only Merge Coverage Gate turns red
// when a test that ran fails. Removed in the next commit.
describe('ci gate falsification', () => {
  it('fails on purpose', () => {
    expect(1 + 1).toBe(3);
  });
});
