/**
 * IFC-117: DriftDetectionScheduler — the first production caller of detectAllDrift.
 * Fake timers throughout; every test stops the scheduler and restores real timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriftDetectionScheduler, SCHEDULED_DRIFT_METRICS } from '../drift-scheduler';
import { DriftDetector, defaultDriftConfig, type DriftResult } from '../drift-detector';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const INTERVAL = 30 * 60_000;
const SECRET_SAMPLE = 0.123456789;

function evaluatedResult(overrides: Partial<DriftResult> = {}): DriftResult {
  const window = {
    startTime: new Date(NOW),
    endTime: new Date(NOW),
    sampleCount: 60,
    mean: SECRET_SAMPLE,
    variance: 0,
    min: SECRET_SAMPLE,
    max: SECRET_SAMPLE,
    distribution: [SECRET_SAMPLE],
  };
  return {
    model: 'scoring-free',
    metric: 'score_distribution',
    status: 'evaluated',
    detected: true,
    detectedTick: true,
    onset: true,
    inEvent: true,
    severity: 'high',
    baselineWindow: window,
    currentWindow: window,
    pValue: 0.001,
    driftScore: 0.8,
    timestamp: new Date(NOW),
    recommendations: [`check sample ${SECRET_SAMPLE}`],
    ...overrides,
  };
}

let scheduler: DriftDetectionScheduler | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  scheduler?.stop();
  scheduler = undefined;
  vi.useRealTimers();
});

function build(
  opts: {
    detector?: DriftDetector;
    record?: (r: readonly DriftResult[]) => unknown;
    log?: {
      info: (o: object, m?: string) => void;
      warn: (o: object, m?: string) => void;
      error: (o: object, m?: string) => void;
    };
  } = {}
) {
  const detector = opts.detector ?? new DriftDetector(defaultDriftConfig);
  const record = opts.record ?? vi.fn();
  const log = opts.log ?? { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  scheduler = new DriftDetectionScheduler(detector, { intervalMs: INTERVAL, record, log });
  return { detector, record, log, scheduler };
}

describe('DriftDetectionScheduler', () => {
  it('defaults to slidingIntervalMinutes (30 min) and only scores the bounded metrics', () => {
    expect(new DriftDetectionScheduler(new DriftDetector(defaultDriftConfig)).intervalMs).toBe(
      30 * 60_000
    );
    expect(SCHEDULED_DRIFT_METRICS).toEqual(['score_distribution', 'confidence_level']);
  });

  it('creates one interval, is idempotent on start, and does not run at boot', async () => {
    const { detector } = build();
    const detect = vi.spyOn(detector, 'detectAllDrift');
    scheduler!.start();
    scheduler!.start();
    expect(vi.getTimerCount()).toBe(1);
    expect(detect).not.toHaveBeenCalled();
  });

  it('runs prune -> detect(scheduled metrics) -> record once per interval', async () => {
    const { detector, record } = build();
    const prune = vi.spyOn(detector, 'pruneOnTick');
    const detect = vi.spyOn(detector, 'detectAllDrift').mockReturnValue([evaluatedResult()]);
    scheduler!.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(prune).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledWith({ metrics: SCHEDULED_DRIFT_METRICS, now: NOW + INTERVAL });
    expect(record).toHaveBeenCalledWith([expect.objectContaining({ onset: true })]);
  });

  it('logs and survives a throwing tick; the next tick still fires', async () => {
    const { detector, log, record } = build();
    vi.spyOn(detector, 'detectAllDrift')
      .mockImplementationOnce(() => {
        throw new Error('detector exploded');
      })
      .mockReturnValue([]);
    scheduler!.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(log.error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('does not start a second run while a tick is still pending', async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    const record = vi.fn(() => pending);
    const { detector } = build({ record });
    const detect = vi.spyOn(detector, 'detectAllDrift').mockReturnValue([]);
    scheduler!.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(detect).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it('stop() clears the interval and later advances do nothing', async () => {
    const { detector } = build();
    const detect = vi.spyOn(detector, 'detectAllDrift').mockReturnValue([]);
    scheduler!.start();
    scheduler!.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(detect).not.toHaveBeenCalled();
    expect(scheduler!.isRunning).toBe(false);
  });

  it('unrefs its interval so it never holds the process open', () => {
    const unref = vi.fn();
    const spy = vi.spyOn(globalThis, 'setInterval').mockReturnValue({ unref } as never);
    build();
    scheduler!.start();
    expect(unref).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    scheduler = undefined;
  });

  it('logs only fixed fields: never samples, windows or recommendations', async () => {
    const lines: string[] = [];
    const capture = (o: object, m?: string) => lines.push(JSON.stringify(o) + (m ?? ''));
    const { detector } = build({ log: { info: capture, warn: capture, error: capture } });
    vi.spyOn(detector, 'detectAllDrift').mockReturnValue([
      evaluatedResult(),
      evaluatedResult({ status: 'insufficient_data', onset: false, detectedTick: false }),
    ]);
    scheduler!.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    const out = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(out).not.toContain(String(SECRET_SAMPLE));
    // No window or recommendation fields (the metric NAME score_distribution is fine to log).
    expect(out).not.toContain('"distribution"');
    expect(out).not.toContain('"baselineWindow"');
    expect(out).not.toContain('"recommendations"');
    expect(out).toContain('scoring-free');
  });

  it('runs with its production defaults (pino logger, OTel facade recorder) without throwing', async () => {
    const detector = new DriftDetector(defaultDriftConfig);
    const detect = vi
      .spyOn(detector, 'detectAllDrift')
      .mockReturnValueOnce([evaluatedResult()])
      .mockImplementationOnce(() => {
        throw new Error('boom');
      });
    scheduler = new DriftDetectionScheduler(detector);
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
    await expect(scheduler.tick()).resolves.toBeUndefined(); // info + warn (onset)
    await expect(scheduler.tick()).resolves.toBeUndefined(); // error, swallowed
    expect(detect).toHaveBeenCalledTimes(2);
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });
});
