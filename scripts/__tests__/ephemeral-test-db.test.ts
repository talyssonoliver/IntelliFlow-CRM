/**
 * Tests for scripts/lib/ephemeral-test-db.mjs (#271): the logic that makes the
 * test database ephemeral and self-provisioning. Connections are fakes; nothing
 * here touches a real server.
 *
 * Connection strings are assembled from parts so no credential-shaped literal
 * appears in source.
 */
import { describe, it, expect } from 'vitest';

import {
  EPHEMERAL_PREFIX,
  adminUrlFor,
  assertLocalServer,
  bootstrapStatements,
  childEnv,
  ephemeralName,
  expandVars,
  isEphemeralName,
  provision,
  quoteIdent,
  resolveServerUrl,
  teardown,
  urlForDatabase,
} from '../lib/ephemeral-test-db.mjs';

const pgUrl = (port: number | string, db = 'intelliflow_test', host = 'localhost') =>
  ['postgresql', '://', 'u', ':', 'p', '@', host, ':', port, '/', db, '?schema=public'].join('');

/** A fake server: records every statement per connection URL. */
function fakeServer(opts: { failOn?: (url: string, sql: string) => boolean } = {}) {
  const log: Array<{ url: string; sql: string }> = [];
  const open = new Set<string>();
  const connect = async (url: string) => {
    open.add(url);
    return {
      query: async (sql: string) => {
        if (opts.failOn?.(url, sql)) throw new Error(`boom: ${sql}`);
        log.push({ url, sql });
      },
      end: async () => {
        open.delete(url);
      },
    };
  };
  return { log, open, connect };
}

describe('expandVars / resolveServerUrl', () => {
  it('expands ${VAR} references the way .env.test uses them', () => {
    const env = {
      DB_USER: 'u',
      DB_PASSWORD: 'p',
      TEST_DATABASE_URL: [
        'postgresql',
        '://',
        '${DB_USER}',
        ':',
        '${DB_PASSWORD}',
        '@localhost:5433/intelliflow_test',
      ].join(''),
    };
    expect(resolveServerUrl(env)).toBe(pgUrl(5433).replace('?schema=public', ''));
  });

  it('prefers the explicit admin URL, then the suite URLs in order', () => {
    expect(resolveServerUrl({ TEST_DATABASE_ADMIN_URL: 'A', TEST_DATABASE_URL: 'B' })).toBe('A');
    expect(resolveServerUrl({ TEST_DATABASE_URL: 'B', DATABASE_URL: 'C' })).toBe('B');
    expect(resolveServerUrl({ DATABASE_TEST_URL: 'D', DATABASE_URL: 'C' })).toBe('D');
    expect(resolveServerUrl({ DATABASE_URL: 'C' })).toBe('C');
    expect(resolveServerUrl({})).toBe('');
  });

  it('terminates on a self-referential variable instead of looping', () => {
    expect(expandVars('${A}', { A: '${A}' })).toContain('${A}');
  });
});

describe('server safety', () => {
  it.each([5433, 25432, 55432, 5432])('accepts a local server on port %s', (port) => {
    expect(() => assertLocalServer(pgUrl(port))).not.toThrow();
  });

  it('refuses a remote host (a production URL leaking in from .env.local)', () => {
    expect(() => assertLocalServer(pgUrl(5432, 'postgres', 'db.example.invalid'))).toThrow(
      /non-local host "db.example.invalid"/
    );
  });

  it('refuses when nothing resolved', () => {
    expect(() => assertLocalServer('')).toThrow(/No database server resolved/);
  });
});

describe('names and URLs', () => {
  it('generates valid, unique, lowercase ephemeral names within the identifier limit', () => {
    const names = new Set(
      Array.from({ length: 200 }, (_, i) => ephemeralName({ rand: i / 200, pid: 1234 + i }))
    );
    expect(names.size).toBe(200);
    for (const n of names) {
      expect(n.startsWith(EPHEMERAL_PREFIX)).toBe(true);
      expect(n.length).toBeLessThanOrEqual(63);
      expect(isEphemeralName(n)).toBe(true);
    }
  });

  it('only treats this tooling’s own databases as droppable', () => {
    for (const bad of [
      'intelliflow_test',
      'intelliflow_dev',
      'postgres',
      'template1',
      'intelliflow_test_run_',
      'intelliflow_test_run_X',
      'intelliflow_test_run_a; DROP DATABASE postgres',
      'intelliflow_test_run_a"b',
      '',
      undefined,
    ]) {
      expect(isEphemeralName(bad as string)).toBe(false);
    }
  });

  it('quotes identifiers', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });

  it('points the server URL at another database, keeping credentials, port and query', () => {
    const u = new URL(urlForDatabase(pgUrl(25432), 'intelliflow_test_run_x'));
    expect(u.pathname).toBe('/intelliflow_test_run_x');
    expect(u.port).toBe('25432');
    expect(u.searchParams.get('schema')).toBe('public');
    expect(u.username).toBe('u');
    expect(new URL(adminUrlFor(pgUrl(25432))).pathname).toBe('/postgres');
  });

  it('pre-creates only the extensions schema and puts public first on the search_path', () => {
    const sql = bootstrapStatements('intelliflow_test_run_x');
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS extensions');
    // The baseline migration installs vector itself, into public. Pre-installing it
    // into `extensions` makes that a no-op and breaks `vector(1536)` columns.
    expect(sql.join(' ')).not.toMatch(/CREATE EXTENSION/);
    expect(sql).toContain(
      'ALTER DATABASE "intelliflow_test_run_x" SET search_path TO public, extensions'
    );
  });
});

describe('provision', () => {
  const serverUrl = pgUrl(25432);

  it('creates a fresh database, bootstraps it, then migrates and seeds it, in that order', async () => {
    const server = fakeServer();
    const order: string[] = [];
    const result = await provision({
      connect: server.connect,
      serverUrl,
      name: 'intelliflow_test_run_abc',
      migrate: async (url: string) => {
        order.push(`migrate ${new URL(url).pathname}`);
      },
      seed: async (url: string) => {
        order.push(`seed ${new URL(url).pathname}`);
      },
    });

    expect(result.name).toBe('intelliflow_test_run_abc');
    expect(new URL(result.url).pathname).toBe('/intelliflow_test_run_abc');
    expect(new URL(result.url).port).toBe('25432');

    // CREATE DATABASE goes through the maintenance DB; bootstrap goes into the new one.
    const create = server.log.find((e) => e.sql.startsWith('CREATE DATABASE'))!;
    expect(new URL(create.url).pathname).toBe('/postgres');
    expect(create.sql).toBe('CREATE DATABASE "intelliflow_test_run_abc"');
    const bootstrap = server.log.filter(
      (e) => new URL(e.url).pathname === '/intelliflow_test_run_abc'
    );
    expect(bootstrap.map((e) => e.sql)).toEqual(bootstrapStatements('intelliflow_test_run_abc'));
    expect(order).toEqual(['migrate /intelliflow_test_run_abc', 'seed /intelliflow_test_run_abc']);
    expect(server.open.size).toBe(0);
  });

  it('skips the seed when none is requested', async () => {
    const server = fakeServer();
    let migrated = 0;
    await provision({
      connect: server.connect,
      serverUrl,
      migrate: async () => {
        migrated++;
      },
    });
    expect(migrated).toBe(1);
  });

  it('drops the half-built database when migration fails, and rethrows the cause', async () => {
    const server = fakeServer();
    await expect(
      provision({
        connect: server.connect,
        serverUrl,
        name: 'intelliflow_test_run_bad',
        migrate: async () => {
          throw new Error('migration 20260101 failed');
        },
      })
    ).rejects.toThrow('migration 20260101 failed');

    const dropped = server.log.filter((e) => e.sql.startsWith('DROP DATABASE'));
    expect(dropped).toHaveLength(1);
    expect(dropped[0].sql).toBe('DROP DATABASE IF EXISTS "intelliflow_test_run_bad" WITH (FORCE)');
    expect(server.open.size).toBe(0);
  });

  it('drops the database when bootstrap fails (for example the extensions schema cannot be created)', async () => {
    const server = fakeServer({
      failOn: (_u, sql) => sql.includes('SCHEMA IF NOT EXISTS extensions'),
    });
    await expect(
      provision({ connect: server.connect, serverUrl, migrate: async () => {} })
    ).rejects.toThrow(/boom/);
    expect(server.log.some((e) => e.sql.startsWith('DROP DATABASE'))).toBe(true);
  });

  it('never connects when the server is not local', async () => {
    const server = fakeServer();
    await expect(
      provision({
        connect: server.connect,
        serverUrl: pgUrl(5432, 'postgres', 'db.example.invalid'),
        migrate: async () => {},
      })
    ).rejects.toThrow(/non-local/);
    expect(server.log).toHaveLength(0);
  });

  it('refuses a caller-chosen name that is not ephemeral', async () => {
    const server = fakeServer();
    await expect(
      provision({
        connect: server.connect,
        serverUrl,
        name: 'intelliflow_test',
        migrate: async () => {},
      })
    ).rejects.toThrow(/not an ephemeral name/);
    expect(server.log).toHaveLength(0);
  });
});

describe('teardown', () => {
  const serverUrl = pgUrl(5433);

  it('drops an ephemeral database through the maintenance database', async () => {
    const server = fakeServer();
    await teardown({ connect: server.connect, serverUrl, name: 'intelliflow_test_run_abc' });
    expect(server.log).toHaveLength(1);
    expect(new URL(server.log[0].url).pathname).toBe('/postgres');
    expect(server.log[0].sql).toContain('DROP DATABASE IF EXISTS "intelliflow_test_run_abc"');
  });

  it.each(['intelliflow_test', 'intelliflow_dev', 'postgres'])(
    'refuses to drop the long-lived database %s',
    async (name) => {
      const server = fakeServer();
      await expect(teardown({ connect: server.connect, serverUrl, name })).rejects.toThrow(
        /Refusing to drop/
      );
      expect(server.log).toHaveLength(0);
    }
  );
});

describe('childEnv', () => {
  it('points every database variable at the ephemeral URL, overriding stale values', () => {
    const url = pgUrl(5433, 'intelliflow_test_run_x');
    const env = childEnv(
      {
        DATABASE_URL: 'stale-1',
        DIRECT_URL: 'stale-2',
        TEST_DATABASE_URL: 'stale-3',
        DATABASE_TEST_URL: 'stale-4',
        KEEP: 'me',
      },
      url
    );
    expect(env).toMatchObject({
      DATABASE_URL: url,
      DIRECT_URL: url,
      TEST_DATABASE_URL: url,
      DATABASE_TEST_URL: url,
      KEEP: 'me',
    });
  });
});
