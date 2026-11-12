/**
 * Heavy commands refuse to run outside the test-slot queue (owner ruling
 * 2026-11-12, "enforce it"): the web build, Lighthouse, the full suite and
 * coverage. scripts/lib/test-slot.mjs decides (slotRefusal, requireSlot);
 * scripts/require-test-slot.mjs is chained in front of each heavy script.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OUTSIDE_SLOT_ENV, requireSlot, slotRefusal } from '../lib/test-slot.mjs';

const ROOT = path.resolve(__dirname, '..', '..');
const yes = () => true;
const no = () => false;

describe('slotRefusal', () => {
  it('refuses outside the queue on a machine that has one', () => {
    const msg = slotRefusal('web-build', {}, yes);
    expect(msg).toContain('web-build is a heavy command and runs only inside the test-slot queue.');
    expect(msg).toContain('with-slot.mjs --label web-build -- <the same command>');
    expect(msg).toContain('ALLOW_OUTSIDE_SLOT=1');
    expect(msg).not.toContain('\\');
  });

  it('names the queue under TEST_SLOTS_DIR', () => {
    expect(slotRefusal('x', { TEST_SLOTS_DIR: '/q/slots' }, yes)).toContain(
      `node /q/slots/with-slot.mjs --label x`
    );
  });

  it('allows a run that holds a slot', () => {
    expect(slotRefusal('web-build', { TEST_SLOT_HELD: 'slot1' }, yes)).toBeNull();
  });

  it('allows CI, but not CI=false or CI=0', () => {
    expect(slotRefusal('web-build', { CI: 'true' }, yes)).toBeNull();
    expect(slotRefusal('web-build', { CI: '1' }, yes)).toBeNull();
    expect(slotRefusal('web-build', { CI: 'false' }, yes)).not.toBeNull();
    expect(slotRefusal('web-build', { CI: '0' }, yes)).not.toBeNull();
  });

  it('allows the owner override only when it is exactly 1', () => {
    expect(OUTSIDE_SLOT_ENV).toBe('ALLOW_OUTSIDE_SLOT');
    expect(slotRefusal('web-build', { ALLOW_OUTSIDE_SLOT: '1' }, yes)).toBeNull();
    expect(slotRefusal('web-build', { ALLOW_OUTSIDE_SLOT: 'yes' }, yes)).not.toBeNull();
  });

  it('allows a machine with no semaphore (a contributor laptop, a Docker build)', () => {
    expect(slotRefusal('web-build', {}, no)).toBeNull();
  });
});

describe('requireSlot', () => {
  function io(env: NodeJS.ProcessEnv) {
    const out: string[] = [];
    const codes: number[] = [];
    return {
      out,
      codes,
      io: {
        env,
        exists: yes,
        stderr: { write: (s: string) => out.push(s) },
        exit: ((c: number) => {
          codes.push(c);
        }) as (code: number) => never,
      },
    };
  }

  it('exits 2 with the message when refused', () => {
    const r = io({});
    requireSlot('lighthouse', r.io);
    expect(r.codes).toEqual([2]);
    expect(r.out.join('')).toContain('lighthouse is a heavy command');
  });

  it('returns quietly when allowed', () => {
    const r = io({ TEST_SLOT_HELD: 'slot2' });
    requireSlot('lighthouse', r.io);
    expect(r.codes).toEqual([]);
    expect(r.out).toEqual([]);
  });
});

describe('require-test-slot.mjs', () => {
  const cli = path.join(ROOT, 'scripts', 'require-test-slot.mjs');
  const queue = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-guard-'));
  fs.writeFileSync(path.join(queue, 'with-slot.mjs'), '');
  const base: NodeJS.ProcessEnv = { ...process.env, TEST_SLOTS_DIR: queue };
  delete base.CI;
  delete base.TEST_SLOT_HELD;
  delete base.ALLOW_OUTSIDE_SLOT;
  const run = (env: NodeJS.ProcessEnv) =>
    spawnSync(process.execPath, [cli, 'web-build'], { env, encoding: 'utf8' });

  it('exits 2 and explains itself outside the queue', () => {
    const r = run(base);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('web-build is a heavy command');
  });

  it('exits 0 inside the queue, under CI and with the owner override', () => {
    expect(run({ ...base, TEST_SLOT_HELD: 'slot1' }).status).toBe(0);
    expect(run({ ...base, CI: 'true' }).status).toBe(0);
    expect(run({ ...base, ALLOW_OUTSIDE_SLOT: '1' }).status).toBe(0);
  });
});

describe('the heavy commands are guarded', () => {
  const scripts = (rel: string): Record<string, string> =>
    JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')).scripts;

  it.each([
    ['package.json', 'test:unit', 'node scripts/require-test-slot.mjs test:unit && '],
    ['package.json', 'test:integration', 'node scripts/require-test-slot.mjs test:integration && '],
    ['package.json', 'lighthouse', 'node scripts/require-test-slot.mjs lighthouse && '],
    ['package.json', 'lighthouse:ci', 'node scripts/require-test-slot.mjs lighthouse:ci && '],
    ['apps/web/package.json', 'build', 'node ../../scripts/require-test-slot.mjs web-build && '],
    [
      'apps/web/package.json',
      'lighthouse:auth',
      'node ../../scripts/require-test-slot.mjs lighthouse:auth && ',
    ],
  ])('%s %s', (file, name, prefix) => {
    expect(scripts(file)[name].startsWith(prefix)).toBe(true);
  });

  // Dev servers count as heavy jobs too (owner rule 2026-11-12).
  it.each([
    ['apps/web/package.json', 'dev', '../../', 'web-dev'],
    ['apps/api/package.json', 'dev', '../../', 'api-dev'],
    ['apps/api/package.json', 'dev:ws', '../../', 'api-dev-ws'],
    ['apps/ai-worker/package.json', 'dev', '../../', 'ai-worker-dev'],
    ['apps/workers/combined-worker/package.json', 'dev', '../../../', 'combined-worker-dev'],
    ['apps/workers/events-worker/package.json', 'dev', '../../../', 'events-worker-dev'],
    ['apps/workers/ingestion-worker/package.json', 'dev', '../../../', 'ingestion-worker-dev'],
  ])('dev server %s %s', (file, name, up, label) => {
    expect(
      scripts(file)[name].startsWith(`node ${up}scripts/require-test-slot.mjs ${label} && `)
    ).toBe(true);
  });

  it('leaves the owner project tracker (:3002) unguarded: it stays running', () => {
    expect(scripts('apps/project-tracker/package.json').dev).toBe('next dev --port 3002');
  });

  it('every guard path reaches the real CLI', () => {
    for (const [file, up] of [
      ['apps/web/package.json', '../../'],
      ['apps/workers/events-worker/package.json', '../../../'],
    ]) {
      const cli = path.resolve(ROOT, path.dirname(file), up, 'scripts', 'require-test-slot.mjs');
      expect(fs.existsSync(cli)).toBe(true);
    }
  });

  it('pnpm test and test:coverage still join the queue themselves', () => {
    const root = scripts('package.json');
    expect(root.test.startsWith('node scripts/with-test-slot.mjs ')).toBe(true);
    expect(root['test:coverage'].startsWith('node scripts/with-test-slot.mjs ')).toBe(true);
  });

  it('the full-suite and coverage runners check the slot themselves', () => {
    const read = (f: string) => fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    expect(read('run-tests.js')).toContain(
      "require('./lib/test-slot.mjs').requireSlot('test-suite');"
    );
    expect(read('run-coverage.js')).toContain("if (!MERGE_ONLY) requireSlot('test-coverage');");
  });

  it('turbo passes the slot variables through to the web build', () => {
    const turbo = JSON.parse(fs.readFileSync(path.join(ROOT, 'turbo.json'), 'utf8'));
    expect(turbo.globalPassThroughEnv).toEqual(
      expect.arrayContaining(['CI', 'TEST_SLOT_HELD', 'TEST_SLOTS_DIR', 'ALLOW_OUTSIDE_SLOT'])
    );
    // Pass-through only: the variables never change a cache key.
    expect(turbo.globalEnv).not.toContain('TEST_SLOT_HELD');
  });
});
