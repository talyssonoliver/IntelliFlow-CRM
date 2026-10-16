/**
 * Tests for the scripts/test-db.mjs CLI (#271). Every side effect (server
 * connection, pnpm, child process, signals, output) is injected, so nothing
 * here touches a database or spawns a process.
 *
 * Connection strings are assembled from parts so no credential-shaped literal
 * appears in source.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';

import { main } from '../test-db.mjs';

const serverUrl = (host = 'localhost') =>
  ['postgresql', '://', 'u', ':', 'p', '@', host, ':25432/intelliflow_test'].join('');

function harness(
  opts: { host?: string; exit?: [number | null, string | null]; spawnError?: Error } = {}
) {
  const sql: string[] = [];
  const err: string[] = [];
  const out: string[] = [];
  const pnpmCalls: Array<{ args: string[]; dbUrl: string }> = [];
  const spawned: Array<{ cmd: string; args: string[]; dbUrl: string }> = [];
  const handlers = new Map<string, () => void>();

  const io = {
    env: { TEST_DATABASE_ADMIN_URL: serverUrl(opts.host) },
    connect: async () => ({
      query: async (s: string) => {
        sql.push(s);
        return { rows: [] };
      },
      end: async () => {},
    }),
    pnpm: (args: string[], env: Record<string, string>) => {
      pnpmCalls.push({ args, dbUrl: env.DATABASE_URL });
    },
    spawn: (cmd: string, args: string[], o: { env: Record<string, string> }) => {
      spawned.push({ cmd, args, dbUrl: o.env.DATABASE_URL });
      const child = Object.assign(new EventEmitter(), { killed: false, kill: () => {} });
      queueMicrotask(() => {
        if (opts.spawnError) child.emit('error', opts.spawnError);
        else if (opts.exit) child.emit('exit', ...opts.exit);
        else child.emit('exit', 0, null);
      });
      return child;
    },
    stderr: (t: string) => err.push(t),
    stdout: (t: string) => out.push(t),
    onSignal: (sig: string, fn: () => void) => handlers.set(sig, fn),
    offSignal: (sig: string) => handlers.delete(sig),
  };
  return { io, sql, err, out, pnpmCalls, spawned, handlers };
}

const created = (sql: string[]) => sql.find((s) => s.startsWith('CREATE DATABASE'));
const dropped = (sql: string[]) => sql.filter((s) => s.startsWith('DROP DATABASE'));

describe('test-db run', () => {
  it('creates a database, runs the command against it, then drops it and returns the exit code', async () => {
    const h = harness({ exit: [3, null] });
    const code = await main(['run', '--', 'pnpm', 'test:integration'], h.io);

    expect(code).toBe(3);
    expect(created(h.sql)).toMatch(/intelliflow_test_run_/);
    expect(h.pnpmCalls.map((c) => c.args.at(-1))).toEqual(['db:migrate']);
    expect(h.spawned).toHaveLength(1);
    expect(h.spawned[0].cmd).toBe('pnpm');
    expect(h.spawned[0].args).toEqual(['test:integration']);
    expect(h.spawned[0].dbUrl).toMatch(/intelliflow_test_run_/);
    expect(dropped(h.sql)).toHaveLength(1);
    expect(h.handlers.size).toBe(0);
  });

  it('seeds only when asked', async () => {
    const h = harness();
    await main(['run', '--seed', '--', 'true'], h.io);
    expect(h.pnpmCalls.map((c) => c.args.at(-1))).toEqual(['db:migrate', 'db:seed']);
  });

  it('never prints the server credentials', async () => {
    const h = harness();
    await main(['run', '--', 'true'], h.io);
    expect(h.err.join('')).not.toContain('u:p@');
  });

  it('reports a signal death as 128+n and still drops the database', async () => {
    const h = harness({ exit: [null, 'SIGTERM'] });
    const code = await main(['run', '--', 'sleep', '9'], h.io);
    expect(code).toBe(128 + 15);
    expect(dropped(h.sql)).toHaveLength(1);
  });

  it('returns 1 and still drops the database when the command cannot start', async () => {
    const h = harness({ spawnError: new Error('ENOENT') });
    const code = await main(['run', '--', 'nope'], h.io);
    expect(code).toBe(1);
    expect(h.err.join('')).toContain('could not start command: ENOENT');
    expect(dropped(h.sql)).toHaveLength(1);
  });

  it('an interrupt during provisioning runs no command, exits 130 and drops the database', async () => {
    const h = harness();
    const realPnpm = h.io.pnpm;
    h.io.pnpm = (args: string[], env: Record<string, string>) => {
      realPnpm(args, env);
      h.handlers.get('SIGINT')!(); // the kill lands mid-migration
    };
    const code = await main(['run', '--', 'pnpm', 'test'], h.io);
    expect(code).toBe(130);
    expect(h.spawned).toHaveLength(0);
    expect(dropped(h.sql)).toHaveLength(1);
  });

  it('refuses a non-local server before creating anything', async () => {
    const h = harness({ host: 'db.example.invalid' });
    await expect(main(['run', '--', 'true'], h.io)).rejects.toThrow(/non-local host/);
    expect(h.sql).toEqual([]);
    expect(h.handlers.size).toBe(0);
  });

  it('needs a command after --', async () => {
    const h = harness();
    await expect(main(['run'], h.io)).rejects.toThrow(/usage: test-db run/);
  });
});

describe('test-db up / down', () => {
  it('up leaves the database in place and prints its URL on stdout only', async () => {
    const h = harness();
    expect(await main(['up'], h.io)).toBe(0);
    expect(created(h.sql)).toBeDefined();
    expect(dropped(h.sql)).toHaveLength(0);
    expect(h.out.join('')).toMatch(/^TEST_DATABASE_URL=.*intelliflow_test_run_/);
    expect(h.err.join('')).toContain('pnpm test:db:down intelliflow_test_run_');
  });

  it('down drops the named database', async () => {
    const h = harness();
    expect(await main(['down', 'intelliflow_test_run_abc'], h.io)).toBe(0);
    expect(dropped(h.sql)[0]).toContain('intelliflow_test_run_abc');
  });

  it('down refuses a database that is not ephemeral', async () => {
    const h = harness();
    await expect(main(['down', 'production'], h.io)).rejects.toThrow(/databases are managed/);
    expect(dropped(h.sql)).toHaveLength(0);
  });

  it('down needs a name', async () => {
    const h = harness();
    await expect(main(['down'], h.io)).rejects.toThrow(/usage: test-db down/);
  });

  it('down --stale rejects a non-numeric age', async () => {
    const h = harness();
    await expect(main(['down', '--stale', '--older-than-min', 'soon'], h.io)).rejects.toThrow(
      /needs a number/
    );
  });

  it('down --stale sweeps and reports', async () => {
    const h = harness();
    expect(await main(['down', '--stale'], h.io)).toBe(0);
    expect(h.err.join('')).toContain('swept 0 stale database(s)');
  });

  it('rejects an unknown command', async () => {
    const h = harness();
    await expect(main(['frobnicate'], h.io)).rejects.toThrow(/usage: test-db/);
  });
});
