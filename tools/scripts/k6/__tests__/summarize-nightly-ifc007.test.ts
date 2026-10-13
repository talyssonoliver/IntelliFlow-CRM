/**
 * Issue #318 — real-numbers IFC-007 SLO summary, built from an actual k6
 * --summary-export JSON. Never fabricates: every field here is either read
 * straight from the k6 summary or explicitly `null` when the metric is
 * absent (e.g. a dry-run / malformed summary), rather than a guessed value.
 */
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildIfc007Slo, resolveWithinAllowedRoot } from '../summarize-nightly-ifc007.mjs';

describe('buildIfc007Slo', () => {
  it('extracts real p95/p99/error-rate/rps from a k6 summary-export shape', () => {
    const k6Summary = {
      metrics: {
        http_req_duration: { values: { 'p(95)': 42.1, 'p(99)': 88.7, avg: 20.3 } },
        errors: { values: { rate: 0.004 } },
        http_reqs: { values: { rate: 312.5 } },
        vus_max: { values: { value: 1000 } },
      },
    };

    const result = buildIfc007Slo(k6Summary, {
      runId: '123456',
      generatedAt: '2026-10-13T04:00:00.000Z',
    });

    expect(result.task).toBe('IFC-007');
    expect(result.runId).toBe('123456');
    expect(result.generatedAt).toBe('2026-10-13T04:00:00.000Z');
    expect(result.concurrentUsersTarget).toBe(1000);
    expect(result.measured).toEqual({
      maxVUs: 1000,
      p95LatencyMs: 42.1,
      p99LatencyMs: 88.7,
      errorRate: 0.004,
      requestsPerSecond: 312.5,
    });
  });

  it('derives the SLO verdicts from the measured numbers, not a hardcoded pass', () => {
    const passing = buildIfc007Slo({
      metrics: {
        http_req_duration: { values: { 'p(99)': 95 } },
        errors: { values: { rate: 0.005 } },
      },
    });
    expect(passing.slo).toEqual({ p99Under100ms: true, errorRateUnder1Pct: true });

    const failing = buildIfc007Slo({
      metrics: {
        http_req_duration: { values: { 'p(99)': 150 } },
        errors: { values: { rate: 0.02 } },
      },
    });
    expect(failing.slo).toEqual({ p99Under100ms: false, errorRateUnder1Pct: false });
  });

  it('is honest about missing metrics — null, never a guessed number', () => {
    const result = buildIfc007Slo({ metrics: {} });
    expect(result.measured).toEqual({
      maxVUs: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
      errorRate: null,
      requestsPerSecond: null,
    });
    expect(result.slo).toEqual({ p99Under100ms: null, errorRateUnder1Pct: null });
  });

  it('records which script produced the evidence (real run, not stub)', () => {
    const result = buildIfc007Slo({ metrics: {} });
    expect(result.source).toMatch(/load-test\.js/);
    expect(result.source).toMatch(/#318/);
  });
});

/**
 * jssecurity:S8707 — the k6-summary path is CLI-supplied (the nightly
 * workflow passes `artifacts/benchmarks/nightly-1000vu-${run_id}.json`), so
 * it must be confined to `artifacts/benchmarks` before it reaches
 * `readFileSync`/`writeFileSync`. Covers both the traversal rejection and
 * the normal path still resolving, so a revert of the guard shows up as a
 * failing test, not a silent pass.
 */
describe('resolveWithinAllowedRoot', () => {
  it('resolves a normal path under artifacts/benchmarks', () => {
    const resolved = resolveWithinAllowedRoot(
      'artifacts/benchmarks/nightly-1000vu-123.json',
      'input summary'
    );
    expect(resolved).toBe(resolve('artifacts/benchmarks/nightly-1000vu-123.json'));
  });

  it('resolves a nested path that still stays under artifacts/benchmarks', () => {
    const resolved = resolveWithinAllowedRoot(
      'artifacts/benchmarks/sub/dir/summary.json',
      'input summary'
    );
    expect(resolved).toBe(resolve('artifacts/benchmarks/sub/dir/summary.json'));
  });

  it('rejects a relative traversal out of artifacts/benchmarks', () => {
    expect(() =>
      resolveWithinAllowedRoot('artifacts/benchmarks/../../../etc/passwd', 'input summary')
    ).toThrow(/refusing input summary path outside artifacts\/benchmarks/);
  });

  it('rejects an absolute path outside artifacts/benchmarks', () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    expect(() => resolveWithinAllowedRoot(outside, 'input summary')).toThrow(
      /refusing input summary path outside artifacts\/benchmarks/
    );
  });

  it('rejects a sibling directory that merely shares the allowed-root prefix', () => {
    // A naive `startsWith('artifacts/benchmarks')` string check would let
    // this through; `path.relative` must not.
    expect(() =>
      resolveWithinAllowedRoot('artifacts/benchmarks-evil/payload.json', 'output')
    ).toThrow(/refusing output path outside artifacts\/benchmarks/);
  });
});
