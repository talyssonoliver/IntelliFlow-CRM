import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EgressMeter,
  currentEgressJob,
  egressMeterEnabled,
  measureResult,
  meterOperation,
  runWithEgressJob,
  startEgressLogging,
  stopEgressLogging,
} from '../egress-meter';
import { runWithQueryBudget } from '../query-budget/context';

afterEach(() => {
  stopEgressLogging();
  vi.useRealTimers();
});

describe('egressMeterEnabled', () => {
  it('is off unless EGRESS_LOG is 1 or true', () => {
    expect(egressMeterEnabled({})).toBe(false);
    expect(egressMeterEnabled({ EGRESS_LOG: '0' })).toBe(false);
    expect(egressMeterEnabled({ EGRESS_LOG: 'no' })).toBe(false);
    expect(egressMeterEnabled({ EGRESS_LOG: '1' })).toBe(true);
    expect(egressMeterEnabled({ EGRESS_LOG: ' TRUE ' })).toBe(true);
  });
});

describe('measureResult', () => {
  it('counts rows of an array and the JSON bytes', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    expect(measureResult(rows)).toEqual({
      rows: 2,
      bytes: Buffer.byteLength(JSON.stringify(rows)),
    });
  });

  it('counts a single object (findFirst, count, aggregate) as one row', () => {
    expect(measureResult({ _count: 5 }).rows).toBe(1);
    expect(measureResult(5).rows).toBe(1);
  });

  it('counts nothing as zero rows and zero bytes', () => {
    expect(measureResult(null)).toEqual({ rows: 0, bytes: 0 });
    expect(measureResult(undefined)).toEqual({ rows: 0, bytes: 0 });
    expect(measureResult([])).toEqual({ rows: 0, bytes: 2 });
  });

  it('does not throw on BigInt or circular results', () => {
    expect(measureResult([{ n: 10n }]).bytes).toBeGreaterThan(0);
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(measureResult(loop)).toEqual({ rows: 1, bytes: 0 });
  });
});

describe('EgressMeter', () => {
  it('sums calls, rows and bytes per job and operation, ranked by bytes', () => {
    const m = new EgressMeter();
    m.record('job-a', 'Lead.findMany', 10, 5000);
    m.record('job-a', 'Lead.findMany', 20, 9000);
    m.record('job-b', 'Email.findMany', 1, 100);
    m.record('job-a', 'Lead.count', 1, 10);
    const s = m.summary();
    expect(s.totalCalls).toBe(4);
    expect(s.totalRows).toBe(32);
    expect(s.totalBytes).toBe(14110);
    expect(s.top[0]).toEqual({
      job: 'job-a',
      op: 'Lead.findMany',
      calls: 2,
      rows: 30,
      bytes: 14000,
    });
    expect(s.top.map((t) => t.op)).toEqual(['Lead.findMany', 'Email.findMany', 'Lead.count']);
  });

  it('limits the summary to the top N and resets', () => {
    const m = new EgressMeter();
    for (let i = 0; i < 5; i++) m.record('j', `op${i}`, 1, i);
    expect(m.summary(2).top).toHaveLength(2);
    m.reset();
    expect(m.summary().totalCalls).toBe(0);
  });
});

describe('job labels', () => {
  it('is unscoped by default, the named job inside runWithEgressJob, the route inside a budget', () => {
    expect(currentEgressJob()).toBe('unscoped');
    runWithEgressJob('events-worker.sla', () =>
      expect(currentEgressJob()).toBe('events-worker.sla')
    );
    runWithQueryBudget({ budget: 5, route: 'trpc.query.leads.list', context: 'request' }, () =>
      expect(currentEgressJob()).toBe('trpc.query.leads.list')
    );
  });
});

describe('meterOperation', () => {
  it('returns the query result untouched and records it under the job', async () => {
    const m = new EgressMeter();
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = await runWithEgressJob('sweep', () =>
      meterOperation(
        { model: 'Lead', operation: 'findMany', args: { take: 3 }, query: async () => rows },
        m
      )
    );
    expect(result).toBe(rows);
    expect(m.summary().top[0]).toMatchObject({
      job: 'sweep',
      op: 'Lead.findMany',
      calls: 1,
      rows: 3,
    });
  });

  it('labels raw queries $raw and propagates errors without recording', async () => {
    const m = new EgressMeter();
    await meterOperation({ operation: '$queryRaw', args: [], query: async () => [{ x: 1 }] }, m);
    expect(m.summary().top[0].op).toBe('$raw.$queryRaw');
    await expect(
      meterOperation(
        {
          model: 'Lead',
          operation: 'findMany',
          args: {},
          query: async () => {
            throw new Error('boom');
          },
        },
        m
      )
    ).rejects.toThrow('boom');
    expect(m.summary().totalCalls).toBe(1);
  });
});

describe('startEgressLogging', () => {
  it('logs one [egress] JSON line per interval with the top spenders, then resets', () => {
    vi.useFakeTimers();
    const m = new EgressMeter();
    const lines: string[] = [];
    startEgressLogging(
      { EGRESS_LOG_INTERVAL_MS: '5000', EGRESS_LOG_TOP: '1' },
      (l) => lines.push(l),
      m
    );
    m.record('job-a', 'Lead.findMany', 10, 4000);
    m.record('job-a', 'Lead.findMany', 10, 4000);
    m.record('job-b', 'Tenant.findMany', 1, 50);

    vi.advanceTimersByTime(5000);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('[egress] ')).toBe(true);
    const payload = JSON.parse(lines[0].slice('[egress] '.length));
    expect(payload).toMatchObject({
      totalBytes: 8050,
      totalRows: 21,
      totalCalls: 3,
      windowMs: 5000,
    });
    expect(payload.top).toEqual([
      { job: 'job-a', op: 'Lead.findMany', calls: 2, rows: 20, bytes: 8000, avgBytes: 4000 },
    ]);

    vi.advanceTimersByTime(5000); // nothing new: no empty line
    expect(lines).toHaveLength(1);
  });

  it('logs no row contents, only labels and numbers', () => {
    vi.useFakeTimers();
    const m = new EgressMeter();
    const lines: string[] = [];
    startEgressLogging({ EGRESS_LOG_INTERVAL_MS: '1000' }, (l) => lines.push(l), m);
    m.record('job', 'Lead.findMany', 1, 100);
    vi.advanceTimersByTime(1000);
    expect(lines[0]).not.toMatch(/email|@/);
  });
});
