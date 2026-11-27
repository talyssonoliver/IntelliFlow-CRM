/**
 * Tests for scripts/lib/review-policy.mjs: Claude only when necessary, wait or defer otherwise,
 * never a silent pass. Every reviewer, the clock and the sleep are fakes; no model runs.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  claudeAllowed,
  deferredMessage,
  isCapped,
  makeReviewer,
  maxWaitMs,
  parseResetAt,
} from '../lib/review-policy.mjs';

const GOOD = JSON.stringify({ findings: [] });
const extract = (raw: string) => {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p.findings) ? p : null;
  } catch {
    return null;
  }
};
const log = { out: vi.fn(), err: vi.fn() };
const CAP = "You've hit your usage limit. Try again at 10:57 PM.";
const strong = { model: 'strong-m', effort: 'high' };

function setup(over: Record<string, unknown> = {}) {
  const runCodex = vi.fn((_p: string, _o: unknown) => ({
    raw: GOOD,
    status: 0,
    stderr: '',
    stdout: '',
  }));
  const runClaude = vi.fn((_p: string) => ({ text: GOOD, tokens: { total: 9 }, costUsd: 0.3 }));
  const sleep = vi.fn();
  const deps = {
    plan: { tier: 'light', risky: false, model: 'light-m', effort: 'medium', why: 'small' },
    codexUsable: true,
    claudeUsable: true,
    runCodex,
    runClaude,
    extract,
    log,
    sleep,
    now: () => new Date('2026-11-27T22:00:00'),
    models: { strong },
    env: {},
    ...over,
  };
  return { review: makeReviewer(deps as never), runCodex, runClaude, sleep };
}

describe('cap detection', () => {
  it('reads the usage cap messages', () => {
    expect(isCapped(CAP)).toBe(true);
    expect(isCapped('429 Too Many Requests')).toBe(true);
    expect(isCapped('syntax error near x')).toBe(false);
  });

  it('parses "try again at 10:57 PM" as the next such time', () => {
    const now = new Date('2026-11-27T22:00:00');
    const at = parseResetAt(CAP, now)!;
    expect(at.getHours()).toBe(22);
    expect(at.getMinutes()).toBe(57);
    expect(at.getDate()).toBe(27);
    const next = parseResetAt('try again at 9:15 AM', now)!;
    expect(next.getDate()).toBe(28);
  });

  it('parses a relative reset and returns null when none is stated', () => {
    const now = new Date('2026-11-27T22:00:00');
    expect(parseResetAt('Try again in 2 hours 5 minutes', now)!.getTime() - now.getTime()).toBe(
      125 * 60_000
    );
    expect(parseResetAt('Try again in 35 minutes', now)!.getTime() - now.getTime()).toBe(
      35 * 60_000
    );
    expect(parseResetAt('unknown error', now)).toBeNull();
  });
});

describe('who may review', () => {
  it('allows Claude for a risky diff only, or when an owner sets the override', () => {
    expect(claudeAllowed({ risky: true, env: {} })).toBe(true);
    expect(claudeAllowed({ risky: false, env: {} })).toBe(false);
    expect(claudeAllowed({ risky: false, env: { CODEX_REVIEW_ALLOW_CLAUDE: '1' } })).toBe(true);
  });

  it('reads the wait limit from the env, 20 minutes by default', () => {
    expect(maxWaitMs({})).toBe(20 * 60_000);
    expect(maxWaitMs({ CODEX_REVIEW_MAX_WAIT_MIN: '0' })).toBe(0);
    expect(maxWaitMs({ CODEX_REVIEW_MAX_WAIT_MIN: 'x' })).toBe(20 * 60_000);
  });
});

describe('makeReviewer', () => {
  it('reviews with Codex on the tier model and never touches Claude when Codex works', () => {
    const { review, runCodex, runClaude } = setup();
    const r = review('P');
    expect(r).toMatchObject({ reviewer: 'codex', model: 'light-m', effort: 'medium' });
    expect(runCodex).toHaveBeenCalledWith('P', { model: 'light-m', effort: 'medium' });
    expect(runClaude).not.toHaveBeenCalled();
  });

  it('escalates once to the strong Codex when a light model fails without a cap', () => {
    const runCodex = vi
      .fn()
      .mockReturnValueOnce({ raw: 'unknown model', status: 1, stderr: 'unknown model', stdout: '' })
      .mockReturnValueOnce({ raw: GOOD, status: 0, stderr: '', stdout: '' });
    const { review, runClaude } = setup({ runCodex });
    const r = review('P');
    expect(r).toMatchObject({ reviewer: 'codex', model: 'strong-m' });
    expect(runCodex).toHaveBeenCalledTimes(2);
    expect(runClaude).not.toHaveBeenCalled();
  });

  it('does not escalate a strong tier failure to another strong run', () => {
    const runCodex = vi.fn(() => ({ raw: 'boom', status: 1, stderr: 'boom', stdout: '' }));
    const { review } = setup({
      runCodex,
      plan: { tier: 'strong', risky: false, model: 'strong-m', effort: 'high', why: 'x' },
    });
    review('P');
    expect(runCodex).toHaveBeenCalledTimes(1);
  });

  it('DEFERS a non-risky diff when Codex is capped: no Claude, no pass', () => {
    const runCodex = vi.fn(() => ({ raw: CAP, status: 1, stderr: CAP, stdout: '' }));
    const { review, runClaude, sleep } = setup({
      runCodex,
      env: { CODEX_REVIEW_MAX_WAIT_MIN: '0' },
    });
    const r = review('P');
    expect(r.parsed).toBeNull();
    expect(r.deferred).toMatchObject({ reason: 'usage cap' });
    expect(runClaude).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('uses Claude (lean) for a RISKY diff when Codex is capped', () => {
    const runCodex = vi.fn(() => ({ raw: CAP, status: 1, stderr: CAP, stdout: '' }));
    const { review, runClaude } = setup({
      runCodex,
      plan: { tier: 'strong', risky: true, model: 'strong-m', effort: 'high', why: 'auth' },
      env: { CODEX_REVIEW_MAX_WAIT_MIN: '0' },
    });
    const r = review('P');
    expect(r).toMatchObject({ reviewer: 'claude', costUsd: 0.3, tokens: { total: 9 } });
    expect(runClaude).toHaveBeenCalledTimes(1);
  });

  it('defers a risky diff when Codex is down and Claude is missing or gives nothing', () => {
    const down = {
      codexUsable: false,
      plan: { tier: 'strong', risky: true, model: 'm', effort: 'high', why: 'x' },
    };
    expect(setup({ ...down, claudeUsable: false }).review('P').deferred).toBeTruthy();
    const empty = vi.fn(() => ({ text: 'no json' }));
    const r = setup({ ...down, runClaude: empty }).review('P');
    expect(r.parsed).toBeNull();
    expect(r.deferred?.reason).toMatch(/claude gave no parseable review/);
  });

  it('lets an owner override send a non-risky diff to Claude', () => {
    const { review, runClaude } = setup({
      codexUsable: false,
      env: { CODEX_REVIEW_ALLOW_CLAUDE: '1' },
    });
    expect(review('P').reviewer).toBe('claude');
    expect(runClaude).toHaveBeenCalled();
  });

  it('waits for a near reset and retries Codex once', () => {
    const runCodex = vi
      .fn()
      .mockReturnValueOnce({ raw: CAP, status: 1, stderr: CAP, stdout: '' })
      .mockReturnValueOnce({ raw: GOOD, status: 0, stderr: '', stdout: '' });
    const { review, sleep, runClaude } = setup({
      runCodex,
      plan: { tier: 'strong', risky: false, model: 'strong-m', effort: 'high', why: 'x' },
      env: { CODEX_REVIEW_MAX_WAIT_MIN: '90' },
    });
    const r = review('P');
    expect(r.reviewer).toBe('codex');
    expect(sleep).toHaveBeenCalledTimes(1);
    // 22:00 -> 22:57 plus the 1-minute margin
    expect(sleep).toHaveBeenCalledWith(58 * 60_000);
    expect(runClaude).not.toHaveBeenCalled();
  });

  it('retries after the reset when it is inside the wait limit', () => {
    const runCodex = vi
      .fn()
      .mockReturnValueOnce({
        raw: 'Try again in 5 minutes',
        status: 1,
        stderr: 'usage limit. Try again in 5 minutes',
        stdout: '',
      })
      .mockReturnValueOnce({ raw: GOOD, status: 0, stderr: '', stdout: '' });
    const { review, sleep } = setup({
      runCodex,
      plan: { tier: 'strong', risky: false, model: 'strong-m', effort: 'high', why: 'x' },
    });
    expect(review('P').reviewer).toBe('codex');
    expect(sleep).toHaveBeenCalledWith(6 * 60_000);
  });

  it('does not wait for a reset beyond the limit, and waits only once per run', () => {
    const runCodex = vi.fn(() => ({ raw: CAP, status: 1, stderr: CAP, stdout: '' }));
    const { review, sleep } = setup({
      runCodex,
      plan: { tier: 'strong', risky: false, model: 'm', effort: 'high', why: 'x' },
    });
    // 22:00 -> 22:57 is 57 minutes, over the 20-minute default: defer, no sleep.
    expect(review('P').deferred).toBeTruthy();
    expect(sleep).not.toHaveBeenCalled();
    // a second chunk does not call Codex again once it is known to be down
    review('P2');
    expect(runCodex).toHaveBeenCalledTimes(1);
  });

  it('treats an unavailable Codex as down from the start', () => {
    const { review, runCodex } = setup({ codexUsable: false });
    const r = review('P');
    expect(r.deferred?.reason).toMatch(/not installed or not logged in/);
    expect(runCodex).not.toHaveBeenCalled();
  });
});

describe('deferredMessage', () => {
  it('says the diff was not reviewed, that it is not a pass, and when to retry', () => {
    const m = deferredMessage({
      reason: 'usage cap',
      resetAt: new Date('2026-11-27T22:57:00Z'),
      risky: false,
      claudeUsable: true,
    });
    expect(m).toMatch(/^REVIEW_DEFERRED: codex unavailable/);
    expect(m).toMatch(/NOT reviewed/);
    expect(m).toMatch(/not a pass/);
    expect(m).toMatch(/2026-11-27T22:57/);
    expect(m).toMatch(/not risky, so Claude is not used/);
  });

  it('names the Claude outcome for a risky diff', () => {
    expect(
      deferredMessage({ reason: 'x', resetAt: null, risky: true, claudeUsable: false })
    ).toMatch(/risky, but the Claude CLI is not available/);
    expect(
      deferredMessage({ reason: 'x', resetAt: null, risky: true, claudeUsable: true })
    ).toMatch(/Claude fallback was tried/);
  });
});
