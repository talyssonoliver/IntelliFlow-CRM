import { describe, it, expect } from 'vitest';

import { displayVerdict, stepLine, summarize, summaryText } from '../lib/preship-report.mjs';

const fmt = (ms: number) => `${ms}ms`;

describe('printer truthfulness', () => {
  it('prints a non-required failure as a warning, never FAIL', () => {
    const r = { id: 'audit', verdict: 'FAIL', required: false, duration_ms: 5 };
    expect(displayVerdict(r)).toBe('WARN');
    const line = stepLine(r, {}, fmt);
    expect(line).toContain('WARN');
    expect(line).not.toContain('FAIL');
  });

  it('keeps FAIL for a required failure', () => {
    const r = { id: 'lint', verdict: 'FAIL', required: true, duration_ms: 5 };
    expect(stepLine(r, {}, fmt)).toContain('✗ FAIL');
  });

  it('labels a pass that needed a retry', () => {
    const r = { id: 'x', verdict: 'PASS', required: true, attempts: 2, duration_ms: 5 };
    expect(stepLine(r, {}, fmt)).toContain('PASS (after retry)');
  });

  it('summary agrees with per-step lines', () => {
    const results = [
      { id: 'a', verdict: 'PASS', required: true },
      { id: 'b', verdict: 'CACHED_PASS', required: true },
      { id: 'audit', verdict: 'FAIL', required: false },
      { id: 'docs-audit', verdict: 'FAIL', required: false },
    ];
    const c = summarize(results, ['a', 'b', 'audit', 'docs-audit']);
    expect(c).toEqual({ passed: 2, warned: 2, failed: 0, total: 4 });
    expect(summaryText(c)).toBe('2/4 steps passed, 2 advisory warnings');
  });
});
