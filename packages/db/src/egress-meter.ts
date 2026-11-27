/**
 * Egress meter: rows and bytes returned from Postgres, per job (egress audit 1126).
 *
 * Supabase bills egress, the bytes the database sends out. This counts them where they are
 * produced: every Prisma operation reports the rows it returned and the size of the result,
 * grouped by the job or route that issued it, and a summary of the top spenders is logged on an
 * interval. After a deploy it answers "which job spends the egress" from the app's own logs,
 * which Supabase's dashboard cannot.
 *
 * OFF by default. Set `EGRESS_LOG=1` to turn it on (read when the Prisma client is created).
 * When off, nothing is attached to the client and there is no cost. When on, each result is
 * measured with one `JSON.stringify` (a close estimate of the wire size), so use it for a
 * measuring window, not as an always-on feature.
 *
 *   EGRESS_LOG=1                 enable
 *   EGRESS_LOG_INTERVAL_MS=300000  summary interval (default 5 minutes)
 *   EGRESS_LOG_TOP=15            rows in each summary (default 15)
 *
 * The label is the active query-budget route (`trpc.query.leads.list`, a BullMQ queue name) or,
 * for timers and sweeps that have no request context, the name given to `runWithEgressJob`.
 * Anything else is `unscoped`. Only labels and numbers are logged, never row contents.
 *
 * @module @intelliflow/db/egress-meter
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getQueryBudgetStore } from './query-budget/context';

export interface EgressStat {
  calls: number;
  rows: number;
  bytes: number;
}

export interface EgressSummaryLine extends EgressStat {
  job: string;
  op: string;
}

const jobStorage = new AsyncLocalStorage<string>();

/** Name the job for every Prisma operation issued inside `fn` (timers and sweeps have no route). */
export function runWithEgressJob<T>(job: string, fn: () => T): T {
  return jobStorage.run(job, fn);
}

export function egressMeterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.EGRESS_LOG?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Rows and approximate wire bytes of one Prisma result. */
export function measureResult(result: unknown): { rows: number; bytes: number } {
  if (result === null || result === undefined) return { rows: 0, bytes: 0 };
  const rows = Array.isArray(result) ? result.length : 1;
  try {
    // BigInt and Decimal-like values appear in raw queries; stringify them rather than throw.
    const json = JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    return { rows, bytes: json ? Buffer.byteLength(json) : 0 };
  } catch {
    // Circular or otherwise unserialisable: the rows are still counted, the size is unknown.
    return { rows, bytes: 0 };
  }
}

export class EgressMeter {
  private readonly stats = new Map<string, EgressStat & { job: string; op: string }>();

  record(job: string, op: string, rows: number, bytes: number): void {
    const key = `${job}\u0000${op}`;
    let s = this.stats.get(key);
    if (!s) {
      s = { job, op, calls: 0, rows: 0, bytes: 0 };
      this.stats.set(key, s);
    }
    s.calls += 1;
    s.rows += rows;
    s.bytes += bytes;
  }

  /** Top spenders by bytes since the last reset. */
  summary(top = 15): {
    totalBytes: number;
    totalRows: number;
    totalCalls: number;
    top: EgressSummaryLine[];
  } {
    const all = [...this.stats.values()].sort((a, b) => b.bytes - a.bytes);
    return {
      totalBytes: all.reduce((n, s) => n + s.bytes, 0),
      totalRows: all.reduce((n, s) => n + s.rows, 0),
      totalCalls: all.reduce((n, s) => n + s.calls, 0),
      top: all.slice(0, top),
    };
  }

  reset(): void {
    this.stats.clear();
  }
}

export const egressMeter = new EgressMeter();

/** The label of the code issuing a query: the budget route, else the named job, else `unscoped`. */
export function currentEgressJob(): string {
  return getQueryBudgetStore()?.route ?? jobStorage.getStore() ?? 'unscoped';
}

interface AllOperationsArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/** The `$allOperations` body, exported so it can be tested without a database. */
export async function meterOperation(
  params: AllOperationsArgs,
  meter: EgressMeter = egressMeter
): Promise<unknown> {
  const result = await params.query(params.args);
  const { rows, bytes } = measureResult(result);
  meter.record(currentEgressJob(), `${params.model ?? '$raw'}.${params.operation}`, rows, bytes);
  return result;
}

/** Plain Prisma extension object; attach with `client.$extends(egressMeterExtension())`. */
export function egressMeterExtension() {
  return {
    name: 'egress-meter',
    query: {
      $allOperations: (params: AllOperationsArgs) => meterOperation(params),
    },
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Log the summary every interval, once per process. The timer never keeps the process alive.
 * `sink` defaults to one `console.log` JSON line tagged `[egress]`.
 */
export function startEgressLogging(
  env: NodeJS.ProcessEnv = process.env,
  sink: (line: string) => void = (line) => console.log(line),
  meter: EgressMeter = egressMeter
): void {
  if (timer) return;
  const interval = Math.max(1_000, Number(env.EGRESS_LOG_INTERVAL_MS) || 300_000);
  const top = Math.max(1, Number(env.EGRESS_LOG_TOP) || 15);
  timer = setInterval(() => {
    const s = meter.summary(top);
    if (s.totalCalls === 0) return;
    sink(
      `[egress] ${JSON.stringify({
        windowMs: interval,
        totalBytes: s.totalBytes,
        totalRows: s.totalRows,
        totalCalls: s.totalCalls,
        top: s.top.map((t) => ({
          job: t.job,
          op: t.op,
          calls: t.calls,
          rows: t.rows,
          bytes: t.bytes,
          avgBytes: Math.round(t.bytes / t.calls),
        })),
      })}`
    );
    meter.reset();
  }, interval);
  timer.unref?.();
}

/** Test helper. */
export function stopEgressLogging(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
