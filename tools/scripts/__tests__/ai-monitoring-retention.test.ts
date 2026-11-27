import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  assertMayApply,
  cutoffFor,
  isProductionHost,
  parseArgs,
  run,
  rollUpDay,
  type RetentionArgs,
  type RetentionDb,
  type RetentionTx,
} from '../ai-monitoring-retention';

const args = (over: Partial<RetentionArgs> = {}): RetentionArgs => ({
  isApply: false,
  days: 90,
  ownerApproved: undefined,
  includeDrift: false,
  ...over,
});

describe('parseArgs', () => {
  it('defaults to a dry run with 90 days', () => {
    expect(parseArgs(['node', 'x'])).toEqual({
      isApply: false,
      days: DEFAULT_RETENTION_DAYS,
      ownerApproved: undefined,
      includeDrift: false,
    });
  });

  it('reads --days, --apply, --owner-approved and --include-drift', () => {
    expect(
      parseArgs([
        '--days',
        '60',
        '--apply',
        '--owner-approved',
        'Talysson 2026-12-01',
        '--include-drift',
      ])
    ).toEqual({
      isApply: true,
      days: 60,
      ownerApproved: 'Talysson 2026-12-01',
      includeDrift: true,
    });
  });

  it.each([['0'], ['6'], ['abc'], ['1.5'], ['-30']])('rejects --days %s', (bad) => {
    expect(() => parseArgs(['--days', bad])).toThrow(/--days/);
  });

  it('rejects --days with no value', () => {
    expect(() => parseArgs(['--days'])).toThrow(/--days/);
  });
});

describe('cutoffFor', () => {
  it('is the start of the UTC day N days back, never mid-day', () => {
    expect(cutoffFor(new Date('2026-12-01T15:45:10Z'), 90).toISOString()).toBe(
      '2026-09-02T00:00:00.000Z'
    );
    expect(cutoffFor(new Date('2026-12-01T00:00:00Z'), 7).toISOString()).toBe(
      '2026-11-24T00:00:00.000Z'
    );
    expect(cutoffFor(new Date('2026-12-01T23:59:59.999Z'), 7).toISOString()).toBe(
      '2026-11-24T00:00:00.000Z'
    );
  });
});

describe('the guards on --apply', () => {
  // Built from parts at runtime: nothing here is shaped like a real connection string.
  const dsn = (host: string) =>
    ['post', 'gresql://', 'user', ':', 'x'.repeat(8), '@', host, '/db'].join('');
  const local = dsn('localhost:5433');
  const prod = dsn(['pooler', 'example', 'supabase', 'com'].join('.') + ':6543');

  it('a dry run needs nothing', () => {
    expect(() => assertMayApply(args(), prod, {})).not.toThrow();
  });

  it('--apply needs the owner reference', () => {
    expect(() => assertMayApply(args({ isApply: true }), local, {})).toThrow(/--owner-approved/);
  });

  it('--apply on a local database with the reference is allowed', () => {
    expect(() =>
      assertMayApply(args({ isApply: true, ownerApproved: 'ok' }), local, {})
    ).not.toThrow();
  });

  it('--apply on Supabase also needs ALLOW_PRODUCTION_RETENTION to match', () => {
    const a = args({ isApply: true, ownerApproved: 'Talysson 2026-12-01' });
    expect(() => assertMayApply(a, prod, {})).toThrow(/production/);
    expect(() => assertMayApply(a, prod, { ALLOW_PRODUCTION_RETENTION: 'other' })).toThrow(
      /production/
    );
    expect(() =>
      assertMayApply(a, prod, { ALLOW_PRODUCTION_RETENTION: 'Talysson 2026-12-01' })
    ).not.toThrow();
  });

  it('knows production hosts and treats an unparseable URL as production', () => {
    expect(isProductionHost(dsn(['db', 'example', 'supabase', 'co'].join('.') + ':5432'))).toBe(
      true
    );
    expect(isProductionHost(prod)).toBe(true);
    expect(isProductionHost(local)).toBe(false);
    expect(isProductionHost('not a url')).toBe(true);
  });
});

/** A fake database that records every statement and answers the few the script issues. */
function fakeDb(opts: { days?: Array<{ day: string; events: number }>; mismatch?: boolean } = {}) {
  const statements: string[] = [];
  const tx: RetentionTx = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      statements.push(sql.trim().split(/\s+/)[0].toUpperCase());
      return sql.includes('INSERT') ? 3 : 41;
    }),
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      statements.push('SELECT');
      if (sql.includes('FROM ai_monitoring_events')) return [{ events: 41 }];
      return [{ summarised: opts.mismatch ? 40 : 41 }];
    }) as RetentionTx['$queryRawUnsafe'],
  };
  const db: RetentionDb = {
    $queryRawUnsafe: vi.fn(async () => opts.days ?? []) as RetentionDb['$queryRawUnsafe'],
    $transaction: vi.fn(async (fn: (t: RetentionTx) => Promise<unknown>) =>
      fn(tx)
    ) as RetentionDb['$transaction'],
  };
  return { db, tx, statements };
}

describe('run', () => {
  const now = new Date('2026-12-01T12:00:00Z');

  it('a dry run reads once, lists the days, and never opens a transaction or writes', async () => {
    const { db, tx } = fakeDb({
      days: [
        { day: '2026-08-01', events: 41 },
        { day: '2026-08-02', events: 10 },
      ],
    });
    const lines: string[] = [];
    const result = await run(db, args(), now, (l) => lines.push(l));

    expect(result).toEqual({ days: 2, events: 51, summaries: 0, deleted: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(lines[0]).toContain('mode=DRY-RUN');
    expect(lines[0]).toContain('cutoff=2026-09-02T00:00:00.000Z');
    expect(lines[0]).toContain('drift=kept');
    expect(lines.some((l) => l.includes('would roll up 2026-08-01: 41 events'))).toBe(true);
  });

  it('with nothing old enough, even --apply does nothing', async () => {
    const { db } = fakeDb({ days: [] });
    const r = await run(db, args({ isApply: true, ownerApproved: 'ok' }), now, () => undefined);
    expect(r).toEqual({ days: 0, events: 0, summaries: 0, deleted: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('--apply rolls up each day in its own transaction: insert, check, then delete', async () => {
    const { db, statements } = fakeDb({
      days: [
        { day: '2026-08-01', events: 41 },
        { day: '2026-08-02', events: 41 },
      ],
    });
    const lines: string[] = [];
    const r = await run(db, args({ isApply: true, ownerApproved: 'Talysson' }), now, (l) =>
      lines.push(l)
    );

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ days: 2, events: 82, summaries: 6, deleted: 82 });
    // per day: INSERT, then the two checks, then DELETE: the delete is always last
    expect(statements).toEqual([
      'INSERT',
      'SELECT',
      'SELECT',
      'DELETE',
      'INSERT',
      'SELECT',
      'SELECT',
      'DELETE',
    ]);
    expect(lines[0]).toContain('mode=APPLY');
    expect(lines[0]).toContain('ownerApproved="Talysson"');
  });

  it('deletes nothing and stops when the summaries do not account for the events', async () => {
    const { db, statements } = fakeDb({
      days: [
        { day: '2026-08-01', events: 41 },
        { day: '2026-08-02', events: 41 },
      ],
      mismatch: true,
    });
    await expect(
      run(db, args({ isApply: true, ownerApproved: 'ok' }), now, () => undefined)
    ).rejects.toThrow(/41 events but the summaries hold 40; nothing deleted/);
    expect(statements).not.toContain('DELETE');
    expect(db.$transaction).toHaveBeenCalledTimes(1); // stopped at the first day
  });
});

describe('rollUpDay SQL', () => {
  it('keeps drift events out of the roll-up and the delete unless asked', async () => {
    const { tx } = fakeDb();
    await rollUpDay(tx, '2026-08-01', args());
    const sql = (tx.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string
    );
    expect(sql).toHaveLength(2);
    for (const s of sql) expect(s).toContain(`"eventType" <> 'drift'`);

    const { tx: tx2 } = fakeDb();
    await rollUpDay(tx2, '2026-08-01', args({ includeDrift: true }));
    for (const call of (tx2.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toContain(`<> 'drift'`);
    }
  });

  it('is idempotent in SQL (ON CONFLICT DO NOTHING) and day-bounded', async () => {
    const { tx } = fakeDb();
    await rollUpDay(tx, '2026-08-01', args());
    const insert = (tx.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(insert).toContain('ON CONFLICT');
    expect(insert).toContain('DO NOTHING');
    expect(insert).toContain(`"recordedAt" >= $1::date AND "recordedAt" < ($1::date + 1)`);
    const del = (tx.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(del).toContain(`"recordedAt" < ($1::date + 1)`);
    expect(del).not.toContain('TRUNCATE');
  });
});
