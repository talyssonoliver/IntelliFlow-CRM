/**
 * Drift Detection Scheduler (IFC-117, ADR-088)
 *
 * The first production caller of DriftDetector.detectAllDrift(). Every
 * `slidingIntervalMinutes` (30 min) it prunes old samples, evaluates the scheduled metrics and
 * hands the results to the OTel facade. It never runs at boot (there are no samples yet), never
 * overlaps a still-running tick, never lets a tick error escape the timer, and unrefs its
 * interval so it cannot hold the process open.
 *
 * @module drift-scheduler
 * @task IFC-117
 */
import pino from 'pino';
import { defaultDriftConfig, type DriftDetector, type DriftResult } from './drift-detector';
import { normalizeModel, recordDriftTick } from './otel-ai-metrics';
import { DRIFT_METRICS } from './otel-ai-types';

/** Only the bounded output distributions; feedback metrics have no production producer. */
export const SCHEDULED_DRIFT_METRICS = DRIFT_METRICS;

type Log = (fields: object, message?: string) => void;

export interface DriftSchedulerOptions {
  intervalMs?: number;
  /** Where tick results go; the OTel facade in production. */
  record?: (results: readonly DriftResult[]) => unknown;
  log?: { info: Log; warn: Log; error: Log };
}

const defaultLogger = pino({ name: 'drift-scheduler', level: process.env.LOG_LEVEL || 'info' });

export class DriftDetectionScheduler {
  readonly intervalMs: number;
  private readonly record: (results: readonly DriftResult[]) => unknown;
  private readonly log: { info: Log; warn: Log; error: Log };
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly detector: DriftDetector,
    options: DriftSchedulerOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? defaultDriftConfig.slidingIntervalMinutes * 60_000;
    this.record = options.record ?? recordDriftTick;
    this.log = options.log ?? {
      info: (f, m) => defaultLogger.info(f, m),
      warn: (f, m) => defaultLogger.warn(f, m),
      error: (f, m) => defaultLogger.error(f, m),
    };
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    const timer = setInterval(() => {
      // tick() catches its own errors; this only guards an unexpected rejection.
      this.tick().catch((err: unknown) =>
        this.log.error(
          { err: err instanceof Error ? err.name : typeof err },
          'Drift detection tick rejected'
        )
      );
    }, this.intervalMs);
    timer.unref?.();
    this.timer = timer;
    this.log.info(
      { intervalMs: this.intervalMs, metrics: SCHEDULED_DRIFT_METRICS },
      'Drift detection scheduler started'
    );
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.log.info({}, 'Drift detection scheduler stopped');
  }

  /** One tick. Public for tests; production calls it only from the interval. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const started = Date.now();
    try {
      this.detector.pruneOnTick(started);
      const results = this.detector.detectAllDrift({
        metrics: SCHEDULED_DRIFT_METRICS,
        now: started,
      });
      await this.record(results);
      this.logTick(results, Date.now() - started);
    } catch (err) {
      this.log.error(
        { err: err instanceof Error ? err.name : typeof err },
        'Drift detection tick failed'
      );
    } finally {
      this.running = false;
    }
  }

  /** Fixed fields only: never the result objects, windows, recommendations or sample values. */
  private logTick(results: readonly DriftResult[], durationMs: number): void {
    const evaluated = results.filter((r) => r.status === 'evaluated').length;
    this.log.info(
      { evaluated, insufficientData: results.length - evaluated, durationMs },
      'Drift detection tick'
    );
    for (const r of results) {
      if (!r.onset) continue;
      this.log.warn(
        {
          model: normalizeModel(r.model),
          metric: r.metric,
          status: r.status,
          severity: r.severity,
          pValue: Number(r.pValue.toFixed(6)),
          score: Number(r.driftScore.toFixed(4)),
        },
        'Output distribution shift event started'
      );
    }
  }
}
