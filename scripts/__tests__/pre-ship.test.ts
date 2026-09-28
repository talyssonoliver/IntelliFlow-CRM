/**
 * Tests for scripts/pre-ship.mjs's test-DB-stack probe and exclusivity lock
 * (issue #704).
 *
 * #704 had two distinct defects:
 *
 *   1. The `integration-tests`/`coverage` skip_if probes matched ANY running
 *      container whose name contained the substrings "postgres"/"redis" —
 *      not THIS repo's own `intelliflow-postgres-test`/`intelliflow-redis-test`
 *      (fixed container_name in docker-compose.yml). On a machine running
 *      another project's `cao-postgres`/`cao-redis` containers while this
 *      repo's own test stack was stopped, the probe said "available" and the
 *      gate ran integration tests against a database that didn't exist.
 *   2. Nothing serialized the DB-touching steps across concurrent
 *      `pre-ship.mjs` runs (different worktrees sharing the same
 *      machine-wide singleton containers) — two overlapping runs could
 *      interleave mutations against the same database and each report a PASS
 *      that neither run's isolated state actually supports.
 *
 * Every function under test here is a pure/injectable helper exported from
 * pre-ship.mjs specifically so this file can exercise the real logic without
 * running the actual gate, touching the machine's real Docker containers, or
 * taking the real shared-.git DB lock (which other worktrees' gate runs may
 * be holding for real). Importing pre-ship.mjs does NOT run the gate — see
 * the `invokedDirectly` guard at the bottom of that file (mirrors
 * scripts/preship-attest.mjs's own import-vs-CLI guard).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  parseHostPort,
  readEnvFile,
  getConfiguredTestEndpoints,
  tcpPortOpen,
  hasExactTestContainers,
  dockerTestContainersRunning,
  testStackUnavailable,
  isPidAlive,
  readDbLockFile,
  reapStaleDbLock,
  acquireDbLock,
} from '../pre-ship.mjs';

// ─── test helpers ──────────────────────────────────────────────────────────

/** Starts a throwaway TCP server on an ephemeral loopback port. */
function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ port, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}

function tempPath(prefix: string): string {
  return path.join(
    os.tmpdir(),
    `${prefix}-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  );
}

function writeTempEnvFile(content: string): string {
  const p = tempPath('pre-ship-test-env') + '.env';
  fs.writeFileSync(p, content);
  return p;
}

// ─── parseHostPort ─────────────────────────────────────────────────────────

describe('parseHostPort', () => {
  it('parses an explicit port from a postgresql:// URL', () => {
    expect(parseHostPort('postgresql://test:test@localhost:5433/intelliflow_test', 5432)).toEqual({
      host: 'localhost',
      port: 5433,
    });
  });

  it('parses a redis:// URL', () => {
    expect(parseHostPort('redis://localhost:6380', 6379)).toEqual({
      host: 'localhost',
      port: 6380,
    });
  });

  it('falls back to the default port when the URL omits one', () => {
    expect(parseHostPort('redis://localhost', 6380)).toEqual({ host: 'localhost', port: 6380 });
  });

  it('returns null for a missing or unparseable URL', () => {
    expect(parseHostPort(undefined, 5433)).toBeNull();
    expect(parseHostPort('', 5433)).toBeNull();
    expect(parseHostPort('not a url', 5433)).toBeNull();
  });
});

// ─── readEnvFile / getConfiguredTestEndpoints ──────────────────────────────

describe('readEnvFile', () => {
  it('parses KEY=VALUE, strips quotes, and ignores comments/blank lines', () => {
    const p = writeTempEnvFile(
      [
        '# a comment',
        '',
        'TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/intelliflow_test?schema=public',
        "TEST_REDIS_URL='redis://localhost:6380'",
        'QUOTED="hello world"',
        'EMPTY=',
      ].join('\n')
    );
    const vars = readEnvFile(p);
    expect(vars.TEST_DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5433/intelliflow_test?schema=public'
    );
    expect(vars.TEST_REDIS_URL).toBe('redis://localhost:6380');
    expect(vars.QUOTED).toBe('hello world');
    expect(vars.EMPTY).toBe('');
    expect(Object.keys(vars)).not.toContain('# a comment');
  });

  it('returns {} for a missing file', () => {
    expect(readEnvFile(tempPath('does-not-exist'))).toEqual({});
  });
});

describe('getConfiguredTestEndpoints', () => {
  it('prefers explicit env TEST_DATABASE_URL/TEST_REDIS_URL over the file', () => {
    const p = writeTempEnvFile(
      'TEST_DATABASE_URL=postgresql://file/db\nTEST_REDIS_URL=redis://file:1\n'
    );
    const result = getConfiguredTestEndpoints({
      envFilePath: p,
      env: { TEST_DATABASE_URL: 'postgresql://env/db', TEST_REDIS_URL: 'redis://env:2' },
    });
    expect(result).toEqual({ dbUrl: 'postgresql://env/db', redisUrl: 'redis://env:2' });
  });

  it('falls back to the file, then to REDIS_URL, when env has nothing', () => {
    const p = writeTempEnvFile(
      'TEST_DATABASE_URL=postgresql://file/db\nREDIS_URL=redis://file:2\n'
    );
    const result = getConfiguredTestEndpoints({ envFilePath: p, env: {} });
    expect(result).toEqual({ dbUrl: 'postgresql://file/db', redisUrl: 'redis://file:2' });
  });

  it('returns undefined fields when nothing is configured anywhere', () => {
    const result = getConfiguredTestEndpoints({ envFilePath: tempPath('does-not-exist'), env: {} });
    expect(result).toEqual({ dbUrl: undefined, redisUrl: undefined });
  });

  it('reads the REAL repo .env.test by default and resolves the documented test ports (5433/6380)', () => {
    // No envFilePath override — this reads the actual committed .env.test.
    // env:{} isolates from whatever the test runner's own process.env holds.
    const result = getConfiguredTestEndpoints({ env: {} });
    expect(parseHostPort(result.dbUrl, 5433)?.port).toBe(5433);
    expect(parseHostPort(result.redisUrl, 6380)?.port).toBe(6380);
  });
});

// ─── tcpPortOpen ────────────────────────────────────────────────────────────

describe('tcpPortOpen', () => {
  it('is true for a reachable host:port', async () => {
    const server = await listen();
    try {
      expect(tcpPortOpen('127.0.0.1', server.port, 2000)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('is false for a closed port (connection refused)', async () => {
    const server = await listen();
    await server.close();
    expect(tcpPortOpen('127.0.0.1', server.port, 2000)).toBe(false);
  });

  it('is false when host or port is missing', () => {
    expect(tcpPortOpen(null as unknown as string, 5433)).toBe(false);
    expect(tcpPortOpen('127.0.0.1', null as unknown as number)).toBe(false);
  });
});

// ─── hasExactTestContainers ─────────────────────────────────────────────────

describe('hasExactTestContainers — exact-name match, the core of the #704 fix', () => {
  it('is true only when BOTH exact repo container names are present', () => {
    expect(hasExactTestContainers(['intelliflow-postgres-test', 'intelliflow-redis-test'])).toBe(
      true
    );
  });

  it("FALSIFICATION (#704 repro): is false when only an UNRELATED project's postgres/redis containers are running", () => {
    // The exact reported bug: cao-postgres/cao-redis contain the substrings
    // "postgres"/"redis" the OLD probe matched, while this repo's own test
    // containers (intelliflow-postgres-test/intelliflow-redis-test) are absent.
    expect(hasExactTestContainers(['cao-postgres', 'cao-redis', 'some-other-container'])).toBe(
      false
    );
  });

  it('is case-insensitive and tolerant of blank/whitespace entries', () => {
    expect(
      hasExactTestContainers(['INTELLIFLOW-POSTGRES-TEST', '', ' intelliflow-redis-test '])
    ).toBe(true);
  });

  it('is false when only one of the two containers is present', () => {
    expect(hasExactTestContainers(['intelliflow-postgres-test'])).toBe(false);
    expect(hasExactTestContainers(['intelliflow-redis-test'])).toBe(false);
  });

  it('handles empty/undefined input', () => {
    expect(hasExactTestContainers([])).toBe(false);
    expect(hasExactTestContainers(undefined as unknown as string[])).toBe(false);
  });
});

describe('dockerTestContainersRunning — live smoke test (read-only `docker ps`; skips without Docker)', () => {
  const dockerAvailable =
    spawnSync('docker', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' })
      .status === 0;
  const maybeIt = dockerAvailable ? it : it.skip;

  maybeIt('agrees with a fresh, independently-computed `docker ps` exact-name check', () => {
    const ps = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const expected = hasExactTestContainers((ps.stdout || '').split(/\r?\n/));
    expect(dockerTestContainersRunning()).toBe(expected);
  });
});

// ─── testStackUnavailable — the unified probe ──────────────────────────────

describe('testStackUnavailable — the unified probe (#704)', () => {
  it('is available (false) when the exact containers are confirmed running', () => {
    expect(testStackUnavailable({ probeContainers: () => true })).toBe(false);
  });

  it('FALSIFICATION: is missing (true) when Docker is up but the exact repo containers are confirmed absent', () => {
    // This is the reported scenario end to end: Docker reachable, but the
    // exact-name check (mocked here as the Docker layer already returning
    // its verdict) came back false — e.g. only cao-postgres/cao-redis running.
    expect(testStackUnavailable({ probeContainers: () => false })).toBe(true);
  });

  it('falls back to a TCP check when Docker cannot be asked, and is available when both endpoints are reachable', async () => {
    const pg = await listen();
    const redis = await listen();
    try {
      const result = testStackUnavailable({
        probeContainers: () => null,
        endpoints: {
          dbUrl: `postgresql://test:test@127.0.0.1:${pg.port}/intelliflow_test`,
          redisUrl: `redis://127.0.0.1:${redis.port}`,
        },
      });
      expect(result).toBe(false);
    } finally {
      await pg.close();
      await redis.close();
    }
  });

  it('falls back to a TCP check and is missing (true) when the configured endpoints refuse the connection', async () => {
    const pg = await listen();
    const redis = await listen();
    await pg.close();
    await redis.close();
    const result = testStackUnavailable({
      probeContainers: () => null,
      endpoints: {
        dbUrl: `postgresql://test:test@127.0.0.1:${pg.port}/intelliflow_test`,
        redisUrl: `redis://127.0.0.1:${redis.port}`,
      },
    });
    expect(result).toBe(true);
  });

  it('is missing (true) when Docker is unavailable and no test endpoints are configured', () => {
    const result = testStackUnavailable({
      probeContainers: () => null,
      endpoints: { dbUrl: undefined, redisUrl: undefined },
    });
    expect(result).toBe(true);
  });
});

// ─── DB lock (#704 exclusivity) ─────────────────────────────────────────────

describe('isPidAlive', () => {
  it('is true for this process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('is false for a pid that has already exited', () => {
    const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    expect(isPidAlive(dead.pid as number)).toBe(false);
  });
});

describe('DB lock (#704) — acquire/release/staleness, isolated to a temp lock path', () => {
  it('acquires, records pid/worktree/branch/startedAt, and release() removes the file', () => {
    const lockPath = tempPath('preship-db-lock') + '.lock';
    const release = acquireDbLock({ lockPath, waitMs: 2000, pollMs: 50 });
    expect(release).not.toBeNull();
    expect(fs.existsSync(lockPath)).toBe(true);
    const holder = readDbLockFile(lockPath);
    expect(holder?.pid).toBe(process.pid);
    expect(typeof holder?.startedAt).toBe('number');
    release!();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('is genuinely exclusive: a second acquire times out while the first holder is alive and fresh, then succeeds once released', () => {
    const lockPath = tempPath('preship-db-lock') + '.lock';
    const release1 = acquireDbLock({ lockPath, waitMs: 2000, pollMs: 50 });
    expect(release1).not.toBeNull();

    const release2 = acquireDbLock({ lockPath, waitMs: 300, pollMs: 50, staleMs: 60000 });
    expect(release2).toBeNull(); // timed out — proves the lock actually serializes

    release1!();
    const release3 = acquireDbLock({ lockPath, waitMs: 2000, pollMs: 50 });
    expect(release3).not.toBeNull();
    release3!();
  });

  it('reaps a lock whose holder PID has already exited, even before the staleness ceiling', () => {
    const lockPath = tempPath('preship-db-lock') + '.lock';
    const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: dead.pid, worktree: 'somewhere', branch: 'x', startedAt: Date.now() })
    );
    const release = acquireDbLock({ lockPath, waitMs: 2000, pollMs: 50, staleMs: 60000 });
    expect(release).not.toBeNull();
    expect(readDbLockFile(lockPath)?.pid).toBe(process.pid); // taken over by us
    release!();
  });

  it('reapStaleDbLock reaps a lock past the staleness ceiling even when the PID looks alive', () => {
    const lockPath = tempPath('preship-db-lock') + '.lock';
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        worktree: 'somewhere',
        branch: 'x',
        startedAt: Date.now() - 100000,
      })
    );
    expect(reapStaleDbLock(lockPath, 1000)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('reapStaleDbLock leaves a fresh lock from a live process alone', () => {
    const lockPath = tempPath('preship-db-lock') + '.lock';
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        worktree: 'somewhere',
        branch: 'x',
        startedAt: Date.now(),
      })
    );
    expect(reapStaleDbLock(lockPath, 60000)).toBe(false);
    expect(fs.existsSync(lockPath)).toBe(true);
    fs.unlinkSync(lockPath);
  });

  it('readDbLockFile returns null for a missing file', () => {
    expect(readDbLockFile(tempPath('does-not-exist') + '.lock')).toBeNull();
  });
});
