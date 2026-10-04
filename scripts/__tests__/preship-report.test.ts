import { describe, it, expect } from 'vitest';

import {
  displayVerdict,
  stepLine,
  summarize,
  summaryText,
  mergeOnlyState,
  persistedState,
  advisoryNote,
  finalLine,
} from '../lib/preship-report.mjs';

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

describe('--only merge', () => {
  const ids = ['a', 'b', 'c'];
  const prev = {
    git_head: 'h',
    steps: [
      { id: 'a', verdict: 'PASS', duration_ms: 10 },
      { id: 'b', verdict: 'PASS', duration_ms: 20 },
      { id: 'c', verdict: 'FAIL', required: true, duration_ms: 30 },
    ],
  };
  const next = {
    git_head: 'h',
    only: ['c'],
    steps: [
      { id: 'a', verdict: 'SKIPPED_NOT_SELECTED', duration_ms: 0 },
      { id: 'b', verdict: 'SKIPPED_NOT_SELECTED', duration_ms: 0 },
      { id: 'c', verdict: 'PASS', duration_ms: 99 },
    ],
  };

  it('keeps other steps cached and replaces the selected one', () => {
    const m = mergeOnlyState(prev, next, ids, new Set(['c']));
    expect(m.steps.map((s: any) => [s.id, s.verdict])).toEqual([
      ['a', 'PASS'],
      ['b', 'PASS'],
      ['c', 'PASS'],
    ]);
    expect(m.only).toEqual(['c']);
  });

  it('ignores previous state from a different HEAD', () => {
    expect(mergeOnlyState({ ...prev, git_head: 'other' }, next, ids, new Set(['c']))).toBe(next);
  });

  it('returns the new state when there is no previous state', () => {
    expect(mergeOnlyState(null, next, ids, new Set(['c']))).toBe(next);
  });
});

describe('persisted state and printed lines', () => {
  const ids = ['a', 'b'];
  const prev = {
    git_head: 'h',
    verdict: 'PASS',
    steps: [
      { id: 'a', verdict: 'PASS', duration_ms: 1 },
      { id: 'b', verdict: 'PASS', duration_ms: 1 },
    ],
  };
  const ran = (verdict: string, required = true) => ({
    git_head: 'h',
    verdict: 'PASS',
    only: ['b'],
    steps: [{ id: 'b', verdict, required, duration_ms: 2 }],
  });

  it('a full run is written as is', () => {
    const state = { ...ran('PASS'), only: null };
    expect(persistedState(prev, state, null, ids, 0)).toBe(state);
  });

  it('an --only run with no previous state is written as is', () => {
    const state = ran('PASS');
    expect(persistedState(null, state, ['b'], ids, 0)).toBe(state);
  });

  it('an --only run keeps the cached steps and passes when nothing required failed', () => {
    const m = persistedState(prev, ran('PASS'), ['b'], ids, 0);
    expect(m.steps.map((s: { id: string }) => s.id)).toEqual(['a', 'b']);
    expect(m.verdict).toBe('PASS');
  });

  it('a required failure in the merged steps fails the verdict', () => {
    expect(persistedState(prev, ran('FAIL'), ['b'], ids, 0).verdict).toBe('FAIL');
  });

  it('an advisory failure does not fail it, but a missing required guard does', () => {
    expect(persistedState(prev, ran('FAIL', false), ['b'], ids, 0).verdict).toBe('PASS');
    expect(persistedState(prev, ran('PASS'), ['b'], ids, 1).verdict).toBe('FAIL');
  });

  it('only an advisory failure gets a note, naming its log', () => {
    const r = { id: 'audit', verdict: 'FAIL', required: false, log_path: 'x.log' };
    expect(advisoryNote(r)).toContain('does not block the gate. Log: x.log');
    expect(advisoryNote({ ...r, required: true })).toBe('');
    expect(advisoryNote({ ...r, verdict: 'PASS' })).toBe('');
  });

  it('the final line carries the verdict, duration and counts', () => {
    const line = finalLine('PASS', '3s', [{ id: 'a', verdict: 'PASS' }], ['a']);
    expect(line.startsWith('pre-ship: PASS in 3s (')).toBe(true);
    expect(line.endsWith(').\n')).toBe(true);
  });
});
