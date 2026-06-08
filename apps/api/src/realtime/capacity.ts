/**
 * Realtime connection capacity evaluator — caveat 3b.
 *
 * The realtime/WebSocket layer has a hard concurrent-connection cap (the Supabase
 * Realtime plan limit, ~200 — see docs/shared/optimization-guide.md). Capacity was
 * previously stub evidence; this module turns the LIVE connection count into an
 * evaluated status (ok / warning / critical) so the WS server can alert and report
 * real headroom instead of an assumption.
 *
 * @module @intelliflow/api/realtime
 * @task issue #318 (caveat 3b)
 */

export type RealtimeCapacityStatus = 'ok' | 'warning' | 'critical';

export interface RealtimeCapacityConfig {
  /** Hard cap (plan limit). Default 200; override via REALTIME_MAX_CONNECTIONS. */
  max: number;
  /** Warn at/above this count. Default 75% of max; REALTIME_WARN_CONNECTIONS. */
  warnAt: number;
  /** Critical at/above this count. Default 90% of max; REALTIME_CRITICAL_CONNECTIONS. */
  criticalAt: number;
}

export interface RealtimeCapacityEvaluation {
  connections: number;
  max: number;
  /** Fraction of the cap in use (0..1+, can exceed 1 if over the cap). */
  utilization: number;
  /** Connections remaining before the cap (never negative). */
  headroom: number;
  status: RealtimeCapacityStatus;
}

const DEFAULT_MAX = 200;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Resolve capacity thresholds from env, with Supabase-plan defaults (warn 75%, critical 90%). */
export function getRealtimeCapacityConfig(
  env: NodeJS.ProcessEnv = process.env
): RealtimeCapacityConfig {
  const max = positiveInt(env.REALTIME_MAX_CONNECTIONS, DEFAULT_MAX);
  const warnAt = positiveInt(env.REALTIME_WARN_CONNECTIONS, Math.round(max * 0.75));
  const criticalAt = positiveInt(env.REALTIME_CRITICAL_CONNECTIONS, Math.round(max * 0.9));
  return { max, warnAt, criticalAt };
}

/** Evaluate a live connection count against the capacity thresholds. */
export function evaluateRealtimeCapacity(
  connections: number,
  config: RealtimeCapacityConfig = getRealtimeCapacityConfig()
): RealtimeCapacityEvaluation {
  const safe = Number.isFinite(connections) && connections > 0 ? Math.floor(connections) : 0;

  let status: RealtimeCapacityStatus = 'ok';
  if (safe >= config.criticalAt) {
    status = 'critical';
  } else if (safe >= config.warnAt) {
    status = 'warning';
  }

  return {
    connections: safe,
    max: config.max,
    utilization: config.max > 0 ? safe / config.max : 0,
    headroom: Math.max(0, config.max - safe),
    status,
  };
}

/** Minimal console-compatible logger surface. */
export interface CapacityLogger {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Log a capacity evaluation ONLY when its status changed from `previousStatus`, at
 * a level matching the new status. Returns the new status so the caller can track
 * it. Keeps the WS server quiet under steady state but loud on transitions.
 */
export function logCapacityIfChanged(
  evaluation: RealtimeCapacityEvaluation,
  previousStatus: RealtimeCapacityStatus,
  logger: CapacityLogger = console
): RealtimeCapacityStatus {
  if (evaluation.status === previousStatus) {
    return previousStatus;
  }

  const pct = Math.round(evaluation.utilization * 100);
  const line =
    `[WS] realtime capacity ${evaluation.connections}/${evaluation.max} ` +
    `(${pct}%) status=${evaluation.status} (was ${previousStatus})`;

  if (evaluation.status === 'critical') {
    logger.error(line);
  } else if (evaluation.status === 'warning') {
    logger.warn(line);
  } else {
    logger.log(line);
  }
  return evaluation.status;
}
