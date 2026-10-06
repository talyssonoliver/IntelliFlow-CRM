/**
 * Tests for scripts/lib/preship-integration-infra.mjs (the integration step's
 * precondition) and scripts/lib/preship-cache.mjs (which earlier results
 * pre-ship may reuse).
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

import {
  ENV_FILES,
  endpointOf,
  integrationEndpoints,
  integrationInfraMissing,
  missingInfra,
  parseEnv,
  resolveEnv,
  tcpReachable,
} from '../lib/preship-integration-infra.mjs';
import { NEVER_CACHED, reusableResult } from '../lib/preship-cache.mjs';

// Connection strings are assembled from parts so no credential-shaped literal
// appears in source.
const pgUrl = (port: number) =>
  ['postgresql', '://', 'u', ':', 'p', '@', 'localhost', ':', port, '/db'].join('');
const redisUrl = (port: number) => `redis://localhost:${port}`;

describe('env resolution, as vite loadEnv("test") does it', () => {
  it('parses KEY=value lines, strips quotes, ignores comments and blanks', () => {
    const text = [
      '# c',
      'A=1',
      '',
      'export B="two"',
      "C='3'",
      '  D = four  ',
      'bad line',
      '1X=bad',
      '=nokey',
      "E='",
      'F=a=b',
    ].join('\r\n');
    expect(parseEnv(text)).toEqual({ A: '1', B: 'two', C: '3', D: 'four', E: "'", F: 'a=b' });
  });

  it('lets later files win and the process env win over all files', () => {
    expect(ENV_FILES).toEqual(['.env', '.env.local', '.env.test', '.env.test.local']);
    const env = resolveEnv(['A=env\nB=env', 'B=test\nC=test'], { C: 'process', D: undefined });
    expect(env).toEqual({ A: 'env', B: 'test', C: 'process' });
  });
});

describe('integration endpoints', () => {
  it('reads host and port, with the scheme default when no port is given', () => {
    expect(endpointOf(pgUrl(5433), 5432)).toEqual({ host: 'localhost', port: 5433 });
    expect(endpointOf('redis://cache.example.invalid', 6379)).toEqual({
      host: 'cache.example.invalid',
      port: 6379,
    });
    expect(endpointOf('not a url', 1)).toBeNull();
  });

  it('prefers TEST_DATABASE_URL over DATABASE_URL, as the suite setup does', () => {
    const eps = integrationEndpoints({
      DATABASE_URL: pgUrl(5432),
      TEST_DATABASE_URL: pgUrl(5433),
      REDIS_URL: redisUrl(6380),
    });
    expect(eps).toEqual([
      { name: 'postgres', host: 'localhost', port: 5433 },
      { name: 'redis', host: 'localhost', port: 6380 },
    ]);
  });

  it('reports what is missing or unreachable, and null when all answer', () => {
    const eps = integrationEndpoints({ DATABASE_URL: pgUrl(5433), REDIS_URL: redisUrl(6380) });
    expect(missingInfra(eps, () => true)).toBeNull();
    expect(missingInfra(eps, (_h, port) => port !== 6380)).toBe(
      'not reachable: redis at localhost:6380'
    );
    expect(missingInfra(integrationEndpoints({ REDIS_URL: redisUrl(6380) }), () => true)).toBe(
      'no postgres URL configured for the integration suite'
    );
    expect(missingInfra(integrationEndpoints({ DATABASE_URL: pgUrl(5433) }), () => true)).toBe(
      'no redis URL configured for the integration suite'
    );
  });
});

describe('the probe against real sockets and env files', () => {
  const dirs: string[] = [];
  const servers: net.Server[] = [];
  afterAll(() => {
    for (const s of servers) s.close();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  const listen = () =>
    new Promise<number>((resolve) => {
      const s = net
        .createServer((c) => c.end())
        .listen(0, '127.0.0.1', () => {
          servers.push(s);
          resolve((s.address() as net.AddressInfo).port);
        });
    });
  const closedPort = async () => {
    const s = net.createServer();
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
    const port = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return port;
  };

  it('tcpReachable connects to a listening port and refuses a closed one', async () => {
    expect(tcpReachable('127.0.0.1', await listen(), 1500)).toBe(true);
    expect(tcpReachable('127.0.0.1', await closedPort(), 1500)).toBe(false);
  }, 20_000);

  it('integrationInfraMissing reads the repo env files and probes what they name', async () => {
    const up = await listen();
    const down = await closedPort();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-infra-'));
    dirs.push(root);
    // A sibling project's containers on the default ports are irrelevant: only
    // the endpoints the suite is configured to use count.
    fs.writeFileSync(path.join(root, '.env'), `DATABASE_URL=${pgUrl(5432)}\n`);
    fs.writeFileSync(
      path.join(root, '.env.test'),
      `TEST_DATABASE_URL=${pgUrl(up)}\nREDIS_URL=${redisUrl(down)}\n`
    );
    expect(integrationInfraMissing(root, {})).toBe(`not reachable: redis at localhost:${down}`);
    expect(integrationInfraMissing(root, { REDIS_URL: redisUrl(up) })).toBeNull();
    // No env files at all: nothing is configured, so nothing can be probed.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-infra-'));
    dirs.push(empty);
    expect(integrationInfraMissing(empty, {})).toMatch(/no postgres URL configured/);
  }, 20_000);
});

describe('reusableResult (pre-ship cache)', () => {
  const prev = {
    steps: [
      { id: 'lint', verdict: 'PASS' },
      { id: 'build', verdict: 'FAIL' },
      { id: 'integration-tests', verdict: 'PASS' },
    ],
  };

  it('reuses an earlier PASS of a code-only step', () => {
    expect(reusableResult('lint', prev)).toEqual({ id: 'lint', verdict: 'PASS' });
  });

  it('never reuses a failure, a missing step or no previous run', () => {
    expect(reusableResult('build', prev)).toBeNull();
    expect(reusableResult('typecheck', prev)).toBeNull();
    expect(reusableResult('lint', null)).toBeNull();
    expect(reusableResult('lint', undefined)).toBeNull();
  });

  it('never reuses the integration suite, whose pass depends on live infrastructure', () => {
    expect(NEVER_CACHED.has('integration-tests')).toBe(true);
    expect(reusableResult('integration-tests', prev)).toBeNull();
  });
});
