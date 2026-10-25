/**
 * IFC-117: drift statistics and detection.
 *
 * Deterministic: a seeded mulberry32 generator (never Math.random) and a pinned clock.
 * Proves what the old detector could not: a pure shift is detected, the KS test uses the real
 * sample sizes and handles ties, the PSI null bias is corrected, the false-positive rate is
 * bounded, and a drift event is counted once per onset against a time-of-day-matched reference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriftDetector, defaultDriftConfig, type DriftResult } from '../drift-detector';
import {
  DRIFT_BANDS,
  excessPsi,
  fixedEdges,
  binCounts,
  isDetectedTick,
  ksTwoSample,
  severityFrom,
} from '../drift-stats';
import type { DriftTickResult } from '../otel-ai-types';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal(mean, sd) clipped to [0, 1], via Box-Muller on the seeded generator. */
function normals(rand: () => number, n: number, mean: number, sd: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    out.push(Math.min(1, Math.max(0, mean + sd * z)));
  }
  return out;
}

/** Spread `values` evenly through [start, end). */
function addSamples(
  d: DriftDetector,
  values: number[],
  start: number,
  end: number,
  metric = 'score_distribution',
  model = 'scoring-free'
): void {
  const step = (end - start) / values.length;
  values.forEach((value, i) =>
    d.recordSample({ value, timestamp: new Date(start + i * step), model, metric })
  );
}

/** Reference slices: the same 6h window on each of the previous `days` days. */
function addReference(
  d: DriftDetector,
  rand: () => number,
  perDay: number,
  mean: number,
  sd: number,
  days = 7,
  now = NOW
): void {
  for (let day = 1; day <= days; day++) {
    const end = now - day * 24 * HOUR;
    addSamples(d, normals(rand, perDay, mean, sd), end - 6 * HOUR, end);
  }
}

function addCurrent(
  d: DriftDetector,
  rand: () => number,
  n: number,
  mean: number,
  sd: number,
  now = NOW
): void {
  addSamples(d, normals(rand, n, mean, sd), now - 6 * HOUR + 1, now);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('drift-stats', () => {
  it('KS statistic equals a hand-computed value on a tiny sample', () => {
    // ECDFs of [1,2,3] and [2,3,4]: largest gap is 1/3 (at x=1 and at x=3).
    const { d } = ksTwoSample([1, 2, 3], [2, 3, 4]);
    expect(d).toBeCloseTo(1 / 3, 12);
  });

  it('KS handles ties by evaluating at distinct values only', () => {
    // Identical multisets with heavy ties must give D = 0, not an inflated step.
    const a = [0.7, 0.7, 0.7, 0.75, 0.75, 0.8];
    const b = [0.75, 0.7, 0.8, 0.7, 0.75, 0.7];
    expect(ksTwoSample(a, b).d).toBe(0);
  });

  it('KS uses the real sample sizes: the same shift is more significant at n=2000 than at n=20', () => {
    const rand = mulberry32(7);
    const small = ksTwoSample(normals(rand, 20, 0.4, 0.1), normals(rand, 20, 0.5, 0.1));
    const big = ksTwoSample(normals(rand, 2000, 0.4, 0.1), normals(rand, 2000, 0.5, 0.1));
    expect(big.pValue).toBeLessThan(small.pValue);
    expect(big.pValue).toBeLessThan(1e-6);
  });

  it('excess PSI is calibrated under the null at n=25 / m=50 (raw PSI is not)', () => {
    const rand = mulberry32(11);
    const edges = fixedEdges(0, 1, 10);
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const ref = binCounts(normals(rand, 50, 0.6, 0.15), edges);
      const cur = binCounts(normals(rand, 25, 0.6, 0.15), edges);
      sum += excessPsi(ref, cur);
    }
    expect(sum / 200).toBeLessThan(0.1);
  });

  it.each([
    // [pValue, excessPsi, d, expected]
    [0.001, 0.15, 0.05, true],
    [0.001, 0.05, 0.15, true],
    [0.001, 0.05, 0.05, false],
    [0.02, 0.5, 0.5, false],
  ])('gate p=%s psi=%s d=%s -> %s', (pValue, psi, d, expected) => {
    expect(isDetectedTick({ pValue, excessPsi: psi, d }, 0.01)).toBe(expected);
  });

  it.each([
    // PSI band edges
    [{ excessPsi: 0.1, d: 0 }, 'low'],
    [{ excessPsi: 0.2, d: 0 }, 'medium'],
    [{ excessPsi: 0.25, d: 0 }, 'high'],
    [{ excessPsi: 0.5, d: 0 }, 'critical'],
    [{ excessPsi: 0.0999, d: 0 }, 'none'],
    // D band edges
    [{ excessPsi: 0, d: 0.1 }, 'low'],
    [{ excessPsi: 0, d: 0.2 }, 'medium'],
    [{ excessPsi: 0, d: 0.3 }, 'high'],
    [{ excessPsi: 0, d: 0.5 }, 'critical'],
    [{ excessPsi: 0, d: 0.2999 }, 'medium'],
    // max of the two
    [{ excessPsi: 0.12, d: 0.31 }, 'high'],
  ] as const)('severity %o -> %s', (effects, expected) => {
    expect(severityFrom(effects)).toBe(expected);
  });

  it('exposes the bands as one exported config', () => {
    expect(DRIFT_BANDS.psi).toEqual({ low: 0.1, medium: 0.2, high: 0.25, critical: 0.5 });
    expect(DRIFT_BANDS.ks).toEqual({ low: 0.1, medium: 0.2, high: 0.3, critical: 0.5 });
  });
});

describe('DriftDetector — detection', () => {
  it('detects a pure shift (same spread, mean moved ≥2σ) that per-window bins would hide', () => {
    const rand = mulberry32(42);
    const d = new DriftDetector(defaultDriftConfig);
    addReference(d, rand, 40, 0.4, 0.05);
    addCurrent(d, rand, 200, 0.6, 0.05);
    const r = d.detectDrift('scoring-free', 'score_distribution', NOW);
    expect(r.status).toBe('evaluated');
    expect(r.detectedTick).toBe(true);
    expect(['medium', 'high', 'critical']).toContain(r.severity);
    expect(r.pValue).toBeLessThan(0.01);
  });

  it('does not flag a no-shift control', () => {
    const rand = mulberry32(43);
    const d = new DriftDetector(defaultDriftConfig);
    addReference(d, rand, 40, 0.5, 0.1);
    addCurrent(d, rand, 200, 0.5, 0.1);
    const r = d.detectDrift('scoring-free', 'score_distribution', NOW);
    expect(r.detectedTick).toBe(false);
    expect(r.severity).toBe('none');
    expect(r.pValue).toBeGreaterThan(0.2);
  });

  it('keeps the false-positive rate bounded over 200 seeded null windows', () => {
    let detected = 0;
    for (let seed = 1000; seed < 1200; seed++) {
      const rand = mulberry32(seed);
      const d = new DriftDetector(defaultDriftConfig);
      addReference(d, rand, 10, 0.6, 0.15);
      addCurrent(d, rand, 30, 0.6, 0.15);
      if (d.detectDrift('scoring-free', 'score_distribution', NOW).detectedTick) detected++;
    }
    expect(detected).toBeLessThanOrEqual(5);
  });

  it('reports insufficient_data (never "none" as healthy) below the sample minimums', () => {
    const rand = mulberry32(5);
    const fewRef = new DriftDetector(defaultDriftConfig);
    addReference(fewRef, rand, 5, 0.5, 0.1); // 35 < 50 reference samples
    addCurrent(fewRef, rand, 100, 0.5, 0.1);
    expect(fewRef.detectDrift('scoring-free', 'score_distribution', NOW).status).toBe(
      'insufficient_data'
    );

    const fewCur = new DriftDetector(defaultDriftConfig);
    addReference(fewCur, rand, 20, 0.5, 0.1);
    addCurrent(fewCur, rand, 24, 0.5, 0.1); // 24 < 25 current samples
    expect(fewCur.detectDrift('scoring-free', 'score_distribution', NOW).status).toBe(
      'insufficient_data'
    );
  });

  it('uses only time-of-day-matched reference slices that never overlap the current window', () => {
    const rand = mulberry32(9);
    const d = new DriftDetector(defaultDriftConfig);
    // Off-slice samples (12h ago, and 18h before yesterday's slice) must be ignored entirely.
    addSamples(d, normals(rand, 300, 0.9, 0.02), NOW - 18 * HOUR, NOW - 12 * HOUR);
    addReference(d, rand, 30, 0.5, 0.1);
    addCurrent(d, rand, 200, 0.5, 0.1);
    const r = d.detectDrift('scoring-free', 'score_distribution', NOW);
    expect(r.baselineWindow.sampleCount).toBe(7 * 30);
    expect(r.currentWindow.sampleCount).toBe(200);
    expect(r.baselineWindow.endTime.getTime()).toBeLessThanOrEqual(NOW - 24 * HOUR);
    expect(r.detectedTick).toBe(false);
  });

  it('returns structured, type-compatible tick results even for a model name containing ":"', () => {
    const rand = mulberry32(3);
    const d = new DriftDetector(defaultDriftConfig);
    const model = 'openrouter:scoring-free:v1';
    for (let day = 1; day <= 7; day++) {
      const end = NOW - day * 24 * HOUR;
      addSamples(d, normals(rand, 20, 0.5, 0.1), end - 6 * HOUR, end, 'score_distribution', model);
    }
    addSamples(
      d,
      normals(rand, 60, 0.5, 0.1),
      NOW - 6 * HOUR + 1,
      NOW,
      'score_distribution',
      model
    );
    const [r] = d.detectAllDrift({ now: NOW });
    const tick: DriftTickResult = r satisfies DriftTickResult;
    expect(tick.model).toBe(model);
    expect(tick.metric).toBe('score_distribution');
    expect(tick.status).toBe('evaluated');
  });
});

describe('DriftDetector — persistence and events', () => {
  function tick(d: DriftDetector, at: number): DriftResult {
    return d.detectAllDrift({ now: at })[0];
  }

  it('counts one onset after three consecutive detected ticks and none on the 4th', () => {
    const rand = mulberry32(21);
    const d = new DriftDetector(defaultDriftConfig);
    addReference(d, rand, 40, 0.4, 0.05);
    addCurrent(d, rand, 200, 0.6, 0.05);

    const first = tick(d, NOW);
    const second = tick(d, NOW);
    const third = tick(d, NOW);
    const fourth = tick(d, NOW);
    expect([first, second, third, fourth].map((r) => r.detectedTick)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([first, second, third, fourth].map((r) => r.onset)).toEqual([false, false, true, false]);
    expect(fourth.inEvent).toBe(true);
  });

  it('an event ends after three clear ticks and a new shift starts a second onset', () => {
    const d = new DriftDetector(defaultDriftConfig);
    const results: boolean[] = [];
    const detectedSeq = [true, true, true, false, false, false, true, true, true];
    for (const detected of detectedSeq) {
      results.push(d.applyPersistence('scoring-free', 'score_distribution', detected).onset);
    }
    expect(results).toEqual([false, false, true, false, false, false, false, false, true]);
  });

  it('insufficient-data ticks do not advance persistence', () => {
    const d = new DriftDetector(defaultDriftConfig);
    const r = d.detectAllDrift({ now: NOW });
    expect(r).toEqual([]);
    const rand = mulberry32(31);
    addCurrent(d, rand, 10, 0.5, 0.1);
    const [insufficient] = d.detectAllDrift({ now: NOW });
    expect(insufficient.status).toBe('insufficient_data');
    expect(insufficient.onset).toBe(false);
    expect(insufficient.inEvent).toBe(false);
  });
});

describe('DriftDetector — scope, retention and history', () => {
  it('evaluates only the requested metrics', () => {
    const rand = mulberry32(51);
    const d = new DriftDetector(defaultDriftConfig);
    addReference(d, rand, 20, 0.5, 0.1);
    addCurrent(d, rand, 60, 0.5, 0.1);
    addSamples(d, normals(rand, 60, 0.5, 0.1), NOW - HOUR, NOW, 'user_satisfaction');
    const results = d.detectAllDrift({
      now: NOW,
      metrics: ['score_distribution', 'confidence_level'],
    });
    expect(results.map((r) => r.metric)).toEqual(['score_distribution']);
  });

  it('prunes samples older than 8 days on tick and caps each key at the newest 50,000', () => {
    const d = new DriftDetector(defaultDriftConfig);
    d.recordSample({
      value: 0.5,
      timestamp: new Date(NOW - 9 * 24 * HOUR),
      model: 'scoring-free',
      metric: 'score_distribution',
    });
    d.recordSample({
      value: 0.5,
      timestamp: new Date(NOW - HOUR),
      model: 'scoring-free',
      metric: 'score_distribution',
    });
    d.pruneOnTick(NOW);
    expect(d.getStatus().totalSamples).toBe(1);

    const capped = new DriftDetector({ ...defaultDriftConfig, maxSamplesPerKey: 100 });
    for (let i = 0; i < 250; i++) {
      capped.recordSample({
        value: i / 250,
        timestamp: new Date(NOW - 250 + i),
        model: 'scoring-free',
        metric: 'score_distribution',
      });
    }
    capped.pruneOnTick(NOW);
    expect(capped.getStatus().totalSamples).toBe(100);
  });

  it('caps drift history at 7 days', () => {
    const rand = mulberry32(61);
    const d = new DriftDetector(defaultDriftConfig);
    addReference(d, rand, 20, 0.5, 0.1);
    addCurrent(d, rand, 60, 0.5, 0.1);
    d.detectAllDrift({ now: NOW });
    vi.setSystemTime(NOW + 8 * 24 * HOUR);
    d.pruneOnTick(NOW + 8 * 24 * HOUR);
    expect(d.getHistory()).toHaveLength(0);
  });

  it('keeps legacy pinned baselines working, compared on shared bins with real sample counts', () => {
    const rand = mulberry32(71);
    const d = new DriftDetector(defaultDriftConfig);
    d.setBaseline('scoring-free', 'score_distribution', {
      startTime: new Date(NOW - 48 * HOUR),
      endTime: new Date(NOW - 24 * HOUR),
      sampleCount: 500,
      mean: 0.4,
      variance: 0.0025,
      min: 0,
      max: 1,
      distribution: [0, 0, 0.1, 0.4, 0.4, 0.1, 0, 0, 0, 0],
    });
    addCurrent(d, rand, 200, 0.75, 0.03);
    const r = d.detectDrift('scoring-free', 'score_distribution', NOW);
    expect(r.status).toBe('evaluated');
    expect(r.detectedTick).toBe(true);
  });
});
