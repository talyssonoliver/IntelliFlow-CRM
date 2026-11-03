import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPECTED_LICENSE_SHA256, checkLicenseKey, enforceLicenseKey } from '../license-check';

const KEY = ['sample', 'value', 'for', 'tests'].join('-');
const HASH = createHash('sha256').update(KEY).digest('hex');
const prod = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  ...extra,
});

describe('checkLicenseKey', () => {
  it('passes in production when the hash matches', () => {
    expect(checkLicenseKey(prod({ IFC_LICENSE_KEY: KEY }), HASH)).toEqual({ ok: true });
  });

  it.each([[undefined], ['']])('refuses in production when the key is %j', (value) => {
    expect(checkLicenseKey(prod({ IFC_LICENSE_KEY: value }), HASH)).toEqual({
      ok: false,
      reason: 'IFC_LICENSE_KEY is not set',
    });
  });

  it('refuses in production when the key is wrong', () => {
    expect(checkLicenseKey(prod({ IFC_LICENSE_KEY: `${KEY}-other` }), HASH)).toEqual({
      ok: false,
      reason: 'IFC_LICENSE_KEY is not valid',
    });
  });

  it('does not accept the hash itself as the key', () => {
    expect(checkLicenseKey(prod({ IFC_LICENSE_KEY: HASH }), HASH).ok).toBe(false);
  });

  it.each([[''], ['not-a-hash'], [HASH.toUpperCase()]])(
    'refuses in production when the build hash is %j',
    (expected) => {
      expect(checkLicenseKey(prod({ IFC_LICENSE_KEY: KEY }), expected)).toEqual({
        ok: false,
        reason: 'this build has no license hash configured',
      });
    }
  );

  it.each([['development'], ['test'], ['staging'], [undefined]])(
    'does nothing when NODE_ENV is %j',
    (NODE_ENV) => {
      expect(checkLicenseKey({ NODE_ENV }, HASH)).toEqual({ ok: true });
      expect(checkLicenseKey({ NODE_ENV, IFC_LICENSE_KEY: 'wrong' }, HASH)).toEqual({ ok: true });
    }
  );
});

describe('enforceLicenseKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const spies = () => ({
    exit: vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never),
    stderr: vi.spyOn(process.stderr, 'write').mockImplementation(() => true),
  });

  it('exits 1 with a clear error that does not print the key', () => {
    const { exit, stderr } = spies();

    enforceLicenseKey(prod({ IFC_LICENSE_KEY: KEY }));

    expect(exit).toHaveBeenCalledWith(1);
    const output = stderr.mock.calls.map(([text]) => String(text)).join('');
    expect(output).toContain('Refusing to start in production');
    expect(output).not.toContain(KEY);
  });

  it('leaves a non-production process alone', () => {
    const { exit, stderr } = spies();

    enforceLicenseKey({ NODE_ENV: 'test' });

    expect(exit).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });
});

describe('the configured hash', () => {
  // A build without a valid hash here would refuse every production start.
  it('is a SHA-256 hex digest', () => {
    expect(EXPECTED_LICENSE_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('what the check loads', () => {
  // It runs before OpenTelemetry starts, which only patches modules loaded after it.
  it.each([
    ['enforce-license.ts', ["import { enforceLicenseKey } from './license-check';"]],
    ['license-check.ts', ["import { createHash, timingSafeEqual } from 'node:crypto';"]],
  ])('%s imports nothing else', (file, expected) => {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
    expect(source.split('\n').filter((line) => /^import\s/.test(line))).toEqual(expected);
  });
});

describe('service entries', () => {
  const root = resolve(__dirname, '../../../..');
  const importLines = (file: string) =>
    readFileSync(resolve(root, file), 'utf8')
      .split('\n')
      .filter((line) => /^import\s/.test(line));
  const GUARD = "import '@intelliflow/validators/enforce-license';";

  it.each([
    ['apps/api/src/main.ts'],
    ['apps/api/src/ws-server.ts'],
    // Before ./env, whose env files can replace NODE_ENV.
    ['apps/ai-worker/src/index.ts'],
    ['apps/workers/combined-worker/src/main.ts'],
    ['apps/workers/events-worker/src/main.ts'],
    ['apps/workers/ingestion-worker/src/main.ts'],
  ])('%s runs the check first', (file) => {
    expect(importLines(file)[0]).toBe(GUARD);
  });
});
