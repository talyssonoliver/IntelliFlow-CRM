import { describe, expect, it } from 'vitest';
import { evaluateBounce } from '../evaluate-bounce';

const rules = (hardBounceAction: 'SUPPRESS' | 'NONE', softBounceThreshold: number) => ({
  hardBounceAction,
  softBounceThreshold,
});

describe('evaluateBounce', () => {
  it('suppresses a hard bounce when the rule says SUPPRESS', () => {
    expect(evaluateBounce('HARD', rules('SUPPRESS', 3), 0)).toEqual({
      suppress: true,
      reason: 'HARD_BOUNCE',
    });
  });

  it('does not suppress a hard bounce when the rule says NONE', () => {
    expect(evaluateBounce('HARD', rules('NONE', 3), 0)).toEqual({ suppress: false, reason: null });
  });

  it('does not suppress below the soft threshold (count includes the current DSN)', () => {
    expect(evaluateBounce('SOFT', rules('SUPPRESS', 3), 2)).toEqual({
      suppress: false,
      reason: null,
    });
  });

  it('suppresses on the soft bounce that reaches the threshold', () => {
    expect(evaluateBounce('SOFT', rules('SUPPRESS', 3), 3)).toEqual({
      suppress: true,
      reason: 'SOFT_BOUNCE_LIMIT',
    });
  });

  it('suppresses on the first soft bounce when the threshold is 1', () => {
    expect(evaluateBounce('SOFT', rules('NONE', 1), 1).suppress).toBe(true);
  });

  it('needs ten soft bounces when the threshold is 10', () => {
    expect(evaluateBounce('SOFT', rules('SUPPRESS', 10), 9).suppress).toBe(false);
    expect(evaluateBounce('SOFT', rules('SUPPRESS', 10), 10).suppress).toBe(true);
    expect(evaluateBounce('SOFT', rules('SUPPRESS', 10), 11).suppress).toBe(true);
  });

  it('never suppresses a delayed notice', () => {
    expect(evaluateBounce('DELAYED', rules('SUPPRESS', 1), 99)).toEqual({
      suppress: false,
      reason: null,
    });
  });
});
