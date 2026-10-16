/**
 * Behaviour tests for the push-based executor status file (ADR-077, #581).
 * Real filesystem in a temp dir; time is injected, nothing sleeps.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as lib from './executor-status.mjs';
import { main } from '../executor-status.mjs';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-status-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const T0 = new Date('2026-10-16T10:00:00.000Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

describe('writeExecutorStatus', () => {
  it('is a no-op when the feature is not enabled', () => {
    const dir = tmp();
    const res = lib.writeExecutorStatus(dir, 'PG-1', { phase: 'spec' }, { env: {}, now: T0 });
    expect(res).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('writes when enabled via env and bumps seq on each write', () => {
    const dir = tmp();
    const env = { [lib.ENABLE_ENV]: '1' };
    const a = lib.writeExecutorStatus(dir, 'PG-1', { phase: 'spec' }, { env, now: T0 });
    const b = lib.writeExecutorStatus(dir, 'PG-1', { phase: 'plan' }, { env, now: at(5) });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'PG-1.json'), 'utf8')).phase).toBe('plan');
  });

  it('leaves no temp files behind (atomic rename)', () => {
    const dir = tmp();
    lib.writeExecutorStatus(dir, 'PG-1', { phase: 'exec' }, { enabled: true, now: T0 });
    expect(fs.readdirSync(dir)).toEqual(['PG-1.json']);
  });

  it('restarts seq at 1 when the previous file is corrupt', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'PG-1.json'), '{"seq": 7, "trunc');
    const rec = lib.writeExecutorStatus(dir, 'PG-1', { phase: 'exec' }, { enabled: true, now: T0 });
    expect(rec.seq).toBe(1);
  });

  it('marks terminal phases terminal', () => {
    const dir = tmp();
    const rec = lib.writeExecutorStatus(
      dir,
      'PG-1',
      { phase: 'ready' },
      { enabled: true, now: T0 }
    );
    expect(rec.terminal).toBe(true);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, '60'])(
    'rejects heartbeat_s %j so the writer cannot emit a file its reader refuses',
    (hb) => {
      const dir = tmp();
      expect(() =>
        lib.writeExecutorStatus(dir, 'PG-1', { phase: 'exec', heartbeat_s: hb }, { enabled: true })
      ).toThrow(/invalid heartbeat_s/);
      expect(fs.readdirSync(dir)).toEqual([]);
    }
  );

  it('a small positive heartbeat_s the writer accepts is one the reader accepts', () => {
    const dir = tmp();
    lib.writeExecutorStatus(
      dir,
      'PG-1',
      { phase: 'exec', heartbeat_s: 0.5 },
      { enabled: true, now: T0 }
    );
    expect(lib.readExecutorStatus(dir, 'PG-1', { now: T0 }).state).toBe('fresh');
  });

  it.each(['../evil', 'a/b', 'a\\b', '', '.hidden', 'x'.repeat(65)])(
    'rejects unsafe task id %j so it cannot escape the directory',
    (id) => {
      const dir = tmp();
      expect(() => lib.writeExecutorStatus(dir, id, { phase: 'spec' }, { enabled: true })).toThrow(
        /invalid task id/
      );
    }
  );

  it('rejects unknown phase and gate_status', () => {
    const dir = tmp();
    expect(() =>
      lib.writeExecutorStatus(dir, 'PG-1', { phase: 'nope' }, { enabled: true })
    ).toThrow(/invalid phase/);
    expect(() =>
      lib.writeExecutorStatus(
        dir,
        'PG-1',
        { phase: 'spec', gate_status: 'maybe' },
        { enabled: true }
      )
    ).toThrow(/invalid gate_status/);
  });
});

describe('readExecutorStatus', () => {
  const write = (dir: string, phase: string, now = T0, extra = {}) =>
    lib.writeExecutorStatus(dir, 'PG-1', { phase, ...extra }, { enabled: true, now });

  it('missing file means fall back to polling', () => {
    const r = lib.readExecutorStatus(tmp(), 'PG-1', { now: T0 });
    expect(r).toMatchObject({ state: 'missing', needsPoll: true });
  });

  it('a recent heartbeat is trusted', () => {
    const dir = tmp();
    write(dir, 'preship');
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: at(100) });
    expect(r).toMatchObject({ state: 'fresh', needsPoll: false, ageS: 100 });
    expect(r.status.phase).toBe('preship');
  });

  it('a dead executor (no heartbeat past 3x interval) becomes stale and needs polling', () => {
    const dir = tmp();
    write(dir, 'preship', T0, { heartbeat_s: 60 });
    expect(lib.readExecutorStatus(dir, 'PG-1', { now: at(180) }).state).toBe('fresh');
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: at(181) });
    expect(r).toMatchObject({ state: 'stale', needsPoll: true });
  });

  it('a terminal record bound to this run is trusted regardless of age', () => {
    const dir = tmp();
    write(dir, 'blocked');
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: at(86400), since: T0 });
    expect(r).toMatchObject({ state: 'terminal', needsPoll: false });
  });

  it('a terminal record with no run to bind to is not trusted', () => {
    const dir = tmp();
    write(dir, 'merged');
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: at(5) });
    expect(r).toMatchObject({ state: 'unbound', needsPoll: true });
  });

  it('a previous run terminal record is stale once the task is re-dispatched', () => {
    const dir = tmp();
    const day30 = 30 * 86400;
    write(dir, 'merged', T0); // run 1 finished
    const redispatch = at(day30); // run 2 starts, has not heartbeated yet
    expect(
      lib.readExecutorStatus(dir, 'PG-1', { now: at(day30 + 5), since: redispatch })
    ).toMatchObject({ state: 'stale', needsPoll: true });
    // Run 2's first write replaces it and is trusted.
    write(dir, 'exec', at(day30 + 10));
    expect(
      lib.readExecutorStatus(dir, 'PG-1', { now: at(day30 + 15), since: redispatch })
    ).toMatchObject({ state: 'fresh', needsPoll: false });
    write(dir, 'failed', at(day30 + 60));
    expect(
      lib.readExecutorStatus(dir, 'PG-1', { now: at(day30 + 90), since: redispatch })
    ).toMatchObject({ state: 'terminal', needsPoll: false });
  });

  it('a previous run heartbeat that still looks fresh is stale for the new run', () => {
    const dir = tmp();
    write(dir, 'exec', T0);
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: at(30), since: at(20) });
    expect(r).toMatchObject({ state: 'stale', needsPoll: true });
  });

  it('an unusable since is invalid, never trusted', () => {
    const dir = tmp();
    write(dir, 'blocked');
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: at(5), since: 'yesterday-ish' });
    expect(r).toMatchObject({ state: 'invalid', needsPoll: true });
  });

  it('a future-dated record is invalid, not fresh', () => {
    const dir = tmp();
    write(dir, 'exec', at(3600)); // one hour ahead of the reader clock
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: T0 });
    expect(r).toMatchObject({ state: 'invalid', needsPoll: true });
    expect(r.reason).toMatch(/future/);
  });

  it('a future-dated terminal record is invalid too', () => {
    const dir = tmp();
    write(dir, 'merged', at(3600));
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: T0, since: T0 });
    expect(r).toMatchObject({ state: 'invalid', needsPoll: true });
  });

  it('small clock skew within the allowance is still fresh', () => {
    const dir = tmp();
    write(dir, 'exec', at(30));
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: T0 });
    expect(r).toMatchObject({ state: 'fresh', needsPoll: false, ageS: 0 });
  });

  it('a torn file is invalid, not an exception', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'PG-1.json'), '{"schema_version": 1, "task');
    expect(lib.readExecutorStatus(dir, 'PG-1', { now: T0 })).toMatchObject({
      state: 'invalid',
      needsPoll: true,
    });
  });

  it('a file written for another task is rejected', () => {
    const dir = tmp();
    lib.writeExecutorStatus(dir, 'PG-2', { phase: 'spec' }, { enabled: true, now: T0 });
    fs.renameSync(path.join(dir, 'PG-2.json'), path.join(dir, 'PG-1.json'));
    const r = lib.readExecutorStatus(dir, 'PG-1', { now: T0 });
    expect(r.state).toBe('invalid');
    expect(r.reason).toMatch(/task_id mismatch/);
  });

  it('an unknown schema version is invalid so old readers do not misread new files', () => {
    const dir = tmp();
    write(dir, 'spec');
    const p = path.join(dir, 'PG-1.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.schema_version = 99;
    fs.writeFileSync(p, JSON.stringify(j));
    expect(lib.readExecutorStatus(dir, 'PG-1', { now: T0 }).state).toBe('invalid');
  });
});

describe('listExecutorStatuses', () => {
  it('returns [] for a missing directory', () => {
    expect(lib.listExecutorStatuses(path.join(tmp(), 'nope'))).toEqual([]);
  });

  it('lists each task with its own state, ignoring stray files', () => {
    const dir = tmp();
    lib.writeExecutorStatus(dir, 'PG-1', { phase: 'spec' }, { enabled: true, now: T0 });
    lib.writeExecutorStatus(dir, 'PG-2', { phase: 'merged' }, { enabled: true, now: T0 });
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    const rows = lib.listExecutorStatuses(dir, { now: at(10), since: T0 });
    expect(rows.map((r: { taskId: string; state: string }) => [r.taskId, r.state])).toEqual([
      ['PG-1', 'fresh'],
      ['PG-2', 'terminal'],
    ]);
  });
});

describe('executor-status CLI', () => {
  it('write is a silent no-op when disabled and never creates the directory', () => {
    const dir = path.join(tmp(), 'status');
    const out: string[] = [];
    const code = main(
      ['write', 'PG-1', '--phase', 'spec'],
      { INTELLIFLOW_EXECUTOR_STATUS_DIR: dir },
      (s: string) => out.push(s)
    );
    expect(code).toBe(0);
    expect(out).toEqual([]);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('write then read round-trips; read of a missing task exits 2 (poll)', () => {
    const dir = path.join(tmp(), 'status');
    const env = { INTELLIFLOW_EXECUTOR_STATUS_DIR: dir, [lib.ENABLE_ENV]: '1' };
    const out: string[] = [];
    const sink = (s: string) => out.push(s);
    expect(main(['read', 'PG-1'], env, sink)).toBe(2);
    expect(
      main(
        ['write', 'PG-1', '--phase', 'ci', '--gate-status', 'running', '--next', 'ci-green'],
        env,
        sink
      )
    ).toBe(0);
    expect(main(['read', 'PG-1', '--since', '2000-01-01T00:00:00Z'], env, sink)).toBe(0);
    const last = JSON.parse(out[out.length - 1]);
    expect(last.status).toMatchObject({
      phase: 'ci',
      gate_status: 'running',
      next_expected_event: 'ci-green',
    });
  });

  it('read exits 2 for a terminal record from before --since, and when --since is missing', () => {
    const dir = path.join(tmp(), 'status');
    const env = { INTELLIFLOW_EXECUTOR_STATUS_DIR: dir, [lib.ENABLE_ENV]: '1' };
    const sink = () => {};
    main(['write', 'PG-1', '--phase', 'merged'], env, sink);
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(main(['read', 'PG-1', '--since', future], env, sink)).toBe(2);
    expect(main(['read', 'PG-1'], env, sink)).toBe(2);
    expect(main(['read', 'PG-1', '--since', '2000-01-01T00:00:00Z'], env, sink)).toBe(0);
  });

  it.each([
    [['read', '../evil']],
    [['read', '']],
    [['read', 'PG-1', '--since', 'not-a-date']],
    [['read', 'PG-1', '--since']],
  ])('read %j exits 2, never 1, so the poll fallback always applies', (argv) => {
    const dir = path.join(tmp(), 'status');
    const env = { INTELLIFLOW_EXECUTOR_STATUS_DIR: dir, [lib.ENABLE_ENV]: '1' };
    const out: string[] = [];
    expect(main(argv, env, (s: string) => out.push(s))).toBe(2);
    expect(JSON.parse(out[0]).needsPoll).toBe(true);
  });
});
